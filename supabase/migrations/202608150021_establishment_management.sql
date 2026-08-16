-- Fase 4: administración normalizada del establecimiento.
alter table public.venues add column if not exists description text not null default '';
alter table public.venues add column if not exists zone text;
alter table public.venues add column if not exists latitude numeric(9,6);
alter table public.venues add column if not exists longitude numeric(9,6);
alter table public.venues add column if not exists phone text;
alter table public.venues add column if not exists website text;
alter table public.venues add column if not exists category text;
alter table public.venues add column if not exists price_range text check(price_range is null or price_range in ('$$','$$$','$$$$'));
alter table public.venues add column if not exists opening_hours jsonb not null default '{}'::jsonb;
alter table public.venues add column if not exists operational_settings jsonb not null default '{"service_modes":["bar"],"preorder_enabled":false}'::jsonb;
alter table public.venues add column if not exists updated_at timestamptz not null default now();

create table if not exists public.venue_menu_categories(
  id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null, sort_order integer not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(venue_id,name)
);
create table if not exists public.venue_menu_items(
  id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id) on delete cascade,
  category_id uuid references public.venue_menu_categories(id) on delete set null, name text not null,
  description text not null default '', sku text, price_cop integer not null check(price_cop>=0),
  available boolean not null default true, image_url text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(venue_id,name)
);
create table if not exists public.venue_customer_notes(
  id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id) on delete cascade,
  customer_user_id uuid not null references public.profiles(id) on delete cascade, note text not null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);

create or replace function public.can_manage_venue(target_venue uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner()
  or exists(select 1 from public.venue_members vm where vm.venue_id=target_venue and vm.user_id=auth.uid() and vm.role in('venue_owner','venue_admin'))
  or exists(select 1 from public.venues v join public.organization_members om on om.organization_id=v.organization_id where v.id=target_venue and om.user_id=auth.uid() and om.role in('venue_owner','venue_admin'))
  or exists(
    select 1 from public.venues v join public.organization_memberships m on m.organization_id=v.organization_id
    join public.organization_roles r on r.membership_id=m.id
    where v.id=target_venue and m.user_id=auth.uid() and m.status='active' and r.context_role='establishment'
      and r.role in('owner','admin','establishment_admin') and (r.scope_venue_id is null or r.scope_venue_id=target_venue)
  );
$$;

create or replace function public.can_manage_organization(target_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner() or exists(
    select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id
    where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active'
      and r.context_role='establishment' and r.role in('owner','admin','establishment_admin')
  );
$$;
create or replace function public.can_manage_customer_at_venue(target_venue uuid, target_customer uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.can_manage_venue(target_venue) and (
    exists(select 1 from public.reservations where venue_id=target_venue and customer_user_id=target_customer)
    or exists(select 1 from public.orders where venue_id=target_venue and customer_user_id=target_customer)
  );
$$;
create or replace function public.can_view_organization_teammate(target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.organization_memberships mine join public.organization_memberships teammate on teammate.organization_id=mine.organization_id
    where mine.user_id=auth.uid() and teammate.user_id=target_user and mine.status='active' and teammate.status<>'suspended'
      and public.can_manage_organization(mine.organization_id)
  );
$$;

alter table public.venue_menu_categories enable row level security;
alter table public.venue_menu_items enable row level security;
alter table public.venue_customer_notes enable row level security;
drop policy if exists "venue managers update profile" on public.venues;
create policy "venue managers update profile" on public.venues for update to authenticated using(public.can_manage_venue(id)) with check(public.can_manage_venue(id));
drop policy if exists "public menu categories read" on public.venue_menu_categories;
create policy "public menu categories read" on public.venue_menu_categories for select using(active or public.can_manage_venue(venue_id));
drop policy if exists "venue menu categories manage" on public.venue_menu_categories;
create policy "venue menu categories manage" on public.venue_menu_categories for all to authenticated using(public.can_manage_venue(venue_id)) with check(public.can_manage_venue(venue_id));
drop policy if exists "public menu items read" on public.venue_menu_items;
create policy "public menu items read" on public.venue_menu_items for select using(available or public.can_manage_venue(venue_id));
drop policy if exists "venue menu items manage" on public.venue_menu_items;
create policy "venue menu items manage" on public.venue_menu_items for all to authenticated using(public.can_manage_venue(venue_id)) with check(public.can_manage_venue(venue_id));
drop policy if exists "venue customer notes manage" on public.venue_customer_notes;
create policy "venue customer notes manage" on public.venue_customer_notes for all to authenticated using(public.can_manage_customer_at_venue(venue_id,customer_user_id)) with check(public.can_manage_customer_at_venue(venue_id,customer_user_id));
drop policy if exists "organization team read" on public.organization_memberships;
create policy "organization team read" on public.organization_memberships for select using(public.can_manage_organization(organization_id));
drop policy if exists "organization team roles read" on public.organization_roles;
create policy "organization team roles read" on public.organization_roles for select using(exists(select 1 from public.organization_memberships m where m.id=organization_roles.membership_id and public.can_manage_organization(m.organization_id)));
drop policy if exists "organization teammate profiles read" on public.profiles;
create policy "organization teammate profiles read" on public.profiles for select using(public.can_view_organization_teammate(id));

grant select on public.venue_menu_categories,public.venue_menu_items to anon,authenticated;
grant insert,update,delete on public.venue_menu_categories,public.venue_menu_items,public.venue_customer_notes to authenticated;
grant select on public.venue_customer_notes to authenticated;
grant execute on function public.can_manage_organization(uuid),public.can_manage_customer_at_venue(uuid,uuid),public.can_view_organization_teammate(uuid) to authenticated;

insert into public.venue_menu_categories(venue_id,name,sort_order)
select id,'Bebidas',1 from public.venues where active on conflict(venue_id,name) do nothing;
notify pgrst,'reload schema';
