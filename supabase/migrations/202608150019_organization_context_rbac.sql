-- Fase 1: identidad, organizaciones multicontexto, roles y autorización canónica.

do $$ begin
  create type public.nocta_principal_role as enum ('consumer','establishment','promoter','brand_distributor','nocta_admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.organization_business_type as enum ('manufacturer','importer','distributor','brand_owner','representative','mixed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.organization_membership_status as enum ('invited','active','suspended');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.organization_member_role as enum ('owner','admin','member','establishment_admin','bar','waiter','cashier');
exception when duplicate_object then null; end $$;

alter table public.organizations add column if not exists slug text;
alter table public.organizations add column if not exists business_type public.organization_business_type;
alter table public.organizations add column if not exists updated_at timestamptz not null default now();
update public.organizations set slug = 'org-' || id::text where slug is null;
alter table public.organizations alter column slug set not null;
create unique index if not exists organizations_slug_unique on public.organizations(slug);

create table if not exists public.user_roles(
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.nocta_principal_role not null check(role in ('consumer','nocta_admin')),
  created_at timestamptz not null default now(),
  primary key(user_id, role)
);

create table if not exists public.organization_memberships(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status public.organization_membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, organization_id)
);

create table if not exists public.organization_contexts(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.nocta_principal_role not null check(role in ('establishment','promoter','brand_distributor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(organization_id, role)
);

create table if not exists public.organization_roles(
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  context_role public.nocta_principal_role not null check(context_role in ('establishment','promoter','brand_distributor')),
  role public.organization_member_role not null,
  scope_venue_id uuid references public.venues(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists organization_roles_unique
  on public.organization_roles(membership_id, context_role, role, scope_venue_id) nulls not distinct;

create table if not exists public.user_active_contexts(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  role public.nocta_principal_role not null,
  updated_at timestamptz not null default now(),
  check(
    (role in ('consumer','nocta_admin') and organization_id is null)
    or (role in ('establishment','promoter','brand_distributor') and organization_id is not null)
  )
);

create table if not exists public.role_capabilities(
  role text not null,
  capability text not null,
  primary key(role, capability)
);

insert into public.role_capabilities(role, capability) values
  ('consumer','discovery.read'),('consumer','tickets.purchase'),('consumer','reservations.create'),('consumer','loyalty.use'),
  ('nocta_admin','*'),
  ('establishment','organization.read'),('establishment','venue.manage'),('establishment','events.manage'),('establishment','orders.operate'),('establishment','team.manage'),('establishment','analytics.read'),
  ('promoter','organization.read'),('promoter','events.manage'),('promoter','tickets.manage'),('promoter','guest_lists.manage'),('promoter','conecta.manage'),('promoter','collaborations.manage'),('promoter','analytics.read'),
  ('brand_distributor','organization.read'),('brand_distributor','campaigns.manage'),('brand_distributor','portfolio.manage'),('brand_distributor','activations.manage'),('brand_distributor','analytics.read'),
  ('owner','*'),('admin','organization.manage'),('member','organization.read'),
  ('establishment_admin','venue.manage'),('establishment_admin','events.manage'),('establishment_admin','orders.operate'),('establishment_admin','team.manage'),('establishment_admin','analytics.read'),
  ('bar','orders.prepare'),('waiter','orders.deliver'),('cashier','orders.charge')
on conflict do nothing;

create index if not exists organization_memberships_user on public.organization_memberships(user_id, status);
create index if not exists organization_memberships_org on public.organization_memberships(organization_id, status);
create index if not exists organization_roles_membership on public.organization_roles(membership_id, context_role);

-- Migración compatible de las identidades y alcances existentes.
insert into public.user_roles(user_id, role)
select id, 'consumer'::public.nocta_principal_role from public.profiles where true on conflict do nothing;
insert into public.user_roles(user_id, role)
select user_id, 'nocta_admin'::public.nocta_principal_role from public.platform_members where role in ('platform_owner','platform_support') on conflict do nothing;

insert into public.organizations(name, slug, created_by)
select pp.public_name || ' · Promotor', 'promoter-' || pp.user_id::text, pp.user_id
from public.promoter_profiles pp
where not exists(select 1 from public.organizations o where o.slug = 'promoter-' || pp.user_id::text)
on conflict(slug) do nothing;

insert into public.organization_contexts(organization_id, role)
select distinct v.organization_id, 'establishment'::public.nocta_principal_role from public.venues v where true on conflict do nothing;
insert into public.organization_contexts(organization_id, role)
select o.id, 'promoter'::public.nocta_principal_role from public.organizations o where o.slug like 'promoter-%' on conflict do nothing;

insert into public.organization_memberships(user_id, organization_id)
select om.user_id, om.organization_id from public.organization_members om where true on conflict(user_id, organization_id) do nothing;
insert into public.organization_memberships(user_id, organization_id)
select distinct vm.user_id, v.organization_id from public.venue_members vm join public.venues v on v.id = vm.venue_id
where true
on conflict(user_id, organization_id) do nothing;
insert into public.organization_memberships(user_id, organization_id)
select pp.user_id, o.id from public.promoter_profiles pp join public.organizations o on o.slug = 'promoter-' || pp.user_id::text
where true
on conflict(user_id, organization_id) do nothing;

insert into public.organization_roles(membership_id, context_role, role)
select m.id, 'promoter'::public.nocta_principal_role, 'owner'::public.organization_member_role from public.organization_memberships m
join public.organizations o on o.id = m.organization_id and o.slug = 'promoter-' || m.user_id::text
where true
on conflict do nothing;
insert into public.organization_roles(membership_id, context_role, role)
select m.id, 'establishment'::public.nocta_principal_role, case om.role::text when 'venue_owner' then 'owner'::public.organization_member_role when 'venue_admin' then 'establishment_admin'::public.organization_member_role else 'member'::public.organization_member_role end
from public.organization_members om join public.organization_memberships m on m.user_id = om.user_id and m.organization_id = om.organization_id
where exists(select 1 from public.organization_contexts c where c.organization_id = om.organization_id and c.role = 'establishment')
on conflict do nothing;
insert into public.organization_roles(membership_id, context_role, role, scope_venue_id)
select m.id, 'establishment'::public.nocta_principal_role, case vm.role::text
  when 'venue_owner' then 'owner'::public.organization_member_role
  when 'venue_admin' then 'establishment_admin'::public.organization_member_role
  when 'bartender' then 'bar'::public.organization_member_role
  when 'waiter' then 'waiter'::public.organization_member_role
  when 'cashier' then 'cashier'::public.organization_member_role
  else 'member'::public.organization_member_role end, vm.venue_id
from public.venue_members vm join public.venues v on v.id = vm.venue_id
join public.organization_memberships m on m.user_id = vm.user_id and m.organization_id = v.organization_id
on conflict do nothing;

insert into public.user_active_contexts(user_id, role)
select user_id, 'nocta_admin'::public.nocta_principal_role from public.user_roles where role = 'nocta_admin' on conflict(user_id) do nothing;
insert into public.user_active_contexts(user_id, organization_id, role)
select m.user_id, m.organization_id, c.role from public.organization_memberships m
join public.organization_contexts c on c.organization_id = m.organization_id and c.active
where m.status = 'active' order by case c.role when 'promoter' then 1 when 'establishment' then 2 else 3 end
on conflict(user_id) do nothing;
insert into public.user_active_contexts(user_id, role)
select user_id, 'consumer'::public.nocta_principal_role from public.user_roles where role = 'consumer' on conflict(user_id) do nothing;

alter table public.user_roles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_contexts enable row level security;
alter table public.organization_roles enable row level security;
alter table public.user_active_contexts enable row level security;
alter table public.role_capabilities enable row level security;

drop policy if exists "user roles self read" on public.user_roles;
create policy "user roles self read" on public.user_roles for select using(user_id = auth.uid());
drop policy if exists "memberships self read" on public.organization_memberships;
create policy "memberships self read" on public.organization_memberships for select using(user_id = auth.uid());
drop policy if exists "organization contexts member read" on public.organization_contexts;
create policy "organization contexts member read" on public.organization_contexts for select using(exists(
  select 1 from public.organization_memberships m where m.organization_id = organization_contexts.organization_id and m.user_id = auth.uid() and m.status = 'active'
));
drop policy if exists "organization roles self read" on public.organization_roles;
create policy "organization roles self read" on public.organization_roles for select using(exists(
  select 1 from public.organization_memberships m where m.id = organization_roles.membership_id and m.user_id = auth.uid()
));
drop policy if exists "active context self read" on public.user_active_contexts;
create policy "active context self read" on public.user_active_contexts for select using(user_id = auth.uid());
drop policy if exists "capabilities authenticated read" on public.role_capabilities;
create policy "capabilities authenticated read" on public.role_capabilities for select to authenticated using(true);

grant select on public.user_roles, public.organization_memberships, public.organization_contexts, public.organization_roles, public.user_active_contexts, public.role_capabilities to authenticated;

create or replace function public.is_nocta_admin(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id = target_user and role = 'nocta_admin')
    or exists(select 1 from public.platform_members where user_id = target_user and role in ('platform_owner','platform_support'));
$$;

create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_nocta_admin(auth.uid());
$$;

create or replace function public.get_my_access_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select jsonb_build_object(
    'user', jsonb_build_object('id', p.id, 'fullName', p.full_name, 'status', p.status),
    'globalRoles', coalesce((select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id = p.id), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'slug', o.slug, 'businessType', o.business_type,
        'membershipStatus', m.status,
        'contexts', coalesce((select jsonb_agg(c.role::text order by c.role::text) from public.organization_contexts c where c.organization_id = o.id and c.active), '[]'::jsonb),
        'roles', coalesce((select jsonb_agg(jsonb_build_object('context', r.context_role, 'role', r.role, 'venueId', r.scope_venue_id) order by r.context_role, r.role) from public.organization_roles r where r.membership_id = m.id), '[]'::jsonb)
      ) order by o.name)
      from public.organization_memberships m join public.organizations o on o.id = m.organization_id
      where m.user_id = p.id and m.status <> 'suspended'
    ), '[]'::jsonb),
    'activeContext', (
      select jsonb_build_object('organizationId', ac.organization_id, 'role', ac.role::text, 'organizationName', o.name)
      from public.user_active_contexts ac left join public.organizations o on o.id = ac.organization_id where ac.user_id = p.id
    )
  ) into result from public.profiles p where p.id = auth.uid();
  return result;
end;
$$;

create or replace function public.set_active_context(target_organization uuid, target_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare parsed_role public.nocta_principal_role;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  parsed_role := target_role::public.nocta_principal_role;
  if parsed_role in ('consumer','nocta_admin') then
    if target_organization is not null then raise exception 'ORGANIZATION_NOT_ALLOWED'; end if;
    if parsed_role = 'nocta_admin' and not public.is_nocta_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
    if parsed_role = 'consumer' and not exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'consumer') then raise exception 'FORBIDDEN'; end if;
  else
    if not exists(
      select 1 from public.organization_memberships m join public.organization_contexts c on c.organization_id = m.organization_id
      where m.user_id = auth.uid() and m.organization_id = target_organization and m.status = 'active' and c.role = parsed_role and c.active
    ) then raise exception 'CONTEXT_NOT_AVAILABLE'; end if;
  end if;
  insert into public.user_active_contexts(user_id, organization_id, role, updated_at)
  values(auth.uid(), target_organization, parsed_role, now())
  on conflict(user_id) do update set organization_id = excluded.organization_id, role = excluded.role, updated_at = now();
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'context.changed', 'organization', target_organization, jsonb_build_object('role', parsed_role));
  return public.get_my_access_context();
