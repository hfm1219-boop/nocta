-- Permite confirmar mapping, regla y atribución de forma independiente.

create or replace function public.prepare_agent_promotion_engine(target_conversation uuid,configuration_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare promo public.promotions; target_org uuid; confirmation_id uuid; mapping_verified boolean:=false; menu_venue uuid; product_brand uuid; activation_brand uuid; do_mapping boolean; do_rule boolean; do_attribution boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.ai_conversations c where c.id=target_conversation and c.user_id=auth.uid() and c.status='active') then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  do_mapping:=coalesce((configuration_payload->>'configureMapping')::boolean,false);
  do_rule:=coalesce((configuration_payload->>'configureRule')::boolean,false);
  do_attribution:=coalesce((configuration_payload->>'configureAttribution')::boolean,false);
  if not(do_mapping or do_rule or do_attribution) then raise exception 'NO_ENGINE_COMPONENT_SELECTED'; end if;
  select * into promo from public.promotions where id=(configuration_payload->>'promotionId')::uuid;
  if promo.id is null or promo.venue_id is null then raise exception 'PROMOTION_NOT_FOUND'; end if;
  select organization_id into target_org from public.venues where id=promo.venue_id;
  if not public.can_manage_venue(promo.venue_id) or not public.current_user_can('venue.manage',target_org) then raise exception 'FORBIDDEN'; end if;
  if do_mapping or do_rule then
    select venue_id into menu_venue from public.venue_menu_items where id=(configuration_payload->>'menuItemId')::uuid and available;
    if menu_venue is distinct from promo.venue_id then raise exception 'PROMOTION_MENU_VENUE_MISMATCH'; end if;
  end if;
  if do_mapping then
    if coalesce((configuration_payload->>'brandQuantity')::numeric,0)<=0 or configuration_payload->>'brandUnit' not in('unit','ml','g','serving') then raise exception 'INVALID_MAPPING'; end if;
    select brand_id into product_brand from public.brand_products where id=(configuration_payload->>'brandProductId')::uuid and active;
    if product_brand is null then raise exception 'BRAND_PRODUCT_NOT_FOUND'; end if;
  end if;
  if do_attribution then
    select c.brand_id into activation_brand from public.brand_activations a join public.brand_campaigns c on c.id=a.campaign_id where a.id=(configuration_payload->>'activationId')::uuid and a.venue_id=promo.venue_id and a.status not in('rejected','cancelled');
    if activation_brand is null then raise exception 'ACTIVATION_NOT_FOUND'; end if;
  end if;
  if do_mapping and do_attribution and product_brand<>activation_brand then raise exception 'SKU_CAMPAIGN_BRAND_MISMATCH'; end if;
  if configuration_payload->>'brandProductId' is not null and configuration_payload->>'menuItemId' is not null then
    select verified into mapping_verified from public.brand_product_venue_items where brand_product_id=(configuration_payload->>'brandProductId')::uuid and venue_menu_item_id=(configuration_payload->>'menuItemId')::uuid and active;
  end if;
  update public.ai_confirmations set status='cancelled' where conversation_id=target_conversation and status='pending';
  insert into public.ai_confirmations(conversation_id,user_id,organization_id,venue_id,action,payload) values(target_conversation,auth.uid(),target_org,promo.venue_id,'configure_promotion_engine',configuration_payload) returning id into confirmation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ai.confirmation.requested','promotion',promo.id,jsonb_build_object('confirmationId',confirmation_id,'tool','configure_promotion_engine','mappingVerified',coalesce(mapping_verified,false),'mapping',do_mapping,'rule',do_rule,'attribution',do_attribution));
  return jsonb_build_object('confirmationId',confirmation_id,'mappingVerified',coalesce(mapping_verified,false));
end;$$;

