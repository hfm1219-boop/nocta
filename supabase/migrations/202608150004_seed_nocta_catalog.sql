alter table public.organizations add column if not exists external_key text unique;

grant select on public.venues, public.events, public.conecta_modules to anon, authenticated;
grant select on public.profiles, public.promoter_profiles, public.organizations, public.organization_members, public.venue_members, public.event_members to authenticated;
grant insert, update, delete on public.organizations, public.organization_members, public.venues, public.venue_members, public.events, public.event_members, public.event_venue_collaborations, public.conecta_modules to authenticated;

insert into public.organizations(name,external_key,created_by)
select 'NOCTA Cartagena','nocta-cartagena',id from auth.users where email='humberto.franco.m@dismelltda.com'
on conflict(external_key) do update set name=excluded.name;

insert into public.organization_members(organization_id,user_id,role)
select o.id,u.id,'venue_owner' from public.organizations o cross join auth.users u
where o.external_key='nocta-cartagena' and u.email='humberto.franco.m@dismelltda.com'
on conflict do nothing;

insert into public.venues(organization_id,external_key,name,city,address)
select o.id,v.external_key,v.name,'Cartagena',v.address from public.organizations o cross join (values
  ('la-movida','La Movida','Centro Histórico'),
  ('la-jugada-club-house','La Jugada Club House','Centro Histórico'),
  ('casa-la-movida','Casa La Movida','Getsemaní'),
  ('cardinal-bar','Cardinal Bar','Centro Histórico')
) as v(external_key,name,address) where o.external_key='nocta-cartagena'
on conflict(external_key) do update set name=excluded.name,city=excluded.city,address=excluded.address,active=true;

insert into public.venue_members(venue_id,user_id,role)
select v.id,u.id,'venue_owner' from public.venues v cross join auth.users u
where v.external_key in ('la-movida','la-jugada-club-house','casa-la-movida','cardinal-bar') and u.email='humberto.franco.m@dismelltda.com'
on conflict do nothing;

insert into public.events(owner_user_id,organization_id,external_key,name,starts_at,ends_at,capacity,status)
select u.id,o.id,e.external_key,e.name,e.starts_at,e.ends_at,e.capacity,'published'
from auth.users u cross join public.organizations o cross join (values
  ('ritual-caribe','Ritual Caribe','2026-08-14T22:00:00-05:00'::timestamptz,'2026-08-15T04:00:00-05:00'::timestamptz,300),
  ('jugada-live','La Jugada Live','2026-08-15T21:00:00-05:00'::timestamptz,'2026-08-16T03:00:00-05:00'::timestamptz,250),
  ('luna-afro','Luna Afro','2026-08-16T20:00:00-05:00'::timestamptz,'2026-08-17T02:00:00-05:00'::timestamptz,80),
  ('cardinal-sessions','Cardinal Sessions','2026-08-20T19:00:00-05:00'::timestamptz,'2026-08-21T01:00:00-05:00'::timestamptz,120)
) as e(external_key,name,starts_at,ends_at,capacity)
where u.email='humberto.franco.m@dismelltda.com' and o.external_key='nocta-cartagena'
on conflict(external_key) do update set name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,status='published';

insert into public.event_venue_collaborations(event_id,venue_id,requested_by,status,decided_by,decided_at)
select e.id,v.id,u.id,'approved',u.id,now() from auth.users u
join public.events e on true
join public.venues v on v.external_key=case e.external_key
  when 'ritual-caribe' then 'la-movida' when 'jugada-live' then 'la-jugada-club-house'
  when 'luna-afro' then 'casa-la-movida' when 'cardinal-sessions' then 'cardinal-bar' end
where u.email='humberto.franco.m@dismelltda.com' and e.external_key in ('ritual-caribe','jugada-live','luna-afro','cardinal-sessions')
on conflict(event_id,venue_id) do update set status='approved',decided_by=excluded.decided_by,decided_at=excluded.decided_at;

insert into public.ticket_types(event_id,name,description,price_cop,capacity,active)
select e.id,'General','Entrada general',p.price_cop,e.capacity,true from public.events e join (values
  ('ritual-caribe',45000),('jugada-live',35000),('luna-afro',60000),('cardinal-sessions',0)
) p(external_key,price_cop) on p.external_key=e.external_key
where not exists(select 1 from public.ticket_types tt where tt.event_id=e.id and tt.name='General');

