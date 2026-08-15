-- Conecta multidispositivo: perfil operativo, feedback y mutaciones seguras.
alter table public.conecta_participants
  add column if not exists age integer check (age between 18 and 120),
  add column if not exists gender text,
  add column if not exists intention text,
  add column if not exists feedback jsonb;

create index if not exists idx_conecta_assignments_participants
  on public.conecta_assignments using gin (participant_ids);
create unique index if not exists uq_conecta_greeting
  on public.conecta_interactions(conecta_id, from_participant_id, to_participant_id)
  where kind = 'greeting';
create unique index if not exists uq_conecta_contact_pair
  on public.conecta_interactions(
    conecta_id,
    least(from_participant_id, to_participant_id),
    greatest(from_participant_id, to_participant_id)
  ) where kind = 'contact';

drop policy if exists "conecta owner participants read" on public.conecta_participants;
create policy "conecta owner participants read"
  on public.conecta_participants for select
  using (exists (
    select 1 from public.conecta_modules c
    where c.id = conecta_id and (c.owner_promoter_id = auth.uid() or public.is_platform_owner())
  ));

drop policy if exists "conecta owner interactions read" on public.conecta_interactions;
create policy "conecta owner interactions read"
  on public.conecta_interactions for select
  using (exists (
    select 1 from public.conecta_modules c
    where c.id = conecta_id and (c.owner_promoter_id = auth.uid() or public.is_platform_owner())
  ));

drop policy if exists "conecta owner reports update" on public.conecta_reports;
create policy "conecta owner reports update"
  on public.conecta_reports for update
  using (exists (
    select 1 from public.conecta_modules c
    where c.id = conecta_id and (c.owner_promoter_id = auth.uid() or public.is_platform_owner())
  ));

-- El cliente no puede modificar libremente identidad, módulo o consentimiento.
revoke insert, update on public.conecta_participants from authenticated;
grant select on public.conecta_participants to authenticated;
revoke insert, update on public.conecta_interactions from authenticated;
revoke insert, update on public.conecta_reports from authenticated;

