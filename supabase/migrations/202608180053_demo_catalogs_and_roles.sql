-- Datos demo idempotentes para las sedes existentes. No crea ni reemplaza establecimientos.
do $demo$
declare
  actor uuid;
  venue_row record;
  event_row record;
  brand_org record;
  category_id uuid;
  demo_brand_id uuid;
  demo_campaign_id uuid;
  membership_id uuid;
  promoter_user uuid;
begin
  select user_id into actor from public.platform_members where role='platform_owner' limit 1;
  if actor is null then select user_id into actor from public.user_roles where role='nocta_admin' limit 1;end if;
  if actor is null then raise exception 'DEMO_ACTOR_REQUIRED';end if;

  -- Carta, promociones, reservas, pedidos y equipo para cada sede ya registrada.
  for venue_row in select v.* from public.venues v where v.active order by v.name loop
    insert into public.organization_memberships(user_id,organization_id,status)values(actor,venue_row.organization_id,'active')
    on conflict(user_id,organization_id)do update set status='active',updated_at=now() returning id into membership_id;
    insert into public.organization_roles(membership_id,context_role,role,scope_venue_id)
    select membership_id,'establishment'::public.nocta_principal_role,r::public.organization_member_role,venue_row.id
    from unnest(array['establishment_admin','bar','waiter','cashier'])r on conflict do nothing;

    insert into public.venue_menu_categories(venue_id,name,sort_order,active)values
      (venue_row.id,'Cócteles',10,true),(venue_row.id,'Cervezas',20,true),(venue_row.id,'Botellas',30,true),
      (venue_row.id,'Sin alcohol',40,true),(venue_row.id,'Para compartir',50,true)
    on conflict(venue_id,name)do update set active=true,sort_order=excluded.sort_order,updated_at=now();

    select id into category_id from public.venue_menu_categories where venue_id=venue_row.id and name='Cócteles';
    insert into public.venue_menu_items(venue_id,category_id,name,description,sku,price_cop,available,metadata)values
      (venue_row.id,category_id,'Mojito Caribe','Ron, hierbabuena, limón y soda.','DEMO-COC-01',28000,true,'{"demo":true}'::jsonb),
      (venue_row.id,category_id,'Gin Tropical','Ginebra, tónica y frutas tropicales.','DEMO-COC-02',32000,true,'{"demo":true}'::jsonb),
      (venue_row.id,category_id,'Margarita Picante','Tequila, limón, sal y toque de ají.','DEMO-COC-03',30000,true,'{"demo":true}'::jsonb)
    on conflict(venue_id,name)do update set category_id=excluded.category_id,description=excluded.description,price_cop=excluded.price_cop,available=true,metadata=excluded.metadata,updated_at=now();
    select id into category_id from public.venue_menu_categories where venue_id=venue_row.id and name='Cervezas';
    insert into public.venue_menu_items(venue_id,category_id,name,description,sku,price_cop,available,metadata)values
      (venue_row.id,category_id,'Cerveza nacional','Botella fría 330 ml.','DEMO-CER-01',12000,true,'{"demo":true}'::jsonb),
      (venue_row.id,category_id,'Cerveza premium','Selección importada 330 ml.','DEMO-CER-02',18000,true,'{"demo":true}'::jsonb)
    on conflict(venue_id,name)do update set category_id=excluded.category_id,description=excluded.description,price_cop=excluded.price_cop,available=true,metadata=excluded.metadata,updated_at=now();
    select id into category_id from public.venue_menu_categories where venue_id=venue_row.id and name='Botellas';
    insert into public.venue_menu_items(venue_id,category_id,name,description,sku,price_cop,available,metadata)values
      (venue_row.id,category_id,'Aguardiente premium','Botella 750 ml con mezcladores.','DEMO-BOT-01',185000,true,'{"demo":true}'::jsonb),
      (venue_row.id,category_id,'Whisky 12 años','Botella 750 ml con mezcladores.','DEMO-BOT-02',420000,true,'{"demo":true}'::jsonb)
    on conflict(venue_id,name)do update set category_id=excluded.category_id,description=excluded.description,price_cop=excluded.price_cop,available=true,metadata=excluded.metadata,updated_at=now();
    select id into category_id from public.venue_menu_categories where venue_id=venue_row.id and name='Sin alcohol';
    insert into public.venue_menu_items(venue_id,category_id,name,description,sku,price_cop,available,metadata)values
      (venue_row.id,category_id,'Soda artesanal','Soda de frutas y hierbas.','DEMO-SIN-01',14000,true,'{"demo":true}'::jsonb),
      (venue_row.id,category_id,'Agua mineral','Botella 500 ml.','DEMO-SIN-02',8000,true,'{"demo":true}'::jsonb)
    on conflict(venue_id,name)do update set category_id=excluded.category_id,description=excluded.description,price_cop=excluded.price_cop,available=true,metadata=excluded.metadata,updated_at=now();
    select id into category_id from public.venue_menu_categories where venue_id=venue_row.id and name='Para compartir';
    insert into public.venue_menu_items(venue_id,category_id,name,description,sku,price_cop,available,metadata)values
      (venue_row.id,category_id,'Picada nocturna','Selección para dos personas.','DEMO-COM-01',42000,true,'{"demo":true}'::jsonb),
      (venue_row.id,category_id,'Nachos de la casa','Nachos, queso y pico de gallo.','DEMO-COM-02',26000,true,'{"demo":true}'::jsonb)
    on conflict(venue_id,name)do update set category_id=excluded.category_id,description=excluded.description,price_cop=excluded.price_cop,available=true,metadata=excluded.metadata,updated_at=now();

    insert into public.promotions(venue_id,title,description,terms,starts_at,ends_at,active,created_by)
    select venue_row.id,p.title,p.description,p.terms,now()-interval '1 day',now()+interval '180 days',true,actor
    from(values
      ('Happy hour NOCTA','2x1 en cócteles seleccionados antes de las 10 p. m.','Válido de jueves a sábado. Una promoción por persona.'),
      ('Cumpleaños VIP','Mesa preferencial y botella de cortesía para grupos.','Reserva previa, mínimo 8 personas y sujeto a disponibilidad.'),
      ('Noche sin cover','Ingreso sin cover llegando temprano.','Válido hasta las 9:30 p. m. con registro en NOCTA.')
    )p(title,description,terms)
    where not exists(select 1 from public.promotions x where x.venue_id=venue_row.id and x.title=p.title);

    insert into public.reservations(venue_id,customer_user_id,customer_name,phone,party_size,zone_name,reserved_for,deposit_cop,status,notes)
    select venue_row.id,actor,r.name,r.phone,r.party,r.zone,now()+r.offset_time,r.deposit,r.status::public.reservation_status,'Reserva demostrativa NOCTA'
    from(values
      ('Valentina Gómez','3005550101',4,'Terraza',interval '2 days',80000,'confirmed'),
      ('Santiago Ruiz','3005550102',6,'VIP',interval '3 days',150000,'confirmed'),
      ('Daniela Castro','3005550103',2,'Salón principal',interval '4 days',0,'pending')
    )r(name,phone,party,zone,offset_time,deposit,status)
    where not exists(select 1 from public.reservations x where x.venue_id=venue_row.id and x.notes='Reserva demostrativa NOCTA' and x.customer_name=r.name);

    insert into public.orders(external_key,venue_id,customer_user_id,service_mode,zone_name,items,subtotal_cop,tip_cop,total_cop,payment_method,payment_status,status,created_at,updated_at)
    select 'demo-'||venue_row.id::text||'-'||o.key,venue_row.id,actor,o.mode,o.zone,o.items,o.subtotal,o.tip,o.subtotal+o.tip,o.payment,'paid',o.status::public.order_status,now()-o.age,now()-o.age
    from(values
      ('001','bar',null,'[{"name":"Mojito Caribe","quantity":2,"unit_price_cop":28000}]'::jsonb,56000,6000,'digital','delivered',interval '1 hour'),
      ('002','table','Mesa 8','[{"name":"Cerveza nacional","quantity":4,"unit_price_cop":12000},{"name":"Nachos de la casa","quantity":1,"unit_price_cop":26000}]'::jsonb,74000,8000,'datafono','delivered',interval '2 hours'),
      ('003','zone','VIP','[{"name":"Whisky 12 años","quantity":1,"unit_price_cop":420000}]'::jsonb,420000,40000,'cash','preparing',interval '10 minutes')
    )o(key,mode,zone,items,subtotal,tip,payment,status,age)
    on conflict(external_key)do update set items=excluded.items,subtotal_cop=excluded.subtotal_cop,tip_cop=excluded.tip_cop,total_cop=excluded.total_cop,payment_status=excluded.payment_status,status=excluded.status,updated_at=now();
  end loop;

  -- Boletería, listas, cortesías y patrocinadores para eventos existentes.
  select user_id into promoter_user from public.promoter_profiles order by created_at limit 1;
  for event_row in select e.* from public.events e where e.status in('published','draft','pending_venue') order by e.created_at loop
    insert into public.ticket_types(event_id,name,description,price_cop,capacity,sales_start,sales_end,active)
    select event_row.id,t.name,t.description,t.price,t.capacity,now()-interval '1 day',coalesce(event_row.starts_at,now()+interval '30 days'),true
    from(values('General','Ingreso general al evento.',45000,300),('Early bird','Precio especial por compra anticipada.',30000,100),('VIP','Zona preferencial y acceso rápido.',120000,80))t(name,description,price,capacity)
    where not exists(select 1 from public.ticket_types x where x.event_id=event_row.id and x.name=t.name);
    insert into public.event_sponsors(event_id,name,contribution_type,contribution_value_cop,status,notes,created_by)
    select event_row.id,s.name,s.kind,s.value,'confirmed','Patrocinio demostrativo',actor from(values('Ron Caribe','product',8000000),('Radio Urbana','media',3500000))s(name,kind,value)
    where not exists(select 1 from public.event_sponsors x where x.event_id=event_row.id and x.name=s.name);
    insert into public.event_complimentary_allocations(event_id,recipient_name,recipient_email,quantity,status,notes,created_by)
    select event_row.id,c.name,c.email,c.quantity,'issued','Cortesía demostrativa',actor from(values('Invitados aliados','aliados@demo.nocta.app',4),('Prensa y creadores','prensa@demo.nocta.app',6))c(name,email,quantity)
    where not exists(select 1 from public.event_complimentary_allocations x where x.event_id=event_row.id and x.recipient_email=c.email);
    if promoter_user is not null then
      insert into public.guest_lists(event_id,owner_promoter_id,name,code,capacity,closes_at,active)
      select event_row.id,promoter_user,'Lista aliados','DEMO-'||upper(substr(replace(event_row.id::text,'-',''),1,8)),80,event_row.starts_at,true
      where not exists(select 1 from public.guest_lists x where x.event_id=event_row.id and x.name='Lista aliados');
    end if;
  end loop;

  -- Portafolio y campañas en organizaciones de marca ya existentes.
  for brand_org in select o.id from public.organizations o join public.organization_contexts c on c.organization_id=o.id and c.role='brand_distributor' and c.active loop
    insert into public.brands(organization_id,name,description,website,active)values(brand_org.id,'Brisa Spirits','Portafolio demo de bebidas para activaciones nocturnas.','https://nocta.app',true)
    on conflict(organization_id,name)do update set description=excluded.description,active=true,updated_at=now() returning id into demo_brand_id;
    insert into public.brand_products(brand_id,sku,name,description,category,presentation,unit_cost_cop,active)values
      (demo_brand_id,'BRISA-RON-750','Ron Brisa Reserva','Ron añejado para consumo premium.','Licores','Botella 750 ml',72000,true),
      (demo_brand_id,'BRISA-GIN-700','Gin Brisa Tropical','Ginebra con botánicos del Caribe.','Licores','Botella 700 ml',84000,true),
      (demo_brand_id,'BRISA-TON-200','Tónica Brisa','Mezclador premium.','Mezcladores','Lata 200 ml',4500,true)
    on conflict(brand_id,sku)do update set name=excluded.name,description=excluded.description,unit_cost_cop=excluded.unit_cost_cop,active=true,updated_at=now();
    select id into demo_campaign_id from public.brand_campaigns where organization_id=brand_org.id and name='Temporada NOCTA 2026' limit 1;
    if demo_campaign_id is null then
      insert into public.brand_campaigns(organization_id,brand_id,name,objective,starts_at,ends_at,budget_cop,status,target_audience,created_by)
      values(brand_org.id,demo_brand_id,'Temporada NOCTA 2026','Impulsar prueba y sell-out en establecimientos y eventos.',now()-interval '7 days',now()+interval '180 days',120000000,'active','{"cities":["Cartagena"],"ages":[21,38],"interests":["nightlife","music"]}'::jsonb,actor)returning id into demo_campaign_id;
    end if;
    insert into public.brand_activations(campaign_id,venue_id,name,activation_type,status,allocated_budget_cop,actual_spend_cop,planned_reach,actual_reach,redemptions,units_sold,revenue_cop,notes,created_by)
    select demo_campaign_id,v.id,'Brisa Night · '||v.name,'sampling','active',12000000,3500000,1200,430,86,124,14880000,'Activación demostrativa con métricas.',actor
    from public.venues v where v.active and not exists(select 1 from public.brand_activations a where a.campaign_id=demo_campaign_id and a.venue_id=v.id and a.name='Brisa Night · '||v.name);
  end loop;
end;$demo$;

notify pgrst,'reload schema';
