-- Ninguna regla puede atribuir sell-out a un SKU sin aprobación bilateral.
create or replace function public.require_verified_rule_mapping()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.brand_product_id is not null and not exists(select 1 from public.brand_product_venue_items m where m.brand_product_id=new.brand_product_id and m.venue_menu_item_id=new.venue_menu_item_id and m.active and m.verified)then raise exception 'VERIFIED_PRODUCT_MAPPING_REQUIRED';end if;
  return new;
end;$$;
drop trigger if exists promotion_rule_mapping_guard on public.promotion_rule_items;
create trigger promotion_rule_mapping_guard before insert or update on public.promotion_rule_items for each row execute function public.require_verified_rule_mapping();
insert into supabase_migrations.schema_migrations(version,name,statements)values('202608160041','verified_mapping_attribution',array[]::text[])on conflict(version)do update set name=excluded.name;
notify pgrst,'reload schema';
