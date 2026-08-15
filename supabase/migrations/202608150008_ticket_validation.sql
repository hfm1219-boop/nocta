create or replace function public.validate_ticket(ticket_token text)
returns table(result text, holder_name text, type_name text, event_key text)
language plpgsql security definer set search_path = '' as $$
declare selected_ticket public.tickets%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select t.* into selected_ticket from public.tickets t
  where t.qr_token_hash = encode(digest(upper(trim(ticket_token)), 'sha256'), 'hex') for update;
  if not found or selected_ticket.status = 'cancelled' then
    result := 'invalid'; return next; return;
  end if;
  if not (
    public.can_manage_event(selected_ticket.event_id)
    or exists (
      select 1 from public.event_venue_collaborations evc
      where evc.event_id = selected_ticket.event_id and evc.status = 'approved'
      and public.can_operate_venue(evc.venue_id)
    )
  ) then raise exception 'Acceso denegado'; end if;
  select tt.name, e.external_key into type_name, event_key
  from public.ticket_types tt join public.events e on e.id = selected_ticket.event_id
  where tt.id = selected_ticket.ticket_type_id;
  holder_name := selected_ticket.holder_name;
  if selected_ticket.status = 'used' then result := 'used'; return next; return; end if;
  update public.tickets set status = 'used', used_at = now(), used_by = auth.uid() where id = selected_ticket.id;
  result := 'accepted'; return next;
end; $$;

revoke all on function public.validate_ticket(text) from public, anon;
grant execute on function public.validate_ticket(text) to authenticated;
notify pgrst, 'reload schema';
