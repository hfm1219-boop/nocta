-- Fase 6: métricas reales y consistentes para establecimiento, promotor, marca y plataforma.
create or replace function public.track_consumer_event(
  requested_type text,requested_session uuid,entity_type text default null,entity_key text default null,
  requested_source text default 'web',requested_device text default 'unknown',requested_path text default null,
  requested_metadata jsonb default '{}'::jsonb,requested_dedup_key text default null
)returns bigint language plpgsql security definer set search_path=public as $$
declare result_id bigint;target_venue uuid;target_event uuid;target_promotion uuid;target_campaign uuid;target_activation uuid;rate_limit integer;
begin
  if requested_type not in('venue_impression','venue_view','venue_click','event_impression','event_view','event_click','promotion_impression','promotion_view','promotion_click','reservation_started','ticket_checkout_started','venue_checkin')then raise exception 'EVENT_NOT_CLIENT_TRACKABLE';end if;
  if requested_type='venue_checkin'and auth.uid()is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if requested_path is not null and length(requested_path)>500 then raise exception 'INVALID_PATH';end if;
  if jsonb_typeof(coalesce(requested_metadata,'{}'))<>'object'or length(coalesce(requested_metadata,'{}')::text)>4000 then raise exception 'INVALID_METADATA';end if;
  select session_events_per_minute into rate_limit from public.consumer_event_settings where id=true;
  if(select count(*)from public.consumer_events where session_id=requested_session and created_at>now()-interval '1 minute')>=coalesce(rate_limit,60)then raise exception 'RATE_LIMITED';end if;
  update public.consumer_event_settings set last_purged_at=now()where id=true and last_purged_at<now()-interval '1 day';
  if found then delete from public.consumer_events where(user_id is null and occurred_at<now()-make_interval(days=>(select anonymous_retention_days from public.consumer_event_settings where id=true)))or(user_id is not null and occurred_at<now()-make_interval(days=>(select identified_retention_days from public.consumer_event_settings where id=true)));end if;
  if entity_type='venue'then select id into target_venue from public.venues where external_key=entity_key and active;
  elsif entity_type='event'then select id into target_event from public.events where external_key=entity_key and status='published';
  elsif entity_type='promotion'then select id,venue_id,event_id,campaign_id,activation_id into target_promotion,target_venue,target_event,target_campaign,target_activation from public.promotions where id::text=entity_key and active and now()between starts_at and ends_at;end if;
  if entity_type is not null and coalesce(target_venue,target_event,target_promotion)is null then raise exception 'ENTITY_NOT_FOUND';end if;
  if requested_type='venue_checkin'then select id into result_id from public.consumer_events where user_id=auth.uid()and venue_id=target_venue and event_type='venue_checkin'and source='web'and occurred_at>now()-interval '6 hours'order by id desc limit 1;if result_id is not null then return result_id;end if;end if;
  insert into public.consumer_events(event_type,user_id,session_id,venue_id,event_id,promotion_id,campaign_id,activation_id,source,device,path,metadata,dedup_key)
  values(requested_type,auth.uid(),requested_session,target_venue,target_event,target_promotion,target_campaign,target_activation,left(requested_source,40),left(requested_device,40),requested_path,coalesce(requested_metadata,'{}')-array['verified','verified_by'],requested_dedup_key)
  on conflict(dedup_key)do update set dedup_key=excluded.dedup_key returning id into result_id;return result_id;
end$$;
grant execute on function public.track_consumer_event(text,uuid,text,text,text,text,text,jsonb,text)to anon,authenticated;

create or replace view public.venue_analytics with(security_invoker=true)as
select v.id venue_id,v.organization_id,
  count(*)filter(where ce.event_type='venue_impression')::bigint impressions,
  count(*)filter(where ce.event_type='venue_view')::bigint views,
  count(*)filter(where ce.event_type='venue_click')::bigint clicks,
  count(*)filter(where ce.event_type='venue_checkin')::bigint checkins,
  count(distinct coalesce(ce.user_id::text,ce.session_id::text))filter(where ce.event_type in('venue_view','venue_checkin'))::bigint reached_people,
  (select count(*)from public.reservations r where r.venue_id=v.id and r.status not in('cancelled','no_show'))::bigint reservations,
  (select count(*)from public.orders o where o.venue_id=v.id and o.status='delivered'and o.payment_status='paid')::bigint paid_orders,
  (select coalesce(sum(o.total_cop),0)from public.orders o where o.venue_id=v.id and o.status='delivered'and o.payment_status='paid')::bigint revenue_cop,
  (select count(*)from public.promotion_redemptions pr join public.promotions p on p.id=pr.promotion_id where p.venue_id=v.id and pr.status in('applied','redeemed'))::bigint redemptions,
  (select coalesce(sum(pr.discount_amount_cop),0)from public.promotion_redemptions pr join public.promotions p on p.id=pr.promotion_id where p.venue_id=v.id and pr.status in('applied','redeemed'))::bigint discount_cop
