-- Evita confirmar retiros de acceso que no modificaron ningún registro.
create or replace function public.remove_user_access(target_user_id uuid,target_role text,scope_type text,scope_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare affected integer := 0;
begin
  if not public.is_platform_owner()then raise exception 'Acceso denegado';end if;
  if target_user_id=auth.uid()and target_role='platform_owner'then raise exception 'No puedes retirar tu propio rol propietario';end if;
  if scope_type='platform'then
    delete from public.platform_members where user_id=target_user_id and role::text=target_role;
    get diagnostics affected = row_count;
  elsif scope_type='promoter'then
    delete from public.promoter_profiles where user_id=target_user_id;
    get diagnostics affected = row_count;
  elsif scope_type='organization'then
    delete from public.organization_members where user_id=target_user_id and organization_id=scope_id and role::text=target_role;
    get diagnostics affected = row_count;
  elsif scope_type='venue'then
    delete from public.venue_members where user_id=target_user_id and venue_id=scope_id and role::text=target_role;
    get diagnostics affected = row_count;
  elsif scope_type='event'then
    delete from public.event_members where user_id=target_user_id and event_id=scope_id and role::text=target_role;
    get diagnostics affected = row_count;
  elsif scope_type='customer'and target_role='customer'then
    delete from public.user_roles where user_id=target_user_id and role='consumer';
    get diagnostics affected = row_count;
    if affected > 0 then
      delete from public.user_active_contexts where user_id=target_user_id and role='consumer';
    end if;
  else raise exception 'Alcance inválido';end if;
  if affected=0 then raise exception 'ACCESS_NOT_FOUND';end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'access.removed','profile',target_user_id,jsonb_build_object('role',target_role,'scope_type',scope_type,'scope_id',scope_id));
end;$$;

revoke all on function public.remove_user_access(uuid,text,text,uuid) from public,anon;
grant execute on function public.remove_user_access(uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
