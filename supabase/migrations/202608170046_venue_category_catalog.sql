create table if not exists public.venue_categories(
  id uuid primary key default gen_random_uuid(),slug text not null unique,name text not null unique,description text not null default '',active boolean not null default true,sort_order integer not null default 0,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.venue_category_assignments(
  venue_id uuid not null references public.venues(id)on delete cascade,category_id uuid not null references public.venue_categories(id)on delete restrict,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),primary key(venue_id,category_id)
);
alter table public.venue_categories enable row level security;alter table public.venue_category_assignments enable row level security;
drop policy if exists "venue categories public read" on public.venue_categories;create policy "venue categories public read" on public.venue_categories for select using(active or public.is_nocta_admin(auth.uid()));
drop policy if exists "venue categories admin manage" on public.venue_categories;create policy "venue categories admin manage" on public.venue_categories for all to authenticated using(public.is_nocta_admin(auth.uid()))with check(public.is_nocta_admin(auth.uid()));
drop policy if exists "venue category assignments read" on public.venue_category_assignments;create policy "venue category assignments read" on public.venue_category_assignments for select using(exists(select 1 from public.venues v where v.id=venue_id and(v.active or public.can_manage_venue(v.id))));
drop policy if exists "venue category assignments manage" on public.venue_category_assignments;create policy "venue category assignments manage" on public.venue_category_assignments for all to authenticated using(public.can_manage_venue(venue_id))with check(public.can_manage_venue(venue_id));
grant select on public.venue_categories,public.venue_category_assignments to anon,authenticated;grant insert,update,delete on public.venue_categories,public.venue_category_assignments to authenticated;
insert into public.venue_categories(slug,name,sort_order)values('bar','Bar',10),('club','Club',20),('rooftop','Rooftop',30),('restaurante','Restaurante',40)on conflict(slug)do update set name=excluded.name,active=true;
insert into public.venue_category_assignments(venue_id,category_id)
select v.id,c.id from public.venues v join public.venue_categories c on c.slug=lower(trim(v.category))where nullif(trim(v.category),'')is not null on conflict do nothing;
create or replace function public.set_venue_categories(target_venue uuid,category_ids uuid[])returns void language plpgsql security definer set search_path='' as $$declare first_slug text;begin
  if not public.can_manage_venue(target_venue)then raise exception 'FORBIDDEN';end if;if coalesce(array_length(category_ids,1),0)>12 then raise exception 'TOO_MANY_CATEGORIES';end if;
  if exists(select 1 from unnest(coalesce(category_ids,array[]::uuid[]))x where not exists(select 1 from public.venue_categories c where c.id=x and c.active))then raise exception 'INVALID_CATEGORY';end if;
  delete from public.venue_category_assignments where venue_id=target_venue and category_id<>all(coalesce(category_ids,array[]::uuid[]));
  insert into public.venue_category_assignments(venue_id,category_id,created_by)select target_venue,x,auth.uid()from unnest(coalesce(category_ids,array[]::uuid[]))x on conflict do nothing;
  select c.slug into first_slug from public.venue_category_assignments a join public.venue_categories c on c.id=a.category_id where a.venue_id=target_venue order by c.sort_order,c.name limit 1;
  update public.venues set category=first_slug,updated_at=now()where id=target_venue;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'venue.categories_updated','venue',target_venue,jsonb_build_object('category_ids',coalesce(to_jsonb(category_ids),'[]'::jsonb)));
end;$$;
revoke all on function public.set_venue_categories(uuid,uuid[])from public,anon;grant execute on function public.set_venue_categories(uuid,uuid[])to authenticated;notify pgrst,'reload schema';
