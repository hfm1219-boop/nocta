-- Fase 6: Marca / Distribuidor.
create table if not exists public.brands(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text not null default '', logo_url text, website text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,name)
);
create table if not exists public.brand_products(
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  sku text not null, name text not null, description text not null default '', category text, presentation text,
  image_url text, unit_cost_cop integer check(unit_cost_cop is null or unit_cost_cop>=0), active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(brand_id,sku)
);
create table if not exists public.brand_campaigns(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete restrict, name text not null, objective text not null default '',
  starts_at timestamptz not null, ends_at timestamptz not null, budget_cop bigint not null check(budget_cop>=0),
  status text not null default 'draft' check(status in('draft','scheduled','active','paused','completed','cancelled')),
  target_audience jsonb not null default '{}'::jsonb, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at)
);
create table if not exists public.brand_activations(
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.brand_campaigns(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null, venue_id uuid references public.venues(id) on delete set null,
  name text not null, activation_type text not null default 'sampling' check(activation_type in('sampling','promotion','sponsorship','visibility','experience','trade')),
  status text not null default 'proposed' check(status in('proposed','approved','active','completed','rejected','cancelled')),
  allocated_budget_cop bigint not null default 0 check(allocated_budget_cop>=0), actual_spend_cop bigint not null default 0 check(actual_spend_cop>=0),
  planned_reach integer not null default 0 check(planned_reach>=0), actual_reach integer not null default 0 check(actual_reach>=0),
  redemptions integer not null default 0 check(redemptions>=0), units_sold integer not null default 0 check(units_sold>=0), revenue_cop bigint not null default 0 check(revenue_cop>=0),
  notes text not null default '', created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(event_id is not null or venue_id is not null)
);

create or replace function public.can_view_brand_organization(target_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner() or exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active' and r.context_role='brand_distributor');
$$;
create or replace function public.can_manage_brand_organization(target_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner() or exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active' and r.context_role='brand_distributor' and r.role in('owner','admin'));
$$;
create or replace function public.can_manage_brand(target_brand uuid)
returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.brands b where b.id=target_brand and public.can_manage_brand_organization(b.organization_id)); $$;
create or replace function public.can_manage_brand_campaign(target_campaign uuid)
returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.brand_campaigns c where c.id=target_campaign and public.can_manage_brand_organization(c.organization_id)); $$;

alter table public.brands enable row level security;alter table public.brand_products enable row level security;alter table public.brand_campaigns enable row level security;alter table public.brand_activations enable row level security;
drop policy if exists "brand organization read" on public.brands;create policy "brand organization read" on public.brands for select to authenticated using(public.can_view_brand_organization(organization_id));
drop policy if exists "brand organization manage" on public.brands;create policy "brand organization manage" on public.brands for all to authenticated using(public.can_manage_brand_organization(organization_id)) with check(public.can_manage_brand_organization(organization_id));
drop policy if exists "brand products read" on public.brand_products;create policy "brand products read" on public.brand_products for select to authenticated using(exists(select 1 from public.brands b where b.id=brand_id and public.can_view_brand_organization(b.organization_id)));
drop policy if exists "brand products manage" on public.brand_products;create policy "brand products manage" on public.brand_products for all to authenticated using(public.can_manage_brand(brand_id)) with check(public.can_manage_brand(brand_id));
drop policy if exists "brand campaigns read" on public.brand_campaigns;create policy "brand campaigns read" on public.brand_campaigns for select to authenticated using(public.can_view_brand_organization(organization_id));
drop policy if exists "brand campaigns manage" on public.brand_campaigns;create policy "brand campaigns manage" on public.brand_campaigns for all to authenticated using(public.can_manage_brand_organization(organization_id)) with check(public.can_manage_brand_organization(organization_id));
drop policy if exists "brand activations read" on public.brand_activations;create policy "brand activations read" on public.brand_activations for select to authenticated using(exists(select 1 from public.brand_campaigns c where c.id=campaign_id and public.can_view_brand_organization(c.organization_id)));
drop policy if exists "brand activations manage" on public.brand_activations;create policy "brand activations manage" on public.brand_activations for all to authenticated using(public.can_manage_brand_campaign(campaign_id)) with check(public.can_manage_brand_campaign(campaign_id));
grant select,insert,update,delete on public.brands,public.brand_products,public.brand_campaigns,public.brand_activations to authenticated;
grant execute on function public.can_view_brand_organization(uuid),public.can_manage_brand_organization(uuid),public.can_manage_brand(uuid),public.can_manage_brand_campaign(uuid) to authenticated;
notify pgrst,'reload schema';
