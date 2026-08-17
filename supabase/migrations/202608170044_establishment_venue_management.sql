create or replace function public.create_organization_venue(
  target_organization uuid,
  venue_name text,
  venue_city text,
  venue_address text default null,
  venue_category text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_venue_id uuid;
  normalized_name text := trim(coalesce(venue_name, ''));
  normalized_city text := trim(coalesce(venue_city, ''));
  generated_key text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_organization is null or not public.can_manage_organization(target_organization) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.organization_contexts
    where organization_id = target_organization
      and role = 'establishment'::public.nocta_principal_role
      and active
  ) then raise exception 'ESTABLISHMENT_CONTEXT_REQUIRED'; end if;
  if length(normalized_name) < 2 or length(normalized_name) > 120 then raise exception 'INVALID_VENUE_NAME'; end if;
  if length(normalized_city) < 2 or length(normalized_city) > 80 then raise exception 'INVALID_VENUE_CITY'; end if;

  generated_key := trim(both '-' from regexp_replace(lower(normalized_name), '[^a-z0-9]+', '-', 'g'));
  if generated_key = '' then generated_key := 'establecimiento'; end if;
  generated_key := generated_key || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.venues (
    organization_id, external_key, name, city, address, category,
    description, opening_hours, operational_settings, active
  ) values (
    target_organization, generated_key, normalized_name, normalized_city,
    nullif(trim(coalesce(venue_address, '')), ''),
    nullif(trim(coalesce(venue_category, '')), ''), '', '{}'::jsonb,
    '{"service_modes":["bar"],"preorder_enabled":false}'::jsonb, true
  ) returning id into new_venue_id;

  insert into public.venue_menu_categories (venue_id, name, sort_order, active)
  values (new_venue_id, 'General', 0, true);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'venue.created', 'venue', new_venue_id,
    jsonb_build_object('organization_id', target_organization, 'name', normalized_name, 'city', normalized_city));

  return new_venue_id;
end;
$$;

revoke all on function public.create_organization_venue(uuid,text,text,text,text) from public;
grant execute on function public.create_organization_venue(uuid,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
