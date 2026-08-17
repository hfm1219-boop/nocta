-- Elimina la ambigüedad entre la firma compatible y la firma con evento.
drop function if exists public.evaluate_promotions(uuid,jsonb,timestamptz);
drop function if exists public.evaluate_promotions(uuid,jsonb,timestamptz,uuid);
create or replace function public.evaluate_promotions(target_venue uuid,cart jsonb,at_time timestamptz,target_event uuid)
returns table(promotion_id uuid,rule_id uuid,title text,mechanic text,eligible boolean,reason text,gross_amount_cop integer,discount_amount_cop integer,campaign_id uuid,activation_id uuid)
language sql stable security definer set search_path='' as $$
  with normalized as(
    select i.id menu_item_id,(x->>'quantity')::integer quantity,i.price_cop unit_price from jsonb_array_elements(cart)x
    join public.venue_menu_items i on i.id=(x->>'menuItemId')::uuid and i.venue_id=target_venue and i.available where (x->>'quantity')::integer>0
  ),candidates as(
    select p.id promotion_id,r.id rule_id,coalesce(sum(n.quantity)filter(where pri.rule_id is not null),0)::integer eligible_qty,coalesce(sum(n.quantity*n.unit_price)filter(where pri.rule_id is not null),0)::bigint eligible_subtotal,coalesce(sum(n.quantity*n.unit_price),0)::bigint gross,(at_time at time zone r.timezone)local_at
    from public.promotions p join public.promotion_rules r on r.promotion_id=p.id cross join normalized n left join public.promotion_rule_items pri on pri.rule_id=r.id and pri.venue_menu_item_id=n.menu_item_id and pri.role='qualifying'
    where (p.venue_id=target_venue or(p.event_id=target_event and target_event is not null and exists(select 1 from public.event_venue_collaborations c where c.event_id=target_event and c.venue_id=target_venue and c.status='approved')))and p.active and r.active and at_time between p.starts_at and p.ends_at group by p.id,r.id,r.timezone
  ),evaluated as(
    select c.*,c.eligible_qty>=r.minimum_quantity and c.eligible_subtotal>=r.minimum_spend_cop and extract(dow from c.local_at)::smallint=any(r.weekdays)and(r.local_time_start is null or c.local_at::time between r.local_time_start and r.local_time_end)and r.customer_segment='{}'::jsonb
      and(r.total_redemption_limit is null or(select count(*)from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.status in('reserved','applied','redeemed')and(pr.status<>'reserved'or pr.expires_at>at_time))<r.total_redemption_limit)
      and(r.budget_cop is null or coalesce((select sum(pr.discount_amount_cop)from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.status in('reserved','applied','redeemed')and(pr.status<>'reserved'or pr.expires_at>at_time)),0)<r.budget_cop)
      and(r.per_user_limit is null or auth.uid()is null or(select count(*)from public.promotion_redemptions pr where pr.promotion_id=p.id and pr.user_id=auth.uid()and pr.status in('reserved','applied','redeemed')and(pr.status<>'reserved'or pr.expires_at>at_time))<r.per_user_limit)ok
    from candidates c join public.promotions p on p.id=c.promotion_id join public.promotion_rules r on r.id=c.rule_id)
  select p.id,r.id,p.title,r.mechanic::text,e.ok,case when e.ok then'ELIGIBLE'when r.customer_segment<>'{}'::jsonb then'SEGMENT_REQUIRES_PROFILE'when e.eligible_qty<r.minimum_quantity then'MINIMUM_QUANTITY'when e.eligible_subtotal<r.minimum_spend_cop then'MINIMUM_SPEND'else'LIMIT_OR_SCHEDULE'end,e.gross::integer,case when e.ok then public.calculate_promotion_discount(r,e.eligible_qty,e.eligible_subtotal)else 0 end,p.campaign_id,p.activation_id
  from evaluated e join public.promotions p on p.id=e.promotion_id join public.promotion_rules r on r.id=e.rule_id order by e.ok desc,r.priority,p.starts_at;
$$;
create or replace function public.evaluate_promotions(target_venue uuid,cart jsonb,at_time timestamptz default now())
returns table(promotion_id uuid,rule_id uuid,title text,mechanic text,eligible boolean,reason text,gross_amount_cop integer,discount_amount_cop integer,campaign_id uuid,activation_id uuid)
language sql stable security definer set search_path='' as $$select * from public.evaluate_promotions(target_venue,cart,at_time,null);$$;
grant execute on function public.evaluate_promotions(uuid,jsonb,timestamptz,uuid) to anon,authenticated;
grant execute on function public.evaluate_promotions(uuid,jsonb,timestamptz) to anon,authenticated;
notify pgrst,'reload schema';
