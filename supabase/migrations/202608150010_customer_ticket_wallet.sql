alter table public.tickets add column if not exists qr_token text;
create unique index if not exists tickets_qr_token_key on public.tickets(qr_token) where qr_token is not null;

create or replace function public.purchase_tickets(event_key text,type_name text,quantity integer,holder_name text,holder_email text)
returns table(id uuid,token text)
language plpgsql security definer set search_path='' as $$
declare selected_type public.ticket_types%rowtype;selected_event public.events%rowtype;sold integer;raw_token text;new_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado';end if;
  if quantity<1 or quantity>4 or nullif(trim(holder_name),'') is null or position('@' in holder_email)<2 then raise exception 'Compra inválida';end if;
  select * into selected_event from public.events where external_key=event_key and status='published';if not found then raise exception 'Evento no disponible';end if;
  select * into selected_type from public.ticket_types where event_id=selected_event.id and name=type_name and active for update;if not found then raise exception 'Localidad no disponible';end if;
  select count(*) into sold from public.tickets where ticket_type_id=selected_type.id and status in('reserved','paid','used');if sold+quantity>selected_type.capacity then raise exception 'No quedan suficientes entradas';end if;
  for counter in 1..quantity loop
    raw_token:=upper(replace(gen_random_uuid()::text,'-',''));
    insert into public.tickets(ticket_type_id,event_id,holder_user_id,holder_name,holder_email,qr_token,qr_token_hash,status,amount_cop,purchased_at)
    values(selected_type.id,selected_event.id,auth.uid(),trim(holder_name),trim(holder_email),raw_token,encode(digest(raw_token,'sha256'),'hex'),'paid',selected_type.price_cop,now()) returning public.tickets.id into new_id;
    id:=new_id;token:=raw_token;return next;
  end loop;
end;$$;

revoke all on function public.purchase_tickets(text,text,integer,text,text) from public,anon;
grant execute on function public.purchase_tickets(text,text,integer,text,text) to authenticated;
notify pgrst,'reload schema';
