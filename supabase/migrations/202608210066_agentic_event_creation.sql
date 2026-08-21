-- Creación conversacional y confirmada de eventos propios del establecimiento.

alter table public.ai_confirmations drop constraint if exists ai_confirmations_action_check;
alter table public.ai_confirmations add constraint ai_confirmations_action_check check(action in('create_promotion','update_promotion','pause_promotion','reactivate_promotion','duplicate_promotion','configure_promotion_engine','create_event'));

create or replace function public.prepare_agent_event(target_conversation uuid,event_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target_venue uuid;target_org uuid;confirmation_id uuid;start_at timestamptz;end_at timestamptz;capacity_value integer;ticket_price integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  if not exists(select 1 from public.ai_conversations c where c.id=target_conversation and c.user_id=auth.uid() and c.status='active')then raise exception 'CONVERSATION_NOT_FOUND';end if;
  target_venue:=(event_payload->>'venueId')::uuid;
  select v.organization_id into target_org from public.venues v where v.id=target_venue and v.active;
  if target_org is null or not public.can_manage_venue(target_venue) or not public.current_user_can('venue.manage',target_org)then raise exception 'FORBIDDEN';end if;
  if nullif(trim(event_payload->>'name'),'')is null or length(trim(event_payload->>'name'))<3 then raise exception 'INVALID_EVENT_NAME';end if;
  start_at:=(event_payload->>'startsAt')::timestamptz;end_at:=(event_payload->>'endsAt')::timestamptz;
  if start_at<=now() or end_at<=start_at then raise exception 'INVALID_EVENT_WINDOW';end if;
  capacity_value:=(event_payload->>'capacity')::integer;ticket_price:=(event_payload->>'ticketPriceCop')::integer;
  if capacity_value<1 or capacity_value>100000 then raise exception 'INVALID_EVENT_CAPACITY';end if;
  if ticket_price<0 then raise exception 'INVALID_TICKET_PRICE';end if;
  update public.ai_confirmations set status='cancelled' where conversation_id=target_conversation and status='pending';
  insert into public.ai_confirmations(conversation_id,user_id,organization_id,venue_id,action,payload)
  values(target_conversation,auth.uid(),target_org,target_venue,'create_event',event_payload)returning id into confirmation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'ai.confirmation.requested','ai_conversation',target_conversation,jsonb_build_object('confirmationId',confirmation_id,'tool','create_event','venueId',target_venue));
  return confirmation_id;
end;$$;

create or replace function public.execute_confirmed_agent_event(target_confirmation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare confirmation public.ai_confirmations;payload jsonb;new_event_id uuid;event_key text;start_at timestamptz;end_at timestamptz;capacity_value integer;ticket_price integer;venue_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  select * into confirmation from public.ai_confirmations c where c.id=target_confirmation and c.user_id=auth.uid() for update;
  if confirmation.id is null then raise exception 'CONFIRMATION_NOT_FOUND';end if;
  if confirmation.status<>'pending' then raise exception 'CONFIRMATION_ALREADY_USED';end if;
  if confirmation.expires_at<=now()then update public.ai_confirmations set status='expired' where id=target_confirmation;raise exception 'CONFIRMATION_EXPIRED';end if;
  if confirmation.action<>'create_event' then raise exception 'INVALID_ACTION';end if;
  if not public.can_manage_venue(confirmation.venue_id) or not public.current_user_can('venue.manage',confirmation.organization_id)then raise exception 'FORBIDDEN';end if;
  payload:=confirmation.payload;start_at:=(payload->>'startsAt')::timestamptz;end_at:=(payload->>'endsAt')::timestamptz;capacity_value:=(payload->>'capacity')::integer;ticket_price:=(payload->>'ticketPriceCop')::integer;
  if nullif(trim(payload->>'name'),'')is null or start_at<=now() or end_at<=start_at or capacity_value<1 or ticket_price<0 then raise exception 'INVALID_EVENT';end if;
  select name into venue_name from public.venues where id=confirmation.venue_id and organization_id=confirmation.organization_id and active;
  if venue_name is null then raise exception 'VENUE_NOT_FOUND';end if;
  update public.ai_confirmations set status='confirmed',confirmed_at=now() where id=target_confirmation;
  event_key:='agent-'||replace(gen_random_uuid()::text,'-','');
  insert into public.events(external_key,owner_user_id,organization_id,name,starts_at,ends_at,capacity,status,details)
  values(event_key,auth.uid(),confirmation.organization_id,trim(payload->>'name'),start_at,end_at,capacity_value,'published',jsonb_build_object('summary',coalesce(payload->>'description',''),'description',coalesce(payload->>'description',''),'venue_name',venue_name,'source','nocta_assistant'))returning id into new_event_id;
  insert into public.event_members(event_id,user_id,role)values(new_event_id,auth.uid(),'organizer')on conflict do nothing;
  insert into public.event_venue_collaborations(event_id,venue_id,requested_by,status,decided_by,decided_at,notes)
  values(new_event_id,confirmation.venue_id,auth.uid(),'approved',auth.uid(),now(),'Creado y aprobado por el administrador de la sede mediante NOCTA Assistant');
  insert into public.ticket_types(event_id,name,description,price_cop,capacity,active)
  values(new_event_id,coalesce(nullif(trim(payload->>'ticketName'),''),'Entrada general'),'Entrada creada mediante NOCTA Assistant',ticket_price,capacity_value,true);
  update public.ai_confirmations set status='consumed',consumed_at=now() where id=target_confirmation;
  update public.ai_conversations set status='active',state=jsonb_build_object('eventId',new_event_id,'action','create_event'),updated_at=now() where id=confirmation.conversation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'event.created_by_ai','event',new_event_id,jsonb_build_object('conversationId',confirmation.conversation_id,'confirmationId',target_confirmation,'venueId',confirmation.venue_id,'externalKey',event_key));
  return jsonb_build_object('eventId',new_event_id,'externalKey',event_key);
end;$$;

revoke all on function public.prepare_agent_event(uuid,jsonb),public.execute_confirmed_agent_event(uuid) from public,anon;
grant execute on function public.prepare_agent_event(uuid,jsonb),public.execute_confirmed_agent_event(uuid) to authenticated;
notify pgrst,'reload schema';
