-- Participantes ficticios confirmados para demostrar diversidad y ocupacion en Conecta.
-- Los invitados sin cuenta pueden coexistir; un usuario autenticado sigue siendo unico por modulo.
alter table public.conecta_participants
  drop constraint if exists conecta_participants_conecta_id_user_id_key;

create unique index if not exists conecta_participants_unique_registered_user
  on public.conecta_participants(conecta_id, user_id)
  where user_id is not null;

with people(sequence, display_name, phone, age, gender, intention, answers) as (values
  (1,  'Valentina Ríos',    '3009000001', 24, 'Mujer',       'Conocer gente nueva',       '{"energy":"alta","music":"afro house","ideal_plan":"rooftop","conversation":"viajes"}'::jsonb),
  (2,  'Mateo Salazar',     '3009000002', 28, 'Hombre',      'Amistad',                    '{"energy":"media","music":"salsa","ideal_plan":"cocteles","conversation":"música"}'::jsonb),
  (3,  'Laura Mendoza',     '3009000003', 31, 'Mujer',       'Networking',                 '{"energy":"media","music":"house","ideal_plan":"cena","conversation":"emprendimiento"}'::jsonb),
  (4,  'Sebastián Torres',  '3009000004', 27, 'Hombre',      'Conocer gente nueva',       '{"energy":"alta","music":"urbano","ideal_plan":"club","conversation":"deportes"}'::jsonb),
  (5,  'Camila Ospina',     '3009000005', 26, 'Mujer',       'Citas',                      '{"energy":"alta","music":"latin house","ideal_plan":"rooftop","conversation":"gastronomía"}'::jsonb),
  (6,  'Nicolás Herrera',   '3009000006', 30, 'Hombre',      'Citas',                      '{"energy":"tranquila","music":"indie","ideal_plan":"cena","conversation":"cine"}'::jsonb),
  (7,  'Mariana Vélez',     '3009000007', 29, 'Mujer',       'Amistad',                    '{"energy":"media","music":"pop","ideal_plan":"bar","conversation":"viajes"}'::jsonb),
  (8,  'Daniel Pardo',      '3009000008', 33, 'Hombre',      'Networking',                 '{"energy":"media","music":"jazz","ideal_plan":"cocteles","conversation":"negocios"}'::jsonb),
  (9,  'Sofía Guerrero',    '3009000009', 23, 'Mujer',       'Conocer gente nueva',       '{"energy":"alta","music":"reggaetón","ideal_plan":"club","conversation":"moda"}'::jsonb),
  (10, 'Andrés Cabrera',    '3009000010', 32, 'Hombre',      'Amistad',                    '{"energy":"tranquila","music":"rock","ideal_plan":"cervezas","conversation":"tecnología"}'::jsonb),
  (11, 'Isabella Mejía',    '3009000011', 28, 'Mujer',       'Citas',                      '{"energy":"media","music":"salsa","ideal_plan":"cena","conversation":"arte"}'::jsonb),
  (12, 'Felipe Arango',     '3009000012', 35, 'Hombre',      'Networking',                 '{"energy":"media","music":"house","ideal_plan":"rooftop","conversation":"inversión"}'::jsonb),
  (13, 'Juliana Castro',    '3009000013', 30, 'Mujer',       'Comunidad',                  '{"energy":"alta","music":"afrobeats","ideal_plan":"festival","conversation":"cultura"}'::jsonb),
  (14, 'Santiago Restrepo', '3009000014', 25, 'Hombre',      'Conocer gente nueva',       '{"energy":"alta","music":"electrónica","ideal_plan":"club","conversation":"viajes"}'::jsonb),
  (15, 'Gabriela Mora',     '3009000015', 34, 'Mujer',       'Networking',                 '{"energy":"tranquila","music":"soul","ideal_plan":"cena","conversation":"diseño"}'::jsonb),
  (16, 'Tomás Acosta',      '3009000016', 29, 'Hombre',      'Citas',                      '{"energy":"media","music":"latin","ideal_plan":"cocteles","conversation":"gastronomía"}'::jsonb),
  (17, 'Sara Jiménez',      '3009000017', 27, 'Mujer',       'Amistad',                    '{"energy":"alta","music":"pop latino","ideal_plan":"rooftop","conversation":"bienestar"}'::jsonb),
  (18, 'Juan Pablo León',   '3009000018', 36, 'Hombre',      'Networking',                 '{"energy":"tranquila","music":"jazz","ideal_plan":"bar","conversation":"hospitalidad"}'::jsonb),
  (19, 'Emma Rodríguez',    '3009000019', 22, 'No binario',  'Comunidad',                  '{"energy":"alta","music":"electropop","ideal_plan":"festival","conversation":"fotografía"}'::jsonb),
  (20, 'Martín Lozano',     '3009000020', 31, 'Hombre',      'Conocer gente nueva',       '{"energy":"media","music":"champeta","ideal_plan":"club","conversation":"música"}'::jsonb),
  (21, 'Natalia Peña',      '3009000021', 38, 'Mujer',       'Networking',                 '{"energy":"tranquila","music":"bossa nova","ideal_plan":"cena","conversation":"turismo"}'::jsonb),
  (22, 'Samuel Duarte',     '3009000022', 24, 'Hombre',      'Amistad',                    '{"energy":"alta","music":"tech house","ideal_plan":"club","conversation":"deportes"}'::jsonb),
  (23, 'Luciana Becerra',   '3009000023', 29, 'Mujer',       'Citas',                      '{"energy":"media","music":"R&B","ideal_plan":"cocteles","conversation":"cine"}'::jsonb),
  (24, 'Alejandro Suárez',  '3009000024', 40, 'Hombre',      'Comunidad',                  '{"energy":"tranquila","music":"salsa clásica","ideal_plan":"cena","conversation":"historia"}'::jsonb),
  (25, 'Renata Fuentes',    '3009000025', 26, 'No binario',  'Conocer gente nueva',       '{"energy":"alta","music":"afro house","ideal_plan":"rooftop","conversation":"arte"}'::jsonb)
), modules as (
  select id, external_key, row_number() over(order by starts_at, external_key) as module_number
  from (
    select c.id, c.external_key, e.starts_at
    from public.conecta_modules c
    join public.events e on e.id = c.event_id
    where c.external_key like 'conecta-aug26-%'
  ) ordered_modules
), assigned as (
  select p.*, m.id as conecta_id, m.external_key as module_key
  from people p
  join modules m on m.module_number = ((p.sequence - 1) % 6) + 1
)
insert into public.conecta_participants(
  conecta_id, user_id, display_name, phone, age, gender, intention,
  consented_at, questionnaire, questionnaire_completed_at, checked_in_at, feedback
)
select
  a.conecta_id,
  null,
  a.display_name,
  a.phone,
  a.age,
  a.gender,
  a.intention,
  now() - ((26 - a.sequence) * interval '3 hours'),
  a.answers || jsonb_build_object(
    'demo', true,
    'confirmed', true,
    'module_key', a.module_key,
    'profile_style', case a.sequence % 4
      when 0 then 'explorer'
      when 1 then 'connector'
      when 2 then 'foodie'
      else 'music_lover'
    end
  ),
  now() - ((26 - a.sequence) * interval '3 hours') + interval '12 minutes',
  null,
  null
