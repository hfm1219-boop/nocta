-- Fase 3: promociones públicas y favoritos del consumidor.
create table if not exists public.promotions(
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  title text not null,
  description text not null default '',
  terms text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at > starts_at),
  check(venue_id is not null or event_id is not null)
);
create table if not exists public.consumer_favorites(
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null check(entity_type in ('venue','event','experience','promotion')),
  entity_key text not null,
  created_at timestamptz not null default now(),
  primary key(user_id, entity_type, entity_key)
);
create index if not exists promotions_active_window on public.promotions(active, starts_at, ends_at);
alter table public.promotions enable row level security;
alter table public.consumer_favorites enable row level security;
drop policy if exists "active promotions public read" on public.promotions;
create policy "active promotions public read" on public.promotions for select using(active and now() between starts_at and ends_at or public.is_platform_owner());
drop policy if exists "authorized promotions manage" on public.promotions;
create policy "authorized promotions manage" on public.promotions for all to authenticated
using(public.is_platform_owner() or exists(select 1 from public.venues v where v.id = promotions.venue_id and public.can_manage_venue(v.id)))
with check(public.is_platform_owner() or exists(select 1 from public.venues v where v.id = promotions.venue_id and public.can_manage_venue(v.id)));
drop policy if exists "favorites self manage" on public.consumer_favorites;
create policy "favorites self manage" on public.consumer_favorites for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;
grant select, insert, delete on public.consumer_favorites to authenticated;

insert into public.promotions(venue_id, title, description, terms, starts_at, ends_at, created_by)
select v.id, 'Primera ronda NOCTA', 'Beneficio especial para comenzar la noche en ' || v.name || '.', 'Sujeto a disponibilidad y horario del establecimiento.', '2026-01-01', '2030-12-31', o.user_id
from public.venues v cross join lateral(select user_id from public.platform_members where role = 'platform_owner' limit 1) o
where v.active and not exists(select 1 from public.promotions p where p.venue_id = v.id and p.title = 'Primera ronda NOCTA');
notify pgrst, 'reload schema';
