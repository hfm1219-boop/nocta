-- Cierre Fase 1: aprobación bilateral, configuración atómica y promociones de evento.

alter table public.brand_product_venue_items
  add column brand_approved boolean not null default false,
  add column venue_approved boolean not null default false;

update public.brand_product_venue_items
set venue_approved=verified,brand_approved=verified;

create or replace function public.sync_mapping_verification()
returns trigger language plpgsql set search_path='' as $$
begin new.verified:=new.brand_approved and new.venue_approved;new.updated_at:=now();return new;end;$$;
create trigger mapping_verification_guard before insert or update on public.brand_product_venue_items for each row execute function public.sync_mapping_verification();

drop policy if exists "mapping participants manage" on public.brand_product_venue_items;
revoke insert,update,delete on public.brand_product_venue_items from authenticated;

create or replace function public.propose_product_mapping(target_brand_product uuid,target_menu_item uuid,quantity numeric,unit text)
returns public.brand_product_venue_items language plpgsql security definer set search_path='' as $$
declare target_brand uuid;target_venue uuid;brand_actor boolean;venue_actor boolean;platform_actor boolean;current_row public.brand_product_venue_items;result public.brand_product_venue_items;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  if quantity<=0 or unit not in('unit','ml','g','serving') then raise exception 'INVALID_MAPPING';end if;
  select bp.brand_id into target_brand from public.brand_products bp where bp.id=target_brand_product and bp.active;
  select mi.venue_id into target_venue from public.venue_menu_items mi where mi.id=target_menu_item;
  if target_brand is null or target_venue is null then raise exception 'MAPPING_TARGET_NOT_FOUND';end if;
  platform_actor:=public.is_platform_owner();brand_actor:=platform_actor or public.can_manage_brand(target_brand);venue_actor:=platform_actor or public.can_manage_venue(target_venue);
  if not brand_actor and not venue_actor then raise exception 'FORBIDDEN';end if;
  select * into current_row from public.brand_product_venue_items where brand_product_id=target_brand_product and venue_menu_item_id=target_menu_item for update;
  insert into public.brand_product_venue_items(brand_product_id,venue_menu_item_id,brand_quantity,brand_unit,brand_approved,venue_approved,created_by)
  values(target_brand_product,target_menu_item,quantity,unit,brand_actor,venue_actor,auth.uid())
  on conflict(brand_product_id,venue_menu_item_id) do update set
    brand_quantity=excluded.brand_quantity,brand_unit=excluded.brand_unit,active=true,
    brand_approved=case when platform_actor then true when brand_actor then true when public.brand_product_venue_items.brand_quantity is distinct from excluded.brand_quantity or public.brand_product_venue_items.brand_unit is distinct from excluded.brand_unit then false else public.brand_product_venue_items.brand_approved end,
    venue_approved=case when platform_actor then true when venue_actor then true when public.brand_product_venue_items.brand_quantity is distinct from excluded.brand_quantity or public.brand_product_venue_items.brand_unit is distinct from excluded.brand_unit then false else public.brand_product_venue_items.venue_approved end,
    updated_at=now()
  returning * into result;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'product.mapping.proposed','brand_product_venue_item',result.id,jsonb_build_object('brandApproved',result.brand_approved,'venueApproved',result.venue_approved));
  return result;
end;$$;

