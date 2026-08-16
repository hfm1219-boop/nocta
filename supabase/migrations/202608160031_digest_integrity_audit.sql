-- Sustituye todas las llamadas históricas ambiguas a digest(text, ...)
-- en las funciones activas del esquema público por el helper tipado y probado.
do $$
declare
  fn record;
  fixed text;
  unresolved integer;
begin
  for fn in
    select p.oid, p.proname, pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> 'nocta_sha256'
      and pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid), 'digest(') > 0
  loop
    fixed := fn.definition;
    fixed := pg_catalog.replace(fixed, 'encode(digest(raw_token,''sha256''),''hex'')', 'public.nocta_sha256(raw_token)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(raw_token, ''sha256''), ''hex'')', 'public.nocta_sha256(raw_token)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(candidate,''sha256''),''hex'')', 'public.nocta_sha256(candidate)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(candidate, ''sha256''), ''hex'')', 'public.nocta_sha256(candidate)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(new.token,''sha256''),''hex'')', 'public.nocta_sha256(new.token)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(new.token, ''sha256''), ''hex'')', 'public.nocta_sha256(new.token)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(pickup_pin,''sha256''),''hex'')', 'public.nocta_sha256(pickup_pin)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(pickup_pin, ''sha256''), ''hex'')', 'public.nocta_sha256(pickup_pin)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(gen_random_uuid()::text, ''sha256''), ''hex'')', 'public.nocta_sha256(gen_random_uuid()::text)');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(raw_token)),''sha256''),''hex'')', 'public.nocta_sha256(upper(trim(raw_token)))');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(raw_token)), ''sha256''), ''hex'')', 'public.nocta_sha256(upper(trim(raw_token)))');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(entry_token)),''sha256''),''hex'')', 'public.nocta_sha256(upper(trim(entry_token)))');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(entry_token)), ''sha256''), ''hex'')', 'public.nocta_sha256(upper(trim(entry_token)))');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(reservation_token)),''sha256''),''hex'')', 'public.nocta_sha256(upper(trim(reservation_token)))');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(reservation_token)), ''sha256''), ''hex'')', 'public.nocta_sha256(upper(trim(reservation_token)))');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(ticket_token)),''sha256''),''hex'')', 'public.nocta_sha256(upper(trim(ticket_token)))');
    fixed := pg_catalog.replace(fixed, 'encode(digest(upper(trim(ticket_token)), ''sha256''), ''hex'')', 'public.nocta_sha256(upper(trim(ticket_token)))');

    if fixed <> fn.definition then
      execute fixed;
    end if;
  end loop;

  select count(*) into unresolved
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname <> 'nocta_sha256'
    and pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid), 'digest(') > 0;

  if unresolved > 0 then
    raise exception 'DIGEST_CALLS_UNRESOLVED: %', unresolved;
  end if;
end;
$$;

notify pgrst, 'reload schema';
