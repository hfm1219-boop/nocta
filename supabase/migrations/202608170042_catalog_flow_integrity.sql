-- Cierra la demo productiva: catálogo público vigente, transacciones con fecha y
-- promociones ejercitables sobre productos reales del menú.

update public.events
set status='closed'
where status='published' and coalesce(ends_at,starts_at)<now();

drop policy if exists "public approved event venues" on public.event_venue_collaborations;
create policy "public approved event venues" on public.event_venue_collaborations
for select to anon,authenticated using(
  status='approved' and exists(
    select 1 from public.events e
    where e.id=event_id and e.status='published' and coalesce(e.ends_at,e.starts_at)>now()
  )
);
grant select on public.event_venue_collaborations to anon,authenticated;

insert into public.venue_menu_categories(venue_id,name,sort_order,active)
select id,'Bebidas',1,true from public.venues where active
on conflict(venue_id,name) do update set active=true;

insert into public.venue_menu_items(venue_id,category_id,name,description,sku,price_cop,available)
select v.id,c.id,x.name,x.description,x.sku,x.price_cop,true
from public.venues v
join public.venue_menu_categories c on c.venue_id=v.id and c.name='Bebidas'
cross join lateral(values
  ('Cerveza nacional','Cerveza nacional fría','BEER-NAT',15000),
  ('Cóctel de autor','Cóctel insignia de la casa','COCKTAIL-HOUSE',38000)
)x(name,description,sku,price_cop)
where v.active
on conflict(venue_id,name) do update set description=excluded.description,sku=excluded.sku,price_cop=excluded.price_cop,available=true;

insert into public.promotion_rules(
  promotion_id,mechanic,buy_quantity,get_quantity,minimum_quantity,
  per_user_limit,total_redemption_limit,priority,stackable,active
)
select p.id,'buy_x_get_y',1,1,2,1,300,100,false,true
from public.promotions p
where p.active and p.title in('2x1 en cócteles de autor','2x1 Cerveza nacional')
on conflict(promotion_id) do update set
  mechanic='buy_x_get_y',percentage_off=null,fixed_amount_cop=null,
  buy_quantity=1,get_quantity=1,fixed_price_cop=null,minimum_quantity=2,
  per_user_limit=1,total_redemption_limit=300,active=true,updated_at=now();

insert into public.promotion_rule_items(rule_id,venue_menu_item_id,role,minimum_quantity)
select r.id,i.id,'qualifying',2
from public.promotion_rules r
join public.promotions p on p.id=r.promotion_id
join public.venue_menu_items i on i.venue_id=p.venue_id and i.name=case
  when p.title='2x1 Cerveza nacional' then 'Cerveza nacional'
  else 'Cóctel de autor' end
where p.title in('2x1 en cócteles de autor','2x1 Cerveza nacional')
on conflict(rule_id,venue_menu_item_id,role) do update set minimum_quantity=2;

create or replace function public.purchase_tickets(
  event_key text,type_name text,quantity integer,holder_name text,holder_email text
)
returns table(id uuid,token text)
language plpgsql security definer set search_path='' as $$
declare selected_type public.ticket_types%rowtype;selected_event public.events%rowtype;
sold integer;raw_token text;new_id uuid;counter integer;
begin
  if auth.uid() is null then raise exception 'No autenticado';end if;
  if quantity<1 or quantity>4 or nullif(pg_catalog.btrim(holder_name),'') is null or pg_catalog.strpos(holder_email,'@')<2 then raise exception 'Compra inválida';end if;
  select * into selected_event from public.events
  where external_key=event_key and status='published' and starts_at>now() and coalesce(ends_at,starts_at)>now();
  if not found then raise exception 'Evento no disponible';end if;
  select * into selected_type from public.ticket_types
  where event_id=selected_event.id and name=type_name and active
    and (sales_start is null or sales_start<=now()) and (sales_end is null or sales_end>now()) for update;
  if not found then raise exception 'Localidad no disponible';end if;
  select count(*) into sold from public.tickets where ticket_type_id=selected_type.id and status in('reserved','paid','used');
  if sold+quantity>selected_type.capacity then raise exception 'No quedan suficientes entradas';end if;
  for counter in 1..quantity loop
    raw_token:=pg_catalog.upper(pg_catalog.replace(gen_random_uuid()::text,'-',''));
    insert into public.tickets(ticket_type_id,event_id,holder_user_id,holder_name,holder_email,qr_token,qr_token_hash,status,amount_cop,purchased_at)
    values(selected_type.id,selected_event.id,auth.uid(),pg_catalog.btrim(holder_name),pg_catalog.btrim(holder_email),raw_token,public.nocta_sha256(raw_token),'paid',selected_type.price_cop,now())
    returning public.tickets.id into new_id;
    id:=new_id;token:=raw_token;return next;
  end loop;
end;$$;

revoke all on function public.purchase_tickets(text,text,integer,text,text) from public,anon;
grant execute on function public.purchase_tickets(text,text,integer,text,text) to authenticated;

create or replace function public.create_event_reservation(
  event_key text,party_size_value integer,customer_name_value text,customer_email_value text,
  phone_value text,zone_name_value text,deposit_cop_value integer,notes_value text,access_token_hash_value text
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_event public.events%rowtype;selected_venue uuid;occupied integer;new_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  if party_size_value<1 or nullif(pg_catalog.btrim(customer_name_value),'') is null or nullif(pg_catalog.btrim(phone_value),'') is null then raise exception 'INVALID_RESERVATION';end if;
  select * into selected_event from public.events where external_key=event_key
    and status='published' and starts_at>now() and coalesce(ends_at,starts_at)>now() for update;
  if not found then raise exception 'EVENT_UNAVAILABLE';end if;
  select venue_id into selected_venue from public.event_venue_collaborations
    where event_id=selected_event.id and status='approved' order by created_at limit 1;
  if selected_venue is null then raise exception 'APPROVED_VENUE_REQUIRED';end if;
  select coalesce(sum(party_size),0) into occupied from public.reservations
    where event_id=selected_event.id and status in('pending','confirmed');
  if occupied+party_size_value>selected_event.capacity then raise exception 'CAPACITY_REACHED';end if;
  insert into public.reservations(event_id,venue_id,customer_user_id,customer_name,customer_email,phone,party_size,zone_name,reserved_for,deposit_cop,status,notes,access_token_hash)
  values(selected_event.id,selected_venue,auth.uid(),pg_catalog.btrim(customer_name_value),nullif(pg_catalog.btrim(customer_email_value),''),pg_catalog.btrim(phone_value),party_size_value,zone_name_value,selected_event.starts_at,greatest(0,coalesce(deposit_cop_value,0)),'pending',coalesce(notes_value,''),access_token_hash_value)
  returning id into new_id;
  return new_id;
end;$$;

revoke all on function public.create_event_reservation(text,integer,text,text,text,text,integer,text,text) from public,anon;
grant execute on function public.create_event_reservation(text,integer,text,text,text,text,integer,text,text) to authenticated;
notify pgrst,'reload schema';