create or replace function public.execute_confirmed_agent_promotion_engine(target_confirmation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare confirmation public.ai_confirmations; payload jsonb; mapping public.brand_product_venue_items; rule_id uuid; promo_id uuid; mapping_id uuid; mapping_verified boolean:=false; do_mapping boolean; do_rule boolean; do_attribution boolean; activation_event uuid; activation_campaign uuid; linked_brand uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into confirmation from public.ai_confirmations c where c.id=target_confirmation and c.user_id=auth.uid() for update;
  if confirmation.id is null then raise exception 'CONFIRMATION_NOT_FOUND'; end if;
  if confirmation.status<>'pending' then raise exception 'CONFIRMATION_ALREADY_USED'; end if;
  if confirmation.expires_at<=now() then update public.ai_confirmations set status='expired' where id=target_confirmation; raise exception 'CONFIRMATION_EXPIRED'; end if;
  if confirmation.action<>'configure_promotion_engine' then raise exception 'INVALID_ACTION'; end if;
  if not public.can_manage_venue(confirmation.venue_id) or not public.current_user_can('venue.manage',confirmation.organization_id) then raise exception 'FORBIDDEN'; end if;
  payload:=confirmation.payload; promo_id:=(payload->>'promotionId')::uuid;
  do_mapping:=coalesce((payload->>'configureMapping')::boolean,false);
  do_rule:=coalesce((payload->>'configureRule')::boolean,false);
  do_attribution:=coalesce((payload->>'configureAttribution')::boolean,false);
  update public.ai_confirmations set status='confirmed',confirmed_at=now() where id=target_confirmation;
  if do_mapping then
    mapping:=public.propose_product_mapping((payload->>'brandProductId')::uuid,(payload->>'menuItemId')::uuid,(payload->>'brandQuantity')::numeric,payload->>'brandUnit');
    mapping_id:=mapping.id; mapping_verified:=mapping.verified;
  elsif payload->>'brandProductId' is not null and payload->>'menuItemId' is not null then
    select m.id,m.verified into mapping_id,mapping_verified from public.brand_product_venue_items m where m.brand_product_id=(payload->>'brandProductId')::uuid and m.venue_menu_item_id=(payload->>'menuItemId')::uuid and m.active;
  end if;
  mapping_verified:=coalesce(mapping_verified,false);
  if do_attribution then
    select a.event_id,a.campaign_id into activation_event,activation_campaign from public.brand_activations a where a.id=(payload->>'activationId')::uuid and a.venue_id=confirmation.venue_id and a.status not in('rejected','cancelled');
    if not found then raise exception 'ACTIVATION_NOT_FOUND'; end if;
    update public.promotions set activation_id=(payload->>'activationId')::uuid,campaign_id=activation_campaign,event_id=coalesce(event_id,activation_event),updated_at=now() where id=promo_id and venue_id=confirmation.venue_id;
    if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  end if;
  if do_rule then
    linked_brand:=case when mapping_verified then nullif(payload->>'brandProductId','')::uuid else null end;
    rule_id:=public.configure_promotion_rule(promo_id,(payload->>'menuItemId')::uuid,linked_brand,case when do_attribution then nullif(payload->>'activationId','')::uuid else null end,payload);
  end if;
  update public.ai_confirmations set status='consumed',consumed_at=now() where id=target_confirmation;
  update public.ai_conversations set status='active',state=jsonb_build_object('promotionId',promo_id,'action','configure_promotion_engine','mappingVerified',mapping_verified),updated_at=now() where id=confirmation.conversation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'promotion.engine_configured_by_ai','promotion',promo_id,jsonb_build_object('mappingId',mapping_id,'mappingVerified',mapping_verified,'ruleId',rule_id,'activationId',case when do_attribution then payload->>'activationId' end,'mapping',do_mapping,'rule',do_rule,'attribution',do_attribution));
  return jsonb_build_object(
    'promotionId',promo_id,
    'mappingVerified',mapping_verified,
    'components',to_jsonb(array_remove(array[case when do_mapping then'mapping'end,case when do_rule then'rule'end,case when do_attribution then'attribution'end],null)),
    'status',case when do_mapping and not mapping_verified then'pending_brand_approval'else'configured'end
  );
end;$$;

revoke all on function public.prepare_agent_promotion_engine(uuid,jsonb),public.execute_confirmed_agent_promotion_engine(uuid) from public,anon;
grant execute on function public.prepare_agent_promotion_engine(uuid,jsonb),public.execute_confirmed_agent_promotion_engine(uuid) to authenticated;
notify pgrst,'reload schema';
