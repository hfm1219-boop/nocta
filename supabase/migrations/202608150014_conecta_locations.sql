-- Conserva el lugar de Conecta en todos los dispositivos, incluso cuando no
-- pertenece al catálogo de establecimientos NOCTA.
alter table public.conecta_modules
  add column if not exists location_name text,
  add column if not exists location_address text,
  add column if not exists location_city text;

update public.conecta_modules c
set location_name = v.name,
    location_address = v.address,
    location_city = v.city
from public.events e
join public.event_venue_collaborations evc on evc.event_id = e.id
join public.venues v on v.id = evc.venue_id
where c.event_id = e.id and c.location_name is null;