from assigned a
where not exists(
  select 1 from public.conecta_participants existing
  where existing.conecta_id = a.conecta_id and existing.phone = a.phone
);

-- Completa una comunidad de 100 personas sin almacenar datos personales reales.
with modules as (
  select id, external_key, row_number() over(order by starts_at, external_key) as module_number
  from (
    select c.id, c.external_key, e.starts_at
    from public.conecta_modules c
    join public.events e on e.id = c.event_id
    where c.external_key like 'conecta-aug26-%'
  ) ordered_modules
), generated_people as (
  select
    n as sequence,
    (array[
      'Adriana','Bruno','Carolina','Diego','Elena','Fabián','Helena','Iván',
      'Josefina','Kevin','Lorena','Miguel','Noelia','Óscar','Paula'
    ])[((n - 26) % 15) + 1]
      || ' ' ||
    (array['Álvarez','Benítez','Correa','Domínguez','Escobar','Flórez','Guzmán','Ibarra','Navarro','Quintero'])[
      (((n - 26) / 15) % 10) + 1
    ] as display_name,
    '30091' || lpad(n::text, 5, '0') as phone,
    21 + ((n * 7) % 23) as age,
    (array['Mujer','Hombre','No binario'])[((n - 1) % 3) + 1] as gender,
    (array['Conocer gente nueva','Amistad','Citas','Networking','Comunidad'])[((n - 1) % 5) + 1] as intention,
    jsonb_build_object(
      'energy', (array['tranquila','media','alta'])[((n - 1) % 3) + 1],
      'music', (array['afro house','salsa','urbano','electrónica','champeta','R&B'])[((n - 1) % 6) + 1],
      'ideal_plan', (array['rooftop','cena','cocteles','club','festival'])[((n - 1) % 5) + 1],
      'conversation', (array['viajes','gastronomía','música','arte','negocios','bienestar'])[((n - 1) % 6) + 1],
      'demo', true,
      'confirmed', true,
      'profile_style', (array['explorer','connector','foodie','music_lover'])[((n - 1) % 4) + 1]
    ) as answers
  from generate_series(26, 100) n
), assigned as (
  select p.*, m.id as conecta_id, m.external_key as module_key
  from generated_people p
  join modules m on m.module_number = ((p.sequence - 1) % 6) + 1
)
insert into public.conecta_participants(
  conecta_id, user_id, display_name, phone, age, gender, intention,
  consented_at, questionnaire, questionnaire_completed_at, checked_in_at, feedback
)
select
  a.conecta_id,
  null,
  a.display_name,
  a.phone,
  a.age,
  a.gender,
  a.intention,
  now() - ((101 - a.sequence) * interval '35 minutes'),
  a.answers || jsonb_build_object('module_key', a.module_key),
  now() - ((101 - a.sequence) * interval '35 minutes') + interval '9 minutes',
  null,
  null
from assigned a
where not exists(
  select 1 from public.conecta_participants existing
  where existing.conecta_id = a.conecta_id and existing.phone = a.phone
);

notify pgrst, 'reload schema';
