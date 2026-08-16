-- Auditoria transversal Fases 1-6: el contexto exige un rol asignado, no solo membresia.
update public.user_active_contexts ac set organization_id=null,role='consumer',updated_at=now()
where ac.role in('establishment','promoter','brand_distributor') and not exists(
  select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id
  join public.organization_contexts c on c.organization_id=m.organization_id and c.role=r.context_role and c.active
  where m.user_id=ac.user_id and m.organization_id=ac.organization_id and m.status='active' and r.context_role=ac.role
);

create or replace function public.get_my_access_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  select jsonb_build_object(
    'user',jsonb_build_object('id',p.id,'fullName',p.full_name,'status',p.status),
    'globalRoles',coalesce((select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id=p.id),'[]'::jsonb),
    'organizations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'name',o.name,'slug',o.slug,'businessType',o.business_type,'membershipStatus',m.status,
      'contexts',coalesce((select jsonb_agg(x.context_role order by x.context_role) from(select distinct r.context_role::text context_role from public.organization_roles r join public.organization_contexts c on c.organization_id=m.organization_id and c.role=r.context_role and c.active where r.membership_id=m.id)x),'[]'::jsonb),
      'roles',coalesce((select jsonb_agg(jsonb_build_object('context',r.context_role,'role',r.role,'venueId',r.scope_venue_id) order by r.context_role,r.role) from public.organization_roles r join public.organization_contexts c on c.organization_id=m.organization_id and c.role=r.context_role and c.active where r.membership_id=m.id),'[]'::jsonb)
    ) order by o.name) from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.user_id=p.id and m.status<>'suspended'),'[]'::jsonb),
    'activeContext',(select jsonb_build_object('organizationId',ac.organization_id,'role',ac.role::text,'organizationName',o.name) from public.user_active_contexts ac left join public.organizations o on o.id=ac.organization_id where ac.user_id=p.id and (
      (ac.role='consumer' and exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role='consumer')) or
      (ac.role='nocta_admin' and public.is_nocta_admin(p.id)) or
      (ac.role in('establishment','promoter','brand_distributor') and exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id join public.organization_contexts c on c.organization_id=m.organization_id and c.role=r.context_role and c.active where m.user_id=p.id and m.organization_id=ac.organization_id and m.status='active' and r.context_role=ac.role))
    ))
  ) into result from public.profiles p where p.id=auth.uid();return result;
end;$$;

create or replace function public.set_active_context(target_organization uuid,target_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare parsed_role public.nocta_principal_role;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;parsed_role:=target_role::public.nocta_principal_role;
  if parsed_role in('consumer','nocta_admin') then
    if target_organization is not null then raise exception 'ORGANIZATION_NOT_ALLOWED';end if;
    if parsed_role='nocta_admin' and not public.is_nocta_admin(auth.uid()) then raise exception 'FORBIDDEN';end if;
    if parsed_role='consumer' and not exists(select 1 from public.user_roles where user_id=auth.uid() and role='consumer') then raise exception 'FORBIDDEN';end if;
  elsif not exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id join public.organization_contexts c on c.organization_id=m.organization_id and c.role=r.context_role and c.active where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active' and r.context_role=parsed_role) then raise exception 'CONTEXT_NOT_ASSIGNED';end if;
  insert into public.user_active_contexts(user_id,organization_id,role,updated_at) values(auth.uid(),target_organization,parsed_role,now()) on conflict(user_id) do update set organization_id=excluded.organization_id,role=excluded.role,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'context.changed','organization',target_organization,jsonb_build_object('role',parsed_role));return public.get_my_access_context();
end;$$;

create or replace function public.current_user_has_any_role(required_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.platform_members where user_id=auth.uid() and role::text=any(required_roles))
  or (public.is_nocta_admin(auth.uid()) and required_roles&&array['nocta_admin','platform_owner','platform_support'])
  or (exists(select 1 from public.user_roles where user_id=auth.uid() and role='consumer') and required_roles&&array['consumer','customer'])
  or exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id join public.organization_contexts c on c.organization_id=m.organization_id and c.role=r.context_role and c.active where m.user_id=auth.uid() and m.status='active' and (
    (r.context_role='promoter' and required_roles&&array['promoter','organizer']) or
    (r.context_role='brand_distributor' and required_roles&&array['brand_distributor']) or
    (r.context_role='establishment' and ((r.role in('owner','admin','establishment_admin') and required_roles&&array['establishment','venue_owner','venue_admin','establishment_admin']) or (r.role='bar' and required_roles&&array['bartender','bar']) or (r.role='waiter' and required_roles&&array['waiter']) or (r.role='cashier' and required_roles&&array['cashier'])))
  ))
  or exists(select 1 from public.venue_members where user_id=auth.uid() and role::text=any(required_roles))
  or exists(select 1 from public.event_members where user_id=auth.uid() and role::text=any(required_roles));
$$;

create or replace function public.phase1_access_integrity_report()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not public.is_nocta_admin(auth.uid()) then raise exception 'FORBIDDEN';end if;return jsonb_build_object(
  'profiles_without_consumer',(select count(*) from public.profiles p where not exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role='consumer')),
  'memberships_without_context_role',(select count(*) from public.organization_memberships m where m.status='active' and not exists(select 1 from public.organization_roles r where r.membership_id=m.id)),
  'roles_without_enabled_context',(select count(*) from public.organization_roles r join public.organization_memberships m on m.id=r.membership_id where not exists(select 1 from public.organization_contexts c where c.organization_id=m.organization_id and c.role=r.context_role and c.active)),
  'invalid_active_contexts',(select count(*) from public.user_active_contexts ac where ac.role in('establishment','promoter','brand_distributor') and not exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id join public.organization_contexts c on c.organization_id=m.organization_id and c.role=r.context_role and c.active where m.user_id=ac.user_id and m.organization_id=ac.organization_id and m.status='active' and r.context_role=ac.role)),
  'brand_organizations_without_business_type',(select count(*) from public.organization_contexts c join public.organizations o on o.id=c.organization_id where c.role='brand_distributor' and c.active and o.business_type is null),'checked_at',now());end;$$;
revoke all on function public.get_my_access_context(),public.set_active_context(uuid,text),public.current_user_has_any_role(text[]),public.phase1_access_integrity_report() from public,anon;
grant execute on function public.get_my_access_context(),public.set_active_context(uuid,text),public.current_user_has_any_role(text[]),public.phase1_access_integrity_report() to authenticated;
notify pgrst,'reload schema';
