-- Corrige el hash de tickets cuando pgcrypto solo expone digest(bytea, text).
create or replace function public.nocta_sha256(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(value, 'UTF8'), 'sha256'::text),
    'hex'
  );
$$;

revoke all on function public.nocta_sha256(text) from public, anon;
grant execute on function public.nocta_sha256(text) to authenticated;

create or replace function public.purchase_tickets(
  event_key text,
  type_name text,
  quantity integer,
  holder_name text,
  holder_email text
)
returns table(id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_type public.ticket_types%rowtype;
  selected_event public.events%rowtype;
  sold integer;
  raw_token text;
  new_id uuid;
  counter integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if quantity < 1 or quantity > 4 or nullif(pg_catalog.btrim(holder_name), '') is null or pg_catalog.strpos(holder_email, '@') < 2 then
    raise exception 'Compra inválida';
  end if;

  select * into selected_event
  from public.events
  where external_key = event_key and status = 'published';
  if not found then raise exception 'Evento no disponible'; end if;

  select * into selected_type
  from public.ticket_types
  where event_id = selected_event.id and name = type_name and active
  for update;
  if not found then raise exception 'Localidad no disponible'; end if;

  select count(*) into sold
  from public.tickets
  where ticket_type_id = selected_type.id and status in ('reserved', 'paid', 'used');
  if sold + quantity > selected_type.capacity then raise exception 'No quedan suficientes entradas'; end if;

  for counter in 1..quantity loop
    raw_token := pg_catalog.upper(pg_catalog.replace(gen_random_uuid()::text, '-', ''));
    insert into public.tickets(
      ticket_type_id, event_id, holder_user_id, holder_name, holder_email,
      qr_token, qr_token_hash, status, amount_cop, purchased_at
    ) values (
      selected_type.id, selected_event.id, auth.uid(), pg_catalog.btrim(holder_name),
      pg_catalog.btrim(holder_email), raw_token, public.nocta_sha256(raw_token),
      'paid', selected_type.price_cop, now()
    ) returning public.tickets.id into new_id;
    id := new_id;
    token := raw_token;
    return next;
  end loop;
end;
$$;

revoke all on function public.purchase_tickets(text,text,integer,text,text) from public, anon;
grant execute on function public.purchase_tickets(text,text,integer,text,text) to authenticated;

create or replace function public.validate_ticket(ticket_token text)
returns table(result text, holder_name text, type_name text, event_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_ticket public.tickets%rowtype;
  selected_venue uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select t.* into selected_ticket
  from public.tickets t
  where t.qr_token_hash = public.nocta_sha256(pg_catalog.upper(pg_catalog.btrim(ticket_token)))
  for update;
  if not found or selected_ticket.status = 'cancelled' then
    result := 'invalid'; return next; return;
  end if;
  select evc.venue_id into selected_venue
  from public.event_venue_collaborations evc
  where evc.event_id = selected_ticket.event_id and evc.status = 'approved'
  limit 1;
  if not public.can_validate_access(selected_ticket.event_id, selected_venue) then raise exception 'Acceso denegado'; end if;
  select tt.name, e.external_key into type_name, event_key
  from public.ticket_types tt
  join public.events e on e.id = selected_ticket.event_id
  where tt.id = selected_ticket.ticket_type_id;
  holder_name := selected_ticket.holder_name;
  if selected_ticket.status = 'used' then result := 'used'; return next; return; end if;
  update public.tickets set status = 'used', used_at = now(), used_by = auth.uid()
  where id = selected_ticket.id;
  result := 'accepted'; return next;
end;
$$;

revoke all on function public.validate_ticket(text) from public, anon;
grant execute on function public.validate_ticket(text) to authenticated;

notify pgrst, 'reload schema';
