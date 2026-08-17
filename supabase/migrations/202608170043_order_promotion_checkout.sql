-- Fase 2: carrito -> promoción -> pedido -> redención -> libro económico.

alter table public.orders
  add column if not exists discount_cop integer not null default 0 check(discount_cop>=0),
  add column if not exists promotion_redemption_id uuid references public.promotion_redemptions(id) on delete set null,
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists orders_promotion_redemption on public.orders(promotion_redemption_id)
where promotion_redemption_id is not null;

create table if not exists public.order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  venue_menu_item_id uuid not null references public.venue_menu_items(id),
  name_snapshot text not null,
  unit_price_cop integer not null check(unit_price_cop>=0),
  quantity integer not null check(quantity between 1 and 100),
  gross_amount_cop integer not null check(gross_amount_cop>=0),
  discount_amount_cop integer not null default 0 check(discount_amount_cop>=0),
  net_amount_cop integer not null check(net_amount_cop>=0),
  promotion_redemption_id uuid references public.promotion_redemptions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(order_id,venue_menu_item_id)
);
create index if not exists order_items_menu_item on public.order_items(venue_menu_item_id);
create index if not exists order_items_redemption on public.order_items(promotion_redemption_id)
where promotion_redemption_id is not null;
alter table public.order_items enable row level security;
drop policy if exists "order items visible to participants" on public.order_items;
create policy "order items visible to participants" on public.order_items for select using(
  exists(select 1 from public.orders o where o.id=order_id and(o.customer_user_id=auth.uid()or public.can_operate_venue(o.venue_id)))
);
revoke all on public.order_items from anon;
grant select on public.order_items to authenticated;
revoke insert,update,delete on public.orders from authenticated;