create or replace function public.register_conecta_participant(
  module_key text,
  participant_name text,
  participant_phone text,
  participant_age integer,
  participant_gender text,
  participant_intention text,
  accepted_consent boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  module_row public.conecta_modules;
  participant_id uuid;
  current_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not accepted_consent then raise exception 'CONSENT_REQUIRED'; end if;
  if nullif(btrim(participant_name), '') is null or nullif(btrim(participant_phone), '') is null then
    raise exception 'PARTICIPANT_DATA_REQUIRED';
  end if;
  if participant_age < 18 or participant_age > 120 then raise exception 'ADULT_REQUIRED'; end if;

  select * into module_row from public.conecta_modules
  where external_key = module_key for update;
  if not found then raise exception 'MODULE_NOT_FOUND'; end if;
  if module_row.status <> 'open' then raise exception 'REGISTRATION_CLOSED'; end if;

  select id into participant_id from public.conecta_participants
  where conecta_id = module_row.id and user_id = auth.uid();
  if participant_id is not null then return participant_id; end if;

  select count(*) into current_count from public.conecta_participants
  where conecta_id = module_row.id;
  if current_count >= module_row.capacity then raise exception 'CAPACITY_REACHED'; end if;

  insert into public.conecta_participants(
    conecta_id, user_id, display_name, phone, age, gender, intention, consented_at
  ) values (
    module_row.id, auth.uid(), btrim(participant_name), btrim(participant_phone),
    participant_age, nullif(btrim(participant_gender), ''),
    nullif(btrim(participant_intention), ''), now()
  ) returning id into participant_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values(auth.uid(), 'conecta.participant.registered', 'conecta_participant', participant_id);
  return participant_id;
end;
$$;

create or replace function public.update_my_conecta_participation(
  module_key text,
  requested_action text,
  action_payload jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  participant_row public.conecta_participants;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select p.* into participant_row
  from public.conecta_participants p
  join public.conecta_modules c on c.id = p.conecta_id
  where c.external_key = module_key and p.user_id = auth.uid()
  for update of p;
  if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;

  if requested_action = 'questionnaire' then
    if jsonb_typeof(action_payload) <> 'object' or action_payload = '{}'::jsonb then
      raise exception 'QUESTIONNAIRE_REQUIRED';
    end if;
    update public.conecta_participants
      set questionnaire = action_payload, questionnaire_completed_at = now()
      where id = participant_row.id;
  elsif requested_action = 'checkin' then
    if participant_row.questionnaire_completed_at is null then raise exception 'QUESTIONNAIRE_INCOMPLETE'; end if;
    update public.conecta_participants set checked_in_at = coalesce(checked_in_at, now())
      where id = participant_row.id;
  elsif requested_action = 'feedback' then
    if coalesce((action_payload->>'rating')::integer, 0) not between 1 and 5 then
      raise exception 'INVALID_FEEDBACK';
    end if;
    update public.conecta_participants set feedback = action_payload where id = participant_row.id;
  else
    raise exception 'INVALID_ACTION';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'conecta.participant.' || requested_action, 'conecta_participant', participant_row.id,
    jsonb_build_object('module_key', module_key));
end;
$$;

create or replace function public.manage_conecta_state(module_key text, next_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare module_row public.conecta_modules;
begin
  if next_status not in ('open','matching','revealed','closed') then raise exception 'INVALID_STATUS'; end if;
  select * into module_row from public.conecta_modules where external_key = module_key for update;
  if not found then raise exception 'MODULE_NOT_FOUND'; end if;
  if module_row.owner_promoter_id <> auth.uid() and not public.is_platform_owner() then raise exception 'FORBIDDEN'; end if;
  if next_status = 'open' and exists (
    select 1 from public.event_venue_collaborations evc
    where evc.event_id = module_row.event_id and evc.status <> 'approved'
  ) then raise exception 'VENUE_APPROVAL_REQUIRED'; end if;
  if next_status = 'revealed' and not exists (
    select 1 from public.conecta_assignments a where a.conecta_id = module_row.id
  ) then raise exception 'MATCHING_REQUIRED'; end if;
  update public.conecta_modules set status = next_status, updated_at = now() where id = module_row.id;
  update public.events set status = case when next_status = 'open' then 'published' else status end
    where id = module_row.event_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'conecta.status.changed', 'conecta_module', module_row.id,
    jsonb_build_object('status', next_status));
end;
$$;

-- Expone a cada asistente únicamente los perfiles de sus asignaciones. El teléfono
-- aparece solo cuando existe una solicitud de contacto aceptada entre ambos.
create or replace function public.conecta_visible_peers(module_key text)
returns table(
  id uuid, display_name text, age integer, gender text, intention text,
  questionnaire jsonb, phone text
) language sql stable security definer set search_path = '' as $$
  with me as (
    select p.id, p.conecta_id
    from public.conecta_participants p
    join public.conecta_modules c on c.id = p.conecta_id
    where c.external_key = module_key and p.user_id = auth.uid()
  ), visible as (
    select distinct unnest(a.participant_ids) as participant_id
    from public.conecta_assignments a join me on me.conecta_id = a.conecta_id
    where me.id = any(a.participant_ids)
  )
  select p.id, p.display_name, p.age, p.gender, p.intention, p.questionnaire,
    case when exists (
      select 1 from public.conecta_interactions i, me
      where i.conecta_id = me.conecta_id and i.kind = 'contact' and i.status = 'accepted'
        and ((i.from_participant_id = me.id and i.to_participant_id = p.id)
          or (i.to_participant_id = me.id and i.from_participant_id = p.id))
    ) then p.phone else null end
  from visible v join public.conecta_participants p on p.id = v.participant_id
  where p.id <> (select me.id from me);
$$;

create or replace function public.interact_conecta(
  module_key text, requested_action text, target_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare me public.conecta_participants; interaction_row public.conecta_interactions;
begin
  select p.* into me from public.conecta_participants p
  join public.conecta_modules c on c.id = p.conecta_id
  where c.external_key = module_key and p.user_id = auth.uid();
  if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if requested_action in ('greeting','contact') then
    if target_id = me.id or not exists (
      select 1 from public.conecta_assignments a
      where a.conecta_id = me.conecta_id and me.id = any(a.participant_ids) and target_id = any(a.participant_ids)
    ) then raise exception 'NOT_MATCHED'; end if;
    insert into public.conecta_interactions(conecta_id, kind, from_participant_id, to_participant_id, status)
    values(me.conecta_id, requested_action, me.id, target_id, 'sent');
  elsif requested_action in ('accept-contact','reject-contact') then
    select * into interaction_row from public.conecta_interactions
    where id = target_id and conecta_id = me.conecta_id and kind = 'contact'
      and to_participant_id = me.id and status = 'sent' for update;
    if not found then raise exception 'INTERACTION_NOT_FOUND'; end if;
    update public.conecta_interactions
      set status = case when requested_action = 'accept-contact' then 'accepted' else 'rejected' end,
          updated_at = now()
      where id = interaction_row.id;
  else raise exception 'INVALID_ACTION';
  end if;
end;
$$;

create or replace function public.report_conecta(
  module_key text, reported_id uuid, report_reason text, report_detail text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare me public.conecta_participants; report_id uuid;
begin
  select p.* into me from public.conecta_participants p
  join public.conecta_modules c on c.id = p.conecta_id
  where c.external_key = module_key and p.user_id = auth.uid();
  if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if nullif(btrim(report_reason), '') is null then raise exception 'REASON_REQUIRED'; end if;
  if reported_id is not null and not exists (
    select 1 from public.conecta_assignments a where a.conecta_id = me.conecta_id
      and me.id = any(a.participant_ids) and reported_id = any(a.participant_ids)
  ) then raise exception 'NOT_MATCHED'; end if;
  insert into public.conecta_reports(conecta_id, reporter_participant_id, reported_participant_id, reason, detail)
  values(me.conecta_id, me.id, reported_id, btrim(report_reason), coalesce(btrim(report_detail), ''))
  returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.manage_conecta_report(report_id uuid, next_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if next_status not in ('reviewed','resolved') then raise exception 'INVALID_STATUS'; end if;
  update public.conecta_reports r set status = next_status
  where r.id = report_id and exists (
    select 1 from public.conecta_modules c where c.id = r.conecta_id
      and (c.owner_promoter_id = auth.uid() or public.is_platform_owner())
  );
  if not found then raise exception 'REPORT_NOT_FOUND_OR_FORBIDDEN'; end if;
end;
$$;

grant execute on function public.register_conecta_participant(text,text,text,integer,text,text,boolean) to authenticated;
grant execute on function public.update_my_conecta_participation(text,text,jsonb) to authenticated;
grant execute on function public.manage_conecta_state(text,text) to authenticated;
grant execute on function public.conecta_visible_peers(text) to authenticated;
grant execute on function public.interact_conecta(text,text,uuid) to authenticated;
grant execute on function public.report_conecta(text,uuid,text,text) to authenticated;
grant execute on function public.manage_conecta_report(uuid,text) to authenticated;
