-- Permite abandonar un flujo pendiente y mantiene promoción/activación en el mismo evento.

create or replace function public.reset_agent_promotion_flow(target_conversation uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.ai_conversations c
    where c.id=target_conversation and c.user_id=auth.uid() and c.status='active'
  ) then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  update public.ai_confirmations
  set status='cancelled'
  where conversation_id=target_conversation and user_id=auth.uid() and status='pending';
  update public.ai_conversations
  set state='{}'::jsonb,updated_at=now()
  where id=target_conversation and user_id=auth.uid();
end;$$;

create or replace function public.configure_promotion_rule(target_promotion uuid,target_menu_item uuid,target_brand_product uuid,target_activation uuid,configuration jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare promo public.promotions;menu_venue uuid;created_rule_id uuid;mechanic_value public.promotion_mechanic;start_time time;end_time time;activation_event uuid;activation_campaign uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  select * into promo from public.promotions where id=target_promotion for update;
  if not found then raise exception 'PROMOTION_NOT_FOUND';end if;
  if not(public.is_platform_owner() or (promo.venue_id is not null and public.can_manage_venue(promo.venue_id)) or (promo.event_id is not null and public.can_manage_event(promo.event_id))) then raise exception 'FORBIDDEN';end if;
  select venue_id into menu_venue from public.venue_menu_items where id=target_menu_item;
  if menu_venue is null then raise exception 'MENU_ITEM_NOT_FOUND';end if;
  if promo.venue_id is not null and promo.venue_id<>menu_venue then raise exception 'PROMOTION_MENU_VENUE_MISMATCH';end if;
  if promo.venue_id is null and not exists(select 1 from public.event_venue_collaborations c where c.event_id=promo.event_id and c.venue_id=menu_venue and c.status='approved') then raise exception 'EVENT_VENUE_NOT_APPROVED';end if;
  mechanic_value:=(configuration->>'mechanic')::public.promotion_mechanic;
  start_time:=nullif(configuration->>'timeStart','')::time;end_time:=nullif(configuration->>'timeEnd','')::time;
  if (start_time is null)<>(end_time is null) then raise exception 'INCOMPLETE_SCHEDULE';end if;
  if target_activation is not null then
    select a.event_id,a.campaign_id into activation_event,activation_campaign from public.brand_activations a where a.id=target_activation;
    if not found then raise exception 'ACTIVATION_NOT_FOUND';end if;
    if promo.event_id is not null and activation_event is distinct from promo.event_id then raise exception 'PROMOTION_ACTIVATION_EVENT_MISMATCH';end if;
    update public.promotions set activation_id=target_activation,campaign_id=activation_campaign,event_id=coalesce(event_id,activation_event),updated_at=now() where id=target_promotion;
  end if;
  insert into public.promotion_rules(promotion_id,mechanic,percentage_off,fixed_amount_cop,buy_quantity,get_quantity,fixed_price_cop,minimum_quantity,minimum_spend_cop,maximum_discount_cop,per_user_limit,total_redemption_limit,budget_cop,local_time_start,local_time_end,weekdays,priority,stackable,active,updated_at)
  values(target_promotion,mechanic_value,
    case when mechanic_value='percentage' then (configuration->>'benefit')::numeric end,
    case when mechanic_value='fixed_amount' then (configuration->>'benefit')::integer end,
    case when mechanic_value='buy_x_get_y' then (configuration->>'buyQuantity')::integer end,
    case when mechanic_value='buy_x_get_y' then (configuration->>'getQuantity')::integer end,
    case when mechanic_value='fixed_price' then (configuration->>'benefit')::integer end,
    greatest(1,coalesce((configuration->>'minimumQuantity')::integer,1)),greatest(0,coalesce((configuration->>'minimumSpendCop')::integer,0)),nullif(configuration->>'maximumDiscountCop','')::integer,nullif(configuration->>'perUserLimit','')::integer,nullif(configuration->>'totalLimit','')::integer,nullif(configuration->>'budgetCop','')::bigint,start_time,end_time,coalesce((select array_agg(value::smallint) from jsonb_array_elements_text(configuration->'weekdays')),array[0,1,2,3,4,5,6]::smallint[]),coalesce((configuration->>'priority')::integer,100),coalesce((configuration->>'stackable')::boolean,false),true,now())
  on conflict(promotion_id) do update set mechanic=excluded.mechanic,percentage_off=excluded.percentage_off,fixed_amount_cop=excluded.fixed_amount_cop,buy_quantity=excluded.buy_quantity,get_quantity=excluded.get_quantity,fixed_price_cop=excluded.fixed_price_cop,minimum_quantity=excluded.minimum_quantity,minimum_spend_cop=excluded.minimum_spend_cop,maximum_discount_cop=excluded.maximum_discount_cop,per_user_limit=excluded.per_user_limit,total_redemption_limit=excluded.total_redemption_limit,budget_cop=excluded.budget_cop,local_time_start=excluded.local_time_start,local_time_end=excluded.local_time_end,weekdays=excluded.weekdays,priority=excluded.priority,stackable=excluded.stackable,active=true,updated_at=now()
  returning id into created_rule_id;
  delete from public.promotion_rule_items pri where pri.rule_id=created_rule_id;
  insert into public.promotion_rule_items(rule_id,venue_menu_item_id,brand_product_id,role,minimum_quantity) values(created_rule_id,target_menu_item,target_brand_product,'qualifying',greatest(1,coalesce((configuration->>'minimumQuantity')::integer,1)));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'promotion.rule.configured','promotion',target_promotion,jsonb_build_object('ruleId',created_rule_id,'menuItemId',target_menu_item));
  return created_rule_id;
end;$$;

revoke all on function public.reset_agent_promotion_flow(uuid) from public,anon;
grant execute on function public.reset_agent_promotion_flow(uuid) to authenticated;
grant execute on function public.configure_promotion_rule(uuid,uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
