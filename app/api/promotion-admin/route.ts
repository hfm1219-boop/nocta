import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

async function context() {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase no configurado" }, { status: 503 }) };
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const { data: access } = await supabase.rpc("get_my_access_context");
  const active = access?.activeContext as { organizationId?: string; role?: string } | undefined;
  if (active?.role !== "establishment" || !active.organizationId) return { error: NextResponse.json({ error: "Selecciona un contexto de establecimiento" }, { status: 403 }) };
  return { supabase, organizationId: active.organizationId, userId: claims.claims.sub };
}

async function allowedVenue(supabase: NonNullable<Awaited<ReturnType<typeof crearClienteSupabaseServidor>>>, organizationId: string, venueId: unknown) {
  if (typeof venueId !== "string") return false;
  const { data } = await supabase.from("venues").select("id").eq("id", venueId).eq("organization_id", organizationId).maybeSingle();
  return Boolean(data);
}

export async function GET(request: NextRequest) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const venueId = request.nextUrl.searchParams.get("venueId");
  if (!await allowedVenue(ctx.supabase!, ctx.organizationId!, venueId)) return NextResponse.json({ error: "Establecimiento no autorizado" }, { status: 403 });
  const [catalog, promotions, menu] = await Promise.all([
    ctx.supabase!.rpc("promotion_configuration_catalog", { target_venue: venueId }),
    ctx.supabase!.from("promotions").select("id,title,campaign_id,activation_id,promotion_rules(id,mechanic,percentage_off,fixed_amount_cop,buy_quantity,get_quantity,fixed_price_cop,minimum_quantity,minimum_spend_cop,maximum_discount_cop,per_user_limit,total_redemption_limit,budget_cop,local_time_start,local_time_end,weekdays,priority,stackable,active,promotion_rule_items(venue_menu_item_id,brand_product_id,role,minimum_quantity))").eq("venue_id", venueId).order("starts_at", { ascending: false }),
    ctx.supabase!.from("venue_menu_items").select("id,name,sku,price_cop,available").eq("venue_id", venueId).order("name"),
  ]);
  const error = catalog.error ?? promotions.error ?? menu.error;
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ...(catalog.data as object), promotions: promotions.data ?? [], menuItems: menu.data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const body = await request.json() as Record<string, unknown>;
  if (!await allowedVenue(ctx.supabase!, ctx.organizationId!, body.venueId)) return NextResponse.json({ error: "Establecimiento no autorizado" }, { status: 403 });

  if (body.action === "mapping") {
    const { error } = await ctx.supabase!.rpc("propose_product_mapping", { target_brand_product: body.brandProductId, target_menu_item: body.menuItemId, quantity: Number(body.brandQuantity), unit: body.brandUnit });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true }, { status: 201 });
  }

  if (body.action === "rule") {
    const promotion = await ctx.supabase!.from("promotions").select("id").eq("id", body.promotionId).eq("venue_id", body.venueId).maybeSingle();
    if (!promotion.data) return NextResponse.json({ error: "Promoción no autorizada" }, { status: 403 });
    const configuration = { mechanic: body.mechanic, benefit: body.benefit, buyQuantity: body.buyQuantity, getQuantity: body.getQuantity, minimumQuantity: body.minimumQuantity, minimumSpendCop: body.minimumSpendCop, maximumDiscountCop: body.maximumDiscountCop || "", perUserLimit: body.perUserLimit || "", totalLimit: body.totalLimit || "", budgetCop: body.budgetCop || "", timeStart: body.timeStart || "", timeEnd: body.timeEnd || "", weekdays: body.weekdays ?? [0,1,2,3,4,5,6], priority: body.priority ?? 100, stackable: body.stackable ?? false };
    const { error } = await ctx.supabase!.rpc("configure_promotion_rule", { target_promotion: body.promotionId, target_menu_item: body.menuItemId, target_brand_product: body.brandProductId || null, target_activation: body.activationId || null, configuration });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
