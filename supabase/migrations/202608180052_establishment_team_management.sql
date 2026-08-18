-- Equipo de establecimientos: autorización coherente, búsqueda por correo y alcance por sede.
create or replace function public.current_user_can(required_capability text,target_organization uuid default null)
returns boolean language sql stable security definer set search_path='' as $current_user_capability$
  with active as(
    select ac.organization_id,ac.role::text role from public.user_active_contexts ac
    where ac.user_id=auth.uid()and(target_organization is null or ac.organization_id=target_organization)
  ),effective_roles as(
    select role from active where role in('consumer','nocta_admin')
    union
    select r.role::text from active a join public.organization_memberships m on m.user_id=auth.uid()and m.organization_id=a.organization_id and m.status='active'
      join public.organization_roles r on r.membership_id=m.id and r.context_role::text=a.role
  )
  select public.is_nocta_admin(auth.uid())or exists(select 1 from effective_roles er join public.role_capabilities rc on rc.role=er.role where rc.capability in(required_capability,'*'));
$current_user_capability$;

create or replace function public.can_manage_organization_team(target_organization uuid,target_venue uuid default null)
returns boolean language sql stable security definer set search_path='' as $can_manage_team$
  select public.is_nocta_admin(auth.uid()) or exists(
    select 1 from public.organization_memberships m
    join public.organization_roles r on r.membership_id=m.id
    where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active'
      and r.context_role='establishment'
      and (
        r.role in('owner','admin')
        or (r.role='establishment_admin' and (r.scope_venue_id is null or r.scope_venue_id=target_venue))
      )
  );
$can_manage_team$;

create or replace function public.set_organization_member_access(
  target_organization uuid,target_user uuid,target_context text,target_role text,target_venue uuid default null
) returns uuid language plpgsql security definer set search_path='' as $set_member_access$
declare parsed_context public.nocta_principal_role;parsed_role public.organization_member_role;membership_id uuid;is_org_manager boolean;
begin
  parsed_context:=target_context::public.nocta_principal_role;parsed_role:=target_role::public.organization_member_role;
  select public.is_nocta_admin(auth.uid()) or exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active' and r.role in('owner','admin')) into is_org_manager;
  if parsed_context='establishment' then
    if not public.can_manage_organization_team(target_organization,target_venue) then raise exception 'FORBIDDEN';end if;
    if not is_org_manager and parsed_role not in('establishment_admin','bar','waiter','cashier') then raise exception 'FORBIDDEN_ROLE_ASSIGNMENT';end if;
  elsif not is_org_manager then raise exception 'FORBIDDEN';end if;
  if not exists(select 1 from public.profiles where id=target_user and status='active') then raise exception 'USER_NOT_FOUND_OR_INACTIVE';end if;
  if not exists(select 1 from public.organization_contexts where organization_id=target_organization and role=parsed_context and active) then raise exception 'CONTEXT_NOT_AVAILABLE';end if;
  if parsed_role in('establishment_admin','bar','waiter','cashier') and parsed_context<>'establishment' then raise exception 'ROLE_CONTEXT_MISMATCH';end if;
  if target_venue is not null and not exists(select 1 from public.venues where id=target_venue and organization_id=target_organization) then raise exception 'VENUE_SCOPE_MISMATCH';end if;
  insert into public.organization_memberships(user_id,organization_id,status)values(target_user,target_organization,'active')on conflict(user_id,organization_id)do update set status='active',updated_at=now()returning id into membership_id;
  insert into public.organization_roles(membership_id,context_role,role,scope_venue_id)values(membership_id,parsed_context,parsed_role,target_venue)on conflict do nothing;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'organization.member_access_set','organization',target_organization,jsonb_build_object('target_user',target_user,'context',parsed_context,'role',parsed_role,'venue_id',target_venue));
  return membership_id;
end;$set_member_access$;

create or replace function public.set_organization_member_access_by_email(
  target_organization uuid,target_email text,target_context text,target_role text,target_venue uuid default null
) returns uuid language plpgsql security definer set search_path='' as $set_member_email$
declare target_user uuid;
begin
  if not public.can_manage_organization_team(target_organization,target_venue) then raise exception 'FORBIDDEN';end if;
  select id into target_user from auth.users where lower(email)=lower(btrim(target_email)) and deleted_at is null;
  if target_user is null then raise exception 'No existe una cuenta NOCTA activa con ese correo';end if;
  return public.set_organization_member_access(target_organization,target_user,target_context,target_role,target_venue);
end;$set_member_email$;

create or replace function public.remove_organization_member_access(
  target_organization uuid,target_user uuid,target_context text,target_role text,target_venue uuid default null
) returns void language plpgsql security definer set search_path='' as $remove_access$
declare parsed_context public.nocta_principal_role;parsed_role public.organization_member_role;target_membership uuid;is_org_manager boolean;
begin
  parsed_context:=target_context::public.nocta_principal_role;parsed_role:=target_role::public.organization_member_role;
  select public.is_nocta_admin(auth.uid()) or exists(select 1 from public.organization_memberships m join public.organization_roles r on r.membership_id=m.id where m.user_id=auth.uid() and m.organization_id=target_organization and m.status='active' and r.role in('owner','admin')) into is_org_manager;
  if parsed_context='establishment' then
    if not public.can_manage_organization_team(target_organization,target_venue) then raise exception 'FORBIDDEN';end if;
    if not is_org_manager and parsed_role not in('establishment_admin','bar','waiter','cashier') then raise exception 'FORBIDDEN_ROLE_REMOVAL';end if;
  elsif not is_org_manager then raise exception 'FORBIDDEN';end if;
  select id into target_membership from public.organization_memberships where user_id=target_user and organization_id=target_organization;
  if target_membership is null then raise exception 'MEMBERSHIP_NOT_FOUND';end if;
  if parsed_role='owner' and not exists(select 1 from public.organization_roles r join public.organization_memberships m on m.id=r.membership_id where m.organization_id=target_organization and m.status='active' and r.role='owner' and(r.membership_id<>target_membership or r.context_role<>parsed_context or r.scope_venue_id is distinct from target_venue))then raise exception 'LAST_OWNER_REQUIRED';end if;
  delete from public.organization_roles where membership_id=target_membership and context_role=parsed_context and role=parsed_role and scope_venue_id is not distinct from target_venue;
  if not found then raise exception 'ACCESS_NOT_FOUND';end if;
  if not exists(select 1 from public.organization_roles where membership_id=target_membership)then update public.organization_memberships set status='suspended',updated_at=now()where id=target_membership;end if;
  if exists(select 1 from public.user_active_contexts where user_id=target_user and organization_id=target_organization and role=parsed_context)and not exists(select 1 from public.organization_roles where membership_id=target_membership and context_role=parsed_context)then update public.user_active_contexts set organization_id=null,role='consumer',updated_at=now()where user_id=target_user;end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'organization.member_access_removed','organization',target_organization,jsonb_build_object('target_user',target_user,'context',parsed_context,'role',parsed_role,'venue_id',target_venue));
end;$remove_access$;

revoke all on function public.can_manage_organization_team(uuid,uuid),public.set_organization_member_access_by_email(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.can_manage_organization_team(uuid,uuid),public.set_organization_member_access_by_email(uuid,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
