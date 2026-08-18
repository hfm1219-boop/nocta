-- Programacion demo para el resto de agosto de 2026, repartida entre promotores reales.
-- Incluye eventos con boleteria, promociones y modulos Conecta operativos.
do $august$
declare
  promoter_ids uuid[];
begin
  select array_agg(user_id order by created_at) into promoter_ids
  from public.promoter_profiles;

  if coalesce(array_length(promoter_ids, 1), 0) < 2 then
    raise exception 'TWO_PROMOTERS_REQUIRED';
  end if;

  with schedule(event_key, venue_key, promoter_number, name, starts_at, capacity, genre, conecta_name, experience_type, matching_mode) as (values
    ('aug26-sunset-connections', 'lobo-de-mar', 1, 'Sunset Connections', '2026-08-18 19:30:00-05'::timestamptz, 100, 'lounge', 'Conecta Sunset', 'social', 'rounds'),
    ('aug26-cardinal-tasting', 'cardinal-bar', 2, 'Cardinal Cocktail Tasting', '2026-08-19 20:00:00-05'::timestamptz, 90, 'cocktail session', null, null, null),
    ('aug26-movida-house', 'la-movida', 2, 'Movida House Sessions', '2026-08-20 22:00:00-05'::timestamptz, 260, 'house', null, null, null),
    ('aug26-jugada-social', 'la-jugada-club-house', 1, 'Jugada Social Club', '2026-08-21 20:30:00-05'::timestamptz, 180, 'open format', 'Conecta Social Club', 'networking', 'groups'),
    ('aug26-casa-rooftop', 'casa-la-movida', 2, 'Rooftop Golden Hour', '2026-08-22 18:30:00-05'::timestamptz, 120, 'sunset beats', null, null, null),
    ('aug26-lobo-table', 'lobo-de-mar', 1, 'Mesa del Mar', '2026-08-23 19:00:00-05'::timestamptz, 80, 'dinner experience', 'Conecta Mesa del Mar', 'social', 'groups'),
    ('aug26-cardinal-vinyl', 'cardinal-bar', 1, 'Cardinal Vinyl Night', '2026-08-24 20:00:00-05'::timestamptz, 110, 'vinyl & cocktails', null, null, null),
    ('aug26-movida-singles', 'la-movida', 2, 'Singles Night Cartagena', '2026-08-25 20:30:00-05'::timestamptz, 200, 'urban & latin', 'Conecta Singles Night', 'dating', 'one-to-one'),
    ('aug26-jugada-afterwork', 'la-jugada-club-house', 1, 'Afterwork Club House', '2026-08-27 19:30:00-05'::timestamptz, 160, 'afterwork', null, null, null),
    ('aug26-casa-newfriends', 'casa-la-movida', 2, 'New Friends Rooftop', '2026-08-28 20:00:00-05'::timestamptz, 120, 'afro house', 'Conecta New Friends', 'community', 'rounds'),
    ('aug26-lobo-fire', 'lobo-de-mar', 1, 'Fuego, Mar & Música', '2026-08-29 20:00:00-05'::timestamptz, 140, 'live session', null, null, null),
    ('aug26-jugada-closing', 'la-jugada-club-house', 2, 'August Closing Party', '2026-08-30 21:00:00-05'::timestamptz, 240, 'open format', 'Conecta Closing Party', 'social', 'groups')
  )
  insert into public.events(
    external_key, owner_user_id, organization_id, name, starts_at, ends_at,
    capacity, status, details, created_at
  )
  select
    s.event_key,
    promoter_ids[s.promoter_number],
    v.organization_id,
    s.name,
    s.starts_at,
    s.starts_at + interval '5 hours',
    s.capacity,
    'published',
    jsonb_build_object(
      'demo', true,
      'city', v.city,
      'venue_key', v.external_key,
      'genre', s.genre,
      'promoter_user_id', promoter_ids[s.promoter_number],
      'has_conecta', s.conecta_name is not null
    ),
    least(now(), s.starts_at - interval '20 days')
  from schedule s
  join public.venues v on v.external_key = s.venue_key
  on conflict(external_key) do update
  set owner_user_id = excluded.owner_user_id,
      organization_id = excluded.organization_id,
      name = excluded.name,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      capacity = excluded.capacity,
      status = 'published',
      details = excluded.details;

  -- Colaboraciones ya aceptadas para que el evento sea visible en promotor y establecimiento.
  insert into public.event_venue_collaborations(
    event_id, venue_id, requested_by, status, decided_by, decided_at, notes, created_at
  )
  select
    e.id, v.id, e.owner_user_id, 'approved',
    (select user_id from public.platform_members where role = 'platform_owner' limit 1),
    e.created_at + interval '1 day', 'Programación demo confirmada', e.created_at
  from public.events e
  join public.venues v on v.external_key = e.details ->> 'venue_key'
  where e.external_key like 'aug26-%'
  on conflict(event_id, venue_id) do update
  set status = 'approved', decided_at = excluded.decided_at, notes = excluded.notes;

  -- Dos niveles de entrada para todos los eventos del calendario.
  insert into public.ticket_types(
    event_id, name, description, price_cop, capacity, sales_start, sales_end, active
  )
  select e.id, t.name, t.description, t.price_cop,
         least(t.capacity, greatest(e.capacity - case when t.name = 'VIP' then 0 else 40 end, 20)),
         now() - interval '7 days', e.starts_at, true
  from public.events e
  cross join (values
    ('General', 'Ingreso general al evento.', 55000, 180),
    ('VIP', 'Acceso preferencial y fila rápida.', 140000, 40)
  ) t(name, description, price_cop, capacity)
  where e.external_key like 'aug26-%'
    and not exists(select 1 from public.ticket_types x where x.event_id = e.id and x.name = t.name);

  -- Promocion visible asociada a cada evento.
  insert into public.promotions(
    event_id, title, description, terms, starts_at, ends_at, active, created_by
  )
  select
    e.id,
    'Llegando temprano · ' || e.name,
    'Beneficio demo para asistentes que llegan antes de la hora indicada.',
    'Válido hasta las 9:00 p. m. y sujeto a disponibilidad.',
    now() - interval '1 day', e.starts_at, true, e.owner_user_id
  from public.events e
  where e.external_key like 'aug26-%'
    and not exists(select 1 from public.promotions p where p.event_id = e.id and p.title = 'Llegando temprano · ' || e.name);

  -- Seis experiencias Conecta, tres por cada promotor.
  with conecta_schedule(event_key, conecta_key, name, description, experience_type, matching_mode, capacity) as (values
    ('aug26-sunset-connections', 'conecta-aug26-sunset', 'Conecta Sunset', 'Rondas breves para conocer personas mientras cae el sol.', 'social', 'rounds', 60),
    ('aug26-jugada-social', 'conecta-aug26-social-club', 'Conecta Social Club', 'Mesas por afinidades para ampliar tu círculo profesional y social.', 'networking', 'groups', 80),
    ('aug26-lobo-table', 'conecta-aug26-mesa-mar', 'Conecta Mesa del Mar', 'Cena compartida y conversaciones guiadas alrededor de la gastronomía.', 'social', 'groups', 48),
    ('aug26-movida-singles', 'conecta-aug26-singles', 'Conecta Singles Night', 'Encuentros uno a uno con compatibilidad y revelación durante la noche.', 'dating', 'one-to-one', 100),
    ('aug26-casa-newfriends', 'conecta-aug26-new-friends', 'Conecta New Friends', 'Rondas para conocer gente nueva en Cartagena.', 'community', 'rounds', 72),
    ('aug26-jugada-closing', 'conecta-aug26-closing', 'Conecta Closing Party', 'Grupos por afinidad antes del cierre musical del mes.', 'social', 'groups', 100)
  )
  insert into public.conecta_modules(
    external_key, owner_promoter_id, event_id, name, description,
    experience_type, matching_mode, capacity, reveal_at, status,
    location_name, location_address, location_city
  )
  select
    c.conecta_key, e.owner_user_id, e.id, c.name, c.description,
    c.experience_type, c.matching_mode, c.capacity,
    e.starts_at + interval '90 minutes', 'open',
    v.name, v.address, v.city
  from conecta_schedule c
  join public.events e on e.external_key = c.event_key
  join public.event_venue_collaborations evc on evc.event_id = e.id and evc.status = 'approved'
  join public.venues v on v.id = evc.venue_id
  on conflict(external_key) do update
  set owner_promoter_id = excluded.owner_promoter_id,
      event_id = excluded.event_id,
      name = excluded.name,
      description = excluded.description,
      experience_type = excluded.experience_type,
      matching_mode = excluded.matching_mode,
      capacity = excluded.capacity,
      reveal_at = excluded.reveal_at,
      status = 'open',
      location_name = excluded.location_name,
      location_address = excluded.location_address,
      location_city = excluded.location_city,
      updated_at = now();
end;
$august$;

notify pgrst, 'reload schema';
