-- Catálogo inicial para probar de extremo a extremo el flujo de misiones NOCTA.
do $$
declare
  owner_id uuid;
  campaign_id uuid;
begin
  select user_id into owner_id
  from public.platform_members
  where role = 'platform_owner'
  limit 1;

  if owner_id is null then
    raise exception 'PLATFORM_OWNER_REQUIRED';
  end if;

  select id into campaign_id
  from public.loyalty_campaigns
  where name = 'Comunidad NOCTA · Lanzamiento'
  order by created_at
  limit 1;

  if campaign_id is null then
    insert into public.loyalty_campaigns(
      name, budget_points, status, starts_at, ends_at, created_by
    ) values (
      'Comunidad NOCTA · Lanzamiento', 500000, 'published',
      '2026-01-01 00:00:00+00', '2030-12-31 23:59:59+00', owner_id
    ) returning id into campaign_id;
  else
    update public.loyalty_campaigns
    set status = 'published', budget_points = greatest(budget_points, 500000),
      starts_at = '2026-01-01 00:00:00+00', ends_at = '2030-12-31 23:59:59+00',
      updated_at = now()
    where id = campaign_id;
  end if;

  insert into public.loyalty_missions(
    campaign_id, slug, name, description, reward_points, starts_at, ends_at,
    total_quota, per_user_quota, frequency, requires_audit, evidence_schema, status
  ) values
  (
    campaign_id, 'comparte-tu-noche', 'Comparte tu noche',
    'Publica una historia o contenido de tu experiencia NOCTA y envía el enlace.',
    75, '2026-01-01 00:00:00+00', '2030-12-31 23:59:59+00',
    5000, 1, 'weekly', true,
    '{"required":["enlace_publicacion"],"labels":{"enlace_publicacion":"Enlace de la publicación"}}'::jsonb,
    'active'
  ),
  (
    campaign_id, 'resena-tu-experiencia', 'Reseña tu experiencia',
    'Cuéntanos cómo estuvo tu noche para ayudar a mejorar los lugares y eventos.',
    50, '2026-01-01 00:00:00+00', '2030-12-31 23:59:59+00',
    10000, 1, 'weekly', true,
    '{"required":["lugar_o_evento","calificacion","comentario"],"labels":{"lugar_o_evento":"Lugar o evento","calificacion":"Calificación de 1 a 5","comentario":"¿Cómo fue tu experiencia?"}}'::jsonb,
    'active'
  ),
  (
    campaign_id, 'trae-tu-parche', 'Trae tu parche',
    'Invita a tu grupo a vivir una noche NOCTA y registra la referencia de la invitación.',
    150, '2026-01-01 00:00:00+00', '2030-12-31 23:59:59+00',
    3000, 1, 'weekly', true,
    '{"required":["codigo_o_referencia","cantidad_invitados"],"labels":{"codigo_o_referencia":"Código o referencia de invitación","cantidad_invitados":"Cantidad de invitados"}}'::jsonb,
    'active'
  ),
  (
    campaign_id, 'descubre-un-lugar', 'Descubre un lugar nuevo',
    'Visita un establecimiento que todavía no conocías y comparte los datos de la experiencia.',
    100, '2026-01-01 00:00:00+00', '2030-12-31 23:59:59+00',
    5000, 1, 'monthly', true,
    '{"required":["establecimiento","fecha_visita","detalle"],"labels":{"establecimiento":"Establecimiento visitado","fecha_visita":"Fecha de la visita","detalle":"¿Qué fue lo mejor?"}}'::jsonb,
    'active'
  ),
  (
    campaign_id, 'encuesta-post-evento', 'Encuesta post-evento',
    'Responde una encuesta breve después de asistir a un evento.',
    60, '2026-01-01 00:00:00+00', '2030-12-31 23:59:59+00',
    10000, 1, 'weekly', true,
    '{"required":["evento","momento_favorito","recomendarias"],"labels":{"evento":"Evento al que asististe","momento_favorito":"Tu momento favorito","recomendarias":"¿Lo recomendarías?"}}'::jsonb,
    'active'
  )
  on conflict (slug) do update set
    campaign_id = excluded.campaign_id,
    name = excluded.name,
    description = excluded.description,
    reward_points = excluded.reward_points,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    total_quota = excluded.total_quota,
    per_user_quota = excluded.per_user_quota,
    frequency = excluded.frequency,
    requires_audit = excluded.requires_audit,
    evidence_schema = excluded.evidence_schema,
    status = excluded.status;
end;
$$;

notify pgrst, 'reload schema';
