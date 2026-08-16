-- Sincroniza el rol legado "customer" del panel con el rol principal "consumer".
create or replace function public.admin_access_directory()
returns table(user_id uuid,email text,full_name text,status text,roles jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_platform_owner() then raise exception 'Acceso denegado';end if;
  return query select u.id,u.email::text,p.full_name,p.status::text,coalesce((
    select jsonb_agg(x order by x->>'role') from(
      select jsonb_build_object('role',pm.role::text,'scope_type','platform','scope_id',null,'scope_name','NOCTA')x from public.platform_members pm where pm.user_id=u.id
      union all select jsonb_build_object('role','customer','scope_type','customer','scope_id',null,'scope_name','NOCTA Consumer') from public.user_roles ur where ur.user_id=u.id and ur.role='consumer'
      union all select jsonb_build_object('role','promoter','scope_type','promoter','scope_id',null,'scope_name',pp.public_name) from public.promoter_profiles pp where pp.user_id=u.id
      union all select jsonb_build_object('role',om.role::text,'scope_type','organization','scope_id',om.organization_id,'scope_name',o.name) from public.organization_members om join public.organizations o on o.id=om.organization_id where om.user_id=u.id
      union all select jsonb_build_object('role',vm.role::text,'scope_type','venue','scope_id',vm.venue_id,'scope_name',v.name) from public.venue_members vm join public.venues v on v.id=vm.venue_id where vm.user_id=u.id
      union all select jsonb_build_object('role',em.role::text,'scope_type','event','scope_id',em.event_id,'scope_name',e.name) from public.event_members em join public.events e on e.id=em.event_id where em.user_id=u.id
    )access_rows
  ),'[]'::jsonb) from auth.users u join public.profiles p on p.id=u.id order by u.created_at desc;
end;$$;

create or replace function public.set_user_access(target_user_id uuid,target_role text,scope_type text,scope_id uuid default null,display_name text default null)
returns void language plpgsql security definer set search_path='' as $$
declare parsed_role public.app_role;
begin
  if not public.is_platform_owner() then raise exception 'Acceso denegado';end if;
  if not exists(select 1 from public.profiles where id=target_user_id)then raise exception 'USER_NOT_FOUND';end if;
  parsed_role:=target_role::public.app_role;
  if scope_type='platform' then
    if parsed_role not in('platform_owner','platform_support')then raise exception 'Rol de plataforma inválido';end if;
    insert into public.platform_members(user_id,role)values(target_user_id,parsed_role)on conflict do nothing;
  elsif scope_type='promoter' then
    if parsed_role<>'promoter'then raise exception 'Rol promotor inválido';end if;
    insert into public.promoter_profiles(user_id,public_name)values(target_user_id,coalesce(nullif(display_name,''),(select full_name from public.profiles where id=target_user_id),'Promotor NOCTA'))on conflict(user_id)do update set public_name=excluded.public_name;
  elsif scope_type='organization' then insert into public.organization_members(organization_id,user_id,role)values(scope_id,target_user_id,parsed_role)on conflict do nothing;
  elsif scope_type='venue' then insert into public.venue_members(venue_id,user_id,role)values(scope_id,target_user_id,parsed_role)on conflict do nothing;
  elsif scope_type='event' then insert into public.event_members(event_id,user_id,role)values(scope_id,target_user_id,parsed_role)on conflict do nothing;
  elsif scope_type='customer' and parsed_role='customer' then
    insert into public.user_roles(user_id,role)values(target_user_id,'consumer')on conflict do nothing;
    insert into public.user_active_contexts(user_id,organization_id,role)values(target_user_id,null,'consumer')
      on conflict(user_id)do update set organization_id=null,role='consumer',updated_at=now();
  else raise exception 'Alcance inválido';end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'access.assigned','profile',target_user_id,jsonb_build_object('role',target_role,'scope_type',scope_type,'scope_id',scope_id));
end;$$;

create or replace function public.remove_user_access(target_user_id uuid,target_role text,scope_type text,scope_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_platform_owner()then raise exception 'Acceso denegado';end if;
  if target_user_id=auth.uid()and target_role='platform_owner'then raise exception 'No puedes retirar tu propio rol propietario';end if;
  if scope_type='platform'then delete from public.platform_members where user_id=target_user_id and role::text=target_role;
  elsif scope_type='promoter'then delete from public.promoter_profiles where user_id=target_user_id;
  elsif scope_type='organization'then delete from public.organization_members where user_id=target_user_id and organization_id=scope_id and role::text=target_role;
  elsif scope_type='venue'then delete from public.venue_members where user_id=target_user_id and venue_id=scope_id and role::text=target_role;
  elsif scope_type='event'then delete from public.event_members where user_id=target_user_id and event_id=scope_id and role::text=target_role;
  elsif scope_type='customer'and target_role='customer'then
    delete from public.user_roles where user_id=target_user_id and role='consumer';
    delete from public.user_active_contexts where user_id=target_user_id and role='consumer';
  else raise exception 'Alcance inválido';end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'access.removed','profile',target_user_id,jsonb_build_object('role',target_role,'scope_type',scope_type,'scope_id',scope_id));
end;$$;

revoke all on function public.admin_access_directory(),public.set_user_access(uuid,text,text,uuid,text),public.remove_user_access(uuid,text,text,uuid) from public,anon;
grant execute on function public.admin_access_directory(),public.set_user_access(uuid,text,text,uuid,text),public.remove_user_access(uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
