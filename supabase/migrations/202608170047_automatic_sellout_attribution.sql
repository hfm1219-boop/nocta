-- Fase 3: promoción -> pedido -> SKU -> campaña/activación -> sell-out automático.

alter table public.venue_menu_items
  drop constraint if exists venue_menu_items_phase2_price_limit,
  add constraint venue_menu_items_phase2_price_limit check(price_cop between 0 and 10000000);

create type public.sellout_attribution_status as enum ('pending','confirmed','reversed');

create table public.activation_sellout_attributions(
  id uuid primary key default gen_random_uuid(),
  activation_id uuid not null references public.brand_activations(id) on delete restrict,
  campaign_id uuid not null references public.brand_campaigns(id) on delete restrict,
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  promotion_redemption_id uuid not null references public.promotion_redemptions(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  venue_id uuid not null references public.venues(id) on delete restrict,
  event_id uuid references public.events(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  brand_product_id uuid not null references public.brand_products(id) on delete restrict,
  venue_menu_item_id uuid not null references public.venue_menu_items(id) on delete restrict,
  menu_units integer not null check(menu_units>0),
  brand_quantity numeric(18,4) not null check(brand_quantity>0),
  brand_unit text not null check(brand_unit in('unit','ml','g','serving')),
  gross_sellout_cop integer not null check(gross_sellout_cop>=0),
  discount_cop integer not null check(discount_cop>=0),
  net_sellout_cop integer not null check(net_sellout_cop>=0),
  status public.sellout_attribution_status not null default 'pending',
  confirmed_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id,brand_product_id,activation_id),
  check(net_sellout_cop=gross_sellout_cop-discount_cop)
);
create index activation_sellout_activation_status on public.activation_sellout_attributions(activation_id,status);
create index activation_sellout_campaign_status on public.activation_sellout_attributions(campaign_id,status);
create index activation_sellout_order on public.activation_sellout_attributions(order_id);
create index activation_sellout_sku on public.activation_sellout_attributions(brand_product_id,status);

alter table public.activation_sellout_attributions enable row level security;
create policy "sellout participants read" on public.activation_sellout_attributions for select to authenticated using(
  public.is_platform_owner()
  or public.can_operate_venue(venue_id)
  or exists(select 1 from public.brand_campaigns c where c.id=campaign_id and public.can_view_brand_organization(c.organization_id))
);
grant select on public.activation_sellout_attributions to authenticated;

-- Una activación solo atribuye SKU de su propia marca y con mapping bilateral vigente.
create or replace function public.require_verified_rule_mapping()
returns trigger language plpgsql set search_path='' as $$
declare linked_activation uuid;campaign_brand uuid;product_brand uuid;
begin
  select p.activation_id into linked_activation
  from public.promotion_rules r join public.promotions p on p.id=r.promotion_id where r.id=new.rule_id;
  if new.brand_product_id is not null and not exists(
    select 1 from public.brand_product_venue_items m where m.brand_product_id=new.brand_product_id
      and m.venue_menu_item_id=new.venue_menu_item_id and m.active and m.verified
  )then raise exception 'VERIFIED_PRODUCT_MAPPING_REQUIRED';end if;
  if linked_activation is not null then
    if new.brand_product_id is null then raise exception 'ATTRIBUTED_PROMOTION_REQUIRES_SKU';end if;
    select c.brand_id into campaign_brand from public.brand_activations a join public.brand_campaigns c on c.id=a.campaign_id where a.id=linked_activation;
    select bp.brand_id into product_brand from public.brand_products bp where bp.id=new.brand_product_id and bp.active;
    if campaign_brand is null or product_brand is distinct from campaign_brand then raise exception 'SKU_CAMPAIGN_BRAND_MISMATCH';end if;
  end if;
  return new;
end;$$;

create or replace function public.refresh_activation_automatic_metrics(target_activation uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.brand_activations a set
    redemptions=coalesce((select count(distinct s.promotion_redemption_id) from public.activation_sellout_attributions s where s.activation_id=target_activation and s.status='confirmed'),0),
    units_sold=coalesce((select sum(s.menu_units) from public.activation_sellout_attributions s where s.activation_id=target_activation and s.status='confirmed'),0),
    revenue_cop=coalesce((select sum(s.net_sellout_cop) from public.activation_sellout_attributions s where s.activation_id=target_activation and s.status='confirmed'),0),
    updated_at=now()
  where a.id=target_activation;
end;$$;
revoke all on function public.refresh_activation_automatic_metrics(uuid) from public,anon,authenticated;

create or replace function public.sync_order_sellout_attribution(target_order uuid)
returns void language plpgsql security definer set search_path='' as $$
declare selected_order public.orders%rowtype;linked_activation uuid;
begin
  select * into selected_order from public.orders where id=target_order;
  if not found or selected_order.promotion_redemption_id is null then return;end if;

  -- El snapshot se crea una sola vez. Cambios futuros al mapping no reescriben historia.
  insert into public.activation_sellout_attributions(
    activation_id,campaign_id,promotion_id,promotion_redemption_id,order_id,order_item_id,
    venue_id,event_id,user_id,brand_product_id,venue_menu_item_id,menu_units,
    brand_quantity,brand_unit,gross_sellout_cop,discount_cop,net_sellout_cop,status
  )
  select pr.activation_id,pr.campaign_id,pr.promotion_id,pr.id,selected_order.id,oi.id,
    selected_order.venue_id,selected_order.event_id,selected_order.customer_user_id,pri.brand_product_id,
    oi.venue_menu_item_id,oi.quantity,(m.brand_quantity*oi.quantity)::numeric(18,4),m.brand_unit,
    oi.gross_amount_cop,oi.discount_amount_cop,oi.net_amount_cop,
    case when selected_order.status in('cancelled','expired')then'reversed'::public.sellout_attribution_status
      when selected_order.status='delivered'and selected_order.payment_status='paid'then'confirmed'::public.sellout_attribution_status
      else'pending'::public.sellout_attribution_status end
  from public.promotion_redemptions pr
  join public.promotion_rule_items pri on pri.rule_id=pr.rule_id and pri.role='qualifying' and pri.brand_product_id is not null
  join public.order_items oi on oi.order_id=selected_order.id and oi.venue_menu_item_id=pri.venue_menu_item_id and oi.promotion_redemption_id=pr.id
  join public.brand_product_venue_items m on m.brand_product_id=pri.brand_product_id and m.venue_menu_item_id=oi.venue_menu_item_id and m.active and m.verified
  join public.brand_activations a on a.id=pr.activation_id and a.campaign_id=pr.campaign_id
  join public.brand_campaigns c on c.id=pr.campaign_id
  join public.brand_products bp on bp.id=pri.brand_product_id and bp.brand_id=c.brand_id
  where pr.id=selected_order.promotion_redemption_id and pr.activation_id is not null and pr.campaign_id is not null
  on conflict(order_item_id,brand_product_id,activation_id)do nothing;

  update public.activation_sellout_attributions s set
    status=case when selected_order.status in('cancelled','expired')then'reversed'::public.sellout_attribution_status
      when selected_order.status='delivered'and selected_order.payment_status='paid'then'confirmed'::public.sellout_attribution_status
      else'pending'::public.sellout_attribution_status end,
    confirmed_at=case when selected_order.status='delivered'and selected_order.payment_status='paid'then coalesce(s.confirmed_at,now())else s.confirmed_at end,
    reversed_at=case when selected_order.status in('cancelled','expired')then coalesce(s.reversed_at,now())else null end,
    updated_at=now()
  where s.order_id=selected_order.id;

  for linked_activation in select distinct s.activation_id from public.activation_sellout_attributions s where s.order_id=selected_order.id loop
    perform public.refresh_activation_automatic_metrics(linked_activation);
  end loop;
end;$$;
revoke all on function public.sync_order_sellout_attribution(uuid) from public,anon,authenticated;

create or replace function public.trigger_order_sellout_attribution()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.sync_order_sellout_attribution(new.id);return new;end;$$;
create or replace function public.trigger_order_item_sellout_attribution()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.sync_order_sellout_attribution(new.order_id);return new;end;$$;

drop trigger if exists order_sellout_attribution_sync on public.orders;
create trigger order_sellout_attribution_sync after insert or update of status,payment_status,promotion_redemption_id
on public.orders for each row execute function public.trigger_order_sellout_attribution();
drop trigger if exists order_item_sellout_attribution_sync on public.order_items;
create trigger order_item_sellout_attribution_sync after insert on public.order_items
for each row execute function public.trigger_order_item_sellout_attribution();

-- Solo funciones de sistema pueden escribir las métricas derivadas.
revoke update,delete on public.brand_activations from authenticated;
create or replace function public.update_activation_execution(target_activation uuid,next_status text,spend_cop bigint,reach integer)
returns void language plpgsql security definer set search_path='' as $$
declare selected public.brand_activations%rowtype;
begin
  select * into selected from public.brand_activations where id=target_activation for update;
  if not found then raise exception 'ACTIVATION_NOT_FOUND';end if;
  if not public.can_manage_brand_campaign(selected.campaign_id)then raise exception 'FORBIDDEN';end if;
  if next_status not in('proposed','approved','active','completed','rejected','cancelled')or spend_cop<0 or reach<0 then raise exception 'INVALID_ACTIVATION_EXECUTION';end if;
  update public.brand_activations set status=next_status,actual_spend_cop=spend_cop,actual_reach=reach,updated_at=now() where id=target_activation;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)values(
    auth.uid(),'activation.execution.updated','brand_activation',target_activation,
    jsonb_build_object('status',next_status,'actualSpendCop',spend_cop,'actualReach',reach)
  );
end;$$;
revoke all on function public.update_activation_execution(uuid,text,bigint,integer) from public,anon;
grant execute on function public.update_activation_execution(uuid,text,bigint,integer) to authenticated;

create or replace view public.brand_activation_performance with(security_invoker=true)as
select a.id activation_id,a.campaign_id,
  count(distinct s.order_id)filter(where s.status='confirmed')::integer orders_influenced,
  count(distinct s.promotion_redemption_id)filter(where s.status='confirmed')::integer redemptions,
  coalesce(sum(s.menu_units)filter(where s.status='confirmed'),0)::bigint menu_units_sold,
  coalesce(sum(s.gross_sellout_cop)filter(where s.status='confirmed'),0)::bigint gross_sellout_cop,
  coalesce(sum(s.discount_cop)filter(where s.status='confirmed'),0)::bigint discount_cop,
  coalesce(sum(s.net_sellout_cop)filter(where s.status='confirmed'),0)::bigint net_sellout_cop,
  coalesce(jsonb_agg(jsonb_build_object(
    'brandProductId',s.brand_product_id,'brandQuantity',s.brand_quantity,'brandUnit',s.brand_unit,
    'menuUnits',s.menu_units,'netSelloutCop',s.net_sellout_cop
  )order by s.created_at)filter(where s.status='confirmed'),'[]'::jsonb)sku_attributions
from public.brand_activations a left join public.activation_sellout_attributions s on s.activation_id=a.id
group by a.id,a.campaign_id;
grant select on public.brand_activation_performance to authenticated;

create or replace view public.brand_activation_sku_performance with(security_invoker=true)as
select s.activation_id,s.campaign_id,s.brand_product_id,bp.sku,bp.name product_name,s.brand_unit,
  sum(s.menu_units)::bigint menu_units_sold,
  sum(s.brand_quantity)::numeric(18,4) brand_quantity_sold,
  sum(s.gross_sellout_cop)::bigint gross_sellout_cop,
  sum(s.discount_cop)::bigint discount_cop,
  sum(s.net_sellout_cop)::bigint net_sellout_cop
from public.activation_sellout_attributions s join public.brand_products bp on bp.id=s.brand_product_id
where s.status='confirmed'
group by s.activation_id,s.campaign_id,s.brand_product_id,bp.sku,bp.name,s.brand_unit;
grant select on public.brand_activation_sku_performance to authenticated;

-- Reservar beneficios sin pedido ya no forma parte del flujo productivo.
revoke execute on function public.reserve_promotion_redemption(uuid,uuid,jsonb,text,timestamptz) from public,anon,authenticated;

-- No se permite que una promoción atribuida siga activa si su SKU no puede auditarse.
update public.promotion_rules r set active=false,updated_at=now()
where r.active and exists(select 1 from public.promotions p where p.id=r.promotion_id and p.activation_id is not null)
and not exists(
  select 1 from public.promotion_rule_items pri
  join public.promotions p on p.id=r.promotion_id
  join public.brand_activations a on a.id=p.activation_id
  join public.brand_campaigns c on c.id=a.campaign_id
  join public.brand_products bp on bp.id=pri.brand_product_id and bp.brand_id=c.brand_id
  join public.brand_product_venue_items m on m.brand_product_id=pri.brand_product_id
    and m.venue_menu_item_id=pri.venue_menu_item_id and m.active and m.verified
  where pri.rule_id=r.id and pri.role='qualifying'
);

-- Backfill idempotente de pedidos de fase 2 ya existentes.
do $$declare item record;begin
  for item in select distinct oi.order_id from public.order_items oi loop
    perform public.sync_order_sellout_attribution(item.order_id);
  end loop;
  for item in select a.id from public.brand_activations a loop
    perform public.refresh_activation_automatic_metrics(item.id);
  end loop;
end$$;

insert into supabase_migrations.schema_migrations(version,name,statements)
values('202608170047','automatic_sellout_attribution',array[]::text[])
on conflict(version)do update set name=excluded.name;
notify pgrst,'reload schema';
