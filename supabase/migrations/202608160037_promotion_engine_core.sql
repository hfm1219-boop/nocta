-- Fase 10: núcleo auditable de promociones, elegibilidad y mapping de sell-out.

create type public.promotion_mechanic as enum ('percentage','fixed_amount','buy_x_get_y','fixed_price');
create type public.promotion_redemption_status as enum ('reserved','applied','redeemed','released','reversed');

create table public.brand_product_venue_items(
  id uuid primary key default gen_random_uuid(),
  brand_product_id uuid not null references public.brand_products(id) on delete cascade,
  venue_menu_item_id uuid not null references public.venue_menu_items(id) on delete cascade,
  brand_quantity numeric(12,4) not null check(brand_quantity>0),
  brand_unit text not null check(brand_unit in('unit','ml','g','serving')),
  confidence numeric(5,4) not null default 1 check(confidence between 0 and 1),
  verified boolean not null default false,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_product_id,venue_menu_item_id)
);

alter table public.promotions
  add column campaign_id uuid references public.brand_campaigns(id) on delete set null,
  add column activation_id uuid references public.brand_activations(id) on delete set null;

create table public.promotion_rules(
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null unique references public.promotions(id) on delete cascade,
  mechanic public.promotion_mechanic not null,
  percentage_off numeric(5,2) check(percentage_off>0 and percentage_off<=100),
  fixed_amount_cop integer check(fixed_amount_cop>0),
  buy_quantity integer check(buy_quantity>0),
  get_quantity integer check(get_quantity>0),
  fixed_price_cop integer check(fixed_price_cop>=0),
  minimum_quantity integer not null default 1 check(minimum_quantity>0),
  minimum_spend_cop integer not null default 0 check(minimum_spend_cop>=0),
  maximum_discount_cop integer check(maximum_discount_cop>0),
  per_user_limit integer check(per_user_limit>0),
  total_redemption_limit integer check(total_redemption_limit>0),
  budget_cop bigint check(budget_cop>0),
  local_time_start time,
  local_time_end time,
  timezone text not null default 'America/Bogota',
  weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  customer_segment jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  stackable boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(local_time_start is null = (local_time_end is null)),
  check(weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  check(
    (mechanic='percentage' and percentage_off is not null and fixed_amount_cop is null and buy_quantity is null and get_quantity is null and fixed_price_cop is null) or
    (mechanic='fixed_amount' and percentage_off is null and fixed_amount_cop is not null and buy_quantity is null and get_quantity is null and fixed_price_cop is null) or
    (mechanic='buy_x_get_y' and percentage_off is null and fixed_amount_cop is null and buy_quantity is not null and get_quantity is not null and fixed_price_cop is null) or
    (mechanic='fixed_price' and percentage_off is null and fixed_amount_cop is null and buy_quantity is null and get_quantity is null and fixed_price_cop is not null)
  )
);

create table public.promotion_rule_items(
  rule_id uuid not null references public.promotion_rules(id) on delete cascade,
  venue_menu_item_id uuid not null references public.venue_menu_items(id) on delete cascade,
  brand_product_id uuid references public.brand_products(id) on delete set null,
  role text not null default 'qualifying' check(role in('qualifying','benefit')),
  minimum_quantity integer not null default 1 check(minimum_quantity>0),
  primary key(rule_id,venue_menu_item_id,role)
);

create table public.promotion_redemptions(
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  rule_id uuid not null references public.promotion_rules(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  venue_id uuid not null references public.venues(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  campaign_id uuid references public.brand_campaigns(id) on delete set null,
  activation_id uuid references public.brand_activations(id) on delete set null,
  idempotency_key text not null,
  status public.promotion_redemption_status not null default 'reserved',
  gross_amount_cop integer not null check(gross_amount_cop>=0),
  discount_amount_cop integer not null check(discount_amount_cop>0),
  cart_snapshot jsonb not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key),
  check(expires_at>reserved_at)
);

create index promotion_rules_active on public.promotion_rules(active,priority);
create index promotion_rule_items_menu on public.promotion_rule_items(venue_menu_item_id,rule_id);
create index promotion_redemptions_limits on public.promotion_redemptions(promotion_id,user_id,status);
create index promotion_redemptions_order on public.promotion_redemptions(order_id) where order_id is not null;
create index brand_product_menu_mapping on public.brand_product_venue_items(venue_menu_item_id) where active;

create or replace function public.validate_promotion_links()
returns trigger language plpgsql set search_path='' as $$
declare activation_campaign uuid; activation_venue uuid; activation_event uuid;
begin
  if new.activation_id is null then return new; end if;
  select a.campaign_id,a.venue_id,a.event_id into activation_campaign,activation_venue,activation_event
  from public.brand_activations a where a.id=new.activation_id;
  if new.campaign_id is null then new.campaign_id:=activation_campaign; end if;
  if new.campaign_id<>activation_campaign then raise exception 'PROMOTION_CAMPAIGN_ACTIVATION_MISMATCH'; end if;
  if activation_venue is not null and new.venue_id is distinct from activation_venue then raise exception 'PROMOTION_ACTIVATION_VENUE_MISMATCH'; end if;
  if activation_event is not null and new.event_id is distinct from activation_event then raise exception 'PROMOTION_ACTIVATION_EVENT_MISMATCH'; end if;
  return new;
end;$$;
create trigger promotion_links_guard before insert or update of campaign_id,activation_id,venue_id,event_id on public.promotions for each row execute function public.validate_promotion_links();

create or replace function public.calculate_promotion_discount(rule_row public.promotion_rules,eligible_quantity integer,eligible_subtotal bigint)
returns integer language plpgsql immutable set search_path='' as $$
declare result bigint:=0; groups integer;
begin
  if rule_row.mechanic='percentage' then result:=floor(eligible_subtotal*rule_row.percentage_off/100);
  elsif rule_row.mechanic='fixed_amount' then result:=least(eligible_subtotal,rule_row.fixed_amount_cop);
  elsif rule_row.mechanic='buy_x_get_y' then
    groups:=floor(eligible_quantity/(rule_row.buy_quantity+rule_row.get_quantity));
    result:=case when eligible_quantity=0 then 0 else floor(eligible_subtotal*groups*rule_row.get_quantity/eligible_quantity) end;
  elsif rule_row.mechanic='fixed_price' then result:=greatest(0,eligible_subtotal-rule_row.fixed_price_cop);
  end if;
  return greatest(0,least(eligible_subtotal,result,coalesce(rule_row.maximum_discount_cop,result)))::integer;
end;$$;

create or replace function public.evaluate_promotions(target_venue uuid,cart jsonb,at_time timestamptz default now())
returns table(promotion_id uuid,rule_id uuid,title text,mechanic text,eligible boolean,reason text,gross_amount_cop integer,discount_amount_cop integer,campaign_id uuid,activation_id uuid)
language sql stable security definer set search_path='' as $$
  with normalized as (
    select i.id menu_item_id,(x->>'quantity')::integer quantity,i.price_cop unit_price
    from jsonb_array_elements(cart) x
    join public.venue_menu_items i on i.id=(x->>'menuItemId')::uuid and i.venue_id=target_venue and i.available
    where (x->>'quantity')::integer>0
  ), candidates as (
    select p.id promotion_id,r.id rule_id,
      coalesce(sum(n.quantity) filter(where pri.rule_id is not null),0)::integer eligible_qty,
      coalesce(sum(n.quantity*n.unit_price) filter(where pri.rule_id is not null),0)::bigint eligible_subtotal,
      coalesce(sum(n.quantity*n.unit_price),0)::bigint gross,
      (at_time at time zone r.timezone) local_at
    from public.promotions p join public.promotion_rules r on r.promotion_id=p.id
    cross join normalized n
    left join public.promotion_rule_items pri on pri.rule_id=r.id and pri.venue_menu_item_id=n.menu_item_id and pri.role='qualifying'
    where p.venue_id=target_venue and p.active and r.active and at_time between p.starts_at and p.ends_at
    group by p.id,r.id,r.timezone
  ), evaluated as (
    select c.*,
      c.eligible_qty>=r.minimum_quantity and c.eligible_subtotal>=r.minimum_spend_cop
      and p.active and r.active and at_time between p.starts_at and p.ends_at
      and extract(dow from c.local_at)::smallint=any(r.weekdays)
      and (r.local_time_start is null or c.local_at::time between r.local_time_start and r.local_time_end)
      and r.customer_segment='{}'::jsonb
      and (r.total_redemption_limit is null or (select count(*) from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.status in('reserved','applied','redeemed') and (pr.status<>'reserved' or pr.expires_at>at_time))<r.total_redemption_limit)
      and (r.budget_cop is null or coalesce((select sum(pr.discount_amount_cop) from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.status in('reserved','applied','redeemed') and (pr.status<>'reserved' or pr.expires_at>at_time)),0)<r.budget_cop)
      and (r.per_user_limit is null or auth.uid() is null or (select count(*) from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.user_id=auth.uid() and pr.status in('reserved','applied','redeemed') and (pr.status<>'reserved' or pr.expires_at>at_time))<r.per_user_limit) ok
    from candidates c join public.promotions p on p.id=c.promotion_id join public.promotion_rules r on r.id=c.rule_id
  )
  select p.id,r.id,p.title,r.mechanic::text,e.ok,
    case when e.ok then 'ELIGIBLE' when r.customer_segment<>'{}'::jsonb then 'SEGMENT_REQUIRES_PROFILE' when e.eligible_qty<r.minimum_quantity then 'MINIMUM_QUANTITY' when e.eligible_subtotal<r.minimum_spend_cop then 'MINIMUM_SPEND' else 'LIMIT_OR_SCHEDULE' end,
    e.gross::integer,case when e.ok then public.calculate_promotion_discount(r,e.eligible_qty,e.eligible_subtotal) else 0 end,p.campaign_id,p.activation_id
  from evaluated e join public.promotions p on p.id=e.promotion_id join public.promotion_rules r on r.id=e.rule_id
  order by e.ok desc,r.priority,p.starts_at;
$$;

create or replace function public.reserve_promotion_redemption(target_promotion uuid,target_venue uuid,cart jsonb,idempotency text,at_time timestamptz default now())
returns public.promotion_redemptions language plpgsql security definer set search_path='' as $$
declare choice record; result public.promotion_redemptions; selected_rule public.promotion_rules; committed_discount bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(idempotency),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  select pr.* into selected_rule from public.promotion_rules pr where pr.promotion_id=target_promotion for update;
  if not found then raise exception 'PROMOTION_RULE_NOT_FOUND'; end if;
  select * into choice from public.evaluate_promotions(target_venue,cart,at_time) e where e.promotion_id=target_promotion and e.eligible and e.discount_amount_cop>0;
  if not found then raise exception 'PROMOTION_NOT_ELIGIBLE'; end if;
  select coalesce(sum(pr.discount_amount_cop),0) into committed_discount from public.promotion_redemptions pr
  where pr.promotion_id=target_promotion and pr.status in('reserved','applied','redeemed') and (pr.status<>'reserved' or pr.expires_at>at_time);
  if selected_rule.budget_cop is not null and committed_discount+choice.discount_amount_cop>selected_rule.budget_cop then raise exception 'PROMOTION_BUDGET_EXHAUSTED'; end if;
  insert into public.promotion_redemptions(promotion_id,rule_id,user_id,venue_id,campaign_id,activation_id,idempotency_key,gross_amount_cop,discount_amount_cop,cart_snapshot,eligibility_snapshot,reserved_at,expires_at)
  values(choice.promotion_id,choice.rule_id,auth.uid(),target_venue,choice.campaign_id,choice.activation_id,idempotency,choice.gross_amount_cop,choice.discount_amount_cop,cart,jsonb_build_object('evaluatedAt',at_time,'reason',choice.reason),at_time,at_time+interval '15 minutes')
  on conflict(user_id,idempotency_key) do update set updated_at=now()
  returning * into result;
  return result;
end;$$;

alter table public.brand_product_venue_items enable row level security;
alter table public.promotion_rules enable row level security;
alter table public.promotion_rule_items enable row level security;
alter table public.promotion_redemptions enable row level security;

create policy "mapping participants read" on public.brand_product_venue_items for select to authenticated using(
  public.can_manage_venue((select i.venue_id from public.venue_menu_items i where i.id=venue_menu_item_id)) or public.can_manage_brand((select p.brand_id from public.brand_products p where p.id=brand_product_id))
);
create policy "mapping participants manage" on public.brand_product_venue_items for all to authenticated using(
  public.can_manage_venue((select i.venue_id from public.venue_menu_items i where i.id=venue_menu_item_id)) or public.can_manage_brand((select p.brand_id from public.brand_products p where p.id=brand_product_id))
) with check(
  public.can_manage_venue((select i.venue_id from public.venue_menu_items i where i.id=venue_menu_item_id)) or public.can_manage_brand((select p.brand_id from public.brand_products p where p.id=brand_product_id))
);
create policy "active promotion rules read" on public.promotion_rules for select using(active and exists(select 1 from public.promotions p where p.id=promotion_id and p.active and now() between p.starts_at and p.ends_at) or public.is_platform_owner());
create policy "promotion rules manage" on public.promotion_rules for all to authenticated using(exists(select 1 from public.promotions p where p.id=promotion_id and (public.is_platform_owner() or (p.venue_id is not null and public.can_manage_venue(p.venue_id))))) with check(exists(select 1 from public.promotions p where p.id=promotion_id and (public.is_platform_owner() or (p.venue_id is not null and public.can_manage_venue(p.venue_id)))));
create policy "active promotion rule items read" on public.promotion_rule_items for select using(exists(select 1 from public.promotion_rules r join public.promotions p on p.id=r.promotion_id where r.id=rule_id and r.active and p.active and now() between p.starts_at and p.ends_at));
create policy "promotion rule items manage" on public.promotion_rule_items for all to authenticated using(exists(select 1 from public.promotion_rules r join public.promotions p on p.id=r.promotion_id where r.id=rule_id and (public.is_platform_owner() or (p.venue_id is not null and public.can_manage_venue(p.venue_id))))) with check(exists(select 1 from public.promotion_rules r join public.promotions p on p.id=r.promotion_id where r.id=rule_id and (public.is_platform_owner() or (p.venue_id is not null and public.can_manage_venue(p.venue_id)))));
create policy "redemption participants read" on public.promotion_redemptions for select to authenticated using(user_id=auth.uid() or public.can_manage_venue(venue_id) or public.is_platform_owner());

create or replace function public.promotion_configuration_catalog(target_venue uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_manage_venue(target_venue) and not public.is_platform_owner() then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'brandProducts',coalesce((select jsonb_agg(jsonb_build_object('id',bp.id,'sku',bp.sku,'name',bp.name,'brandId',b.id,'brandName',b.name) order by b.name,bp.name) from public.brand_products bp join public.brands b on b.id=bp.brand_id where bp.active and b.active),'[]'::jsonb),
    'activations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'campaignId',c.id,'campaignName',c.name,'brandName',b.name) order by c.name,a.name) from public.brand_activations a join public.brand_campaigns c on c.id=a.campaign_id join public.brands b on b.id=c.brand_id where a.venue_id=target_venue and a.status not in('rejected','cancelled')),'[]'::jsonb),
    'mappings',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'brandProductId',m.brand_product_id,'menuItemId',m.venue_menu_item_id,'brandQuantity',m.brand_quantity,'brandUnit',m.brand_unit,'verified',m.verified,'active',m.active)) from public.brand_product_venue_items m join public.venue_menu_items i on i.id=m.venue_menu_item_id where i.venue_id=target_venue),'[]'::jsonb)
  ) into result;
  return result;
end;$$;

grant select,insert,update,delete on public.brand_product_venue_items,public.promotion_rules,public.promotion_rule_items to authenticated;
grant select on public.promotion_rules,public.promotion_rule_items to anon;
grant select on public.promotion_redemptions to authenticated;
grant execute on function public.evaluate_promotions(uuid,jsonb,timestamptz) to anon,authenticated;
grant execute on function public.reserve_promotion_redemption(uuid,uuid,jsonb,text,timestamptz) to authenticated;
grant execute on function public.promotion_configuration_catalog(uuid) to authenticated;
notify pgrst,'reload schema';
