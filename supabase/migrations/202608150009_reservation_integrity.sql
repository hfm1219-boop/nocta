alter table public.reservations add column if not exists customer_email text;
alter table public.reservations add column if not exists access_token_hash text;
create unique index if not exists reservations_access_token_hash_key on public.reservations(access_token_hash) where access_token_hash is not null;

create or replace function public.can_validate_access(target_event uuid, target_venue uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_owner()
  or exists(select 1 from public.event_members em where em.event_id=target_event and em.user_id=auth.uid() and em.role in ('organizer','door_staff'))
  or exists(select 1 from public.events e where e.id=target_event and e.owner_user_id=auth.uid())
  or exists(select 1 from public.venue_members vm where vm.venue_id=target_venue and vm.user_id=auth.uid() and vm.role in ('venue_owner','venue_admin','door_staff'))
  or exists(select 1 from public.venues v join public.organization_members om on om.organization_id=v.organization_id where v.id=target_venue and om.user_id=auth.uid() and om.role in ('venue_owner','venue_admin'));
$$;

create or replace function public.validate_reservation(reservation_token text)
returns table(result text, reservation_id uuid, customer_name text, zone_name text, party_size integer, event_key text)
language plpgsql security definer set search_path = '' as $$
declare selected_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select r.* into selected_reservation from public.reservations r
  where r.access_token_hash = encode(digest(upper(trim(reservation_token)), 'sha256'), 'hex') for update;
  if not found or selected_reservation.status in ('cancelled','no_show') then result := 'invalid'; return next; return; end if;
  if not public.can_validate_access(selected_reservation.event_id,selected_reservation.venue_id) then raise exception 'Acceso denegado'; end if;
  select e.external_key into event_key from public.events e where e.id = selected_reservation.event_id;
  reservation_id := selected_reservation.id; customer_name := selected_reservation.customer_name;
  zone_name := selected_reservation.zone_name; party_size := selected_reservation.party_size;
  if selected_reservation.status in ('checked_in','completed') then result := 'used'; return next; return; end if;
  if selected_reservation.status <> 'confirmed' then result := 'pending'; return next; return; end if;
  update public.reservations set status='checked_in',updated_at=now() where id=selected_reservation.id;
  result := 'accepted'; return next;
end; $$;

revoke all on function public.validate_reservation(text) from public, anon;
grant execute on function public.validate_reservation(text) to authenticated;
grant execute on function public.can_validate_access(uuid,uuid) to authenticated;

create or replace function public.validate_ticket(ticket_token text)
returns table(result text, holder_name text, type_name text, event_key text)
language plpgsql security definer set search_path = '' as $$
declare selected_ticket public.tickets%rowtype; selected_venue uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select t.* into selected_ticket from public.tickets t where t.qr_token_hash=encode(digest(upper(trim(ticket_token)),'sha256'),'hex') for update;
  if not found or selected_ticket.status='cancelled' then result:='invalid';return next;return;end if;
  select evc.venue_id into selected_venue from public.event_venue_collaborations evc where evc.event_id=selected_ticket.event_id and evc.status='approved' limit 1;
  if not public.can_validate_access(selected_ticket.event_id,selected_venue) then raise exception 'Acceso denegado'; end if;
  select tt.name,e.external_key into type_name,event_key from public.ticket_types tt join public.events e on e.id=selected_ticket.event_id where tt.id=selected_ticket.ticket_type_id;
  holder_name:=selected_ticket.holder_name;if selected_ticket.status='used' then result:='used';return next;return;end if;
  update public.tickets set status='used',used_at=now(),used_by=auth.uid() where id=selected_ticket.id;result:='accepted';return next;
end; $$;
notify pgrst, 'reload schema';
