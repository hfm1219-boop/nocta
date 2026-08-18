-- Mantiene las conversaciones activas y completa cambios de mecánica promocional.

create or replace function public.keep_ai_conversation_active()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='completed' then new.status:='active'; end if;
  return new;
end;$$;
drop trigger if exists ai_conversations_stay_active on public.ai_conversations;
create trigger ai_conversations_stay_active before insert or update of status on public.ai_conversations for each row execute function public.keep_ai_conversation_active();
update public.ai_conversations set status='active' where status='completed';

create or replace function public.prepare_agent_promotion_mutation(target_conversation uuid,target_promotion uuid,mutation_action text,mutation_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected public.promotions; confirmation_id uuid; target_org uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if mutation_action not in('update_promotion','pause_promotion','reactivate_promotion','duplicate_promotion') then raise exception 'INVALID_ACTION'; end if;
  if not exists(select 1 from public.ai_conversations c where c.id=target_conversation and c.user_id=auth.uid() and c.status='active') then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  select p.* into selected from public.promotions p where p.id=target_promotion;
  if selected.id is null or selected.venue_id is null then raise exception 'PROMOTION_NOT_FOUND'; end if;
  select v.organization_id into target_org from public.venues v where v.id=selected.venue_id;
  if target_org is null or not public.can_manage_venue(selected.venue_id) or not public.current_user_can('venue.manage',target_org) then raise exception 'FORBIDDEN'; end if;
  if mutation_action='update_promotion' and mutation_payload->>'benefit' is null and mutation_payload->>'mechanic' is null and mutation_payload->>'startsAt' is null and mutation_payload->>'endsAt' is null then raise exception 'NO_CHANGES'; end if;
  if mutation_action='duplicate_promotion' and ((mutation_payload->>'startsAt')::timestamptz is null or (mutation_payload->>'endsAt')::timestamptz is null or (mutation_payload->>'endsAt')::timestamptz<=(mutation_payload->>'startsAt')::timestamptz) then raise exception 'INVALID_WINDOW'; end if;
  update public.ai_confirmations set status='cancelled' where conversation_id=target_conversation and status='pending';
  insert into public.ai_confirmations(conversation_id,user_id,organization_id,venue_id,action,payload) values(target_conversation,auth.uid(),target_org,selected.venue_id,mutation_action,mutation_payload||jsonb_build_object('promotionId',selected.id,'originalTitle',selected.title)) returning id into confirmation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ai.confirmation.requested','promotion',selected.id,jsonb_build_object('confirmationId',confirmation_id,'tool',mutation_action));
  return confirmation_id;
end;$$;

create or replace function public.execute_confirmed_agent_promotion_mutation(target_confirmation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare confirmation public.ai_confirmations; payload jsonb; source public.promotions; source_rule public.promotion_rules; result_id uuid; new_rule_id uuid; benefit numeric; start_at timestamptz; end_at timestamptz; requested_mechanic public.promotion_mechanic;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into confirmation from public.ai_confirmations c where c.id=target_confirmation and c.user_id=auth.uid() for update;
  if confirmation.id is null then raise exception 'CONFIRMATION_NOT_FOUND'; end if;
  if confirmation.status<>'pending' then raise exception 'CONFIRMATION_ALREADY_USED'; end if;
  if confirmation.expires_at<=now() then update public.ai_confirmations set status='expired' where id=target_confirmation; raise exception 'CONFIRMATION_EXPIRED'; end if;
  if confirmation.action not in('update_promotion','pause_promotion','reactivate_promotion','duplicate_promotion') then raise exception 'INVALID_ACTION'; end if;
  if not public.can_manage_venue(confirmation.venue_id) or not public.current_user_can('venue.manage',confirmation.organization_id) then raise exception 'FORBIDDEN'; end if;
  payload:=confirmation.payload;
  select * into source from public.promotions where id=(payload->>'promotionId')::uuid and venue_id=confirmation.venue_id for update;
  if source.id is null then raise exception 'PROMOTION_NOT_FOUND'; end if;
  select * into source_rule from public.promotion_rules where promotion_id=source.id for update;
  if source_rule.id is null and confirmation.action in('update_promotion','duplicate_promotion') then raise exception 'PROMOTION_RULE_NOT_FOUND'; end if;
  update public.ai_confirmations set status='confirmed',confirmed_at=now() where id=target_confirmation;
  result_id:=source.id;
  if confirmation.action in('pause_promotion','reactivate_promotion') then
    update public.promotions set active=(confirmation.action='reactivate_promotion'),updated_at=now() where id=source.id;
    update public.promotion_rules set active=(confirmation.action='reactivate_promotion'),updated_at=now() where promotion_id=source.id;
  elsif confirmation.action='update_promotion' then
    start_at:=coalesce(nullif(payload->>'startsAt','')::timestamptz,source.starts_at); end_at:=coalesce(nullif(payload->>'endsAt','')::timestamptz,source.ends_at);
    if end_at<=start_at then raise exception 'INVALID_WINDOW'; end if;
    update public.promotions set starts_at=start_at,ends_at=end_at,updated_at=now() where id=source.id;
    if payload->>'mechanic'='buy_x_get_y' then
      if coalesce((payload->>'buyQuantity')::integer,0)<1 or coalesce((payload->>'getQuantity')::integer,0)<1 then raise exception 'INVALID_BENEFIT'; end if;
      requested_mechanic:='buy_x_get_y';
      update public.promotion_rules set mechanic=requested_mechanic,percentage_off=null,fixed_amount_cop=null,buy_quantity=(payload->>'buyQuantity')::integer,get_quantity=(payload->>'getQuantity')::integer,fixed_price_cop=null,updated_at=now() where id=source_rule.id;
    elsif payload->>'benefit' is not null then
      benefit:=(payload->>'benefit')::numeric;
      if benefit<=0 or (source_rule.mechanic='percentage' and benefit>100) then raise exception 'INVALID_BENEFIT'; end if;
      update public.promotion_rules set percentage_off=case when mechanic='percentage' then benefit end,fixed_amount_cop=case when mechanic='fixed_amount' then benefit::integer end,fixed_price_cop=case when mechanic='fixed_price' then benefit::integer end,updated_at=now() where id=source_rule.id;
    end if;
  else
    start_at:=(payload->>'startsAt')::timestamptz; end_at:=(payload->>'endsAt')::timestamptz;
    insert into public.promotions(venue_id,event_id,title,description,terms,starts_at,ends_at,active,created_by,campaign_id,activation_id) values(source.venue_id,source.event_id,coalesce(nullif(trim(payload->>'title'),''),source.title||' · copia'),source.description,source.terms,start_at,end_at,true,auth.uid(),source.campaign_id,source.activation_id) returning id into result_id;
    insert into public.promotion_rules(promotion_id,mechanic,percentage_off,fixed_amount_cop,buy_quantity,get_quantity,fixed_price_cop,minimum_quantity,minimum_spend_cop,maximum_discount_cop,per_user_limit,total_redemption_limit,budget_cop,local_time_start,local_time_end,timezone,weekdays,customer_segment,priority,stackable,active)
    select result_id,mechanic,percentage_off,fixed_amount_cop,buy_quantity,get_quantity,fixed_price_cop,minimum_quantity,minimum_spend_cop,maximum_discount_cop,per_user_limit,total_redemption_limit,budget_cop,(start_at at time zone timezone)::time,(end_at at time zone timezone)::time,timezone,weekdays,customer_segment,priority,stackable,true from public.promotion_rules where promotion_id=source.id returning id into new_rule_id;
    insert into public.promotion_rule_items(rule_id,venue_menu_item_id,brand_product_id,role,minimum_quantity) select new_rule_id,venue_menu_item_id,brand_product_id,role,minimum_quantity from public.promotion_rule_items where rule_id=source_rule.id;
  end if;
  update public.ai_confirmations set status='consumed',consumed_at=now() where id=target_confirmation;
  update public.ai_conversations set status='active',state=jsonb_build_object('promotionId',result_id,'action',confirmation.action),updated_at=now() where id=confirmation.conversation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'promotion.'||confirmation.action||'_by_ai','promotion',result_id,jsonb_build_object('conversationId',confirmation.conversation_id,'confirmationId',target_confirmation,'sourcePromotionId',source.id));
  return jsonb_build_object('promotionId',result_id,'action',confirmation.action);
end;$$;

notify pgrst,'reload schema';
