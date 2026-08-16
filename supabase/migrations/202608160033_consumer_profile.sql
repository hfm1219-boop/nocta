create or replace function public.update_own_consumer_profile(new_full_name text,new_phone text default null)
returns public.profiles language plpgsql security definer set search_path='' as $$
declare updated public.profiles;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED';end if;
  if length(trim(coalesce(new_full_name,'')))<2 or length(trim(new_full_name))>100 then raise exception 'INVALID_NAME';end if;
  if length(coalesce(new_phone,''))>30 then raise exception 'INVALID_PHONE';end if;
  update public.profiles set full_name=trim(new_full_name),phone=nullif(trim(coalesce(new_phone,'')),''),updated_at=now() where id=auth.uid() returning * into updated;
  if updated.id is null then raise exception 'PROFILE_NOT_FOUND';end if;
  return updated;
end;$$;
revoke all on function public.update_own_consumer_profile(text,text) from public;
grant execute on function public.update_own_consumer_profile(text,text) to authenticated;
notify pgrst,'reload schema';