end;
$$;

create or replace function public.current_user_can(required_capability text, target_organization uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  with active as (
    select ac.organization_id, ac.role::text role from public.user_active_contexts ac
    where ac.user_id = auth.uid() and (target_organization is null or ac.organization_id = target_organization)
  ), effective_roles as (
    select role from active
    union
    select r.role::text from active a join public.organization_memberships m on m.user_id = auth.uid() and m.organization_id = a.organization_id and m.status = 'active'
      join public.organization_roles r on r.membership_id = m.id and r.context_role::text = a.role
  )
  select public.is_nocta_admin(auth.uid()) or exists(
    select 1 from effective_roles er join public.role_capabilities rc on rc.role = er.role
    where rc.capability in (required_capability, '*')
  );
$$;

create or replace function public.create_nocta_organization(
  organization_name text, initial_context text, organization_business_type text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  parsed_context public.nocta_principal_role;
  parsed_business public.organization_business_type;
  org_id uuid;
  membership_id uuid;
  base_slug text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(organization_name), '') is null then raise exception 'ORGANIZATION_NAME_REQUIRED'; end if;
  parsed_context := initial_context::public.nocta_principal_role;
  if parsed_context not in ('establishment','promoter','brand_distributor') then raise exception 'INVALID_CONTEXT'; end if;
  if parsed_context = 'brand_distributor' then
    if organization_business_type is null then raise exception 'BUSINESS_TYPE_REQUIRED'; end if;
    parsed_business := organization_business_type::public.organization_business_type;
  elsif organization_business_type is not null then
    parsed_business := organization_business_type::public.organization_business_type;
  end if;
  base_slug := regexp_replace(lower(translate(btrim(organization_name), 'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU')), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.organizations(name, slug, business_type, created_by)
  values(btrim(organization_name), base_slug, parsed_business, auth.uid()) returning id into org_id;
  insert into public.organization_contexts(organization_id, role) values(org_id, parsed_context);
  insert into public.organization_memberships(user_id, organization_id) values(auth.uid(), org_id) returning id into membership_id;
  insert into public.organization_roles(membership_id, context_role, role) values(membership_id, parsed_context, 'owner');
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'organization.created', 'organization', org_id, jsonb_build_object('context', parsed_context, 'business_type', parsed_business));
  return org_id;
end;
$$;

create or replace function public.add_organization_context(target_organization uuid, new_context text)
returns void language plpgsql security definer set search_path = '' as $$
declare parsed_context public.nocta_principal_role;
begin
  parsed_context := new_context::public.nocta_principal_role;
  if parsed_context not in ('establishment','promoter','brand_distributor') then raise exception 'INVALID_CONTEXT'; end if;
  if not public.is_nocta_admin(auth.uid()) and not exists(
    select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id = m.id
    where m.user_id = auth.uid() and m.organization_id = target_organization and m.status = 'active' and r.role in ('owner','admin')
  ) then raise exception 'FORBIDDEN'; end if;
  if parsed_context = 'brand_distributor' and not exists(select 1 from public.organizations where id = target_organization and business_type is not null) then
    raise exception 'BUSINESS_TYPE_REQUIRED';
  end if;
  insert into public.organization_contexts(organization_id, role) values(target_organization, parsed_context)
  on conflict(organization_id, role) do update set active = true;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'organization.context_added', 'organization', target_organization, jsonb_build_object('context', parsed_context));
