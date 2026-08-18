-- Simplifica la agenda a dos experiencias Conecta, una por promotor.
-- Conserva los 100 perfiles demo y los redistribuye 50/50.
do $reduce_conecta$
declare
  social_module uuid;
  singles_module uuid;
begin
  select id into social_module
  from public.conecta_modules
  where external_key = 'conecta-aug26-social-club';

  select id into singles_module
  from public.conecta_modules
  where external_key = 'conecta-aug26-singles';

  if social_module is null or singles_module is null then
    raise exception 'TARGET_CONECTA_MODULES_REQUIRED';
  end if;

  -- Reasigna primero para evitar perder los perfiles al borrar los otros modulos.
  with ranked as (
    select p.id, row_number() over(order by p.phone, p.id) as position
    from public.conecta_participants p
    join public.conecta_modules c on c.id = p.conecta_id
    where c.external_key like 'conecta-aug26-%'
      and coalesce(p.questionnaire ->> 'demo', 'false') = 'true'
  )
  update public.conecta_participants p
  set conecta_id = case when r.position <= 50 then social_module else singles_module end,
      questionnaire = p.questionnaire || jsonb_build_object(
        'module_key', case when r.position <= 50
          then 'conecta-aug26-social-club'
          else 'conecta-aug26-singles'
        end
      )
  from ranked r
  where p.id = r.id;

  delete from public.conecta_modules
  where external_key in (
    'conecta-aug26-sunset',
    'conecta-aug26-mesa-mar',
    'conecta-aug26-new-friends',
    'conecta-aug26-closing'
  );

  -- Los cuatro eventos permanecen publicados, pero dejan de anunciar Conecta.
  update public.events
  set details = details || '{"has_conecta":false}'::jsonb
  where external_key in (
    'aug26-sunset-connections',
    'aug26-lobo-table',
    'aug26-casa-newfriends',
    'aug26-jugada-closing'
  );

  update public.events
  set details = details || '{"has_conecta":true}'::jsonb
  where external_key in ('aug26-jugada-social', 'aug26-movida-singles');
end;
$reduce_conecta$;

notify pgrst, 'reload schema';
