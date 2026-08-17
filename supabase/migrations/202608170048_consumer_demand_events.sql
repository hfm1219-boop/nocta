-- Fase 4: funnel de demanda auditable, anónimo y autenticado.
create table public.consumer_events(
  id bigint generated always as identity primary key,
  event_type text not null check(event_type in(
    'venue_impression','venue_view','venue_click','event_impression','event_view','event_click',
    'promotion_impression','promotion_view','promotion_click','favorite_added','favorite_removed',
    'reservation_started','reservation_completed','ticket_checkout_started','ticket_purchased',
    'venue_checkin','order_created','order_paid','order_delivered','promotion_applied'
  )),
  user_id uuid references public.profiles(id) on delete set null,
  session_id uuid not null,
  venue_id uuid references public.venues(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  promotion_id uuid references public.promotions(id) on delete set null,
  campaign_id uuid references public.brand_campaigns(id) on delete set null,
  activation_id uuid references public.brand_activations(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete set null,
  source text not null default 'web' check(length(source) between 1 and 40),
  device text not null default 'unknown' check(length(device) between 1 and 40),
  path text check(path is null or length(path)<=500),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  dedup_key text unique,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index consumer_events_funnel_time on public.consumer_events(event_type,occurred_at desc);
create index consumer_events_venue_time on public.consumer_events(venue_id,occurred_at desc) where venue_id is not null;
create index consumer_events_event_time on public.consumer_events(event_id,occurred_at desc) where event_id is not null;
create index consumer_events_campaign_time on public.consumer_events(campaign_id,occurred_at desc) where campaign_id is not null;
alter table public.consumer_events enable row level security;

create policy "consumer own events read" on public.consumer_events for select to authenticated
using(user_id=auth.uid() or public.is_platform_owner()
  or(venue_id is not null and public.can_operate_venue(venue_id))
  or(event_id is not null and public.can_manage_event(event_id))
  or exists(select 1 from public.brand_activations ba join public.brand_campaigns bc on bc.id=ba.campaign_id where ba.id=consumer_events.activation_id and public.can_view_brand_organization(bc.organization_id)));
grant select on public.consumer_events to authenticated;

create or replace function public.track_consumer_event(
  requested_type text, requested_session uuid, entity_type text default null, entity_key text default null,
  requested_source text default 'web', requested_device text default 'unknown', requested_path text default null,
  requested_metadata jsonb default '{}'::jsonb, requested_dedup_key text default null
)returns bigint language plpgsql security definer set search_path=public as $$
declare result_id bigint; target_venue uuid; target_event uuid; target_promotion uuid;
begin
  if requested_type not in('venue_impression','venue_view','venue_click','event_impression','event_view','event_click','promotion_impression','promotion_view','promotion_click','reservation_started','ticket_checkout_started','venue_checkin') then raise exception 'EVENT_NOT_CLIENT_TRACKABLE';end if;
  if requested_type='venue_checkin' and auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if requested_path is not null and length(requested_path)>500 then raise exception 'INVALID_PATH';end if;
  if jsonb_typeof(coalesce(requested_metadata,'{}'))<>'object' or length(coalesce(requested_metadata,'{}')::text)>4000 then raise exception 'INVALID_METADATA';end if;
  if entity_type='venue' then select id into target_venue from public.venues where external_key=entity_key and active;
  elsif entity_type='event' then select id into target_event from public.events where external_key=entity_key and status='published';
  elsif entity_type='promotion' then select id,venue_id,event_id into target_promotion,target_venue,target_event from public.promotions where id::text=entity_key and active and now() between starts_at and ends_at;
  end if;
  if entity_type is not null and coalesce(target_venue,target_event,target_promotion) is null then raise exception 'ENTITY_NOT_FOUND';end if;
  insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,promotion_id,source,device,path,metadata,dedup_key)
  values(requested_type,auth.uid(),requested_session,target_venue,target_event,target_promotion,left(requested_source,40),left(requested_device,40),requested_path,coalesce(requested_metadata,'{}'),requested_dedup_key)
  on conflict(dedup_key)do update set dedup_key=excluded.dedup_key returning id into result_id;
  return result_id;
end$$;
grant execute on function public.track_consumer_event(text,uuid,text,text,text,text,text,jsonb,text) to anon,authenticated;

create or replace function public.capture_consumer_conversion()returns trigger language plpgsql security definer set search_path=public as $$
declare kind text; sid uuid; linked_event uuid; linked_venue uuid; linked_promotion uuid; linked_campaign uuid; linked_activation uuid;
begin
  sid:=gen_random_uuid();
  if tg_table_name='consumer_favorites' then kind:=case when tg_op='INSERT' then 'favorite_added' else 'favorite_removed' end;
    insert into public.consumer_events(event_type,user_id,session_id,source,metadata,dedup_key)values(kind,coalesce(new.user_id,old.user_id),sid,'database',jsonb_build_object('entityType',coalesce(new.entity_type,old.entity_type),'entityKey',coalesce(new.entity_key,old.entity_key)),kind||':'||coalesce(new.user_id,old.user_id)||':'||coalesce(new.entity_type,old.entity_type)||':'||coalesce(new.entity_key,old.entity_key)||':'||extract(epoch from date_trunc('second',now())));if tg_op='DELETE' then return old;else return new;end if;
  elsif tg_table_name='reservations' then
    if tg_op='INSERT' then kind:='reservation_completed'; else return new; end if; linked_event:=new.event_id;linked_venue:=new.venue_id;
    insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,reservation_id,source,dedup_key)values(kind,new.customer_user_id,sid,linked_venue,linked_event,new.id,'database',kind||':'||new.id);return new;
  elsif tg_table_name='tickets' then
    if tg_op='INSERT' then kind:='ticket_purchased'; elsif new.status='used' and old.status is distinct from new.status then kind:='venue_checkin';else return new;end if;
    select ev.id,evc.venue_id into linked_event,linked_venue from public.events ev left join public.event_venue_collaborations evc on evc.event_id=ev.id and evc.status='approved' where ev.id=new.event_id limit 1;
    insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,ticket_id,source,dedup_key)values(kind,new.holder_user_id,sid,linked_venue,linked_event,new.id,'database',kind||':'||new.id);return new;
  elsif tg_table_name='orders' then
    select pr.promotion_id,p.event_id,pr.campaign_id,pr.activation_id into linked_promotion,linked_event,linked_campaign,linked_activation from public.promotion_redemptions pr join public.promotions p on p.id=pr.promotion_id where pr.id=new.promotion_redemption_id;
    if tg_op='INSERT' then
      insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,promotion_id,campaign_id,activation_id,order_id,source,dedup_key)values('order_created',new.customer_user_id,sid,new.venue_id,linked_event,linked_promotion,linked_campaign,linked_activation,new.id,'database','order_created:'||new.id);
      if linked_promotion is not null then insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,promotion_id,campaign_id,activation_id,order_id,source,dedup_key)values('promotion_applied',new.customer_user_id,gen_random_uuid(),new.venue_id,linked_event,linked_promotion,linked_campaign,linked_activation,new.id,'database','promotion_applied:'||new.id);end if;
    else
      if new.payment_status='paid' and old.payment_status is distinct from new.payment_status then insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,promotion_id,campaign_id,activation_id,order_id,source,dedup_key)values('order_paid',new.customer_user_id,sid,new.venue_id,linked_event,linked_promotion,linked_campaign,linked_activation,new.id,'database','order_paid:'||new.id);end if;
      if new.status='delivered' and old.status is distinct from new.status then insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,promotion_id,campaign_id,activation_id,order_id,source,dedup_key)values('order_delivered',new.customer_user_id,gen_random_uuid(),new.venue_id,linked_event,linked_promotion,linked_campaign,linked_activation,new.id,'database','order_delivered:'||new.id);end if;
    end if;return new;
  end if;if tg_op='DELETE' then return old;else return new;end if;
end$$;
revoke all on function public.capture_consumer_conversion() from public,anon,authenticated;
create trigger consumer_favorite_events after insert or delete on public.consumer_favorites for each row execute function public.capture_consumer_conversion();
create trigger consumer_reservation_events after insert on public.reservations for each row execute function public.capture_consumer_conversion();
create trigger consumer_ticket_events after insert or update of status on public.tickets for each row execute function public.capture_consumer_conversion();
create trigger consumer_order_events after insert or update of status,payment_status on public.orders for each row execute function public.capture_consumer_conversion();

create view public.consumer_funnel_daily with(security_invoker=true)as
select date_trunc('day',occurred_at) as bucket_day,venue_id,event_id,promotion_id,campaign_id,activation_id,event_type,count(*) as event_count,count(distinct coalesce(user_id::text,session_id::text)) as people_count
from public.consumer_events group by 1,2,3,4,5,6,7;
grant select on public.consumer_funnel_daily to authenticated;
insert into supabase_migrations.schema_migrations(version,name,statements)values('202608170048','consumer_demand_events',array[]::text[])on conflict(version)do update set name=excluded.name;
notify pgrst,'reload schema';
