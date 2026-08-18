-- La lectura publica no debe invocar funciones administrativas sin permiso anonimo.
-- Las politicas administrativas existentes siguen cubriendo categorias inactivas y gestion.
drop policy if exists "venue categories public read" on public.venue_categories;
create policy "venue categories public read"
on public.venue_categories for select to anon, authenticated
using(active);

drop policy if exists "venue category assignments read" on public.venue_category_assignments;
create policy "venue category assignments read"
on public.venue_category_assignments for select to anon, authenticated
using(exists(
  select 1 from public.venues v
  where v.id = venue_id and v.active
));

grant select on public.venue_categories, public.venue_category_assignments to anon, authenticated;
notify pgrst, 'reload schema';
