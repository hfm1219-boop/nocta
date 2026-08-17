-- Cierre fases 1-5: asistencia completa, check-in verificado, rate limits, retención y reversos.
alter table public.consumer_events add column guest_list_entry_id uuid references public.guest_list_entries(id)on delete set null;
create index consumer_events_guest_entry on public.consumer_events(guest_list_entry_id)where guest_list_entry_id is not null;

create table public.consumer_event_settings(
  id boolean primary key default true check(id),
  anonymous_retention_days integer not null default 90 check(anonymous_retention_days between 30 and 365),
  identified_retention_days integer not null default 730 check(identified_retention_days between 90 and 1825),
  session_events_per_minute integer not null default 60 check(session_events_per_minute between 10 and 600),
  last_purged_at timestamptz not null default '-infinity',
  updated_at timestamptz not null default now()
);
insert into public.consumer_event_settings(id)values(true);
alter table public.consumer_event_settings enable row level security;
create policy "event settings platform read" on public.consumer_event_settings for select to authenticated using(public.is_platform_owner());
create policy "event settings platform manage" on public.consumer_event_settings for all to authenticated using(public.is_platform_owner())with check(public.is_platform_owner());
grant select,update on public.consumer_event_settings to authenticated;

create or replace function public.track_consumer_event(
  requested_type text,requested_session uuid,entity_type text default null,entity_key text default null,
  requested_source text default 'web',requested_device text default 'unknown',requested_path text default null,
  requested_metadata jsonb default '{}'::jsonb,requested_dedup_key text default null
)returns bigint language plpgsql security definer set search_path=public as $$
declare result_id bigint;target_venue uuid;target_event uuid;target_promotion uuid;rate_limit integer;
begin
  if requested_type not in('venue_impression','venue_view','venue_click','event_impression','event_view','event_click','promotion_impression','promotion_view','promotion_click','reservation_started','ticket_checkout_started','venue_checkin')then raise exception 'EVENT_NOT_CLIENT_TRACKABLE';end if;
  if requested_type='venue_checkin'and auth.uid()is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if requested_path is not null and length(requested_path)>500 then raise exception 'INVALID_PATH';end if;
  if jsonb_typeof(coalesce(requested_metadata,'{}'))<>'object'or length(coalesce(requested_metadata,'{}')::text)>4000 then raise exception 'INVALID_METADATA';end if;
  select session_events_per_minute into rate_limit from public.consumer_event_settings where id=true;
  if(select count(*)from public.consumer_events where session_id=requested_session and created_at>now()-interval '1 minute')>=coalesce(rate_limit,60)then raise exception 'RATE_LIMITED';end if;
  update public.consumer_event_settings set last_purged_at=now()where id=true and last_purged_at<now()-interval '1 day';
  if found then
    delete from public.consumer_events where
      (user_id is null and occurred_at<now()-make_interval(days=>(select anonymous_retention_days from public.consumer_event_settings where id=true)))or
      (user_id is not null and occurred_at<now()-make_interval(days=>(select identified_retention_days from public.consumer_event_settings where id=true)));
  end if;
  if entity_type='venue'then select id into target_venue from public.venues where external_key=entity_key and active;
  elsif entity_type='event'then select id into target_event from public.events where external_key=entity_key and status='published';
  elsif entity_type='promotion'then select id,venue_id,event_id into target_promotion,target_venue,target_event from public.promotions where id::text=entity_key and active and now()between starts_at and ends_at;end if;
  if entity_type is not null and coalesce(target_venue,target_event,target_promotion)is null then raise exception 'ENTITY_NOT_FOUND';end if;
  if requested_type='venue_checkin'then
    select id into result_id from public.consumer_events where user_id=auth.uid()and venue_id=target_venue and event_type='venue_checkin'and source='web'and occurred_at>now()-interval '6 hours'order by id desc limit 1;
    if result_id is not null then return result_id;end if;
  end if;
  insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,promotion_id,source,device,path,metadata,dedup_key)
  values(requested_type,auth.uid(),requested_session,target_venue,target_event,target_promotion,left(requested_source,40),left(requested_device,40),requested_path,coalesce(requested_metadata,'{}')-array['verified','verified_by'],requested_dedup_key)
  on conflict(dedup_key)do update set dedup_key=excluded.dedup_key returning id into result_id;return result_id;
end$$;
grant execute on function public.track_consumer_event(text,uuid,text,text,text,text,text,jsonb,text)to anon,authenticated;

