create or replace function public.admin_create_nocta_organization(organization_name text,initial_context text,organization_business_type text default null,owner_user uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare parsed_context public.nocta_principal_role;parsed_business public.organization_business_type;target_owner uuid:=coalesce(owner_user,auth.uid());org_id uuid;membership_id uuid;base_slug text;
begin
  if not public.is_nocta_admin(auth.uid()) then raise exception 'FORBIDDEN';end if;
  if nullif(btrim(organization_name),'') is null then raise exception 'ORGANIZATION_NAME_REQUIRED';end if;
  if not exists(select 1 from public.profiles where id=target_owner and status='active') then raise exception 'OWNER_NOT_AVAILABLE';end if;
  parsed_context:=initial_context::public.nocta_principal_role;
  if parsed_context not in('establishment','promoter','brand_distributor') then raise exception 'INVALID_CONTEXT';end if;
  if parsed_context='brand_distributor' then if organization_business_type is null then raise exception 'BUSINESS_TYPE_REQUIRED';end if;parsed_business:=organization_business_type::public.organization_business_type;
  elsif organization_business_type is not null then parsed_business:=organization_business_type::public.organization_business_type;end if;
  base_slug:=regexp_replace(lower(translate(btrim(organization_name),'áéíóúñüÁÉÍÓÚÑÜ','aeiounuAEIOUNU')),'[^a-z0-9]+','-','g');base_slug:=trim(both '-' from base_slug)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
  insert into public.organizations(name,slug,business_type,created_by)values(btrim(organization_name),base_slug,parsed_business,auth.uid())returning id into org_id;
  insert into public.organization_contexts(organization_id,role)values(org_id,parsed_context);insert into public.organization_memberships(user_id,organization_id)values(target_owner,org_id)returning id into membership_id;
  insert into public.organization_roles(membership_id,context_role,role)values(membership_id,parsed_context,'owner');insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'organization.admin_created','organization',org_id,jsonb_build_object('context',parsed_context,'business_type',parsed_business,'owner_user',target_owner));return org_id;
end;$$;
create or replace function public.update_brand_organization_settings(target_organization uuid,organization_business_type text) returns void
language plpgsql security definer set search_path='' as $$declare parsed_business public.organization_business_type;begin
  if not public.can_manage_brand_organization(target_organization)then raise exception 'FORBIDDEN';end if;if not exists(select 1 from public.organization_contexts where organization_id=target_organization and role='brand_distributor' and active)then raise exception 'BRAND_CONTEXT_REQUIRED';end if;
  parsed_business:=organization_business_type::public.organization_business_type;update public.organizations set business_type=parsed_business,updated_at=now()where id=target_organization;if not found then raise exception 'ORGANIZATION_NOT_FOUND';end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'brand.organization_settings_updated','organization',target_organization,jsonb_build_object('business_type',parsed_business));
end;$$;
create or replace function public.admin_add_organization_context(target_organization uuid,new_context text,organization_business_type text default null)returns void
language plpgsql security definer set search_path='' as $$declare parsed_context public.nocta_principal_role;begin
  if not public.is_nocta_admin(auth.uid())then raise exception 'FORBIDDEN';end if;parsed_context:=new_context::public.nocta_principal_role;if parsed_context not in('establishment','promoter','brand_distributor')then raise exception 'INVALID_CONTEXT';end if;
  if parsed_context='brand_distributor' then update public.organizations set business_type=coalesce(organization_business_type,'mixed')::public.organization_business_type,updated_at=now()where id=target_organization;end if;
  insert into public.organization_contexts(organization_id,role)values(target_organization,parsed_context)on conflict(organization_id,role)do update set active=true;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(auth.uid(),'organization.admin_context_added','organization',target_organization,jsonb_build_object('context',parsed_context,'business_type',organization_business_type));
end;$$;
revoke all on function public.admin_create_nocta_organization(text,text,text,uuid),public.update_brand_organization_settings(uuid,text),public.admin_add_organization_context(uuid,text,text)from public,anon;
grant execute on function public.admin_create_nocta_organization(text,text,text,uuid),public.update_brand_organization_settings(uuid,text),public.admin_add_organization_context(uuid,text,text)to authenticated;
notify pgrst,'reload schema';
