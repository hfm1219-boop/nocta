import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

async function context() {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase no configurado" }, { status: 503 }) };
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const { data, error } = await supabase.rpc("get_my_access_context");
  const access = data as { activeContext?: { organizationId?: string; role?: string } } | null;
  if (error || access?.activeContext?.role !== "brand_distributor" || !access.activeContext.organizationId) {
    return { error: NextResponse.json({ error: "Selecciona una organización con contexto Marca / Distribuidor" }, { status: 403 }) };
  }
  return { supabase, userId, organizationId: access.activeContext.organizationId };
}

type Performance = {
  activation_id: string; orders_influenced: number; redemptions: number; menu_units_sold: number;
  gross_sellout_cop: number; discount_cop: number; net_sellout_cop: number; sku_attributions: unknown[];
};
type SkuPerformance = {
  activation_id: string; brand_product_id: string; sku: string; product_name: string; brand_unit: string;
  menu_units_sold: number; brand_quantity_sold: number; gross_sellout_cop: number; discount_cop: number; net_sellout_cop: number;
};

export async function GET() {
  const c = await context();
  if (c.error) return c.error;
  const [organization, brands, campaigns, performance, skuPerformance, venues, events, team] = await Promise.all([
    c.supabase!.from("organizations").select("id,name,business_type").eq("id", c.organizationId!).single(),
    c.supabase!.from("brands").select("id,name,description,logo_url,website,active,brand_products(id,sku,name,description,category,presentation,unit_cost_cop,active)").eq("organization_id", c.organizationId!).order("name"),
    c.supabase!.from("brand_campaigns").select("id,name,objective,starts_at,ends_at,budget_cop,status,target_audience,brands(id,name),brand_activations(id,name,activation_type,status,allocated_budget_cop,actual_spend_cop,planned_reach,actual_reach,redemptions,units_sold,revenue_cop,events(id,external_key,name),venues(id,name,city))").eq("organization_id", c.organizationId!).order("created_at", { ascending: false }),
    c.supabase!.from("brand_activation_performance").select("activation_id,orders_influenced,redemptions,menu_units_sold,gross_sellout_cop,discount_cop,net_sellout_cop,sku_attributions"),
    c.supabase!.from("brand_activation_sku_performance").select("activation_id,brand_product_id,sku,product_name,brand_unit,menu_units_sold,brand_quantity_sold,gross_sellout_cop,discount_cop,net_sellout_cop"),
    c.supabase!.from("venues").select("id,name,city").eq("active", true).order("name"),
    c.supabase!.from("events").select("id,external_key,name,starts_at,status").eq("status", "published").order("starts_at"),
    c.supabase!.from("organization_memberships").select("id,user_id,status,profiles(full_name),organization_roles(context_role,role)").eq("organization_id", c.organizationId!),
  ]);
  const error = organization.error ?? brands.error ?? campaigns.error ?? performance.error ?? skuPerformance.error ?? venues.error ?? events.error ?? team.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const performanceByActivation = new Map(((performance.data ?? []) as Performance[]).map((row) => [row.activation_id, row]));
  const skuByActivation = new Map<string, SkuPerformance[]>();
  for (const row of (skuPerformance.data ?? []) as SkuPerformance[]) {
    skuByActivation.set(row.activation_id, [...(skuByActivation.get(row.activation_id) ?? []), row]);
  }
  const campaignRows = (campaigns.data ?? []).map((campaign) => ({
    ...campaign,
    brand_activations: (campaign.brand_activations ?? []).map((activation) => ({
      ...activation,
      performance: performanceByActivation.get(activation.id) ?? {
        orders_influenced: 0, redemptions: 0, menu_units_sold: 0,
        gross_sellout_cop: 0, discount_cop: 0, net_sellout_cop: 0, sku_attributions: [],
      },
      skuPerformance: skuByActivation.get(activation.id) ?? [],
    })),
  }));
  const activations = campaignRows.flatMap((row) => row.brand_activations ?? []);
  return NextResponse.json({
    organization: organization.data,
    brands: brands.data ?? [], campaigns: campaignRows, venues: venues.data ?? [], events: events.data ?? [], team: team.data ?? [],
    analytics: {
      brands: brands.data?.length ?? 0,
      products: (brands.data ?? []).reduce((sum, brand) => sum + (brand.brand_products?.length ?? 0), 0),
      campaigns: campaignRows.length,
      activeCampaigns: campaignRows.filter((row) => row.status === "active").length,
      budgetCop: campaignRows.reduce((sum, row) => sum + Number(row.budget_cop), 0),
      spendCop: activations.reduce((sum, row) => sum + Number(row.actual_spend_cop), 0),
      reach: activations.reduce((sum, row) => sum + Number(row.actual_reach), 0),
      ordersInfluenced: activations.reduce((sum, row) => sum + Number(row.performance.orders_influenced), 0),
      redemptions: activations.reduce((sum, row) => sum + Number(row.performance.redemptions), 0),
      unitsSold: activations.reduce((sum, row) => sum + Number(row.performance.menu_units_sold), 0),
      grossSelloutCop: activations.reduce((sum, row) => sum + Number(row.performance.gross_sellout_cop), 0),
      discountCop: activations.reduce((sum, row) => sum + Number(row.performance.discount_cop), 0),
      revenueCop: activations.reduce((sum, row) => sum + Number(row.performance.net_sellout_cop), 0),
    },
  });
}