create or replace function public.capture_verified_attendance_event()returns trigger language plpgsql security definer set search_path=public as $$
declare linked_event uuid;linked_venue uuid;
begin
  if tg_table_name='reservations'then
    if new.status in('checked_in','completed')and old.status not in('checked_in','completed')then
      insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,reservation_id,source,metadata,dedup_key)
      values('venue_checkin',new.customer_user_id,gen_random_uuid(),new.venue_id,new.event_id,new.id,'database',jsonb_build_object('verified',true,'verified_by',auth.uid()),'reservation_checkin:'||new.id)on conflict(dedup_key)do nothing;
    end if;
  elsif tg_table_name='guest_list_entries'then
    if new.status='checked_in'and old.status is distinct from new.status and new.guest_user_id is not null then
      select gl.event_id,evc.venue_id into linked_event,linked_venue from public.guest_lists gl left join public.event_venue_collaborations evc on evc.event_id=gl.event_id and evc.status='approved'where gl.id=new.guest_list_id limit 1;
      insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,guest_list_entry_id,source,metadata,dedup_key)
      values('venue_checkin',new.guest_user_id,gen_random_uuid(),linked_venue,linked_event,new.id,'database',jsonb_build_object('verified',true,'verified_by',auth.uid()),'guest_checkin:'||new.id)on conflict(dedup_key)do nothing;
    end if;
  end if;return new;
end$$;
revoke all on function public.capture_verified_attendance_event()from public,anon,authenticated;
create trigger reservation_verified_attendance after update of status on public.reservations for each row execute function public.capture_verified_attendance_event();
create trigger guest_verified_attendance after update of status on public.guest_list_entries for each row execute function public.capture_verified_attendance_event();

create or replace function public.award_loyalty_for_consumer_event(target_event bigint)returns integer
language plpgsql security definer set search_path=public as $$
declare item public.consumer_events;rule public.loyalty_earning_rules;earned integer:=0;tx_kind text;tx_key text;tx_concept text;order_total integer;distinct_venues integer;
begin
  select * into item from public.consumer_events where id=target_event;if not found or item.user_id is null then return 0;end if;
  if not exists(select 1 from public.profiles where id=item.user_id and status='active')then return 0;end if;
  select * into rule from public.loyalty_earning_rules where event_type=item.event_type and active;if not found then return 0;end if;
  if item.event_type='order_delivered'then select total_cop into order_total from public.orders where id=item.order_id and status='delivered';earned:=least(rule.maximum_points,floor(coalesce(order_total,0)::numeric/rule.cop_per_point)::integer);tx_kind:='purchase_credit';tx_key:='automatic:order:'||item.order_id;tx_concept:='Consumo NOCTA · $'||to_char(coalesce(order_total,0),'FM999G999G999');
  elsif item.event_type='venue_checkin'then
    if item.ticket_id is null and item.reservation_id is null and item.guest_list_entry_id is null and coalesce((item.metadata->>'verified')::boolean,false)is not true then return 0;end if;
    earned:=rule.fixed_points;tx_kind:='attendance_credit';
    tx_key:=case when item.ticket_id is not null then'automatic:ticket-checkin:'||item.ticket_id when item.reservation_id is not null then'automatic:reservation-checkin:'||item.reservation_id when item.guest_list_entry_id is not null then'automatic:guest-checkin:'||item.guest_list_entry_id else'automatic:verified-venue-checkin:'||item.id end;
    tx_concept:=case when item.event_id is not null then'Asistencia verificada a evento'else'Visita verificada en NOCTA'end;
  end if;
  if earned<=0 or tx_key is null then return 0;end if;
  insert into public.wallet_transactions(user_id,kind,status,points,concept,idempotency_key,consumer_event_id)values(item.user_id,tx_kind,'confirmed',earned,tx_concept,tx_key,item.id)on conflict(user_id,idempotency_key)do nothing;if not found then return 0;end if;
  if item.event_type='order_delivered'and item.promotion_id is not null then insert into public.wallet_transactions(user_id,kind,status,points,concept,idempotency_key,consumer_event_id)values(item.user_id,'loyalty_bonus','confirmed',25,'Bonus por producto de campaña','automatic:campaign-product:'||item.order_id,item.id)on conflict(user_id,idempotency_key)do nothing;end if;
  if item.event_type='venue_checkin'then select count(distinct venue_id)into distinct_venues from public.consumer_events where user_id=item.user_id and event_type='venue_checkin'and venue_id is not null and(ticket_id is not null or reservation_id is not null or guest_list_entry_id is not null or coalesce((metadata->>'verified')::boolean,false));if distinct_venues>=3 then insert into public.wallet_transactions(user_id,kind,status,points,concept,idempotency_key,consumer_event_id)values(item.user_id,'loyalty_bonus','confirmed',100,'Bonus explorador · 3 establecimientos','automatic:three-venues',item.id)on conflict(user_id,idempotency_key)do nothing;end if;end if;return earned;