end;
$$;

create or replace function public.set_organization_member_access(
  target_organization uuid, target_user uuid, target_context text,
  target_role text, target_venue uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  parsed_context public.nocta_principal_role;
  parsed_role public.organization_member_role;
  membership_id uuid;
begin
  parsed_context := target_context::public.nocta_principal_role;
  parsed_role := target_role::public.organization_member_role;
  if not public.is_nocta_admin(auth.uid()) and not exists(
    select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id = m.id
    where m.user_id = auth.uid() and m.organization_id = target_organization and m.status = 'active' and r.role in ('owner','admin')
  ) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.organization_contexts where organization_id = target_organization and role = parsed_context and active) then raise exception 'CONTEXT_NOT_AVAILABLE'; end if;
  if parsed_role in ('establishment_admin','bar','waiter','cashier') and parsed_context <> 'establishment' then raise exception 'ROLE_CONTEXT_MISMATCH'; end if;
  if target_venue is not null and not exists(select 1 from public.venues where id = target_venue and organization_id = target_organization) then raise exception 'VENUE_SCOPE_MISMATCH'; end if;
  insert into public.organization_memberships(user_id, organization_id, status)
  values(target_user, target_organization, 'active')
  on conflict(user_id, organization_id) do update set status = 'active', updated_at = now()
  returning id into membership_id;
  insert into public.organization_roles(membership_id, context_role, role, scope_venue_id)
  values(membership_id, parsed_context, parsed_role, target_venue) on conflict do nothing;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'organization.member_access_set', 'organization', target_organization,
    jsonb_build_object('target_user', target_user, 'context', parsed_context, 'role', parsed_role, 'venue_id', target_venue));
  return membership_id;
