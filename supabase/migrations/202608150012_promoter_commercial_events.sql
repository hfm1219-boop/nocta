alter table public.events add column if not exists details jsonb not null default '{}'::jsonb;
grant select,insert,update,delete on public.events,public.ticket_types,public.event_venue_collaborations to authenticated;
create or replace function public.can_manage_venue(target_venue uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner()
  or exists(select 1 from public.venue_members vm where vm.venue_id=target_venue and vm.user_id=auth.uid() and vm.role in('venue_owner','venue_admin'))
  or exists(select 1 from public.venues v join public.organization_members om on om.organization_id=v.organization_id where v.id=target_venue and om.user_id=auth.uid() and om.role in('venue_owner','venue_admin'));
$$;
grant execute on function public.can_manage_venue(uuid) to authenticated;
drop policy if exists "venue operators collaboration read" on public.event_venue_collaborations;
drop policy if exists "venue operators collaboration update" on public.event_venue_collaborations;
create policy "venue operators collaboration read" on public.event_venue_collaborations for select using(public.can_manage_venue(venue_id));
create policy "venue operators collaboration update" on public.event_venue_collaborations for update using(public.can_manage_venue(venue_id)) with check(public.can_manage_venue(venue_id));

create or replace function public.create_commercial_event(event_payload jsonb,ticket_payload jsonb)
returns table(id uuid,external_key text) language plpgsql security definer set search_path='' as $$
declare new_event uuid;new_key text;venue uuid;ticket jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.promoter_profiles where user_id=auth.uid()) then raise exception 'Se requiere rol promotor';end if;
  if nullif(trim(event_payload->>'name'),'') is null or (event_payload->>'capacity')::integer<1 or jsonb_array_length(ticket_payload)<1 then raise exception 'Evento incompleto';end if;
  new_key:='plan-'||replace(gen_random_uuid()::text,'-','');
  insert into public.events(external_key,owner_user_id,name,starts_at,ends_at,capacity,status,details)
  values(new_key,auth.uid(),trim(event_payload->>'name'),(event_payload->>'starts_at')::timestamptz,nullif(event_payload->>'ends_at','')::timestamptz,(event_payload->>'capacity')::integer,'draft',event_payload-'name'-'starts_at'-'ends_at'-'capacity') returning public.events.id into new_event;
  for ticket in select * from jsonb_array_elements(ticket_payload) loop
    insert into public.ticket_types(event_id,name,description,price_cop,capacity,active) values(new_event,trim(ticket->>'name'),coalesce(ticket->>'description',''),(ticket->>'price_cop')::integer,(ticket->>'capacity')::integer,true);
  end loop;
  if nullif(event_payload->>'venue_key','') is not null then
    select v.id into venue from public.venues v where v.external_key=event_payload->>'venue_key';
    if venue is null then raise exception 'Establecimiento no encontrado';end if;
    insert into public.event_venue_collaborations(event_id,venue_id,requested_by,status) values(new_event,venue,auth.uid(),'requested') on conflict do nothing;
  end if;
  id:=new_event;external_key:=new_key;return next;
end;$$;
revoke all on function public.create_commercial_event(jsonb,jsonb) from public,anon;
grant execute on function public.create_commercial_event(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
