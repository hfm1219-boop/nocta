-- Cartas demo diferenciadas con base en la oferta publica de cada establecimiento.
-- Los nombres y precios son demostrativos: no representan una carta oficial vigente.

-- Lobo de Mar pertenece al mismo portafolio demo y se incorpora sin duplicarlo.
insert into public.venues(
  organization_id, external_key, name, city, address, description, phone, website,
  category, price_range, opening_hours, active
)
select
  v.organization_id,
  'lobo-de-mar',
  'Lobo de Mar',
  'Cartagena',
  'Calle del Santísimo #8-15, Centro Histórico',
  'Restaurante mediterráneo y caribeño con pescados, mariscos, preparaciones a la brasa, arroces, ceviches y coctelería de autor.',
  '+57 324 488 2704',
  'https://www.lobodemar.co/',
  'Restaurante · Mariscos · Coctelería',
  '$$$$',
  '{"monday":["12:00-15:00","19:00-23:30"],"tuesday":["12:00-15:00","19:00-23:30"],"wednesday":["12:00-15:00","19:00-23:30"],"thursday":["12:00-15:00","19:00-23:30"],"friday":["12:00-15:00","19:00-00:00"],"saturday":["12:00-15:00","19:00-00:00"],"sunday":["12:00-15:00","19:00-00:00"]}'::jsonb,
  true
from public.venues v
where v.external_key = 'la-movida'
on conflict(external_key) do update
set name = excluded.name,
    city = excluded.city,
    address = excluded.address,
    description = excluded.description,
    phone = excluded.phone,
    website = excluded.website,
    category = excluded.category,
    price_range = excluded.price_range,
    opening_hours = excluded.opening_hours,
    active = true,
    updated_at = now();

-- Sustituye exclusivamente datos demo; conserva intactos los productos creados por usuarios.
delete from public.venue_menu_items i
using public.venues v
where i.venue_id = v.id
  and v.external_key in ('la-movida', 'la-jugada-club-house', 'casa-la-movida', 'cardinal-bar', 'lobo-de-mar')
  and coalesce(i.metadata ->> 'demo', 'false') = 'true';

-- Oculta categorias genericas que quedaron vacias despues de retirar el catalogo demo anterior.
update public.venue_menu_categories c
set active = false, updated_at = now()
from public.venues v
where c.venue_id = v.id
  and v.external_key in ('la-movida', 'la-jugada-club-house', 'casa-la-movida', 'cardinal-bar', 'lobo-de-mar')
  and c.name in ('Cócteles', 'Cervezas', 'Botellas', 'Sin alcohol', 'Para compartir')
  and not exists (select 1 from public.venue_menu_items i where i.category_id = c.id);

with categories(external_key, name, sort_order) as (values
  ('la-movida', 'Coctelería de autor', 10),
  ('la-movida', 'Cocina fusión', 20),
  ('la-movida', 'Rooftop', 30),
  ('la-movida', 'Botellas', 40),
  ('la-jugada-club-house', 'Signature cocktails', 10),
  ('la-jugada-club-house', 'Clásicos', 20),
  ('la-jugada-club-house', 'Wines & bubbles', 30),
  ('la-jugada-club-house', 'Club food', 40),
  ('la-jugada-club-house', 'Botellas', 50),
  ('casa-la-movida', 'Rooftop cocktails', 10),
  ('casa-la-movida', 'Wine & bubbles', 20),
  ('casa-la-movida', 'Bites', 30),
  ('casa-la-movida', 'Botellas', 40),
  ('cardinal-bar', 'Coctelería de autor', 10),
  ('cardinal-bar', 'Mar Caribe', 20),
  ('cardinal-bar', 'Pacífico', 30),
  ('cardinal-bar', 'Clásicos', 40),
  ('cardinal-bar', 'Sin alcohol', 50),
  ('lobo-de-mar', 'Crudos y ceviches', 10),
  ('lobo-de-mar', 'Fuego y mar', 20),
  ('lobo-de-mar', 'Arroces', 30),
  ('lobo-de-mar', 'Para compartir', 40),
  ('lobo-de-mar', 'Coctelería de autor', 50)
)
insert into public.venue_menu_categories(venue_id, name, sort_order, active)
select v.id, c.name, c.sort_order, true
from categories c
join public.venues v on v.external_key = c.external_key
on conflict(venue_id, name) do update
set sort_order = excluded.sort_order, active = true, updated_at = now();