end;
$$;

create or replace function public.current_user_has_any_role(required_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists(select 1 from public.platform_members where user_id = auth.uid() and role::text = any(required_roles))
    or exists(select 1 from public.promoter_profiles where user_id = auth.uid() and 'promoter' = any(required_roles))
    or exists(select 1 from public.organization_members where user_id = auth.uid() and role::text = any(required_roles))
    or exists(select 1 from public.venue_members where user_id = auth.uid() and role::text = any(required_roles))
    or exists(select 1 from public.event_members where user_id = auth.uid() and role::text = any(required_roles))
    or (public.is_nocta_admin(auth.uid()) and required_roles && array['nocta_admin','platform_owner','platform_support'])
    or (exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'consumer') and required_roles && array['consumer','customer'])
    or (required_roles && array['promoter','organizer'] and exists(
      select 1 from public.organization_memberships m join public.organization_contexts c on c.organization_id = m.organization_id
      where m.user_id = auth.uid() and m.status = 'active' and c.role = 'promoter' and c.active
    ))
    or (required_roles && array['establishment'] and exists(
      select 1 from public.organization_memberships m join public.organization_contexts c on c.organization_id = m.organization_id
      where m.user_id = auth.uid() and m.status = 'active' and c.role = 'establishment' and c.active
    ))
    or (required_roles && array['venue_owner','venue_admin','establishment_admin'] and exists(
      select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id = m.id
      where m.user_id = auth.uid() and m.status = 'active' and r.context_role = 'establishment' and r.role in ('owner','admin','establishment_admin')
    ))
    or (required_roles && array['brand_distributor'] and exists(
      select 1 from public.organization_memberships m join public.organization_contexts c on c.organization_id = m.organization_id
      where m.user_id = auth.uid() and m.status = 'active' and c.role = 'brand_distributor' and c.active
    ))
    or (required_roles && array['bartender','bar'] and exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id = m.id where m.user_id = auth.uid() and m.status = 'active' and r.role = 'bar'))
    or (required_roles && array['waiter'] and exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id = m.id where m.user_id = auth.uid() and m.status = 'active' and r.role = 'waiter'))
    or (required_roles && array['cashier'] and exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id = m.id where m.user_id = auth.uid() and m.status = 'active' and r.role = 'cashier'));