create or replace function public.configure_promotion_rule(target_promotion uuid,target_menu_item uuid,target_brand_product uuid,target_activation uuid,configuration jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare promo public.promotions;menu_venue uuid;created_rule_id uuid;mechanic_value public.promotion_mechanic;start_time time;end_time time;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
  select * into promo from public.promotions where id=target_promotion for update;
  if not found then raise exception 'PROMOTION_NOT_FOUND';end if;
  if not(public.is_platform_owner() or (promo.venue_id is not null and public.can_manage_venue(promo.venue_id)) or (promo.event_id is not null and public.can_manage_event(promo.event_id))) then raise exception 'FORBIDDEN';end if;
  select venue_id into menu_venue from public.venue_menu_items where id=target_menu_item;
  if menu_venue is null then raise exception 'MENU_ITEM_NOT_FOUND';end if;
  if promo.venue_id is not null and promo.venue_id<>menu_venue then raise exception 'PROMOTION_MENU_VENUE_MISMATCH';end if;
  if promo.venue_id is null and not exists(select 1 from public.event_venue_collaborations c where c.event_id=promo.event_id and c.venue_id=menu_venue and c.status='approved') then raise exception 'EVENT_VENUE_NOT_APPROVED';end if;
  mechanic_value:=(configuration->>'mechanic')::public.promotion_mechanic;
  start_time:=nullif(configuration->>'timeStart','')::time;end_time:=nullif(configuration->>'timeEnd','')::time;
  if (start_time is null)<>(end_time is null) then raise exception 'INCOMPLETE_SCHEDULE';end if;
  if target_activation is not null then update public.promotions set activation_id=target_activation,updated_at=now() where id=target_promotion;end if;
  insert into public.promotion_rules(promotion_id,mechanic,percentage_off,fixed_amount_cop,buy_quantity,get_quantity,fixed_price_cop,minimum_quantity,minimum_spend_cop,maximum_discount_cop,per_user_limit,total_redemption_limit,budget_cop,local_time_start,local_time_end,weekdays,priority,stackable,active,updated_at)
  values(target_promotion,mechanic_value,
    case when mechanic_value='percentage' then (configuration->>'benefit')::numeric end,
    case when mechanic_value='fixed_amount' then (configuration->>'benefit')::integer end,
    case when mechanic_value='buy_x_get_y' then (configuration->>'buyQuantity')::integer end,
    case when mechanic_value='buy_x_get_y' then (configuration->>'getQuantity')::integer end,
    case when mechanic_value='fixed_price' then (configuration->>'benefit')::integer end,
    greatest(1,coalesce((configuration->>'minimumQuantity')::integer,1)),greatest(0,coalesce((configuration->>'minimumSpendCop')::integer,0)),nullif(configuration->>'maximumDiscountCop','')::integer,nullif(configuration->>'perUserLimit','')::integer,nullif(configuration->>'totalLimit','')::integer,nullif(configuration->>'budgetCop','')::bigint,start_time,end_time,coalesce((select array_agg(value::smallint) from jsonb_array_elements_text(configuration->'weekdays')),array[0,1,2,3,4,5,6]::smallint[]),coalesce((configuration->>'priority')::integer,100),coalesce((configuration->>'stackable')::boolean,false),true,now())
  on conflict(promotion_id) do update set mechanic=excluded.mechanic,percentage_off=excluded.percentage_off,fixed_amount_cop=excluded.fixed_amount_cop,buy_quantity=excluded.buy_quantity,get_quantity=excluded.get_quantity,fixed_price_cop=excluded.fixed_price_cop,minimum_quantity=excluded.minimum_quantity,minimum_spend_cop=excluded.minimum_spend_cop,maximum_discount_cop=excluded.maximum_discount_cop,per_user_limit=excluded.per_user_limit,total_redemption_limit=excluded.total_redemption_limit,budget_cop=excluded.budget_cop,local_time_start=excluded.local_time_start,local_time_end=excluded.local_time_end,weekdays=excluded.weekdays,priority=excluded.priority,stackable=excluded.stackable,active=true,updated_at=now()
  returning id into created_rule_id;
  delete from public.promotion_rule_items pri where pri.rule_id=created_rule_id;
  insert into public.promotion_rule_items(rule_id,venue_menu_item_id,brand_product_id,role,minimum_quantity) values(created_rule_id,target_menu_item,target_brand_product,'qualifying',greatest(1,coalesce((configuration->>'minimumQuantity')::integer,1)));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'promotion.rule.configured','promotion',target_promotion,jsonb_build_object('ruleId',created_rule_id,'menuItemId',target_menu_item));
  return created_rule_id;
end;$$;

