-- Completa el ciclo de gobierno de acceso de Fase 1: consultar y retirar roles canónicos.

-- La versión anterior habilitaba el contexto empresarial, pero no asignaba al solicitante
-- ningún rol dentro de él; por eso el selector de contexto nunca llegaba a mostrarlo.
create or replace function public.add_organization_context(target_organization uuid,new_context text)
returns void language plpgsql security definer set search_path='' as $add_context$
declare
  parsed_context public.nocta_principal_role;
  actor_membership uuid;
  actor_role public.organization_member_role;
begin
  parsed_context:=new_context::public.nocta_principal_role;
  if parsed_context not in('establishment','promoter','brand_distributor') then raise exception 'INVALID_CONTEXT'; end if;
  select m.id,case when exists(select 1 from public.organization_roles r where r.membership_id=m.id and r.role='owner') then 'owner'::public.organization_member_role else 'admin'::public.organization_member_role end
  into actor_membership,actor_role from public.organization_memberships m
  where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active';
  if not public.is_nocta_admin(auth.uid()) and (actor_membership is null or not exists(select 1 from public.organization_roles r where r.membership_id=actor_membership and r.role in('owner','admin'))) then raise exception 'FORBIDDEN'; end if;
  if parsed_context='brand_distributor' and not exists(select 1 from public.organizations where id=target_organization and business_type is not null) then raise exception 'BUSINESS_TYPE_REQUIRED'; end if;
  insert into public.organization_contexts(organization_id,role) values(target_organization,parsed_context)
  on conflict(organization_id,role) do update set active=true;
  if actor_membership is not null then
    insert into public.organization_roles(membership_id,context_role,role) values(actor_membership,parsed_context,actor_role) on conflict do nothing;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'organization.context_added','organization',target_organization,jsonb_build_object('context',parsed_context,'assigned_role',actor_role));
end;$add_context$;

-- Repara contextos históricos que fueron creados sin dejar a ningún miembro con acceso.
insert into public.organization_roles(membership_id,context_role,role)
select owner_membership.id,c.role,'owner'::public.organization_member_role
from public.organization_contexts c
join lateral(
  select m.id from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id
  where m.organization_id=c.organization_id and m.status='active' and r.role='owner' order by m.joined_at limit 1
)owner_membership on true
where c.active and not exists(
  select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id
  where m.organization_id=c.organization_id and m.status='active' and r.context_role=c.role
) on conflict do nothing;

create or replace function public.admin_organization_access_directory()
returns jsonb language plpgsql stable security definer set search_path='' as $access_directory$
begin
  if not public.is_nocta_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'name',o.name,'businessType',o.business_type,
        'contexts',coalesce((select jsonb_agg(c.role::text order by c.role::text) from public.organization_contexts c where c.organization_id=o.id and c.active),'[]'::jsonb),
        'venues',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name) order by v.name) from public.venues v where v.organization_id=o.id),'[]'::jsonb)
      ) order by o.name) from public.organizations o
    ),'[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'userId',m.user_id,'organizationId',m.organization_id,'organizationName',o.name,
        'context',r.context_role::text,'role',r.role::text,'venueId',r.scope_venue_id,'venueName',v.name
      ) order by o.name,r.context_role,r.role)
      from public.organization_roles r
      join public.organization_memberships m on m.id=r.membership_id
      join public.organizations o on o.id=m.organization_id
      left join public.venues v on v.id=r.scope_venue_id
      where m.status<>'suspended'
    ),'[]'::jsonb)
  );
end;$access_directory$;

create or replace function public.remove_organization_member_access(
  target_organization uuid,target_user uuid,target_context text,target_role text,target_venue uuid default null
) returns void language plpgsql security definer set search_path='' as $remove_access$
declare
  parsed_context public.nocta_principal_role;
  parsed_role public.organization_member_role;
  target_membership uuid;
begin
  parsed_context:=target_context::public.nocta_principal_role;
  parsed_role:=target_role::public.organization_member_role;
  if not public.is_nocta_admin(auth.uid()) and not exists(
    select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id
    where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active' and r.role in('owner','admin')
  ) then raise exception 'FORBIDDEN'; end if;
  select id into target_membership from public.organization_memberships
  where user_id=target_user and organization_id=target_organization;
  if target_membership is null then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
  if parsed_role='owner' and not exists(
    select 1 from public.organization_roles r join public.organization_memberships m on m.id=r.membership_id
    where m.organization_id=target_organization and m.status='active' and r.role='owner'
      and (r.membership_id<>target_membership or r.context_role<>parsed_context or r.scope_venue_id is distinct from target_venue)
  ) then raise exception 'LAST_OWNER_REQUIRED'; end if;
  delete from public.organization_roles
  where membership_id=target_membership and context_role=parsed_context and role=parsed_role
    and scope_venue_id is not distinct from target_venue;
  if not found then raise exception 'ACCESS_NOT_FOUND'; end if;
  if not exists(select 1 from public.organization_roles where membership_id=target_membership) then
    update public.organization_memberships set status='suspended',updated_at=now() where id=target_membership;
  end if;
  if exists(select 1 from public.user_active_contexts where user_id=target_user and organization_id=target_organization and role=parsed_context)
    and not exists(select 1 from public.organization_roles where membership_id=target_membership and context_role=parsed_context) then
    update public.user_active_contexts set organization_id=null,role='consumer',updated_at=now() where user_id=target_user;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'organization.member_access_removed','organization',target_organization,
    jsonb_build_object('target_user',target_user,'context',parsed_context,'role',parsed_role,'venue_id',target_venue));
end;$remove_access$;

revoke all on function public.admin_organization_access_directory(),public.remove_organization_member_access(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.admin_organization_access_directory(),public.remove_organization_member_access(uuid,uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