with products(external_key, category_name, name, description, sku, price_cop, source_url) as (values
  -- La Movida: food, drinks, live shows, house/urban music y rooftop.
  ('la-movida', 'Coctelería de autor', 'Movida Mule', 'Mule tropical con cítricos y jengibre.', 'LM-COC-001', 36000, 'https://ficcifestival.com/restaurantes/la-movida-bar'),
  ('la-movida', 'Coctelería de autor', 'Rossy Spritz', 'Spritz refrescante pensado para el rooftop.', 'LM-COC-002', 38000, 'https://www.pixnoy.com/profile/lamovidacartagena/'),
  ('la-movida', 'Coctelería de autor', 'Caribbean Paloma', 'Tequila, toronja y notas caribeñas.', 'LM-COC-003', 36000, 'https://ficcifestival.com/restaurantes/la-movida-bar'),
  ('la-movida', 'Coctelería de autor', 'Ron Old Fashioned', 'Ron añejo, bitters y azúcar.', 'LM-COC-004', 42000, 'https://ficcifestival.com/restaurantes/la-movida-bar'),
  ('la-movida', 'Cocina fusión', 'Ceviche caribeño', 'Pesca blanca, cítricos y sabores locales.', 'LM-COCINA-001', 54000, 'https://ficcifestival.com/restaurantes/la-movida-bar'),
  ('la-movida', 'Cocina fusión', 'Tacos de pesca blanca', 'Tacos de pescado con salsa fresca de la casa.', 'LM-COCINA-002', 46000, 'https://ficcifestival.com/restaurantes/la-movida-bar'),
  ('la-movida', 'Cocina fusión', 'Crispy chicken bites', 'Pollo crocante con salsa ligeramente picante.', 'LM-COCINA-003', 39000, 'https://ficcifestival.com/restaurantes/la-movida-bar'),
  ('la-movida', 'Rooftop', 'Mini burgers de la casa', 'Tres mini hamburguesas para compartir.', 'LM-ROOF-001', 42000, 'https://www.pixnoy.com/profile/lamovidacartagena/'),
  ('la-movida', 'Rooftop', 'Gin Tropical', 'Ginebra, tónica y frutas tropicales.', 'LM-ROOF-002', 38000, 'https://www.pixnoy.com/profile/lamovidacartagena/'),
  ('la-movida', 'Botellas', 'Whisky 12 años', 'Botella de 750 ml con mezcladores.', 'LM-BOT-001', 480000, 'https://www.pixnoy.com/profile/lamovidacartagena/'),
  ('la-movida', 'Botellas', 'Tequila premium', 'Botella de 750 ml con mezcladores.', 'LM-BOT-002', 520000, 'https://www.pixnoy.com/profile/lamovidacartagena/'),
  ('la-movida', 'Botellas', 'Espumante', 'Botella para brindar en rooftop.', 'LM-BOT-003', 260000, 'https://www.pixnoy.com/profile/lamovidacartagena/'),

  -- La Jugada: restaurante, cocktail bar, rooftop y experiencia club house.
  ('la-jugada-club-house', 'Signature cocktails', 'Gatsby', 'Cóctel de autor inspirado en el concepto de la casa.', 'LJ-SIG-001', 38000, 'https://restaurante.covermanager.com/la-jugada/'),
  ('la-jugada-club-house', 'Signature cocktails', 'Daisy Rooftop Spritz', 'Spritz frutal y refrescante.', 'LJ-SIG-002', 38000, 'https://linktr.ee/lajugada'),
  ('la-jugada-club-house', 'Signature cocktails', 'Volta Highball', 'Highball ligero con notas cítricas.', 'LJ-SIG-003', 36000, 'https://linktr.ee/lajugada'),
  ('la-jugada-club-house', 'Clásicos', 'Moscow Mule', 'Vodka, jengibre y limón.', 'LJ-CLA-001', 36000, 'https://www.viberate.com/venue/la-jugada-club-house/'),
  ('la-jugada-club-house', 'Clásicos', 'Negroni', 'Gin, vermut rojo y bitter italiano.', 'LJ-CLA-002', 38000, 'https://www.viberate.com/venue/la-jugada-club-house/'),
  ('la-jugada-club-house', 'Clásicos', 'Old Fashioned', 'Whisky, bitters y azúcar.', 'LJ-CLA-003', 40000, 'https://www.viberate.com/venue/la-jugada-club-house/'),
  ('la-jugada-club-house', 'Wines & bubbles', 'Copa de vino', 'Selección de vino por copa.', 'LJ-WINE-001', 30000, 'https://www.viberate.com/venue/la-jugada-club-house/'),
  ('la-jugada-club-house', 'Wines & bubbles', 'Espumante', 'Botella de vino espumoso.', 'LJ-WINE-002', 260000, 'https://www.viberate.com/venue/la-jugada-club-house/'),
  ('la-jugada-club-house', 'Club food', 'Sliders Club House', 'Mini hamburguesas para compartir.', 'LJ-FOOD-001', 44000, 'https://linktr.ee/lajugada'),
  ('la-jugada-club-house', 'Club food', 'Truffle fries', 'Papas crocantes con toque de trufa.', 'LJ-FOOD-002', 32000, 'https://linktr.ee/lajugada'),
  ('la-jugada-club-house', 'Club food', 'Crispy shrimp', 'Camarones crocantes con salsa de la casa.', 'LJ-FOOD-003', 52000, 'https://linktr.ee/lajugada'),
  ('la-jugada-club-house', 'Botellas', 'Gin premium', 'Botella de 700 ml con mezcladores.', 'LJ-BOT-001', 430000, 'https://restaurante.covermanager.com/la-jugada/'),

  -- Casa La Movida: propuesta demo de rooftop coherente con el concepto publico del lugar.
  ('casa-la-movida', 'Rooftop cocktails', 'Sunset Spritz', 'Spritz cítrico para el atardecer.', 'CLM-COC-001', 38000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Rooftop cocktails', 'Nácar Collins', 'Gin, limón, soda y notas florales.', 'CLM-COC-002', 36000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Rooftop cocktails', 'Caribbean Mojito', 'Ron, hierbabuena, limón y soda.', 'CLM-COC-003', 34000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Rooftop cocktails', 'Passionfruit Mule', 'Vodka, maracuyá y jengibre.', 'CLM-COC-004', 36000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Wine & bubbles', 'Copa de vino', 'Selección de vino por copa.', 'CLM-WINE-001', 28000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Wine & bubbles', 'Prosecco', 'Botella de prosecco para compartir.', 'CLM-WINE-002', 240000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Bites', 'Burrata y tomates', 'Burrata cremosa con tomates y hierbas.', 'CLM-BITE-001', 52000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Bites', 'Ceviche de camarón', 'Camarón, cítricos y sabores del Caribe.', 'CLM-BITE-002', 58000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Bites', 'Mini burgers', 'Tres mini hamburguesas para compartir.', 'CLM-BITE-003', 40000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Bites', 'Tataki de atún', 'Atún sellado con aderezo cítrico.', 'CLM-BITE-004', 56000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Botellas', 'Gin', 'Botella de 700 ml con mezcladores.', 'CLM-BOT-001', 420000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),
  ('casa-la-movida', 'Botellas', 'Ron reserva', 'Botella de 750 ml con mezcladores.', 'CLM-BOT-002', 360000, 'https://all.accor.com/a/es/limitless/thematics/travel-tips-guides/viajar-con-amigos-para-cartagena-colombia.html'),

  -- Cardinal: cocktail bar con sabores del Caribe y Pacifico.
  ('cardinal-bar', 'Coctelería de autor', 'Cardinal 5/5', 'Cóctel insignia de inspiración tropical.', 'CAR-SIG-001', 38000, 'https://www.tripadvisor.co/Restaurant_Review-g297476-d23352573-Reviews-Cardinal_Cinco_De_Cinco-Cartagena_Cartagena_District_Bolivar_Department.html'),
  ('cardinal-bar', 'Coctelería de autor', 'Pacífico Sour', 'Sour con frutas tropicales y notas del Pacífico.', 'CAR-SIG-002', 36000, 'https://www.tripadvisor.co/Restaurant_Review-g297476-d23352573-Reviews-Cardinal_Cinco_De_Cinco-Cartagena_Cartagena_District_Bolivar_Department.html'),
  ('cardinal-bar', 'Coctelería de autor', 'Caribe Ahumado', 'Cóctel de ron con notas especiadas y ahumadas.', 'CAR-SIG-003', 40000, 'https://wanderlog.com/place/details/3675390/cardinal-bar-ctg'),
  ('cardinal-bar', 'Coctelería de autor', 'Coco y Sal', 'Cóctel cremoso con coco y contraste salino.', 'CAR-SIG-004', 36000, 'https://wanderlog.com/place/details/3675390/cardinal-bar-ctg'),
  ('cardinal-bar', 'Mar Caribe', 'Tiradito de robalo', 'Robalo, cítricos y ajíes frescos.', 'CAR-CAR-001', 48000, 'https://www.tripadvisor.co/Restaurant_Review-g297476-d23352573-Reviews-Cardinal_Cinco_De_Cinco-Cartagena_Cartagena_District_Bolivar_Department.html'),
  ('cardinal-bar', 'Mar Caribe', 'Ceviche de camarón', 'Camarón, cítricos y sabores caribeños.', 'CAR-CAR-002', 52000, 'https://www.tripadvisor.co/Restaurant_Review-g297476-d23352573-Reviews-Cardinal_Cinco_De_Cinco-Cartagena_Cartagena_District_Bolivar_Department.html'),
  ('cardinal-bar', 'Pacífico', 'Tartar de atún', 'Atún fresco, aguacate y aderezo cítrico.', 'CAR-PAC-001', 50000, 'https://www.tripadvisor.co/Restaurant_Review-g297476-d23352573-Reviews-Cardinal_Cinco_De_Cinco-Cartagena_Cartagena_District_Bolivar_Department.html'),
  ('cardinal-bar', 'Pacífico', 'Langostinos del Pacífico', 'Langostinos con salsa tropical de la casa.', 'CAR-PAC-002', 58000, 'https://www.tripadvisor.co/Restaurant_Review-g297476-d23352573-Reviews-Cardinal_Cinco_De_Cinco-Cartagena_Cartagena_District_Bolivar_Department.html'),
  ('cardinal-bar', 'Clásicos', 'Negroni', 'Gin, vermut rojo y bitter italiano.', 'CAR-CLA-001', 36000, 'https://wanderlog.com/place/details/3675390/cardinal-bar-ctg'),
  ('cardinal-bar', 'Clásicos', 'Old Fashioned', 'Whisky, bitters y azúcar.', 'CAR-CLA-002', 38000, 'https://wanderlog.com/place/details/3675390/cardinal-bar-ctg'),
  ('cardinal-bar', 'Sin alcohol', 'Cordial tropical', 'Frutas tropicales, cordial y soda.', 'CAR-ZERO-001', 20000, 'https://wanderlog.com/place/details/3675390/cardinal-bar-ctg'),
  ('cardinal-bar', 'Sin alcohol', 'Soda botánica', 'Soda artesanal con botánicos y cítricos.', 'CAR-ZERO-002', 18000, 'https://wanderlog.com/place/details/3675390/cardinal-bar-ctg'),

  -- Lobo de Mar: producto fresco, cocina mediterranea/caribena, fuego y cocteleria.
  ('lobo-de-mar', 'Crudos y ceviches', 'Ceviche de pesca blanca', 'Pesca fresca, cítricos y ajíes del Caribe.', 'LDM-CRU-001', 56000, 'https://ficcifestival.com/restaurantes/lobo-de-mar'),
  ('lobo-de-mar', 'Crudos y ceviches', 'Tiradito del día', 'Pesca del día, leche de tigre y aceite de hierbas.', 'LDM-CRU-002', 58000, 'https://ficcifestival.com/restaurantes/lobo-de-mar'),
  ('lobo-de-mar', 'Crudos y ceviches', 'Tartar de atún', 'Atún fresco, aguacate y vinagreta cítrica.', 'LDM-CRU-003', 62000, 'https://www.lobodemar.co/'),
  ('lobo-de-mar', 'Fuego y mar', 'Pulpo a la brasa', 'Pulpo asado con vegetales y salsa de la casa.', 'LDM-FUE-001', 78000, 'https://ficcifestival.com/restaurantes/lobo-de-mar'),
  ('lobo-de-mar', 'Fuego y mar', 'Pesca del día a la brasa', 'Pesca fresca, vegetales de temporada y salsa mediterránea.', 'LDM-FUE-002', 86000, 'https://ficcifestival.com/restaurantes/lobo-de-mar'),
  ('lobo-de-mar', 'Fuego y mar', 'Langostinos al fuego', 'Langostinos asados con mantequilla cítrica.', 'LDM-FUE-003', 82000, 'https://ficcifestival.com/restaurantes/lobo-de-mar'),
  ('lobo-de-mar', 'Arroces', 'Arroz meloso de mariscos', 'Arroz cremoso con mariscos frescos y fondo de pescado.', 'LDM-ARR-001', 76000, 'https://ficcifestival.com/restaurantes/lobo-de-mar'),
  ('lobo-de-mar', 'Arroces', 'Arroz del Caribe', 'Arroz con pesca, coco y vegetales locales.', 'LDM-ARR-002', 72000, 'https://ficcifestival.com/restaurantes/lobo-de-mar'),
  ('lobo-de-mar', 'Para compartir', 'Tacos de pescado', 'Tacos de pesca fresca con encurtidos y salsa cremosa.', 'LDM-SHA-001', 52000, 'https://www.lobodemar.co/'),
  ('lobo-de-mar', 'Para compartir', 'Burrata mediterránea', 'Burrata, tomates, hierbas y aceite de oliva.', 'LDM-SHA-002', 58000, 'https://www.lobodemar.co/'),
  ('lobo-de-mar', 'Coctelería de autor', 'Flint', 'Cóctel de autor de perfil ahumado y tropical.', 'LDM-COC-001', 44000, 'https://www.tripadvisor.com/Restaurant_Review-g297476-d6777464-Reviews-Lobo_de_Mar-Cartagena_Cartagena_District_Bolivar_Department.html'),
  ('lobo-de-mar', 'Coctelería de autor', 'Viejo Marinero', 'Ron, frutas tropicales, cítricos y especias.', 'LDM-COC-002', 42000, 'https://www.lobodemar.co/'),
  ('lobo-de-mar', 'Coctelería de autor', 'Mediterranean Gin', 'Gin, botánicos, tónica y cítricos.', 'LDM-COC-003', 42000, 'https://www.lobodemar.co/')
)
insert into public.venue_menu_items(
  venue_id, category_id, name, description, sku, price_cop, available, metadata
)
select
  v.id,
  c.id,
  p.name,
  p.description,
  p.sku,
  p.price_cop,
  true,
  jsonb_build_object(
    'demo', true,
    'research_based', true,
    'price_source', 'estimated_demo',
    'source_url', p.source_url,
    'disclaimer', 'Producto y precio demostrativos; confirmar con el establecimiento.'
  )
from products p
join public.venues v on v.external_key = p.external_key
join public.venue_menu_categories c on c.venue_id = v.id and c.name = p.category_name
on conflict(venue_id, name) do update
set category_id = excluded.category_id,
    description = excluded.description,
    sku = excluded.sku,
    price_cop = excluded.price_cop,
    available = true,
    metadata = excluded.metadata,
    updated_at = now();

notify pgrst, 'reload schema';