$$;

create or replace function public.phase1_access_integrity_report()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_nocta_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'profiles_without_consumer', (select count(*) from public.profiles p where not exists(select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'consumer')),
    'memberships_without_context_role', (select count(*) from public.organization_memberships m where m.status = 'active' and not exists(select 1 from public.organization_roles r where r.membership_id = m.id)),
    'roles_without_enabled_context', (select count(*) from public.organization_roles r join public.organization_memberships m on m.id = r.membership_id where not exists(select 1 from public.organization_contexts c where c.organization_id = m.organization_id and c.role = r.context_role and c.active)),
    'invalid_active_contexts', (select count(*) from public.user_active_contexts ac where ac.role in ('establishment','promoter','brand_distributor') and not exists(select 1 from public.organization_memberships m join public.organization_contexts c on c.organization_id = m.organization_id where m.user_id = ac.user_id and m.organization_id = ac.organization_id and m.status = 'active' and c.role = ac.role and c.active)),
    'brand_organizations_without_business_type', (select count(*) from public.organization_contexts c join public.organizations o on o.id = c.organization_id where c.role = 'brand_distributor' and c.active and o.business_type is null),
    'legacy_platform_unsynced', (select count(*) from public.platform_members p where not exists(select 1 from public.user_roles ur where ur.user_id = p.user_id and ur.role = 'nocta_admin')),
    'legacy_promoters_unsynced', (select count(*) from public.promoter_profiles p where not exists(select 1 from public.organization_memberships m join public.organization_contexts c on c.organization_id = m.organization_id where m.user_id = p.user_id and c.role = 'promoter')),
    'checked_at', now()
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare org_id uuid; membership_id uuid; account_type text;
begin
  account_type := coalesce(new.raw_user_meta_data ->> 'account_type', 'consumer');
  insert into public.profiles(id, full_name) values(new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict(id) do update set full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);
  insert into public.user_roles(user_id, role) values(new.id, 'consumer') on conflict do nothing;
  if account_type = 'promoter' then
    insert into public.promoter_profiles(user_id, public_name)
    values(new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Promotor NOCTA')) on conflict(user_id) do nothing;
    insert into public.organizations(name, slug, created_by)
    values(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Promotor NOCTA') || ' · Promotor', 'promoter-' || new.id::text, new.id)
    on conflict(slug) do update set name = excluded.name returning id into org_id;
    insert into public.organization_contexts(organization_id, role) values(org_id, 'promoter') on conflict do nothing;
    insert into public.organization_memberships(user_id, organization_id) values(new.id, org_id)
    on conflict(user_id, organization_id) do update set status = 'active' returning id into membership_id;
    insert into public.organization_roles(membership_id, context_role, role) values(membership_id, 'promoter', 'owner') on conflict do nothing;
    insert into public.user_active_contexts(user_id, organization_id, role) values(new.id, org_id, 'promoter')
    on conflict(user_id) do update set organization_id = excluded.organization_id, role = excluded.role, updated_at = now();
  else
    insert into public.user_active_contexts(user_id, role) values(new.id, 'consumer') on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.sync_legacy_platform_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_roles(user_id, role) values(new.user_id, 'nocta_admin') on conflict do nothing;
  insert into public.user_active_contexts(user_id, role) values(new.user_id, 'nocta_admin')
  on conflict(user_id) do update set organization_id = null, role = 'nocta_admin', updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_legacy_promoter_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare org_id uuid; membership_id uuid;
begin
  insert into public.organizations(name, slug, created_by)
  values(new.public_name || ' · Promotor', 'promoter-' || new.user_id::text, new.user_id)
  on conflict(slug) do update set name = excluded.name returning id into org_id;
  insert into public.organization_contexts(organization_id, role) values(org_id, 'promoter') on conflict do nothing;
  insert into public.organization_memberships(user_id, organization_id, status) values(new.user_id, org_id, 'active')
  on conflict(user_id, organization_id) do update set status = 'active', updated_at = now() returning id into membership_id;
  insert into public.organization_roles(membership_id, context_role, role) values(membership_id, 'promoter', 'owner') on conflict do nothing;
  return new;
end;
$$;

create or replace function public.sync_legacy_organization_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare membership_id uuid; mapped_role public.organization_member_role;
begin
  insert into public.organization_contexts(organization_id, role) values(new.organization_id, 'establishment') on conflict do nothing;
  insert into public.organization_memberships(user_id, organization_id, status) values(new.user_id, new.organization_id, 'active')
  on conflict(user_id, organization_id) do update set status = 'active', updated_at = now() returning id into membership_id;
  mapped_role := case new.role::text when 'venue_owner' then 'owner'::public.organization_member_role when 'venue_admin' then 'establishment_admin'::public.organization_member_role else 'member'::public.organization_member_role end;
  insert into public.organization_roles(membership_id, context_role, role) values(membership_id, 'establishment', mapped_role) on conflict do nothing;
  return new;
end;
$$;

create or replace function public.sync_legacy_venue_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare org_id uuid; membership_id uuid; mapped_role public.organization_member_role;
begin
  select organization_id into org_id from public.venues where id = new.venue_id;
  insert into public.organization_contexts(organization_id, role) values(org_id, 'establishment') on conflict do nothing;
  insert into public.organization_memberships(user_id, organization_id, status) values(new.user_id, org_id, 'active')
  on conflict(user_id, organization_id) do update set status = 'active', updated_at = now() returning id into membership_id;
  mapped_role := case new.role::text when 'venue_owner' then 'owner'::public.organization_member_role when 'venue_admin' then 'establishment_admin'::public.organization_member_role when 'bartender' then 'bar'::public.organization_member_role when 'waiter' then 'waiter'::public.organization_member_role when 'cashier' then 'cashier'::public.organization_member_role else 'member'::public.organization_member_role end;
  insert into public.organization_roles(membership_id, context_role, role, scope_venue_id) values(membership_id, 'establishment', mapped_role, new.venue_id) on conflict do nothing;
  return new;
end;
$$;

create or replace function public.revoke_legacy_platform_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.platform_members where user_id = old.user_id) then
    delete from public.user_roles where user_id = old.user_id and role = 'nocta_admin';
    update public.user_active_contexts set organization_id = null, role = 'consumer', updated_at = now()
      where user_id = old.user_id and role = 'nocta_admin';
  end if;
  return old;
end;
$$;

create or replace function public.revoke_legacy_promoter_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.organization_memberships m using public.organizations o
  where m.organization_id = o.id and m.user_id = old.user_id and o.slug = 'promoter-' || old.user_id::text;
  update public.user_active_contexts set organization_id = null, role = 'consumer', updated_at = now()
    where user_id = old.user_id and role = 'promoter'
      and organization_id = (select id from public.organizations where slug = 'promoter-' || old.user_id::text);
  return old;
end;
$$;

create or replace function public.revoke_legacy_organization_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_membership_id uuid; mapped_role public.organization_member_role;
begin
  select id into target_membership_id from public.organization_memberships where user_id = old.user_id and organization_id = old.organization_id;
  mapped_role := case old.role::text when 'venue_owner' then 'owner'::public.organization_member_role when 'venue_admin' then 'establishment_admin'::public.organization_member_role else 'member'::public.organization_member_role end;
  delete from public.organization_roles where organization_roles.membership_id = target_membership_id and context_role = 'establishment' and role = mapped_role and scope_venue_id is null;
  return old;
end;
$$;

create or replace function public.revoke_legacy_venue_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare org_id uuid; target_membership_id uuid; mapped_role public.organization_member_role;
begin
  select organization_id into org_id from public.venues where id = old.venue_id;
  select id into target_membership_id from public.organization_memberships where user_id = old.user_id and organization_id = org_id;
  mapped_role := case old.role::text when 'venue_owner' then 'owner'::public.organization_member_role when 'venue_admin' then 'establishment_admin'::public.organization_member_role when 'bartender' then 'bar'::public.organization_member_role when 'waiter' then 'waiter'::public.organization_member_role when 'cashier' then 'cashier'::public.organization_member_role else 'member'::public.organization_member_role end;
  delete from public.organization_roles where organization_roles.membership_id = target_membership_id and context_role = 'establishment' and role = mapped_role and scope_venue_id = old.venue_id;
  return old;
end;
$$;

drop trigger if exists sync_legacy_platform_access_trigger on public.platform_members;
create trigger sync_legacy_platform_access_trigger after insert or update on public.platform_members for each row execute function public.sync_legacy_platform_access();
drop trigger if exists sync_legacy_promoter_access_trigger on public.promoter_profiles;
create trigger sync_legacy_promoter_access_trigger after insert or update on public.promoter_profiles for each row execute function public.sync_legacy_promoter_access();
drop trigger if exists sync_legacy_organization_access_trigger on public.organization_members;
create trigger sync_legacy_organization_access_trigger after insert or update on public.organization_members for each row execute function public.sync_legacy_organization_access();
drop trigger if exists sync_legacy_venue_access_trigger on public.venue_members;
create trigger sync_legacy_venue_access_trigger after insert or update on public.venue_members for each row execute function public.sync_legacy_venue_access();
drop trigger if exists revoke_legacy_platform_access_trigger on public.platform_members;
create trigger revoke_legacy_platform_access_trigger after delete on public.platform_members for each row execute function public.revoke_legacy_platform_access();
drop trigger if exists revoke_legacy_promoter_access_trigger on public.promoter_profiles;
create trigger revoke_legacy_promoter_access_trigger after delete on public.promoter_profiles for each row execute function public.revoke_legacy_promoter_access();
drop trigger if exists revoke_legacy_organization_access_trigger on public.organization_members;
create trigger revoke_legacy_organization_access_trigger after delete on public.organization_members for each row execute function public.revoke_legacy_organization_access();
drop trigger if exists revoke_legacy_venue_access_trigger on public.venue_members;
create trigger revoke_legacy_venue_access_trigger after delete on public.venue_members for each row execute function public.revoke_legacy_venue_access();

revoke all on function public.is_nocta_admin(uuid), public.get_my_access_context(), public.set_active_context(uuid,text), public.current_user_can(text,uuid), public.create_nocta_organization(text,text,text), public.add_organization_context(uuid,text), public.set_organization_member_access(uuid,uuid,text,text,uuid), public.phase1_access_integrity_report() from public, anon;
grant execute on function public.is_nocta_admin(uuid), public.get_my_access_context(), public.set_active_context(uuid,text), public.current_user_can(text,uuid), public.create_nocta_organization(text,text,text), public.add_organization_context(uuid,text), public.set_organization_member_access(uuid,uuid,text,text,uuid), public.phase1_access_integrity_report() to authenticated;
grant execute on function public.current_user_has_any_role(text[]) to authenticated;

notify pgrst, 'reload schema';