end$$;
revoke all on function public.award_loyalty_for_consumer_event(bigint)from public,anon,authenticated;

create or replace function public.verify_consumer_venue_checkin(target_event bigint)returns boolean language plpgsql security definer set search_path=public as $$
declare item public.consumer_events;begin select * into item from public.consumer_events where id=target_event and event_type='venue_checkin'for update;if not found then return false;end if;if not public.can_operate_venue(item.venue_id)then raise exception 'FORBIDDEN';end if;update public.consumer_events set metadata=metadata||jsonb_build_object('verified',true,'verified_by',auth.uid(),'verified_at',now())where id=item.id;perform public.award_loyalty_for_consumer_event(item.id);return true;end$$;
revoke all on function public.verify_consumer_venue_checkin(bigint)from public,anon;
grant execute on function public.verify_consumer_venue_checkin(bigint)to authenticated;

create or replace function public.reverse_automatic_loyalty()returns trigger language plpgsql security definer set search_path=public as $$
declare current_row jsonb:=to_jsonb(new);previous_row jsonb:=to_jsonb(old);current_status text:=current_row->>'status';previous_status text:=previous_row->>'status';entity_id text:=current_row->>'id';target_user uuid;
begin
  if current_status is not distinct from previous_status then return new;end if;
  if tg_table_name='orders'and current_status in('cancelled','expired')then target_user:=(current_row->>'customer_user_id')::uuid;update public.wallet_transactions set status='reversed'where user_id=target_user and idempotency_key in('automatic:order:'||entity_id,'automatic:campaign-product:'||entity_id)and status='confirmed';
  elsif tg_table_name='tickets'and current_status in('cancelled','refunded')then target_user:=(current_row->>'holder_user_id')::uuid;update public.wallet_transactions set status='reversed'where user_id=target_user and idempotency_key='automatic:ticket-checkin:'||entity_id and status='confirmed';
  elsif tg_table_name='reservations'and current_status in('cancelled','no_show')then target_user:=(current_row->>'customer_user_id')::uuid;update public.wallet_transactions set status='reversed'where user_id=target_user and idempotency_key='automatic:reservation-checkin:'||entity_id and status='confirmed';
  elsif tg_table_name='guest_list_entries'and current_status='cancelled'and current_row->>'guest_user_id'is not null then target_user:=(current_row->>'guest_user_id')::uuid;update public.wallet_transactions set status='reversed'where user_id=target_user and idempotency_key='automatic:guest-checkin:'||entity_id and status='confirmed';end if;return new;
end$$;
revoke all on function public.reverse_automatic_loyalty()from public,anon,authenticated;
create trigger order_loyalty_reversal after update of status on public.orders for each row execute function public.reverse_automatic_loyalty();
create trigger ticket_loyalty_reversal after update of status on public.tickets for each row execute function public.reverse_automatic_loyalty();
create trigger reservation_loyalty_reversal after update of status on public.reservations for each row execute function public.reverse_automatic_loyalty();
create trigger guest_loyalty_reversal after update of status on public.guest_list_entries for each row execute function public.reverse_automatic_loyalty();

create or replace function public.purge_expired_consumer_events()returns bigint language plpgsql security definer set search_path=public as $$declare settings public.consumer_event_settings;removed bigint;begin if not public.is_platform_owner()then raise exception 'FORBIDDEN';end if;select * into settings from public.consumer_event_settings where id=true;delete from public.consumer_events where(user_id is null and occurred_at<now()-make_interval(days=>settings.anonymous_retention_days))or(user_id is not null and occurred_at<now()-make_interval(days=>settings.identified_retention_days));get diagnostics removed=row_count;return removed;end$$;
create or replace function public.anonymize_my_consumer_events()returns bigint language plpgsql security definer set search_path=public as $$declare changed bigint;begin if auth.uid()is null then raise exception 'AUTH_REQUIRED';end if;update public.consumer_events set user_id=null,metadata=metadata-array['verified_by']where user_id=auth.uid();get diagnostics changed=row_count;return changed;end$$;
revoke all on function public.purge_expired_consumer_events(),public.anonymize_my_consumer_events()from public,anon;
grant execute on function public.purge_expired_consumer_events(),public.anonymize_my_consumer_events()to authenticated;

insert into supabase_migrations.schema_migrations(version,name,statements)values('202608170050','phase_1_5_closure',array[]::text[])on conflict(version)do update set name=excluded.name;
notify pgrst,'reload schema';
