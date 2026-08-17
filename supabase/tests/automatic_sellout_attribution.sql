begin;
do $$
declare
  venue_id uuid;organization_id uuid;user_id uuid;brand_id uuid;product_id uuid;
  campaign_id uuid;target_activation_id uuid;menu_item_id uuid;promotion_id uuid;rule_id uuid;
  checked record;attribution record;performance record;sku_performance record;activation_metrics record;
begin
  if pg_catalog.has_table_privilege('authenticated','public.brand_activations','UPDATE') then raise exception 'MANUAL_ACTIVATION_METRICS_STILL_WRITABLE';end if;
  if pg_catalog.has_function_privilege('authenticated','public.reserve_promotion_redemption(uuid,uuid,jsonb,text,timestamptz)','EXECUTE') then raise exception 'ORPHAN_PROMOTION_RESERVATION_STILL_ALLOWED';end if;
  if not pg_catalog.has_function_privilege('authenticated','public.update_activation_execution(uuid,text,bigint,integer)','EXECUTE') then raise exception 'ACTIVATION_EXECUTION_RPC_NOT_GRANTED';end if;
  select v.id,v.organization_id into venue_id,organization_id from public.venues v where v.active limit 1;
  select p.id into user_id from public.profiles p limit 1;
  if venue_id is null or organization_id is null or user_id is null then raise exception 'FIXTURE_BASE_MISSING';end if;
  perform set_config('request.jwt.claim.sub',user_id::text,true);

  insert into public.brands(organization_id,name)values(organization_id,'__phase3_brand__')returning id into brand_id;
  insert into public.brand_products(brand_id,sku,name)values(brand_id,'__PHASE3_SKU__','__phase3_product__')returning id into product_id;
  insert into public.brand_campaigns(organization_id,brand_id,name,starts_at,ends_at,budget_cop,status,created_by)
  values(organization_id,brand_id,'__phase3_campaign__',now()-interval '1 day',now()+interval '1 day',1000000,'active',user_id)returning id into campaign_id;
  insert into public.brand_activations(campaign_id,venue_id,name,activation_type,status,created_by)
  values(campaign_id,venue_id,'__phase3_activation__','promotion','active',user_id)returning id into target_activation_id;
  insert into public.venue_menu_items(venue_id,name,price_cop,available)
  values(venue_id,'__phase3_menu_item__',40000,true)returning id into menu_item_id;
  insert into public.brand_product_venue_items(
    brand_product_id,venue_menu_item_id,brand_quantity,brand_unit,brand_approved,venue_approved,created_by
  )values(product_id,menu_item_id,50,'ml',true,true,user_id);
  insert into public.promotions(venue_id,campaign_id,activation_id,title,description,terms,starts_at,ends_at,created_by)
  values(venue_id,campaign_id,target_activation_id,'__phase3_promotion__','','',now()-interval '1 hour',now()+interval '1 hour',user_id)
  returning id into promotion_id;
  insert into public.promotion_rules(promotion_id,mechanic,percentage_off,minimum_quantity,budget_cop)
  values(promotion_id,'percentage',50,2,100000)returning id into rule_id;
  insert into public.promotion_rule_items(rule_id,venue_menu_item_id,brand_product_id)
  values(rule_id,menu_item_id,product_id);

  select * into checked from public.checkout_order_with_promotion(
    (select external_key from public.venues where id=venue_id),'__phase3_order__','bar',null,
    jsonb_build_array(jsonb_build_object('menuItemId',menu_item_id,'quantity',2)),0,
    'digital','pending',null,'1234',promotion_id,'__phase3_redemption__',null
  );
  select * into attribution from public.activation_sellout_attributions where order_id=checked.order_id;
  if attribution.status<>'pending'or attribution.menu_units<>2 or attribution.brand_quantity<>100
    or attribution.gross_sellout_cop<>80000 or attribution.discount_cop<>40000 or attribution.net_sellout_cop<>40000 then
    raise exception 'PENDING_ATTRIBUTION_MISMATCH: %',row_to_json(attribution);end if;

  update public.orders set payment_status='paid',paid_at=now(),status='delivered' where id=checked.order_id;
  select * into attribution from public.activation_sellout_attributions where order_id=checked.order_id;
  if attribution.status<>'confirmed'or attribution.confirmed_at is null then raise exception 'ATTRIBUTION_NOT_CONFIRMED';end if;
  select redemptions,units_sold,revenue_cop into activation_metrics from public.brand_activations where id=target_activation_id;
  if activation_metrics.redemptions<>1 or activation_metrics.units_sold<>2 or activation_metrics.revenue_cop<>40000 then
    raise exception 'ACTIVATION_METRICS_MISMATCH: %',row_to_json(activation_metrics);end if;
  select * into performance from public.brand_activation_performance p where p.activation_id=target_activation_id;
  if performance.orders_influenced<>1 or performance.gross_sellout_cop<>80000 or performance.discount_cop<>40000
    or performance.net_sellout_cop<>40000 then raise exception 'PERFORMANCE_VIEW_MISMATCH: %',row_to_json(performance);end if;
  select * into sku_performance from public.brand_activation_sku_performance p where p.activation_id=target_activation_id;
  if sku_performance.sku<>'__PHASE3_SKU__'or sku_performance.menu_units_sold<>2
    or sku_performance.brand_quantity_sold<>100 or sku_performance.net_sellout_cop<>40000 then
    raise exception 'SKU_PERFORMANCE_MISMATCH: %',row_to_json(sku_performance);end if;

  update public.orders set status='cancelled' where id=checked.order_id;
  if(select status from public.activation_sellout_attributions where order_id=checked.order_id)<>'reversed' then raise exception 'ATTRIBUTION_NOT_REVERSED';end if;
  if(select revenue_cop from public.brand_activations where id=target_activation_id)<>0 then raise exception 'REVERSED_REVENUE_NOT_ZERO';end if;
end$$;
rollback;
