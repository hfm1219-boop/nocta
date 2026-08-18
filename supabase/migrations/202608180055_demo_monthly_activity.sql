-- Actividad demo historica de julio de 2026 para ejercitar operaciones y analitica.
-- Idempotente: las claves externas impiden duplicar ventas y eventos al reejecutar.
do $activity$
declare
  actor uuid;
  membership uuid;
begin
  select user_id into actor from public.platform_members where role = 'platform_owner' limit 1;
  if actor is null then
    select user_id into actor from public.user_roles where role = 'nocta_admin' limit 1;
  end if;
  if actor is null then raise exception 'DEMO_ACTOR_REQUIRED'; end if;

  -- El administrador demo puede administrar y operar la nueva sede.
  insert into public.venue_members(venue_id, user_id, role)
  select id, actor, 'venue_owner'::public.app_role from public.venues where external_key = 'lobo-de-mar'
  on conflict do nothing;

  select m.id into membership
  from public.organization_memberships m
  join public.venues v on v.organization_id = m.organization_id
  where v.external_key = 'lobo-de-mar' and m.user_id = actor;

  if membership is null then
    insert into public.organization_memberships(user_id, organization_id, status)
    select actor, organization_id, 'active' from public.venues where external_key = 'lobo-de-mar'
    on conflict(user_id, organization_id) do update set status = 'active', updated_at = now()
    returning id into membership;
  end if;

  insert into public.organization_roles(membership_id, context_role, role, scope_venue_id)
  select membership, 'establishment'::public.nocta_principal_role,
         x.role::public.organization_member_role, v.id
  from public.venues v
  cross join (values ('establishment_admin'), ('bar'), ('waiter'), ('cashier')) x(role)
  where v.external_key = 'lobo-de-mar'
  on conflict do nothing;

  -- Dos eventos cerrados por sede durante el mes anterior.
  insert into public.events(
    external_key, owner_user_id, organization_id, name, starts_at, ends_at,
    capacity, status, details, created_at
  )
  select
    'demo-jul26-' || v.external_key || '-' || e.sequence,
    actor,
    v.organization_id,
    e.name_prefix || ' · ' || v.name,
    e.starts_at,
    e.starts_at + interval '5 hours',
    e.capacity,
    'closed',
    jsonb_build_object(
      'demo', true, 'venue_key', v.external_key, 'city', v.city,
      'genre', e.genre, 'historical_activity', true
    ),
    e.starts_at - interval '24 days'
  from public.venues v
  cross join (values
    ('01', 'Noche de apertura', '2026-07-11 21:00:00-05'::timestamptz, 180, 'house & latin'),
    ('02', 'Sesión de fin de mes', '2026-07-25 21:30:00-05'::timestamptz, 240, 'open format')
  ) e(sequence, name_prefix, starts_at, capacity, genre)
  where v.external_key in ('la-movida', 'la-jugada-club-house', 'casa-la-movida', 'cardinal-bar', 'lobo-de-mar')
  on conflict(external_key) do update
  set name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      capacity = excluded.capacity, status = excluded.status, details = excluded.details;

  insert into public.event_venue_collaborations(
    event_id, venue_id, requested_by, status, decided_by, decided_at, notes, created_at
  )
  select e.id, v.id, actor, 'approved', actor, e.created_at + interval '1 day',
         'Colaboración demo aprobada', e.created_at
  from public.events e
  join public.venues v on e.external_key like 'demo-jul26-' || v.external_key || '-%'
  where e.external_key like 'demo-jul26-%'
  on conflict(event_id, venue_id) do update
  set status = 'approved', decided_by = excluded.decided_by, decided_at = excluded.decided_at;

  insert into public.ticket_types(
    event_id, name, description, price_cop, capacity, sales_start, sales_end, active, created_at
  )
  select e.id, t.name, t.description, t.price_cop, t.capacity,
         e.starts_at - interval '25 days', e.starts_at, false, e.starts_at - interval '25 days'
  from public.events e
  cross join (values
    ('General', 'Entrada general demo.', 55000, 150),
    ('VIP', 'Acceso preferencial demo.', 135000, 60)
  ) t(name, description, price_cop, capacity)
  where e.external_key like 'demo-jul26-%'
    and not exists(select 1 from public.ticket_types x where x.event_id = e.id and x.name = t.name);

  -- Ventas de boleteria: 24 generales y 8 VIP por evento.
  insert into public.tickets(
    ticket_type_id, event_id, holder_user_id, holder_name, holder_email,
    qr_token_hash, status, amount_cop, payment_reference, purchased_at, used_at, used_by, created_at
  )
  select
    tt.id, e.id, actor,
    'Asistente demo ' || s.n,
    'asistente+' || replace(e.external_key, '-', '') || s.n || '@demo.nocta.app',
    'demo-qr-' || e.external_key || '-' || lower(tt.name) || '-' || s.n,
    'used', tt.price_cop,
    'DEMO-PAY-' || e.external_key || '-' || lower(tt.name) || '-' || s.n,
    e.starts_at - ((33 - s.n) * interval '12 hours'),
    e.starts_at + ((s.n % 90) * interval '1 minute'), actor,
    e.starts_at - ((33 - s.n) * interval '12 hours')
  from public.events e
  join public.ticket_types tt on tt.event_id = e.id
  cross join lateral generate_series(1, case when tt.name = 'VIP' then 8 else 24 end) s(n)
  where e.external_key like 'demo-jul26-%'
    and not exists(
      select 1 from public.tickets x
      where x.payment_reference = 'DEMO-PAY-' || e.external_key || '-' || lower(tt.name) || '-' || s.n
    );

  -- Pedidos entregados distribuidos durante julio: alimentan ventas por sede, hora y canal.
  insert into public.orders(
    external_key, venue_id, customer_user_id, service_mode, zone_name, items,
    subtotal_cop, tip_cop, total_cop, payment_method, payment_status, status,
    created_at, updated_at
  )
  select
    'demo-jul26-order-' || v.external_key || '-' || s.n,
    v.id, actor,
    case s.n % 3 when 0 then 'table' when 1 then 'bar' else 'zone' end,
    case s.n % 3 when 0 then 'Mesa ' || (s.n % 10 + 1) when 2 then 'VIP' else null end,
    jsonb_build_array(jsonb_build_object(
      'name', coalesce(mi.name, 'Consumo de la casa'),
      'quantity', 1 + s.n % 3,
      'unit_price_cop', coalesce(mi.price_cop, 38000)
    )),
    coalesce(mi.price_cop, 38000) * (1 + s.n % 3),
    round(coalesce(mi.price_cop, 38000) * (1 + s.n % 3) * 0.1)::integer,
    coalesce(mi.price_cop, 38000) * (1 + s.n % 3)
      + round(coalesce(mi.price_cop, 38000) * (1 + s.n % 3) * 0.1)::integer,
    case s.n % 3 when 0 then 'datafono' when 1 then 'digital' else 'cash' end,
    'paid', 'delivered',
    ('2026-07-01 19:00:00-05'::timestamptz + (s.n * interval '36 hours')),
    ('2026-07-01 19:25:00-05'::timestamptz + (s.n * interval '36 hours'))
  from public.venues v
  cross join generate_series(1, 18) s(n)
  left join lateral (
    select i.name, i.price_cop
    from public.venue_menu_items i
    where i.venue_id = v.id and i.available
    order by i.name
    offset ((s.n - 1) % greatest((select count(*) from public.venue_menu_items z where z.venue_id = v.id and z.available), 1))
    limit 1
  ) mi on true
  where v.external_key in ('la-movida', 'la-jugada-club-house', 'casa-la-movida', 'cardinal-bar', 'lobo-de-mar')
  on conflict(external_key) do update
  set items = excluded.items, subtotal_cop = excluded.subtotal_cop, tip_cop = excluded.tip_cop,
      total_cop = excluded.total_cop, payment_status = 'paid', status = 'delivered',
      created_at = excluded.created_at, updated_at = excluded.updated_at;

  -- Reservas completadas del mes anterior.
  insert into public.reservations(
    venue_id, customer_user_id, customer_name, phone, party_size, zone_name,
    reserved_for, deposit_cop, status, notes, created_at, updated_at
  )
  select
    v.id, actor, 'Cliente histórico ' || s.n, '300700' || lpad(s.n::text, 4, '0'),
    2 + s.n % 7,
    case s.n % 3 when 0 then 'Salón principal' when 1 then 'Terraza' else 'VIP' end,
    '2026-07-03 20:00:00-05'::timestamptz + (s.n * interval '72 hours'),
    case when s.n % 3 = 2 then 150000 else 50000 end,
    'completed', 'Reserva histórica demo · julio 2026',
    '2026-06-25 12:00:00-05'::timestamptz + (s.n * interval '48 hours'),
    '2026-07-03 23:30:00-05'::timestamptz + (s.n * interval '72 hours')
  from public.venues v
  cross join generate_series(1, 8) s(n)
  where v.external_key in ('la-movida', 'la-jugada-club-house', 'casa-la-movida', 'cardinal-bar', 'lobo-de-mar')
    and not exists(
      select 1 from public.reservations r
      where r.venue_id = v.id and r.notes = 'Reserva histórica demo · julio 2026'
        and r.customer_name = 'Cliente histórico ' || s.n
    );

  -- Una promocion historica y dos vigentes por establecimiento.
  insert into public.promotions(
    venue_id, title, description, terms, starts_at, ends_at, active, created_by, created_at
  )
  select v.id, p.title, p.description, p.terms, p.starts_at, p.ends_at, p.active, actor, p.created_at
  from public.venues v
  cross join (values
    ('Julio en la casa', 'Promoción histórica para probar reportes y resultados.', 'Campaña demo finalizada.',
      '2026-07-01 00:00:00-05'::timestamptz, '2026-07-31 23:59:59-05'::timestamptz, false, '2026-06-24 10:00:00-05'::timestamptz),
    ('Atardecer NOCTA', 'Beneficio especial en coctelería seleccionada.', 'Válido antes de las 9 p. m.; sujeto a disponibilidad.',
      now() - interval '7 days', now() + interval '90 days', true, now() - interval '8 days'),
    ('Mesa para compartir', 'Beneficio para grupos que reservan desde NOCTA.', 'Reserva previa; mínimo cuatro personas.',
      now() - interval '7 days', now() + interval '90 days', true, now() - interval '8 days')
  ) p(title, description, terms, starts_at, ends_at, active, created_at)
  where v.external_key in ('la-movida', 'la-jugada-club-house', 'casa-la-movida', 'cardinal-bar', 'lobo-de-mar')
    and not exists(select 1 from public.promotions x where x.venue_id = v.id and x.title = p.title);
end;
$activity$;

notify pgrst, 'reload schema';
