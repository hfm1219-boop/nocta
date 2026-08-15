-- La sede decide una colaboración mediante una única operación autorizada.
-- Aprobar publica el evento y abre Conecta; rechazar conserva ambos cerrados.
create or replace function public.decide_event_collaboration(
  collaboration_id uuid,
  decision text,
  decision_notes text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare selected public.event_venue_collaborations;
begin
  if decision not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
  select * into selected from public.event_venue_collaborations
  where id = collaboration_id for update;
  if not found then raise exception 'COLLABORATION_NOT_FOUND'; end if;
  if selected.status <> 'requested' then raise exception 'COLLABORATION_ALREADY_DECIDED'; end if;
  if not public.can_manage_venue(selected.venue_id) then raise exception 'FORBIDDEN'; end if;

  update public.event_venue_collaborations
  set status = decision::public.collaboration_status,
      notes = coalesce(btrim(decision_notes), ''),
      decided_by = auth.uid(), decided_at = now()
  where id = selected.id;

  update public.events
  set status = case when decision = 'approved' then 'published' else 'draft' end
  where id = selected.event_id;

  update public.conecta_modules
  set status = case when decision = 'approved' then 'open' else 'draft' end,
      updated_at = now()
  where event_id = selected.event_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'event.collaboration.' || decision, 'event_venue_collaboration', selected.id,
    jsonb_build_object('event_id', selected.event_id, 'venue_id', selected.venue_id));
end;
$$;

revoke update on public.event_venue_collaborations from authenticated;
grant execute on function public.decide_event_collaboration(uuid,text,text) to authenticated;
