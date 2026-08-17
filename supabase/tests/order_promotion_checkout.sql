begin;
do $$
declare
  venue_id uuid;user_id uuid;menu_item_id uuid;promotion_id uuid;rule_id uuid;
  checked record;checked_again record;redemption_status text;economic record;
  line_gross integer;line_discount integer;line_net integer;line_count integer;
begin
  select id into venue_id from public.venues where active limit 1;
  select id into user_id from public.profiles limit 1;
  if venue_id is null or user_id is null then raise exception 'FIXTURE_BASE_MISSING';end if;
  perform set_config('request.jwt.claim.sub',user_id::text,true);

  insert into public.venue_menu_items(venue_id,name,price_cop,available)
  values(venue_id,'__phase2_checkout_item__',38000,true)returning id into menu_item_id;
  insert into public.promotions(venue_id,title,description,terms,starts_at,ends_at,created_by)
  values(venue_id,'__phase2_checkout_promotion__','','',now()-interval '1 hour',now()+interval '1 hour',user_id)
  returning id into promotion_id;
  insert into public.promotion_rules(promotion_id,mechanic,percentage_off,minimum_quantity,budget_cop)
  values(promotion_id,'percentage',50,2,100000)returning id into rule_id;
  insert into public.promotion_rule_items(rule_id,venue_menu_item_id)values(rule_id,menu_item_id);

  select * into checked from public.checkout_order_with_promotion(
    (select external_key from public.venues where id=venue_id),'__phase2_order__','bar',null,
    jsonb_build_array(jsonb_build_object('menuItemId',menu_item_id,'quantity',2)),5000,
    'digital','pending',null,'1234',promotion_id,'__phase2_redemption__',null
  );
  if checked.gross_amount_cop<>76000 or checked.discount_amount_cop<>38000 or checked.total_amount_cop<>43000 then
    raise exception 'CHECKOUT_TOTALS_MISMATCH: %',row_to_json(checked);end if;

  select count(*),sum(gross_amount_cop),sum(discount_amount_cop),sum(net_amount_cop)
  into line_count,line_gross,line_discount,line_net from public.order_items where order_id=checked.order_id;
  if line_count<>1 or line_gross<>76000 or line_discount<>38000 or line_net<>38000 then
    raise exception 'ORDER_ITEMS_MISMATCH';end if;

  select * into checked_again from public.checkout_order_with_promotion(
    (select external_key from public.venues where id=venue_id),'__phase2_order__','bar',null,
    jsonb_build_array(jsonb_build_object('menuItemId',menu_item_id,'quantity',2)),5000,
    'digital','pending',null,'1234',promotion_id,'__phase2_redemption__',null
  );
  if checked_again.order_id<>checked.order_id then raise exception 'CHECKOUT_NOT_IDEMPOTENT';end if;

  select status into redemption_status from public.promotion_redemptions where id=checked.redemption_id;
  if redemption_status<>'applied' then raise exception 'REDEMPTION_NOT_APPLIED';end if;
  select gross_amount,discount_amount,net_amount,status into economic
  from public.economic_transactions where source_table='orders'and source_id=checked.order_id;
  if economic.gross_amount<>81000 or economic.discount_amount<>38000 or economic.net_amount<>43000 or economic.status<>'pending' then
    raise exception 'ECONOMIC_TRANSACTION_MISMATCH: %',row_to_json(economic);end if;

  update public.orders set payment_status='paid',paid_at=now(),status='delivered' where id=checked.order_id;
  select status into redemption_status from public.promotion_redemptions where id=checked.redemption_id;
  if redemption_status<>'redeemed' then raise exception 'REDEMPTION_NOT_REDEEMED';end if;
  if(select status from public.economic_transactions where source_table='orders'and source_id=checked.order_id)<>'completed' then
    raise exception 'ECONOMIC_TRANSACTION_NOT_COMPLETED';end if;
end$$;
rollback;