create or replace function public.checkout_order_with_promotion(
  venue_key text,
  order_key text,
  service text,
  zone text,
  cart jsonb,
  tip integer,
  payment_method_value text,
  payment_status_value text,
  preorder_at timestamptz,
  pickup_pin text,
  selected_promotion uuid default null,
  promotion_idempotency text default null,
  event_key text default null
) returns table(
  order_id uuid,external_key text,gross_amount_cop integer,discount_amount_cop integer,
  tip_amount_cop integer,total_amount_cop integer,redemption_id uuid,promotion_id uuid,promotion_title text
) language plpgsql security definer set search_path='' as $$
declare
  selected_venue public.venues%rowtype;
  selected_event uuid;
  existing_order public.orders%rowtype;
  normalized_cart jsonb;
  normalized_count integer;
  requested_count integer;
  gross integer;
  discount integer:=0;
  consumed_budget bigint:=0;
  choice record;
  chosen_promotion uuid;
  chosen_title text;
  selected_rule public.promotion_rules%rowtype;
  redemption public.promotion_redemptions%rowtype;
  created_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  if nullif(pg_catalog.btrim(order_key),'') is null then raise exception 'ORDER_KEY_REQUIRED';end if;
  if service not in('bar','zone','table') or payment_method_value not in('digital','cash','efectivo','datafono') or payment_status_value<>'pending' then raise exception 'INVALID_ORDER';end if;
  if tip<0 or jsonb_typeof(cart)<>'array' or jsonb_array_length(cart)=0 or jsonb_array_length(cart)>100 then raise exception 'INVALID_CART';end if;
  if preorder_at is not null and preorder_at<now()+interval '30 minutes' then raise exception 'INVALID_PREORDER';end if;

  select * into existing_order from public.orders where public.orders.external_key=order_key;
  if found then
    if existing_order.customer_user_id<>auth.uid() then raise exception 'ORDER_KEY_CONFLICT';end if;
    return query select existing_order.id,existing_order.external_key,existing_order.subtotal_cop,existing_order.discount_cop,
      existing_order.tip_cop,existing_order.total_cop,existing_order.promotion_redemption_id,pr.promotion_id,p.title
      from public.promotion_redemptions pr join public.promotions p on p.id=pr.promotion_id
      where pr.id=existing_order.promotion_redemption_id
      union all
      select existing_order.id,existing_order.external_key,existing_order.subtotal_cop,existing_order.discount_cop,
        existing_order.tip_cop,existing_order.total_cop,null,null,null
      where existing_order.promotion_redemption_id is null;
    return;
  end if;

  select * into selected_venue from public.venues where public.venues.external_key=venue_key and active;
  if not found then raise exception 'VENUE_NOT_FOUND';end if;
  if event_key is not null then
    select e.id into selected_event from public.events e
    where e.external_key=event_key and e.status='published' and coalesce(e.ends_at,e.starts_at)>now()
      and exists(select 1 from public.event_venue_collaborations c where c.event_id=e.id and c.venue_id=selected_venue.id and c.status='approved');
    if selected_event is null then raise exception 'EVENT_NOT_AVAILABLE_AT_VENUE';end if;
  end if;

  requested_count:=jsonb_array_length(cart);
  with requested_raw as(
    select (x->>'menuItemId')::uuid menu_item_id,(x->>'quantity')::integer quantity
    from jsonb_array_elements(cart)x
    where jsonb_typeof(x)='object' and (x->>'quantity')::integer between 1 and 100
  ),requested as(
    select menu_item_id,sum(quantity)::integer quantity from requested_raw group by menu_item_id
  ), priced as(
    select i.id,i.name,i.price_cop,r.quantity
    from requested r join public.venue_menu_items i on i.id=r.menu_item_id
    where i.venue_id=selected_venue.id and i.available
  )
  select count(*),coalesce(sum(price_cop*quantity),0)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'menuItemId',id,'productoId',id,'nombre',name,'precioUnit',price_cop,'cantidad',quantity
    )order by name),'[]'::jsonb)
  into normalized_count,gross,normalized_cart from priced;
  if normalized_count<>requested_count then raise exception 'CART_ITEM_NOT_AVAILABLE_OR_DUPLICATED';end if;

  if selected_promotion is not null then
    if nullif(pg_catalog.btrim(promotion_idempotency),'') is null then raise exception 'PROMOTION_IDEMPOTENCY_REQUIRED';end if;
    select r.* into selected_rule from public.promotion_rules r where r.promotion_id=selected_promotion for update;
    if not found then raise exception 'PROMOTION_RULE_NOT_FOUND';end if;
    select * into choice from public.evaluate_promotions(selected_venue.id,cart,now(),selected_event)e
      where e.promotion_id=selected_promotion and e.eligible and e.discount_amount_cop>0;
    if not found then raise exception 'PROMOTION_NOT_ELIGIBLE';end if;
    chosen_promotion:=choice.promotion_id;chosen_title:=choice.title;
    discount:=least(gross,choice.discount_amount_cop);
    if selected_rule.budget_cop is not null then
      select coalesce(sum(pr.discount_amount_cop),0) into consumed_budget
      from public.promotion_redemptions pr where pr.promotion_id=selected_promotion
        and pr.status in('reserved','applied','redeemed')and(pr.status<>'reserved'or pr.expires_at>now());
      if consumed_budget+discount>selected_rule.budget_cop then raise exception 'PROMOTION_BUDGET_EXHAUSTED';end if;
    end if;
    insert into public.promotion_redemptions(
      promotion_id,rule_id,user_id,venue_id,campaign_id,activation_id,idempotency_key,status,
      gross_amount_cop,discount_amount_cop,cart_snapshot,eligibility_snapshot,reserved_at,expires_at
    )values(
      choice.promotion_id,choice.rule_id,auth.uid(),selected_venue.id,choice.campaign_id,choice.activation_id,
      promotion_idempotency,'reserved',gross,discount,normalized_cart,
      jsonb_build_object('evaluatedAt',now(),'reason',choice.reason,'eventId',selected_event),now(),now()+interval '15 minutes'
    )on conflict(user_id,idempotency_key)do update set updated_at=now()
    returning * into redemption;
    if redemption.promotion_id<>selected_promotion or redemption.venue_id<>selected_venue.id or redemption.discount_amount_cop<>discount then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  end if;

  insert into public.orders(
    external_key,venue_id,event_id,customer_user_id,service_mode,zone_name,items,
    subtotal_cop,discount_cop,tip_cop,total_cop,payment_method,payment_status,status,
    preorder_for,pickup_pin_hash,promotion_redemption_id,paid_at
  )values(
    order_key,selected_venue.id,selected_event,auth.uid(),service,zone,normalized_cart,
    gross,discount,tip,gross-discount+tip,payment_method_value,payment_status_value,'new',
    preorder_at,case when pickup_pin is null then null else public.nocta_sha256(pickup_pin)end,
    redemption.id,null
  )returning * into created_order;

  -- Snapshot normalizado y reparto exacto del beneficio sobre los productos elegibles.
  -- La diferencia de dos acumulados evita perder pesos por redondeo.
  with lines as(
    select (x->>'menuItemId')::uuid menu_item_id,x->>'nombre' item_name,
      (x->>'precioUnit')::integer unit_price,(x->>'cantidad')::integer quantity,
      (x->>'precioUnit')::integer*(x->>'cantidad')::integer line_gross
    from jsonb_array_elements(normalized_cart)x
  ),marked as(
    select l.*,(redemption.id is not null and exists(
      select 1 from public.promotion_rule_items pri
      where pri.rule_id=selected_rule.id and pri.venue_menu_item_id=l.menu_item_id and pri.role='qualifying'
    ))qualifying from lines l
  ),running as(
    select m.*,coalesce(sum(line_gross)filter(where qualifying)over(),0)::bigint eligible_gross,
      coalesce(sum(line_gross)filter(where qualifying)over(order by menu_item_id rows between unbounded preceding and current row),0)::bigint eligible_running
    from marked m
  ),allocated as(
    select r.*,case when qualifying and eligible_gross>0 then(
      floor(discount::numeric*eligible_running/eligible_gross)-
      floor(discount::numeric*(eligible_running-line_gross)/eligible_gross)
    )::integer else 0 end line_discount from running r
  )
  insert into public.order_items(
    order_id,venue_menu_item_id,name_snapshot,unit_price_cop,quantity,gross_amount_cop,
    discount_amount_cop,net_amount_cop,promotion_redemption_id
  )select created_order.id,menu_item_id,item_name,unit_price,quantity,line_gross,
    line_discount,line_gross-line_discount,case when line_discount>0 then redemption.id else null end
  from allocated;

  if redemption.id is not null then
    update public.promotion_redemptions set order_id=created_order.id,status='applied',updated_at=now()
    where id=redemption.id;
  end if;
  insert into public.order_status_history(order_id,to_status,actor_id,metadata)
  values(created_order.id,'new',auth.uid(),jsonb_build_object('source','consumer','promotionRedemptionId',redemption.id));

  return query select created_order.id,created_order.external_key,gross,discount,tip,created_order.total_cop,
    redemption.id,chosen_promotion,chosen_title;
