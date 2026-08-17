begin;
do $$
declare venue_key text; session_value uuid:=gen_random_uuid(); first_id bigint; second_id bigint;
begin
  if has_table_privilege('anon','public.consumer_events','insert') then raise exception 'ANON_DIRECT_INSERT_ALLOWED';end if;
  if has_table_privilege('authenticated','public.consumer_events','insert') then raise exception 'AUTHENTICATED_DIRECT_INSERT_ALLOWED';end if;
  if not has_function_privilege('anon','public.track_consumer_event(text,uuid,text,text,text,text,text,jsonb,text)','execute') then raise exception 'ANON_TRACK_RPC_DENIED';end if;
  select external_key into venue_key from public.venues where active order by created_at limit 1;
  if venue_key is null then raise exception 'ACTIVE_VENUE_FIXTURE_REQUIRED';end if;
  first_id:=public.track_consumer_event('venue_view',session_value,'venue',venue_key,'test','desktop','/__phase4_test__','{}','__phase4_dedup__'||session_value);
  second_id:=public.track_consumer_event('venue_view',session_value,'venue',venue_key,'test','desktop','/__phase4_test__','{}','__phase4_dedup__'||session_value);
  if first_id<>second_id then raise exception 'EVENT_NOT_DEDUPLICATED';end if;
  if(select count(*) from public.consumer_events where dedup_key='__phase4_dedup__'||session_value)<>1 then raise exception 'DEDUP_COUNT_MISMATCH';end if;
  begin perform public.track_consumer_event('order_paid',session_value,null,null,'test','desktop',null,'{}',null);raise exception 'SERVER_EVENT_ACCEPTED_FROM_CLIENT';exception when others then if sqlerrm='SERVER_EVENT_ACCEPTED_FROM_CLIENT' then raise;end if;end;
end$$;
rollback;
