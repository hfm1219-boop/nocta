-- Permite que propietarios y administradores gestionen equipos en cualquier contexto empresarial.
create or replace function public.set_organization_member_access_by_email(
  target_organization uuid,target_email text,target_context text,target_role text,target_venue uuid default null
) returns uuid language plpgsql security definer set search_path='' as $set_member_email$
declare target_user uuid;is_manager boolean;
begin
  select public.is_nocta_admin(auth.uid()) or exists(
    select 1 from public.organization_memberships m
    join public.organization_roles r on r.membership_id=m.id
    where m.user_id=auth.uid() and m.organization_id=target_organization
      and m.status='active' and r.role in('owner','admin')
  ) into is_manager;
  if target_context='establishment' then
    if not public.can_manage_organization_team(target_organization,target_venue) then raise exception 'FORBIDDEN';end if;
  elsif not is_manager then raise exception 'FORBIDDEN';end if;
  select id into target_user from auth.users where lower(email)=lower(btrim(target_email)) and deleted_at is null;
  if target_user is null then raise exception 'No existe una cuenta NOCTA activa con ese correo';end if;
  return public.set_organization_member_access(target_organization,target_user,target_context,target_role,target_venue);
end;$set_member_email$;

revoke all on function public.set_organization_member_access_by_email(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.set_organization_member_access_by_email(uuid,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