export async function POST(request: NextRequest) {
  const c = await context();
  if (c.error) return c.error;
  const body = await request.json() as Record<string, unknown>;
  let result: { error: { message: string } | null };
  if (body.action === "brand" && String(body.name ?? "").trim()) {
    result = await c.supabase!.from("brands").insert({ organization_id: c.organizationId, name: String(body.name).trim(), description: String(body.description ?? "").trim(), website: String(body.website ?? "").trim() || null });
  } else if (body.action === "product" && body.brandId && body.sku && body.name) {
    result = await c.supabase!.from("brand_products").insert({ brand_id: body.brandId, sku: String(body.sku).trim(), name: String(body.name).trim(), description: String(body.description ?? "").trim(), category: String(body.category ?? "").trim() || null, presentation: String(body.presentation ?? "").trim() || null, unit_cost_cop: Math.max(0, Number(body.unitCostCop ?? 0)) });
  } else if (body.action === "campaign" && body.brandId && body.name && body.startsAt && body.endsAt) {
    result = await c.supabase!.from("brand_campaigns").insert({ organization_id: c.organizationId, brand_id: body.brandId, name: String(body.name).trim(), objective: String(body.objective ?? "").trim(), starts_at: body.startsAt, ends_at: body.endsAt, budget_cop: Math.max(0, Number(body.budgetCop ?? 0)), status: body.status ?? "draft", target_audience: body.targetAudience ?? {}, created_by: c.userId });
  } else if (body.action === "activation" && body.campaignId && body.name && (body.eventId || body.venueId)) {
    result = await c.supabase!.from("brand_activations").insert({ campaign_id: body.campaignId, event_id: body.eventId || null, venue_id: body.venueId || null, name: String(body.name).trim(), activation_type: body.activationType ?? "sampling", allocated_budget_cop: Math.max(0, Number(body.allocatedBudgetCop ?? 0)), planned_reach: Math.max(0, Number(body.plannedReach ?? 0)), created_by: c.userId });
  } else return NextResponse.json({ error: "Operación inválida" }, { status: 400 });
  return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json({ ok: true }, { status: 201 });
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function PATCH(request: NextRequest) {
  const c = await context();
  if (c.error) return c.error;
  const body = await request.json() as Record<string, unknown>;
  if (body.action === "organization_settings") {
    const type = String(body.businessType ?? "");
    if (!["manufacturer", "importer", "distributor", "brand_owner", "representative", "mixed"].includes(type)) return NextResponse.json({ error: "Tipo empresarial inválido" }, { status: 400 });
    const { error } = await c.supabase!.rpc("update_brand_organization_settings", { target_organization: c.organizationId, organization_business_type: type });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
  }
  if (body.action !== "activation_execution" || typeof body.id !== "string") return NextResponse.json({ error: "Operación inválida" }, { status: 400 });
  const spend = nonNegativeInteger(body.actualSpendCop);
  const reach = nonNegativeInteger(body.actualReach);
  if (spend === null || reach === null) return NextResponse.json({ error: "Inversión o alcance inválidos" }, { status: 400 });
  const { error } = await c.supabase!.rpc("update_activation_execution", {
    target_activation: body.id, next_status: body.status, spend_cop: spend, reach,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