from public.venues v left join public.consumer_events ce on ce.venue_id=v.id group by v.id,v.organization_id;

create or replace view public.event_analytics with(security_invoker=true)as
select e.id event_id,e.organization_id,
  count(*)filter(where ce.event_type='event_impression')::bigint impressions,
  count(*)filter(where ce.event_type='event_view')::bigint views,
  count(*)filter(where ce.event_type='event_click')::bigint clicks,
  count(*)filter(where ce.event_type='venue_checkin')::bigint checkins,
  count(distinct coalesce(ce.user_id::text,ce.session_id::text))filter(where ce.event_type in('event_view','ticket_purchased','venue_checkin'))::bigint reached_people,
  (select count(*)from public.tickets t where t.event_id=e.id and t.status not in('cancelled','refunded'))::bigint tickets,
  (select count(*)from public.reservations r where r.event_id=e.id and r.status not in('cancelled','no_show'))::bigint reservations,
  (select coalesce(sum(t.amount_cop),0)from public.tickets t where t.event_id=e.id and t.status in('paid','used'))::bigint ticket_revenue_cop
from public.events e left join public.consumer_events ce on ce.event_id=e.id group by e.id,e.organization_id;

create or replace view public.brand_activation_analytics with(security_invoker=true)as
select a.id activation_id,a.campaign_id,
  count(*)filter(where ce.event_type='promotion_impression')::bigint impressions,
  count(*)filter(where ce.event_type='promotion_view')::bigint views,
  count(*)filter(where ce.event_type='promotion_click')::bigint clicks,
  count(distinct coalesce(ce.user_id::text,ce.session_id::text))filter(where ce.event_type in('promotion_impression','promotion_view','promotion_click'))::bigint reach,
  p.orders_influenced,p.redemptions,p.menu_units_sold,p.gross_sellout_cop,p.discount_cop,p.net_sellout_cop
from public.brand_activations a join public.brand_activation_performance p on p.activation_id=a.id left join public.consumer_events ce on ce.activation_id=a.id
group by a.id,a.campaign_id,p.orders_influenced,p.redemptions,p.menu_units_sold,p.gross_sellout_cop,p.discount_cop,p.net_sellout_cop;

grant select on public.venue_analytics,public.event_analytics,public.brand_activation_analytics to authenticated;

create or replace function public.platform_analytics()returns jsonb language sql stable security definer set search_path=public as $$
select case when public.is_platform_owner()then jsonb_build_object(
  'users',(select count(*)from public.profiles where status='active'),
  'venues',(select count(*)from public.venues where active),
  'events',(select count(*)from public.events where status='published'),
  'impressions',(select count(*)from public.consumer_events where event_type like '%_impression'),
  'views',(select count(*)from public.consumer_events where event_type like '%_view'),
  'checkins',(select count(*)from public.consumer_events where event_type='venue_checkin'),
  'paidOrders',(select count(*)from public.orders where status='delivered'and payment_status='paid'),
  'revenueCop',(select coalesce(sum(net_amount),0)from public.economic_transactions where status='completed'and currency='COP'and kind in('ticket_sale','reservation_deposit','order_payment')),
  'redemptions',(select count(*)from public.promotion_redemptions where status in('applied','redeemed')),
  'selloutCop',(select coalesce(sum(net_sellout_cop),0)from public.activation_sellout_attributions where status='confirmed')
)else null end$$;
revoke all on function public.platform_analytics()from public,anon;grant execute on function public.platform_analytics()to authenticated;

insert into supabase_migrations.schema_migrations(version,name,statements)values('202608180051','real_analytics_dashboards',array[]::text[])on conflict(version)do update set name=excluded.name;
notify pgrst,'reload schema';
