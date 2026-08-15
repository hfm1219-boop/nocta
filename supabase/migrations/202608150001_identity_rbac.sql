create extension if not exists pgcrypto;

create type public.app_role as enum (
  'platform_owner', 'platform_support', 'venue_owner', 'venue_admin',
  'organizer', 'promoter', 'door_staff', 'reservation_host', 'cashier',
  'bartender', 'waiter', 'dj', 'analyst', 'customer'
);
create type public.account_status as enum ('active', 'suspended', 'invited');
create type public.collaboration_status as enum ('requested', 'approved', 'rejected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', phone text, status public.account_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Los promotores son identidades independientes. No pertenecen a un establecimiento.
create table public.promoter_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  public_name text not null, bio text not null default '', verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('venue_owner', 'venue_admin', 'analyst')),
  created_at timestamptz not null default now(), primary key (organization_id, user_id, role)
);
create table public.venues (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, city text not null, address text, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.venue_members (
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('venue_owner', 'venue_admin', 'door_staff', 'reservation_host', 'cashier', 'bartender', 'waiter', 'dj', 'analyst')),
  created_at timestamptz not null default now(), primary key (venue_id, user_id, role)
);

create table public.events (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.profiles(id),
  organization_id uuid references public.organizations(id), name text not null,
  starts_at timestamptz not null, ends_at timestamptz, capacity integer check (capacity > 0),
  status text not null default 'draft' check (status in ('draft', 'pending_venue', 'published', 'closed', 'cancelled')),
  created_at timestamptz not null default now()
);
create table public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('organizer', 'promoter', 'door_staff', 'reservation_host', 'cashier', 'analyst')),
  created_at timestamptz not null default now(), primary key (event_id, user_id, role)
);

-- La sede participa por evento y puede aprobar o rechazar la operación en su espacio.
create table public.event_venue_collaborations (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  requested_by uuid not null references public.profiles(id), status public.collaboration_status not null default 'requested',
  decided_by uuid references public.profiles(id), decided_at timestamptz, notes text,
  created_at timestamptz not null default now(), unique (event_id, venue_id)
);

-- Conecta es un módulo creado y poseído por el promotor; la sede es opcional.
create table public.conecta_modules (
  id uuid primary key default gen_random_uuid(), owner_promoter_id uuid not null references public.promoter_profiles(user_id),
  event_id uuid references public.events(id) on delete set null, name text not null, description text not null default '',
  experience_type text not null check (experience_type in ('dating', 'networking', 'social', 'community')),
  matching_mode text not null check (matching_mode in ('one-to-one', 'groups', 'rounds')),
  capacity integer not null check (capacity >= 4), reveal_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'open', 'matching', 'revealed', 'closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.conecta_participants (
  id uuid primary key default gen_random_uuid(), conecta_id uuid not null references public.conecta_modules(id) on delete cascade,
  user_id uuid references public.profiles(id), display_name text not null, phone text,
  consented_at timestamptz, questionnaire jsonb not null default '{}'::jsonb,
  questionnaire_completed_at timestamptz, checked_in_at timestamptz,
  created_at timestamptz not null default now(), unique nulls not distinct (conecta_id, user_id)
);

create table public.platform_members (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('platform_owner', 'platform_support')),
  primary key (user_id, role)
);
create table public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
  action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_has_any_role(required_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_members where user_id = auth.uid() and role::text = any(required_roles))
  or exists (select 1 from public.promoter_profiles where user_id = auth.uid() and 'promoter' = any(required_roles))
  or exists (select 1 from public.organization_members where user_id = auth.uid() and role::text = any(required_roles))
  or exists (select 1 from public.venue_members where user_id = auth.uid() and role::text = any(required_roles))
  or exists (select 1 from public.event_members where user_id = auth.uid() and role::text = any(required_roles));
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.promoter_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.venues enable row level security;
alter table public.venue_members enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.event_venue_collaborations enable row level security;
alter table public.conecta_modules enable row level security;
alter table public.conecta_participants enable row level security;
alter table public.platform_members enable row level security;
alter table public.audit_logs enable row level security;

create policy "profile self read" on public.profiles for select using (id = auth.uid());
create policy "profile self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "promoter public read" on public.promoter_profiles for select using (true);
create policy "promoter self manage" on public.promoter_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "venue public read" on public.venues for select using (active);
create policy "event public read" on public.events for select using (status = 'published' or owner_user_id = auth.uid());
create policy "event owner manage" on public.events for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "event member self read" on public.event_members for select using (user_id = auth.uid());
create policy "venue member self read" on public.venue_members for select using (user_id = auth.uid());
create policy "organization member self read" on public.organization_members for select using (user_id = auth.uid());
create policy "platform member self read" on public.platform_members for select using (user_id = auth.uid());
create policy "conecta public read" on public.conecta_modules for select using (status in ('open', 'matching', 'revealed') or owner_promoter_id = auth.uid());
create policy "conecta promoter manage" on public.conecta_modules for all using (owner_promoter_id = auth.uid()) with check (owner_promoter_id = auth.uid());
create policy "conecta participant self read" on public.conecta_participants for select using (user_id = auth.uid());
create policy "conecta participant self insert" on public.conecta_participants for insert with check (user_id = auth.uid());
create policy "conecta participant self update" on public.conecta_participants for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "collaboration visible to requester" on public.event_venue_collaborations for select using (requested_by = auth.uid());
create policy "collaboration requester create" on public.event_venue_collaborations for insert with check (requested_by = auth.uid());

grant execute on function public.current_user_has_any_role(text[]) to authenticated;

