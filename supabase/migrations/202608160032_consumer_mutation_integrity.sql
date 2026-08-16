-- Mutaciones de autoservicio sin conceder UPDATE general sobre columnas sensibles.
drop policy if exists "ticket holder self update" on public.tickets;
drop policy if exists "reservation customer cancel" on public.reservations;

create or replace function public.manage_own_ticket(
  ticket_id uuid, requested_action text, new_holder_name text default null, new_holder_email text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if requested_action = 'transfer' then
    if length(trim(coalesce(new_holder_name, ''))) < 2
      or coalesce(new_holder_email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    then raise exception 'INVALID_HOLDER'; end if;
    update public.tickets set holder_name=trim(new_holder_name), holder_email=lower(trim(new_holder_email))
      where id=ticket_id and holder_user_id=auth.uid() and status in ('reserved','paid');
  elsif requested_action = 'cancel' then
    update public.tickets set status='cancelled'
      where id=ticket_id and holder_user_id=auth.uid() and status in ('reserved','paid');
  else raise exception 'INVALID_ACTION'; end if;
  get diagnostics changed = row_count;
  return changed = 1;
end; $$;

create or replace function public.cancel_own_reservation(reservation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.reservations set status='cancelled', updated_at=now()
    where id=reservation_id and customer_user_id=auth.uid() and status in ('pending','confirmed');
  get diagnostics changed = row_count;
  return changed = 1;
end; $$;

revoke all on function public.manage_own_ticket(uuid,text,text,text) from public;
revoke all on function public.cancel_own_reservation(uuid) from public;
grant execute on function public.manage_own_ticket(uuid,text,text,text) to authenticated;
grant execute on function public.cancel_own_reservation(uuid) to authenticated;
notify pgrst, 'reload schema';
