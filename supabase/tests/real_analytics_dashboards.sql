begin;
do $$declare promotion_id uuid;session_key uuid:=gen_random_uuid();event_id bigint;activation uuid;begin
  if has_function_privilege('anon','public.platform_analytics()','execute')then raise exception 'PLATFORM_ANALYTICS_EXPOSED';end if;
  select p.id,p.activation_id into promotion_id,activation from public.promotions p where p.active and p.activation_id is not null and now()between p.starts_at and p.ends_at limit 1;
  if promotion_id is not null then event_id:=public.track_consumer_event('promotion_impression',session_key,'promotion',promotion_id::text,'test','desktop','/__phase6__','{}','__phase6__'||session_key);if(select activation_id from public.consumer_events where id=event_id)is distinct from activation then raise exception 'PROMOTION_ACTIVATION_NOT_ATTRIBUTED';end if;end if;
  if not exists(select 1 from public.venue_analytics)then raise exception 'VENUE_ANALYTICS_EMPTY';end if;
  if not exists(select 1 from public.event_analytics)then raise exception 'EVENT_ANALYTICS_EMPTY';end if;
end$$;
rollback;
