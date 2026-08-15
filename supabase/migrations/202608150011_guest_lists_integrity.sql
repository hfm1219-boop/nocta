alter table public.guest_lists add column if not exists promoter_name text not null default '';
alter table public.guest_lists add column if not exists conditions text not null default '';
alter table public.guest_list_entries add column if not exists email text;
alter table public.guest_list_entries add column if not exists access_token text;
alter table public.guest_list_entries add column if not exists access_token_hash text;
alter table public.guest_list_entries add column if not exists checked_in_count integer not null default 0 check(checked_in_count>=0);
alter table public.guest_list_entries add column if not exists status text not null default 'confirmed' check(status in('confirmed','cancelled','checked_in'));
create unique index if not exists guest_entries_access_token_key on public.guest_list_entries(access_token) where access_token is not null;
create unique index if not exists guest_entries_access_hash_key on public.guest_list_entries(access_token_hash) where access_token_hash is not null;

drop policy if exists "promoter manages guest entries" on public.guest_list_entries;
create policy "promoter manages guest entries" on public.guest_list_entries for all
using(exists(select 1 from public.guest_lists gl where gl.id=guest_list_id and (gl.owner_promoter_id=auth.uid() or public.can_manage_event(gl.event_id))))
with check(exists(select 1 from public.guest_lists gl where gl.id=guest_list_id and (gl.owner_promoter_id=auth.uid() or public.can_manage_event(gl.event_id))));

create or replace function public.add_guest_entry(target_list uuid,guest_name text,guest_phone text,guest_email text,guest_companions integer)
returns table(id uuid,token text) language plpgsql security definer set search_path='' as $$
declare selected_list public.guest_lists%rowtype;occupied integer;raw_token text;new_id uuid;
begin
  select * into selected_list from public.guest_lists where public.guest_lists.id=target_list for update;
  if not found or not selected_list.active then raise exception 'Lista no disponible';end if;
  if not (selected_list.owner_promoter_id=auth.uid() or public.can_manage_event(selected_list.event_id)) then raise exception 'Acceso denegado';end if;
  if nullif(trim(guest_name),'') is null or guest_companions<0 or guest_companions>5 then raise exception 'Invitado inválido';end if;
  select coalesce(sum(1+companions),0) into occupied from public.guest_list_entries where guest_list_id=target_list and status<>'cancelled';
  if occupied+1+guest_companions>selected_list.capacity then raise exception 'La lista no tiene cupo suficiente';end if;
  if exists(select 1 from public.guest_list_entries where guest_list_id=target_list and status<>'cancelled' and ((nullif(trim(guest_phone),'') is not null and phone=trim(guest_phone)) or (nullif(trim(guest_email),'') is not null and email=trim(guest_email)))) then raise exception 'El invitado ya está registrado';end if;
  raw_token:=upper('LST-'||replace(gen_random_uuid()::text,'-',''));
  insert into public.guest_list_entries(guest_list_id,guest_name,phone,email,companions,access_token,access_token_hash,status)
  values(target_list,trim(guest_name),nullif(trim(guest_phone),''),nullif(trim(guest_email),''),guest_companions,raw_token,encode(digest(raw_token,'sha256'),'hex'),'confirmed') returning public.guest_list_entries.id into new_id;
  id:=new_id;token:=raw_token;return next;
end;$$;
revoke all on function public.add_guest_entry(uuid,text,text,text,integer) from public,anon;
grant execute on function public.add_guest_entry(uuid,text,text,text,integer) to authenticated;

create or replace function public.validate_guest_entry(entry_token text)
returns table(result text,guest_name text,companions integer,entered integer,event_key text,list_name text)
language plpgsql security definer set search_path='' as $$
declare selected_entry public.guest_list_entries%rowtype;selected_list public.guest_lists%rowtype;selected_venue uuid;available integer;
begin
  if auth.uid() is null then raise exception 'No autenticado';end if;
  select * into selected_entry from public.guest_list_entries where access_token_hash=encode(digest(upper(trim(entry_token)),'sha256'),'hex') for update;
  if not found or selected_entry.status='cancelled' then result:='invalid';return next;return;end if;
  select * into selected_list from public.guest_lists where id=selected_entry.guest_list_id;
  select venue_id into selected_venue from public.event_venue_collaborations where event_id=selected_list.event_id and status='approved' limit 1;
  if not public.can_validate_access(selected_list.event_id,selected_venue) then raise exception 'Acceso denegado';end if;
  select external_key into event_key from public.events where id=selected_list.event_id;list_name:=selected_list.name;guest_name:=selected_entry.guest_name;companions:=selected_entry.companions;
  available:=1+selected_entry.companions-selected_entry.checked_in_count;if available<=0 then result:='used';entered:=0;return next;return;end if;
  update public.guest_list_entries set checked_in_count=1+companions,checked_in_at=now(),checked_in_by=auth.uid(),status='checked_in' where id=selected_entry.id;
  result:='accepted';entered:=available;return next;
end;$$;
revoke all on function public.validate_guest_entry(text) from public,anon;
grant execute on function public.validate_guest_entry(text) to authenticated;
notify pgrst,'reload schema';
