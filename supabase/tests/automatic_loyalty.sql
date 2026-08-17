begin;
do $$
declare test_user_id uuid;test_venue_id uuid;test_order_id uuid;first_event bigint;balance_before bigint;balance_after bigint;checkin_key text;
begin
  if pg_catalog.has_table_privilege('authenticated','public.wallet_transactions','INSERT')then raise exception 'DIRECT_WALLET_INSERT_ALLOWED';end if;
  if pg_catalog.has_function_privilege('authenticated','public.award_loyalty_for_consumer_event(bigint)','EXECUTE')then raise exception 'INTERNAL_AWARD_RPC_EXPOSED';end if;
  select p.id,v.id into test_user_id,test_venue_id from public.profiles p cross join public.venues v
  where p.status='active' and v.active and not exists(select 1 from public.wallet_transactions wt where wt.user_id=p.id and wt.idempotency_key='automatic:venue-checkin:'||p.id||':'||v.id||':'||to_char(now() at time zone 'America/Bogota','YYYY-MM-DD'))limit 1;
  if test_user_id is null then raise exception 'LOYALTY_FIXTURE_MISSING';end if;
  perform set_config('request.jwt.claim.sub',test_user_id::text,true);
  select available into balance_before from public.wallet_balance(test_user_id);
  insert into public.consumer_events(event_type,user_id,session_id,venue_id,source,metadata,dedup_key)
  values('venue_checkin',test_user_id,gen_random_uuid(),test_venue_id,'test','{"verified":true}'::jsonb,'__phase5_checkin_1__'||gen_random_uuid())returning id into first_event;
  checkin_key:='automatic:verified-venue-checkin:'||first_event;
  if(select points from public.wallet_transactions where wallet_transactions.user_id=test_user_id and idempotency_key=checkin_key)is distinct from 50 then raise exception 'CHECKIN_POINTS_MISMATCH';end if;
  if(select consumer_event_id from public.wallet_transactions where wallet_transactions.user_id=test_user_id and idempotency_key=checkin_key)is distinct from first_event then raise exception 'CHECKIN_EVENT_NOT_LINKED';end if;
  perform public.award_loyalty_for_consumer_event(first_event);
  if(select count(*) from public.wallet_transactions wt where wt.user_id=test_user_id and wt.idempotency_key=checkin_key)<>1 then raise exception 'CHECKIN_NOT_IDEMPOTENT';end if;

  insert into public.orders(external_key,venue_id,customer_user_id,service_mode,items,subtotal_cop,tip_cop,total_cop,payment_method,payment_status,status)
  values('__phase5_order__'||gen_random_uuid(),test_venue_id,test_user_id,'bar','[]',180000,0,180000,'cash','pending','new')returning id into test_order_id;
  update public.orders set payment_status='paid',status='delivered' where id=test_order_id;
  if(select points from public.wallet_transactions where wallet_transactions.user_id=test_user_id and idempotency_key='automatic:order:'||test_order_id)is distinct from 180 then raise exception 'PURCHASE_POINTS_MISMATCH';end if;
  perform public.reconcile_automatic_loyalty(test_user_id);
  if(select count(*) from public.wallet_transactions wt where wt.user_id=test_user_id and wt.idempotency_key='automatic:order:'||test_order_id)<>1 then raise exception 'PURCHASE_NOT_IDEMPOTENT';end if;
  select available into balance_after from public.wallet_balance(test_user_id);
  if balance_after<balance_before+230 then raise exception 'BALANCE_NOT_CREDITED';end if;
end$$;
rollback;
