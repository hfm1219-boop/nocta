-- Completa la ficha publica de los eventos demo creados para agosto.
update public.events e
set details = e.details || jsonb_build_object(
  'summary', case e.details ->> 'genre'
    when 'dinner experience' then 'Una experiencia gastronómica para compartir y conectar.'
    when 'cocktail session' then 'Coctelería de autor y una noche para descubrir nuevos sabores.'
    when 'live session' then 'Música en vivo, cocina y ambiente frente al mar.'
    else 'Una noche NOCTA con música, acceso y experiencias en un solo lugar.'
  end,
  'description', 'Evento publicado en NOCTA con boletería activa, ubicación confirmada y programación para el resto de agosto.',
  'genres', jsonb_build_array(coalesce(e.details ->> 'genre', 'open format')),
  'min_age', 18,
  'dress_code', 'Smart casual',
  'reservations_enabled', true,
  'lists_enabled', true,
  'promoter_name', pp.public_name,
  'venue_name', v.name,
  'zone', coalesce(v.zone, v.address, ''),
  'city', v.city
)
from public.promoter_profiles pp,
     public.event_venue_collaborations evc,
     public.venues v
where e.external_key like 'aug26-%'
  and pp.user_id = e.owner_user_id
  and evc.event_id = e.id
  and evc.status = 'approved'
  and v.id = evc.venue_id;

notify pgrst, 'reload schema';