drop function if exists public.evaluate_promotions(uuid,jsonb,timestamptz);
create or replace function public.evaluate_promotions(target_venue uuid,cart jsonb,at_time timestamptz,target_event uuid)
returns table(promotion_id uuid,rule_id uuid,title text,mechanic text,eligible boolean,reason text,gross_amount_cop integer,discount_amount_cop integer,campaign_id uuid,activation_id uuid)
language sql stable security definer set search_path='' as $$
  with normalized as(
    select i.id menu_item_id,(x->>'quantity')::integer quantity,i.price_cop unit_price from jsonb_array_elements(cart)x
    join public.venue_menu_items i on i.id=(x->>'menuItemId')::uuid and i.venue_id=target_venue and i.available where (x->>'quantity')::integer>0
  ),candidates as(
    select p.id promotion_id,r.id rule_id,coalesce(sum(n.quantity)filter(where pri.rule_id is not null),0)::integer eligible_qty,coalesce(sum(n.quantity*n.unit_price)filter(where pri.rule_id is not null),0)::bigint eligible_subtotal,coalesce(sum(n.quantity*n.unit_price),0)::bigint gross,(at_time at time zone r.timezone)local_at
    from public.promotions p join public.promotion_rules r on r.promotion_id=p.id cross join normalized n left join public.promotion_rule_items pri on pri.rule_id=r.id and pri.venue_menu_item_id=n.menu_item_id and pri.role='qualifying'
    where (p.venue_id=target_venue or(p.event_id=target_event and(target_event is not null)and exists(select 1 from public.event_venue_collaborations c where c.event_id=target_event and c.venue_id=target_venue and c.status='approved')))and p.active and r.active and at_time between p.starts_at and p.ends_at group by p.id,r.id,r.timezone
  ),evaluated as(
    select c.*,c.eligible_qty>=r.minimum_quantity and c.eligible_subtotal>=r.minimum_spend_cop and extract(dow from c.local_at)::smallint=any(r.weekdays)and(r.local_time_start is null or c.local_at::time between r.local_time_start and r.local_time_end)and r.customer_segment='{}'::jsonb
      and(r.total_redemption_limit is null or(select count(*)from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.status in('reserved','applied','redeemed')and(pr.status<>'reserved'or pr.expires_at>at_time))<r.total_redemption_limit)
      and(r.budget_cop is null or coalesce((select sum(pr.discount_amount_cop)from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.status in('reserved','applied','redeemed')and(pr.status<>'reserved'or pr.expires_at>at_time)),0)<r.budget_cop)
      and(r.per_user_limit is null or auth.uid()is null or(select count(*)from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.user_id=auth.uid()and pr.status in('reserved','applied','redeemed')and(pr.status<>'reserved'or pr.expires_at>at_time))<r.per_user_limit)ok
    from candidates c join public.promotions p on p.id=c.promotion_id join public.promotion_rules r on r.id=c.rule_id)
  select p.id,r.id,p.title,r.mechanic::text,e.ok,case when e.ok then'ELIGIBLE'when r.customer_segment<>'{}'::jsonb then'SEGMENT_REQUIRES_PROFILE'when e.eligible_qty<r.minimum_quantity then'MINIMUM_QUANTITY'when e.eligible_subtotal<r.minimum_spend_cop then'MINIMUM_SPEND'else'LIMIT_OR_SCHEDULE'end,e.gross::integer,case when e.ok then public.calculate_promotion_discount(r,e.eligible_qty,e.eligible_subtotal)else 0 end,p.campaign_id,p.activation_id
  from evaluated e join public.promotions p on p.id=e.promotion_id join public.promotion_rules r on r.id=e.rule_id order by e.ok desc,r.priority,p.starts_at;
$$;

create or replace function public.evaluate_promotions(target_venue uuid,cart jsonb,at_time timestamptz)
returns table(promotion_id uuid,rule_id uuid,title text,mechanic text,eligible boolean,reason text,gross_amount_cop integer,discount_amount_cop integer,campaign_id uuid,activation_id uuid)
language sql stable security definer set search_path='' as $$select * from public.evaluate_promotions(target_venue,cart,at_time,null);$$;

create or replace function public.promotion_configuration_catalog(target_venue uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_manage_venue(target_venue) and not public.is_platform_owner() then raise exception 'FORBIDDEN';end if;
  select jsonb_build_object(
    'brandProducts',coalesce((select jsonb_agg(jsonb_build_object('id',bp.id,'sku',bp.sku,'name',bp.name,'brandId',b.id,'brandName',b.name)order by b.name,bp.name)from public.brand_products bp join public.brands b on b.id=bp.brand_id where bp.active and b.active),'[]'::jsonb),
    'activations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'campaignId',c.id,'campaignName',c.name,'brandName',b.name)order by c.name,a.name)from public.brand_activations a join public.brand_campaigns c on c.id=a.campaign_id join public.brands b on b.id=c.brand_id where a.venue_id=target_venue and a.status not in('rejected','cancelled')),'[]'::jsonb),
    'mappings',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'brandProductId',m.brand_product_id,'menuItemId',m.venue_menu_item_id,'brandQuantity',m.brand_quantity,'brandUnit',m.brand_unit,'verified',m.verified,'brandApproved',m.brand_approved,'venueApproved',m.venue_approved,'active',m.active))from public.brand_product_venue_items m join public.venue_menu_items i on i.id=m.venue_menu_item_id where i.venue_id=target_venue),'[]'::jsonb)
  )into result;return result;
end;$$;

create or replace function public.require_verified_rule_mapping()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.brand_product_id is not null and not exists(select 1 from public.brand_product_venue_items m where m.brand_product_id=new.brand_product_id and m.venue_menu_item_id=new.venue_menu_item_id and m.active and m.verified)then raise exception 'VERIFIED_PRODUCT_MAPPING_REQUIRED';end if;
  return new;
end;$$;
create trigger promotion_rule_mapping_guard before insert or update on public.promotion_rule_items for each row execute function public.require_verified_rule_mapping();

grant execute on function public.propose_product_mapping(uuid,uuid,numeric,text),public.configure_promotion_rule(uuid,uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.evaluate_promotions(uuid,jsonb,timestamptz,uuid) to anon,authenticated;
grant execute on function public.evaluate_promotions(uuid,jsonb,timestamptz) to anon,authenticated;
notify pgrst,'reload schema';
