-- Fase 5: consumo y asistencia generan loyalty automáticamente, sin evidencia manual.
alter table public.wallet_transactions drop constraint if exists wallet_transactions_kind_check;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check
  check(kind in('mission_credit','purchase_credit','attendance_credit','loyalty_bonus','adjustment','reversal','redemption','expiration'));
alter table public.wallet_transactions add column consumer_event_id bigint references public.consumer_events(id)on delete set null;
create index wallet_consumer_event on public.wallet_transactions(consumer_event_id)where consumer_event_id is not null;

create table public.loyalty_earning_rules(
  event_type text primary key check(event_type in('venue_checkin','order_delivered')),
  mode text not null check(mode in('fixed','spend')),
  fixed_points integer not null default 0 check(fixed_points>=0),
  cop_per_point integer not null default 1000 check(cop_per_point>0),
  maximum_points integer not null default 10000 check(maximum_points>0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.loyalty_earning_rules(event_type,mode,fixed_points,cop_per_point,maximum_points)values
('venue_checkin','fixed',50,1000,50),('order_delivered','spend',0,1000,10000);
alter table public.loyalty_earning_rules enable row level security;
create policy "loyalty rules public read" on public.loyalty_earning_rules for select to authenticated using(true);
create policy "loyalty rules platform manage" on public.loyalty_earning_rules for all to authenticated using(public.is_platform_owner())with check(public.is_platform_owner());
grant select,insert,update,delete on public.loyalty_earning_rules to authenticated;

create or replace function public.award_loyalty_for_consumer_event(target_event bigint)returns integer
language plpgsql security definer set search_path=public as $$
declare item public.consumer_events;rule public.loyalty_earning_rules;earned integer:=0;tx_kind text;tx_key text;tx_concept text;order_total integer;distinct_venues integer;
begin
  select * into item from public.consumer_events where id=target_event;
  if not found or item.user_id is null then return 0;end if;
  if not exists(select 1 from public.profiles where id=item.user_id and status='active')then return 0;end if;
  select * into rule from public.loyalty_earning_rules where event_type=item.event_type and active;
  if not found then return 0;end if;
  if item.event_type='order_delivered' then
    select total_cop into order_total from public.orders where id=item.order_id and status='delivered';
    earned:=least(rule.maximum_points,floor(coalesce(order_total,0)::numeric/rule.cop_per_point)::integer);
    tx_kind:='purchase_credit';tx_key:='automatic:order:'||item.order_id;tx_concept:='Consumo NOCTA · $'||to_char(coalesce(order_total,0),'FM999G999G999');
  elsif item.event_type='venue_checkin' then
    earned:=rule.fixed_points;tx_kind:='attendance_credit';
    tx_key:=case when item.ticket_id is not null then 'automatic:ticket-checkin:'||item.ticket_id else 'automatic:venue-checkin:'||item.user_id||':'||item.venue_id||':'||to_char(item.occurred_at at time zone 'America/Bogota','YYYY-MM-DD')end;
    tx_concept:=case when item.event_id is not null then 'Asistencia verificada a evento' else 'Visita identificada en NOCTA' end;
  end if;
  if earned<=0 or tx_key is null then return 0;end if;
  insert into public.wallet_transactions(user_id,kind,status,points,concept,idempotency_key,consumer_event_id)
  values(item.user_id,tx_kind,'confirmed',earned,tx_concept,tx_key,item.id)on conflict(user_id,idempotency_key)do nothing;
  if not found then return 0;end if;
  if item.event_type='order_delivered' and item.promotion_id is not null then
    insert into public.wallet_transactions(user_id,kind,status,points,concept,idempotency_key,consumer_event_id)
    values(item.user_id,'loyalty_bonus','confirmed',25,'Bonus por producto de campaña','automatic:campaign-product:'||item.order_id,item.id)on conflict(user_id,idempotency_key)do nothing;
  end if;
  if item.event_type='venue_checkin' then
    select count(distinct venue_id)into distinct_venues from public.consumer_events where user_id=item.user_id and event_type='venue_checkin' and venue_id is not null;
    if distinct_venues>=3 then insert into public.wallet_transactions(user_id,kind,status,points,concept,idempotency_key,consumer_event_id)
      values(item.user_id,'loyalty_bonus','confirmed',100,'Bonus explorador · 3 establecimientos','automatic:three-venues',item.id)on conflict(user_id,idempotency_key)do nothing;end if;
  end if;
  return earned;
end$$;
revoke all on function public.award_loyalty_for_consumer_event(bigint)from public,anon,authenticated;

create or replace function public.capture_automatic_loyalty()returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.award_loyalty_for_consumer_event(new.id);return new;exception when others then return new;end$$;
revoke all on function public.capture_automatic_loyalty()from public,anon,authenticated;
create trigger consumer_event_loyalty after insert on public.consumer_events for each row execute function public.capture_automatic_loyalty();

create or replace function public.reconcile_automatic_loyalty(target_user uuid default auth.uid())returns integer
language plpgsql security definer set search_path=public as $$declare item record;credited integer:=0;begin
  if target_user is distinct from auth.uid() and not public.is_platform_owner()then raise exception 'FORBIDDEN';end if;
  for item in select id from public.consumer_events where user_id=target_user and event_type in('venue_checkin','order_delivered') order by id loop credited:=credited+public.award_loyalty_for_consumer_event(item.id);end loop;return credited;end$$;
revoke all on function public.reconcile_automatic_loyalty(uuid)from public,anon;
grant execute on function public.reconcile_automatic_loyalty(uuid)to authenticated;

-- La sincronización anterior dependía de abrir la billetera; se conserva como alias compatible.
create or replace function public.sync_verified_attendance()returns integer language sql security definer set search_path=public as $$select public.reconcile_automatic_loyalty(auth.uid())$$;
revoke all on function public.sync_verified_attendance()from public,anon;
grant execute on function public.sync_verified_attendance()to authenticated;
update public.loyalty_missions set status='inactive' where slug='verified-attendance';

do $$declare item record;begin for item in select id from public.consumer_events where event_type in('venue_checkin','order_delivered') order by id loop perform public.award_loyalty_for_consumer_event(item.id);end loop;end$$;
insert into supabase_migrations.schema_migrations(version,name,statements)values('202608170049','automatic_loyalty',array[]::text[])on conflict(version)do update set name=excluded.name;
notify pgrst,'reload schema';
