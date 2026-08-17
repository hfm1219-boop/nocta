begin;
do $$
declare
  test_user_id uuid;operator_id uuid;test_venue_id uuid;test_venue_key text;
  self_event bigint;reservation_event bigint;test_reservation uuid;test_order uuid;
  session_key uuid:=gen_random_uuid();rate_blocked boolean:=false;
begin
  if pg_catalog.has_function_privilege('anon','public.verify_consumer_venue_checkin(bigint)','EXECUTE')then raise exception 'ANON_CAN_VERIFY_CHECKIN';end if;
  if pg_catalog.has_function_privilege('anon','public.purge_expired_consumer_events()','EXECUTE')then raise exception 'ANON_CAN_PURGE_EVENTS';end if;
  select pm.user_id into operator_id from public.platform_members pm where pm.role='platform_owner'limit 1;
  select p.id into test_user_id from public.profiles p where p.status='active'order by(p.id=operator_id),p.created_at limit 1;
  select v.id,v.external_key into test_venue_id,test_venue_key from public.venues v where v.active and v.external_key is not null limit 1;
  if operator_id is null or test_user_id is null or test_venue_id is null then raise exception 'CLOSURE_FIXTURE_MISSING';end if;

  perform set_config('request.jwt.claim.sub',test_user_id::text,true);
  self_event:=public.track_consumer_event('venue_checkin',gen_random_uuid(),'venue',test_venue_key,'web','test','/test','{}',null);
  if exists(select 1 from public.wallet_transactions where user_id=test_user_id and consumer_event_id=self_event)then raise exception 'UNVERIFIED_CHECKIN_CREDITED';end if;
  perform set_config('request.jwt.claim.sub',operator_id::text,true);
  if not public.verify_consumer_venue_checkin(self_event)then raise exception 'OPERATOR_VERIFICATION_FAILED';end if;
  if(select points from public.wallet_transactions where user_id=test_user_id and idempotency_key='automatic:verified-venue-checkin:'||self_event)is distinct from 50 then raise exception 'VERIFIED_CHECKIN_NOT_CREDITED';end if;

  insert into public.reservations(venue_id,customer_user_id,customer_name,party_size,reserved_for,status)
  values(test_venue_id,test_user_id,'Prueba cierre',2,now()+interval '1 day','confirmed')returning id into test_reservation;
  update public.reservations set status='checked_in'where id=test_reservation;
  select id into reservation_event from public.consumer_events where reservation_id=test_reservation and event_type='venue_checkin';
  if reservation_event is null then raise exception 'RESERVATION_ATTENDANCE_NOT_CAPTURED';end if;
  if(select points from public.wallet_transactions where user_id=test_user_id and idempotency_key='automatic:reservation-checkin:'||test_reservation)is distinct from 50 then raise exception 'RESERVATION_ATTENDANCE_NOT_CREDITED';end if;
  update public.reservations set status='cancelled'where id=test_reservation;
  if(select status from public.wallet_transactions where user_id=test_user_id and idempotency_key='automatic:reservation-checkin:'||test_reservation)is distinct from 'reversed' then raise exception 'RESERVATION_CREDIT_NOT_REVERSED';end if;

  insert into public.orders(external_key,venue_id,customer_user_id,service_mode,items,subtotal_cop,tip_cop,total_cop,payment_method,payment_status,status)
  values('__closure_order__'||gen_random_uuid(),test_venue_id,test_user_id,'bar','[]',180000,0,180000,'cash','paid','new')returning id into test_order;
  update public.orders set status='delivered'where id=test_order;
  update public.orders set status='cancelled'where id=test_order;
  if(select status from public.wallet_transactions where user_id=test_user_id and idempotency_key='automatic:order:'||test_order)is distinct from 'reversed' then raise exception 'ORDER_CREDIT_NOT_REVERSED';end if;

  insert into public.consumer_events(event_type,session_id,source,device)select 'venue_view',session_key,'test','test'from generate_series(1,60);
  begin perform public.track_consumer_event('venue_view',session_key,'venue',test_venue_key,'web','test','/test','{}',null);
  exception when others then if sqlerrm like '%RATE_LIMITED%'then rate_blocked:=true;else raise;end if;end;
  if not rate_blocked then raise exception 'EVENT_RATE_LIMIT_NOT_ENFORCED';end if;
end$$;
rollback;
