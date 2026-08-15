create index if not exists idx_venue_members_user on public.venue_members(user_id,venue_id);
create index if not exists idx_event_members_user on public.event_members(user_id,event_id);
create index if not exists idx_events_start on public.events(starts_at,status);
create index if not exists idx_tickets_event_status on public.tickets(event_id,status);
create index if not exists idx_reservations_venue_date on public.reservations(venue_id,reserved_for,status);
create index if not exists idx_orders_venue_created on public.orders(venue_id,created_at desc);
create index if not exists idx_conecta_participants_module on public.conecta_participants(conecta_id,checked_in_at);
create index if not exists idx_audit_entity on public.audit_logs(entity_type,entity_id,created_at desc);

create or replace function public.audit_domain_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; entity uuid; action_name text;
begin
  actor:=coalesce(auth.uid(),case when tg_op='DELETE' then old.updated_by else new.updated_by end);
  entity:=case when tg_op='DELETE' then old.venue_id else new.venue_id end;
  action_name:=lower(tg_table_name)||'.'||lower(tg_op);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(actor,action_name,tg_table_name,entity,jsonb_build_object('operation',tg_op));
  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists audit_venue_runtime_states on public.venue_runtime_states;
create trigger audit_venue_runtime_states after insert or update or delete on public.venue_runtime_states for each row execute function public.audit_domain_change();

create or replace function public.audit_transaction_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare entity uuid; actor uuid; old_state text; new_state text;
begin
  entity:=new.id; actor:=auth.uid();
  old_state:=case when tg_op='INSERT' then null else old.status::text end; new_state:=new.status::text;
  if tg_op='INSERT' or old_state is distinct from new_state then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(actor,lower(tg_table_name)||'.status',tg_table_name,entity,jsonb_build_object('from',old_state,'to',new_state));
  end if;
  return new;
end; $$;
drop trigger if exists audit_tickets on public.tickets;
drop trigger if exists audit_reservations on public.reservations;
drop trigger if exists audit_orders on public.orders;
create trigger audit_tickets after insert or update on public.tickets for each row execute function public.audit_transaction_change();
create trigger audit_reservations after insert or update on public.reservations for each row execute function public.audit_transaction_change();
create trigger audit_orders after insert or update on public.orders for each row execute function public.audit_transaction_change();

create or replace function public.nocta_integrity_report()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_platform_owner() then raise exception 'Acceso denegado'; end if;
  select jsonb_build_object(
    'checked_at',now(),
    'tables_without_rls',(select coalesce(jsonb_agg(tablename),'[]'::jsonb) from pg_catalog.pg_tables where schemaname='public' and not rowsecurity),
    'orphan_events',(select count(*) from public.events e left join public.profiles p on p.id=e.owner_user_id where p.id is null),
    'orphan_conecta',(select count(*) from public.conecta_modules c left join public.promoter_profiles p on p.user_id=c.owner_promoter_id where p.user_id is null),
    'oversold_ticket_types',(select count(*) from public.ticket_types tt where (select count(*) from public.tickets t where t.ticket_type_id=tt.id and t.status in('reserved','paid','used'))>tt.capacity),
    'invalid_reservations',(select count(*) from public.reservations where party_size<=0),
    'platform_owners',(select count(*) from public.platform_members where role='platform_owner'),
    'audit_entries',(select count(*) from public.audit_logs)
  ) into result;
  return result;
end; $$;
grant execute on function public.nocta_integrity_report() to authenticated;