end;$$;

create or replace function public.sync_order_promotion_redemption()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.promotion_redemption_id is null then return new;end if;
  update public.promotion_redemptions set
    status=case
      when new.status in('cancelled','expired')then'reversed'::public.promotion_redemption_status
      when new.status='delivered'and new.payment_status='paid'then'redeemed'::public.promotion_redemption_status
      else'applied'::public.promotion_redemption_status end,
    redeemed_at=case when new.status='delivered'and new.payment_status='paid'then coalesce(redeemed_at,now())else redeemed_at end,
    updated_at=now()
  where id=new.promotion_redemption_id;
  return new;
end;$$;

drop trigger if exists order_promotion_redemption_sync on public.orders;
create trigger order_promotion_redemption_sync after insert or update of status,payment_status,promotion_redemption_id
on public.orders for each row execute function public.sync_order_promotion_redemption();

create or replace function public.sync_order_economic()
returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid;redemption public.promotion_redemptions%rowtype;
begin
  select organization_id into org from public.venues where id=new.venue_id;
  if new.promotion_redemption_id is not null then select * into redemption from public.promotion_redemptions where id=new.promotion_redemption_id;end if;
  insert into public.economic_transactions(
    external_key,kind,status,currency,gross_amount,discount_amount,net_amount,payer_user_id,
    beneficiary_organization_id,venue_id,event_id,source_table,source_id,payment_method,
    payment_reference,occurred_at,settled_at,metadata
  )values(
    'order:'||new.id,'order_payment',case when new.status='cancelled'then'cancelled'when new.payment_status='paid'and new.status='delivered'then'completed'when new.payment_status='paid'then'paid'else'pending'end,
    'COP',new.subtotal_cop+new.tip_cop,new.discount_cop,new.total_cop,new.customer_user_id,org,new.venue_id,new.event_id,
    'orders',new.id,new.payment_method,new.payment_reference,new.created_at,new.paid_at,
    jsonb_build_object('service_mode',new.service_mode,'subtotal_cop',new.subtotal_cop,'tip_cop',new.tip_cop,
      'status',new.status,'promotion_redemption_id',new.promotion_redemption_id,'promotion_id',redemption.promotion_id,
      'campaign_id',redemption.campaign_id,'activation_id',redemption.activation_id)
  )on conflict(source_table,source_id)do update set
    status=excluded.status,gross_amount=excluded.gross_amount,discount_amount=excluded.discount_amount,
    net_amount=excluded.net_amount,payment_method=excluded.payment_method,payment_reference=excluded.payment_reference,
    settled_at=excluded.settled_at,event_id=excluded.event_id,metadata=excluded.metadata,updated_at=now();
  return new;
end;$$;

revoke all on function public.checkout_order_with_promotion(text,text,text,text,jsonb,integer,text,text,timestamptz,text,uuid,text,text) from public,anon;
grant execute on function public.checkout_order_with_promotion(text,text,text,text,jsonb,integer,text,text,timestamptz,text,uuid,text,text) to authenticated;
revoke execute on function public.create_operational_order(text,text,text,text,jsonb,integer,integer,integer,text,text,timestamptz,text) from authenticated;
notify pgrst,'reload schema';
