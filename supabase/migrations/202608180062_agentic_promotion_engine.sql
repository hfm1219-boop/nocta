-- Configuración agéntica de mapping, regla y atribución sin saltarse la aprobación bilateral.

alter table public.ai_confirmations drop constraint if exists ai_confirmations_action_check;
alter table public.ai_confirmations add constraint ai_confirmations_action_check check(action in('create_promotion','update_promotion','pause_promotion','reactivate_promotion','duplicate_promotion','configure_promotion_engine'));

create or replace function public.prepare_agent_promotion_engine(target_conversation uuid,configuration_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare promo public.promotions; target_org uuid; confirmation_id uuid; mapping_verified boolean:=false; menu_venue uuid; product_brand uuid; activation_brand uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.ai_conversations c where c.id=target_conversation and c.user_id=auth.uid() and c.status='active') then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  select * into promo from public.promotions where id=(configuration_payload->>'promotionId')::uuid;
  if promo.id is null or promo.venue_id is null then raise exception 'PROMOTION_NOT_FOUND'; end if;
  select organization_id into target_org from public.venues where id=promo.venue_id;
  if not public.can_manage_venue(promo.venue_id) or not public.current_user_can('venue.manage',target_org) then raise exception 'FORBIDDEN'; end if;
  select venue_id into menu_venue from public.venue_menu_items where id=(configuration_payload->>'menuItemId')::uuid and available;
  if menu_venue is distinct from promo.venue_id then raise exception 'PROMOTION_MENU_VENUE_MISMATCH'; end if;
  if coalesce((configuration_payload->>'brandQuantity')::numeric,0)<=0 or configuration_payload->>'brandUnit' not in('unit','ml','g','serving') then raise exception 'INVALID_MAPPING'; end if;
  select brand_id into product_brand from public.brand_products where id=(configuration_payload->>'brandProductId')::uuid and active;
  select c.brand_id into activation_brand from public.brand_activations a join public.brand_campaigns c on c.id=a.campaign_id where a.id=(configuration_payload->>'activationId')::uuid and a.venue_id=promo.venue_id and a.status not in('rejected','cancelled');
  if product_brand is null or activation_brand is null or product_brand<>activation_brand then raise exception 'SKU_CAMPAIGN_BRAND_MISMATCH'; end if;
  select verified into mapping_verified from public.brand_product_venue_items where brand_product_id=(configuration_payload->>'brandProductId')::uuid and venue_menu_item_id=(configuration_payload->>'menuItemId')::uuid and active;
  update public.ai_confirmations set status='cancelled' where conversation_id=target_conversation and status='pending';
  insert into public.ai_confirmations(conversation_id,user_id,organization_id,venue_id,action,payload) values(target_conversation,auth.uid(),target_org,promo.venue_id,'configure_promotion_engine',configuration_payload) returning id into confirmation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ai.confirmation.requested','promotion',promo.id,jsonb_build_object('confirmationId',confirmation_id,'tool','configure_promotion_engine','mappingVerified',coalesce(mapping_verified,false)));
  return jsonb_build_object('confirmationId',confirmation_id,'mappingVerified',coalesce(mapping_verified,false));
end;$$;

create or replace function public.execute_confirmed_agent_promotion_engine(target_confirmation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare confirmation public.ai_confirmations; payload jsonb; mapping public.brand_product_venue_items; rule_id uuid; promo_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into confirmation from public.ai_confirmations c where c.id=target_confirmation and c.user_id=auth.uid() for update;
  if confirmation.id is null then raise exception 'CONFIRMATION_NOT_FOUND'; end if;
  if confirmation.status<>'pending' then raise exception 'CONFIRMATION_ALREADY_USED'; end if;
  if confirmation.expires_at<=now() then update public.ai_confirmations set status='expired' where id=target_confirmation; raise exception 'CONFIRMATION_EXPIRED'; end if;
  if confirmation.action<>'configure_promotion_engine' then raise exception 'INVALID_ACTION'; end if;
  if not public.can_manage_venue(confirmation.venue_id) or not public.current_user_can('venue.manage',confirmation.organization_id) then raise exception 'FORBIDDEN'; end if;
  payload:=confirmation.payload; promo_id:=(payload->>'promotionId')::uuid;
  update public.ai_confirmations set status='confirmed',confirmed_at=now() where id=target_confirmation;
  mapping:=public.propose_product_mapping((payload->>'brandProductId')::uuid,(payload->>'menuItemId')::uuid,(payload->>'brandQuantity')::numeric,payload->>'brandUnit');
  if mapping.verified then
    rule_id:=public.configure_promotion_rule(promo_id,(payload->>'menuItemId')::uuid,(payload->>'brandProductId')::uuid,(payload->>'activationId')::uuid,payload);
  end if;
  update public.ai_confirmations set status='consumed',consumed_at=now() where id=target_confirmation;
  update public.ai_conversations set status='completed',state=jsonb_build_object('promotionId',promo_id,'action','configure_promotion_engine','mappingVerified',mapping.verified),updated_at=now() where id=confirmation.conversation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'promotion.engine_configured_by_ai','promotion',promo_id,jsonb_build_object('mappingId',mapping.id,'mappingVerified',mapping.verified,'ruleId',rule_id,'activationId',payload->>'activationId'));
  return jsonb_build_object('promotionId',promo_id,'mappingVerified',mapping.verified,'status',case when mapping.verified then'configured'else'pending_brand_approval'end);
end;$$;

revoke all on function public.prepare_agent_promotion_engine(uuid,jsonb),public.execute_confirmed_agent_promotion_engine(uuid) from public,anon;
grant execute on function public.prepare_agent_promotion_engine(uuid,jsonb),public.execute_confirmed_agent_promotion_engine(uuid) to authenticated;
notify pgrst,'reload schema';
