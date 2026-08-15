alter table public.ticket_types drop constraint if exists ticket_types_event_name_key;
alter table public.ticket_types add constraint ticket_types_event_name_key unique(event_id,name);

insert into public.ticket_types(event_id,name,description,price_cop,capacity,active)
select e.id,t.name,t.description,t.price,t.capacity,true from public.events e join (values
  ('ritual-caribe','General','Acceso a los dos ambientes.',45000,120),
  ('ritual-caribe','Fast Pass','Ingreso por fila prioritaria.',75000,30),
  ('ritual-caribe','VIP','Zona VIP y bebida de bienvenida.',140000,16),
  ('jugada-live','General','Acceso a banda en vivo y cierre urbano.',35000,160),
  ('jugada-live','Palco','Ubicación preferencial y servicio a la mesa.',90000,24),
  ('luna-afro','Lista confirmada','Cupo limitado sujeto a disponibilidad.',60000,40),
  ('cardinal-sessions','Entrada libre','Confirma tu asistencia para obtener el QR.',0,80)
) t(event_key,name,description,price,capacity) on t.event_key=e.external_key
on conflict(event_id,name) do update set description=excluded.description,price_cop=excluded.price_cop,capacity=excluded.capacity,active=true;

drop policy if exists "ticket customer create" on public.tickets;
create policy "ticket customer create" on public.tickets for insert with check(
  holder_user_id=auth.uid()
  and event_id=(select tt.event_id from public.ticket_types tt where tt.id=ticket_type_id)
  and amount_cop=(select tt.price_cop from public.ticket_types tt where tt.id=ticket_type_id)
);

grant select on public.event_venue_collaborations to authenticated;

