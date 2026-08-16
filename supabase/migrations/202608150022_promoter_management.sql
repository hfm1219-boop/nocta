-- Fase 5: promotores organizacionales, patrocinio, cortesias y liquidaciones.
alter table public.promoter_profiles add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.promoter_profiles add column if not exists contact_email text;
alter table public.promoter_profiles add column if not exists contact_phone text;
alter table public.promoter_profiles add column if not exists social_links jsonb not null default '{}'::jsonb;
alter table public.promoter_profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.event_sponsors(
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null, name text not null,
  contribution_type text not null default 'cash' check(contribution_type in ('cash','product','media','venue','other')),
  contribution_value_cop integer not null default 0 check(contribution_value_cop>=0), status text not null default 'proposed' check(status in ('proposed','confirmed','rejected','cancelled')),
  notes text not null default '', created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.event_complimentary_allocations(
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid references public.ticket_types(id) on delete set null, recipient_name text not null,
  recipient_email text, quantity integer not null check(quantity between 1 and 20), status text not null default 'reserved' check(status in ('reserved','issued','used','cancelled')),
  notes text not null default '', created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.promoter_settlements(
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gross_cop bigint not null default 0 check(gross_cop>=0), fees_cop bigint not null default 0 check(fees_cop>=0), deductions_cop bigint not null default 0 check(deductions_cop>=0),
  net_cop bigint generated always as (gross_cop-fees_cop-deductions_cop) stored,
  status text not null default 'pending' check(status in ('pending','review','approved','paid','disputed')),
  due_at timestamptz, paid_at timestamptz, reference text, notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(event_id,organization_id)
);

create or replace function public.can_manage_promoter_organization(target_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner() or exists(
    select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id
    where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active'
      and r.context_role='promoter' and r.role in('owner','admin')
  );
$$;
create or replace function public.can_manage_promoter_event(target_event uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_owner() or exists(
    select 1 from public.events e where e.id=target_event and (
      e.owner_user_id=auth.uid() or (e.organization_id is not null and public.can_manage_promoter_organization(e.organization_id))
    )
  );
$$;

create or replace function public.create_commercial_event(event_payload jsonb,ticket_payload jsonb)
returns table(id uuid,external_key text) language plpgsql security definer set search_path='' as $$
declare new_event uuid;new_key text;venue uuid;ticket jsonb;active_org uuid;
begin
  select c.organization_id into active_org from public.user_active_contexts c
  where c.user_id=auth.uid() and c.context_role='promoter';
  if auth.uid() is null or active_org is null or not public.can_manage_promoter_organization(active_org) then raise exception 'Se requiere contexto promotor activo';end if;
  if nullif(trim(event_payload->>'name'),'') is null or coalesce((event_payload->>'capacity')::integer,0)<1 or jsonb_array_length(ticket_payload)<1 then raise exception 'Evento incompleto';end if;
  new_key:='plan-'||replace(gen_random_uuid()::text,'-','');
  insert into public.events(external_key,owner_user_id,organization_id,name,starts_at,ends_at,capacity,status,details)
  values(new_key,auth.uid(),active_org,trim(event_payload->>'name'),(event_payload->>'starts_at')::timestamptz,nullif(event_payload->>'ends_at','')::timestamptz,(event_payload->>'capacity')::integer,'draft',event_payload-'name'-'starts_at'-'ends_at'-'capacity') returning public.events.id into new_event;
  insert into public.event_members(event_id,user_id,role) values(new_event,auth.uid(),'organizer') on conflict do nothing;
  for ticket in select * from jsonb_array_elements(ticket_payload) loop
    if nullif(trim(ticket->>'name'),'') is null or (ticket->>'price_cop')::integer<0 or (ticket->>'capacity')::integer<1 then raise exception 'Tipo de entrada invalido';end if;
    insert into public.ticket_types(event_id,name,description,price_cop,capacity,active) values(new_event,trim(ticket->>'name'),coalesce(ticket->>'description',''),(ticket->>'price_cop')::integer,(ticket->>'capacity')::integer,true);
  end loop;
  if nullif(event_payload->>'venue_key','') is not null then
    select v.id into venue from public.venues v where v.external_key=event_payload->>'venue_key';
    if venue is null then raise exception 'Establecimiento no encontrado';end if;
    insert into public.event_venue_collaborations(event_id,venue_id,requested_by,status) values(new_event,venue,auth.uid(),'requested') on conflict do nothing;
    update public.events set status='pending_venue' where public.events.id=new_event;
  end if;
  id:=new_event;external_key:=new_key;return next;
end;$$;

alter table public.event_sponsors enable row level security;
alter table public.event_complimentary_allocations enable row level security;
alter table public.promoter_settlements enable row level security;
drop policy if exists "promoter sponsors manage" on public.event_sponsors;
create policy "promoter sponsors manage" on public.event_sponsors for all to authenticated using(public.can_manage_promoter_event(event_id)) with check(public.can_manage_promoter_event(event_id));
drop policy if exists "promoter courtesy manage" on public.event_complimentary_allocations;
create policy "promoter courtesy manage" on public.event_complimentary_allocations for all to authenticated using(public.can_manage_promoter_event(event_id)) with check(public.can_manage_promoter_event(event_id));
drop policy if exists "promoter settlements read" on public.promoter_settlements;
create policy "promoter settlements read" on public.promoter_settlements for select to authenticated using(public.can_manage_promoter_organization(organization_id));
drop policy if exists "promoter events organization read" on public.events;
create policy "promoter events organization read" on public.events for select to authenticated using(organization_id is not null and public.can_manage_promoter_organization(organization_id));

grant select,insert,update,delete on public.event_sponsors,public.event_complimentary_allocations to authenticated;
grant select on public.promoter_settlements to authenticated;
grant execute on function public.can_manage_promoter_organization(uuid),public.can_manage_promoter_event(uuid) to authenticated;
notify pgrst,'reload schema';
