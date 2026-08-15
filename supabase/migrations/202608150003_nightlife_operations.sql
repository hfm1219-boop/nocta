alter table public.venues add column if not exists external_key text unique;
alter table public.events add column if not exists external_key text unique;
alter table public.conecta_modules add column if not exists external_key text unique;

create type public.ticket_status as enum ('reserved', 'paid', 'used', 'cancelled', 'refunded');
create type public.reservation_status as enum ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');
create type public.order_status as enum ('new', 'preparing', 'ready', 'on_the_way', 'delivered', 'expired', 'cancelled');

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  name text not null, description text not null default '', price_cop integer not null check(price_cop >= 0),
  capacity integer not null check(capacity > 0), sales_start timestamptz, sales_end timestamptz,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(), ticket_type_id uuid not null references public.ticket_types(id),
  event_id uuid not null references public.events(id) on delete cascade, holder_user_id uuid references public.profiles(id),
  holder_name text not null, holder_email text, qr_token_hash text not null unique, status public.ticket_status not null default 'reserved',
  amount_cop integer not null check(amount_cop >= 0), payment_reference text, purchased_at timestamptz,
  used_at timestamptz, used_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.reservations (
  id uuid primary key default gen_random_uuid(), event_id uuid references public.events(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade, customer_user_id uuid references public.profiles(id),
  customer_name text not null, phone text, party_size integer not null check(party_size > 0), zone_name text,
  reserved_for timestamptz not null, deposit_cop integer not null default 0 check(deposit_cop >= 0),
  status public.reservation_status not null default 'pending', notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.guest_lists (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  owner_promoter_id uuid not null references public.promoter_profiles(user_id), name text not null,
  code text not null unique, capacity integer check(capacity > 0), closes_at timestamptz,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.guest_list_entries (
  id uuid primary key default gen_random_uuid(), guest_list_id uuid not null references public.guest_lists(id) on delete cascade,
  guest_user_id uuid references public.profiles(id), guest_name text not null, phone text, companions integer not null default 0 check(companions >= 0),
  checked_in_at timestamptz, checked_in_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table public.conecta_assignments (
  id uuid primary key default gen_random_uuid(), conecta_id uuid not null references public.conecta_modules(id) on delete cascade,
  mode text not null check(mode in ('one-to-one','groups','rounds')), round_number integer not null default 1,
  participant_ids uuid[] not null, compatibility integer not null check(compatibility between 0 and 100), created_at timestamptz not null default now()
);
create table public.conecta_interactions (
  id uuid primary key default gen_random_uuid(), conecta_id uuid not null references public.conecta_modules(id) on delete cascade,
  kind text not null check(kind in ('greeting','contact')), from_participant_id uuid not null references public.conecta_participants(id) on delete cascade,
  to_participant_id uuid not null references public.conecta_participants(id) on delete cascade,
  status text not null check(status in ('sent','accepted','rejected')), created_at timestamptz not null default now(), updated_at timestamptz
);
create table public.conecta_reports (
  id uuid primary key default gen_random_uuid(), conecta_id uuid not null references public.conecta_modules(id) on delete cascade,
  reporter_participant_id uuid not null references public.conecta_participants(id), reported_participant_id uuid references public.conecta_participants(id),
  reason text not null, detail text not null default '', status text not null default 'open' check(status in ('open','reviewed','resolved')),
  created_at timestamptz not null default now()
);

-- Compatibilidad temporal con el modelo operativo actual. Permite migrar cada local
-- sin perder pedidos o configuración mientras las pantallas pasan a tablas normalizadas.
create table public.venue_runtime_states (
  venue_id uuid primary key references public.venues(id) on delete cascade, state jsonb not null default '{}'::jsonb,
  revision bigint not null default 1, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), external_key text unique, venue_id uuid not null references public.venues(id) on delete cascade,
  customer_user_id uuid references public.profiles(id), customer_token_hash text, service_mode text not null check(service_mode in ('bar','zone','table')),
  zone_name text, items jsonb not null, subtotal_cop integer not null check(subtotal_cop >= 0), tip_cop integer not null default 0 check(tip_cop >= 0),
  total_cop integer not null check(total_cop >= 0), payment_method text not null, payment_status text not null,
  status public.order_status not null default 'new', preorder_for timestamptz, pickup_pin_hash text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_status_history (
  id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status, to_status public.order_status not null, actor_id uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function public.can_manage_event(target_event uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner()
  or exists(select 1 from public.events e where e.id=target_event and e.owner_user_id=auth.uid())
  or exists(select 1 from public.event_members em where em.event_id=target_event and em.user_id=auth.uid() and em.role in ('organizer','promoter'));
$$;
create or replace function public.can_operate_venue(target_venue uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner()
  or exists(select 1 from public.venue_members vm where vm.venue_id=target_venue and vm.user_id=auth.uid())
  or exists(select 1 from public.venues v join public.organization_members om on om.organization_id=v.organization_id where v.id=target_venue and om.user_id=auth.uid());
$$;

alter table public.ticket_types enable row level security; alter table public.tickets enable row level security;
alter table public.reservations enable row level security; alter table public.guest_lists enable row level security;
alter table public.guest_list_entries enable row level security; alter table public.conecta_assignments enable row level security;
alter table public.conecta_interactions enable row level security; alter table public.conecta_reports enable row level security;
alter table public.venue_runtime_states enable row level security; alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;

create policy "public active ticket types" on public.ticket_types for select using(active and exists(select 1 from public.events e where e.id=event_id and e.status='published'));
create policy "event managers ticket types" on public.ticket_types for all using(public.can_manage_event(event_id)) with check(public.can_manage_event(event_id));
create policy "ticket holder read" on public.tickets for select using(holder_user_id=auth.uid() or public.can_manage_event(event_id));
create policy "event managers tickets" on public.tickets for all using(public.can_manage_event(event_id)) with check(public.can_manage_event(event_id));
create policy "reservation customer read" on public.reservations for select using(customer_user_id=auth.uid() or public.can_operate_venue(venue_id));
create policy "reservation customer create" on public.reservations for insert with check(customer_user_id=auth.uid());
create policy "venue manages reservations" on public.reservations for all using(public.can_operate_venue(venue_id)) with check(public.can_operate_venue(venue_id));
create policy "guest list public by code" on public.guest_lists for select using(active);
create policy "promoter manages guest lists" on public.guest_lists for all using(owner_promoter_id=auth.uid() or public.can_manage_event(event_id)) with check(owner_promoter_id=auth.uid() or public.can_manage_event(event_id));
create policy "guest entries visible to managers" on public.guest_list_entries for select using(exists(select 1 from public.guest_lists gl where gl.id=guest_list_id and (gl.owner_promoter_id=auth.uid() or public.can_manage_event(gl.event_id))));
create policy "guest self register" on public.guest_list_entries for insert with check(guest_user_id=auth.uid());
create policy "conecta owner assignments" on public.conecta_assignments for all using(exists(select 1 from public.conecta_modules c where c.id=conecta_id and c.owner_promoter_id=auth.uid())) with check(exists(select 1 from public.conecta_modules c where c.id=conecta_id and c.owner_promoter_id=auth.uid()));
create policy "conecta participant assignments read" on public.conecta_assignments for select using(exists(select 1 from public.conecta_participants p where p.conecta_id=conecta_id and p.user_id=auth.uid() and p.id=any(participant_ids)));
create policy "participant interactions" on public.conecta_interactions for all using(exists(select 1 from public.conecta_participants p where p.id in(from_participant_id,to_participant_id) and p.user_id=auth.uid())) with check(exists(select 1 from public.conecta_participants p where p.id=from_participant_id and p.user_id=auth.uid()));
create policy "participant reports" on public.conecta_reports for insert with check(exists(select 1 from public.conecta_participants p where p.id=reporter_participant_id and p.user_id=auth.uid()));
create policy "conecta owner reports" on public.conecta_reports for select using(exists(select 1 from public.conecta_modules c where c.id=conecta_id and c.owner_promoter_id=auth.uid()));
create policy "venue runtime staff" on public.venue_runtime_states for all using(public.can_operate_venue(venue_id)) with check(public.can_operate_venue(venue_id));
create policy "customer orders read" on public.orders for select using(customer_user_id=auth.uid() or public.can_operate_venue(venue_id));
create policy "customer orders create" on public.orders for insert with check(customer_user_id=auth.uid());
create policy "venue manages orders" on public.orders for all using(public.can_operate_venue(venue_id)) with check(public.can_operate_venue(venue_id));
create policy "order history read" on public.order_status_history for select using(exists(select 1 from public.orders o where o.id=order_id and (o.customer_user_id=auth.uid() or public.can_operate_venue(o.venue_id))));

grant select on public.ticket_types, public.guest_lists to anon, authenticated;
grant select, insert, update on public.tickets, public.reservations, public.guest_list_entries, public.conecta_assignments, public.conecta_interactions, public.conecta_reports, public.venue_runtime_states, public.orders to authenticated;
grant select on public.order_status_history to authenticated;
grant execute on function public.can_manage_event(uuid), public.can_operate_venue(uuid) to authenticated;

