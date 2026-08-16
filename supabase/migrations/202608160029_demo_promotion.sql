-- Promoción demostrativa persistida en el flujo real de establecimientos.
-- Se publica únicamente si La Movida y un actor autorizado ya existen.
with target_venue as (
  select v.id, v.organization_id
  from public.venues v
  where v.external_key = 'la-movida' and v.active
  limit 1
), creator as (
  select candidate.user_id
  from target_venue v
  cross join lateral (
    select m.user_id, 1 as priority
    from public.organization_memberships m
    join public.organization_roles r on r.membership_id = m.id
    where m.organization_id = v.organization_id
      and m.status = 'active'
      and r.context_role = 'establishment'
      and r.role in ('owner', 'admin', 'establishment_admin')
    union all
    select pm.user_id, 2
    from public.platform_members pm
    union all
    select p.id, 3
    from public.profiles p
    order by priority
    limit 1
  ) candidate
)
insert into public.promotions(
  venue_id, title, description, terms, starts_at, ends_at, active, created_by
)
select
  v.id,
  '2x1 en cócteles de autor',
  'Empieza la noche con dos cócteles seleccionados por el precio de uno.',
  'Válido de 7:00 p. m. a 9:00 p. m. para mayores de 18 años. Un beneficio por persona. Sujeto a disponibilidad.',
  date_trunc('day', now()),
  now() + interval '90 days',
  true,
  c.user_id
from target_venue v
cross join creator c
where not exists (
  select 1 from public.promotions p
  where p.venue_id = v.id and p.title = '2x1 en cócteles de autor'
);

notify pgrst, 'reload schema';
