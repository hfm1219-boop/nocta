begin;
do $$
declare v uuid;u uuid;i uuid;p uuid;r uuid;discount integer;e uuid;event_promo uuid;event_rule uuid;bp uuid;guarded boolean:=false;
begin
  select id into v from public.venues where active limit 1;select id into u from public.profiles limit 1;
  if v is null or u is null then raise exception 'FIXTURE_BASE_MISSING';end if;
  insert into public.venue_menu_items(venue_id,name,price_cop,available)values(v,'__promotion_test_item__',20000,true)returning id into i;
  insert into public.promotions(venue_id,title,description,terms,starts_at,ends_at,created_by)values(v,'__promotion_test__','','',now()-interval'1 hour',now()+interval'1 hour',u)returning id into p;
  insert into public.promotion_rules(promotion_id,mechanic,percentage_off,minimum_quantity,per_user_limit,budget_cop)values(p,'percentage',50,2,1,20000)returning id into r;
  insert into public.promotion_rule_items(rule_id,venue_menu_item_id)values(r,i);
  select discount_amount_cop into discount from public.evaluate_promotions(v,jsonb_build_array(jsonb_build_object('menuItemId',i,'quantity',2)),now())where promotion_id=p and eligible;
  if discount<>20000 then raise exception 'EXPECTED_20000_GOT_%',discount;end if;
  if exists(select 1 from public.evaluate_promotions(v,jsonb_build_array(jsonb_build_object('menuItemId',i,'quantity',1)),now())where promotion_id=p and eligible)then raise exception 'MINIMUM_QUANTITY_NOT_ENFORCED';end if;
  select id into bp from public.brand_products where active limit 1;
  if bp is not null then
    begin update public.promotion_rule_items set brand_product_id=bp where rule_id=r;exception when others then guarded:=sqlerrm like '%VERIFIED_PRODUCT_MAPPING_REQUIRED%';end;
    if not guarded then raise exception 'UNVERIFIED_MAPPING_WAS_ACCEPTED';end if;
  end if;
  select c.event_id into e from public.event_venue_collaborations c where c.venue_id=v and c.status='approved' limit 1;
  if e is not null then
    insert into public.promotions(event_id,title,description,terms,starts_at,ends_at,created_by)values(e,'__event_promotion_test__','','',now()-interval'1 hour',now()+interval'1 hour',u)returning id into event_promo;
    insert into public.promotion_rules(promotion_id,mechanic,fixed_amount_cop)values(event_promo,'fixed_amount',5000)returning id into event_rule;
    insert into public.promotion_rule_items(rule_id,venue_menu_item_id)values(event_rule,i);
    select discount_amount_cop into discount from public.evaluate_promotions(v,jsonb_build_array(jsonb_build_object('menuItemId',i,'quantity',1)),now(),e)where promotion_id=event_promo and eligible;
    if discount<>5000 then raise exception 'EVENT_PROMOTION_EXPECTED_5000_GOT_%',discount;end if;
  end if;
end$$;
rollback;
