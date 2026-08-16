-- Catálogo inicial de beneficios visibles y canjeables en Mi NOCTA.
do $$
declare owner_id uuid; venue_one uuid; venue_two uuid; venue_three uuid;
begin
  select user_id into owner_id from public.platform_members where role='platform_owner' limit 1;
  if owner_id is null then raise exception 'PLATFORM_OWNER_REQUIRED';end if;
  select id into venue_one from public.venues where active order by case when external_key='la-movida' then 0 else 1 end,created_at limit 1;
  select id into venue_two from public.venues where active and id<>venue_one order by case when external_key='la-jugada-club-house' then 0 else 1 end,created_at limit 1;
  select id into venue_three from public.venues where active and id not in(venue_one,venue_two) order by case when external_key='casa-la-movida' then 0 else 1 end,created_at limit 1;
  if venue_one is null then raise exception 'ACTIVE_VENUE_REQUIRED';end if;
  venue_two:=coalesce(venue_two,venue_one);venue_three:=coalesce(venue_three,venue_one);
  insert into public.loyalty_rewards(slug,name,description,image_url,points_required,stock,active,venue_id,city,category,terms,created_by) values
    ('welcome-shot-nocta','Shot de bienvenida','Empieza la noche con un shot de cortesía en el establecimiento autorizado.','🥃',100,100,true,venue_one,'Cartagena','Bebidas','Un canje por persona. Válido durante 24 horas después de reservar.',owner_id),
    ('entrada-prioritaria-nocta','Acceso prioritario','Ingresa por la fila prioritaria del establecimiento y evita la espera general.','⚡',200,50,true,venue_two,'Cartagena','Acceso','Sujeto a aforo y horario de operación. No incluye entrada a eventos con boletería.',owner_id),
    ('coctel-nocta','Cóctel NOCTA','Canjea un cóctel seleccionado de la carta en el comercio indicado.','🍸',350,60,true,venue_three,'Cartagena','Bebidas','Aplica sobre referencias seleccionadas. Prohibida la entrega a menores de edad.',owner_id)
  on conflict(slug) do update set name=excluded.name,description=excluded.description,image_url=excluded.image_url,points_required=excluded.points_required,active=true,venue_id=excluded.venue_id,city=excluded.city,category=excluded.category,terms=excluded.terms,updated_at=now();
end;$$;
notify pgrst,'reload schema';
