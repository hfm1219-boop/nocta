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
  if (error || access?.activeContext?.role !== "promoter" || !access.activeContext.organizationId) return { error: NextResponse.json({ error: "Selecciona una organización con contexto Promotor" }, { status: 403 }) };
  return { supabase, userId, organizationId: access.activeContext.organizationId };
}

export async function GET() {
  const ctx = await context(); if (ctx.error) return ctx.error;
  const eventsQuery = await ctx.supabase!.from("events").select("id,external_key,name,starts_at,ends_at,capacity,status,details,created_at,ticket_types(id,name,price_cop,capacity,tickets(id,status,amount_cop,holder_user_id)),event_venue_collaborations(id,status,notes,venues(id,name,city)),event_sponsors(id,name,contribution_type,contribution_value_cop,status),event_complimentary_allocations(id,recipient_name,recipient_email,quantity,status),promoter_settlements(id,gross_cop,fees_cop,deductions_cop,net_cop,status,due_at,paid_at)").eq("organization_id", ctx.organizationId!).order("created_at", { ascending: false });
  if (eventsQuery.error) return NextResponse.json({ error: eventsQuery.error.message }, { status: 400 });
  const [profile, team,eventAnalytics] = await Promise.all([
    ctx.supabase!.from("promoter_profiles").select("public_name,bio,verified,contact_email,contact_phone,social_links").eq("user_id", ctx.userId!).maybeSingle(),
    ctx.supabase!.from("organization_memberships").select("id,user_id,status,profiles(full_name),organization_roles(context_role,role)").eq("organization_id", ctx.organizationId!),
    ctx.supabase!.from("event_analytics").select("event_id,impressions,views,clicks,checkins,reached_people,tickets,reservations,ticket_revenue_cop").eq("organization_id",ctx.organizationId!),
  ]);
  const relatedError=profile.error??team.error??eventAnalytics.error;if(relatedError)return NextResponse.json({error:relatedError.message},{status:400});
  const events = eventsQuery.data ?? [];
  const eventMetrics=eventAnalytics.data??[];
  return NextResponse.json({ organizationId: ctx.organizationId, profile: profile.data, events, team: team.data ?? [],eventAnalytics:eventMetrics, analytics: { events: events.length, published: events.filter(e => e.status === "published").length, tickets:eventMetrics.reduce((sum,row)=>sum+Number(row.tickets),0), checkedIn:eventMetrics.reduce((sum,row)=>sum+Number(row.checkins),0), grossCop:eventMetrics.reduce((sum,row)=>sum+Number(row.ticket_revenue_cop),0), audience:eventMetrics.reduce((sum,row)=>sum+Number(row.reached_people),0),impressions:eventMetrics.reduce((sum,row)=>sum+Number(row.impressions),0),views:eventMetrics.reduce((sum,row)=>sum+Number(row.views),0),clicks:eventMetrics.reduce((sum,row)=>sum+Number(row.clicks),0),reservations:eventMetrics.reduce((sum,row)=>sum+Number(row.reservations),0) } });
}

export async function POST(request: NextRequest) {
  const ctx = await context(); if (ctx.error) return ctx.error;
  const body = await request.json() as { action?: "sponsor" | "courtesy"; eventId?: string; ticketTypeId?: string; name?: string; email?: string; quantity?: number; contributionType?: string; contributionValueCop?: number; notes?: string };
  if (!body.eventId) return NextResponse.json({ error: "Evento requerido" }, { status: 400 });
  const allowed = await ctx.supabase!.from("events").select("id").eq("id", body.eventId).eq("organization_id", ctx.organizationId!).maybeSingle();
  if (!allowed.data) return NextResponse.json({ error: "Evento no autorizado" }, { status: 403 });
  if (body.action === "sponsor" && body.name?.trim()) {
    const result = await ctx.supabase!.from("event_sponsors").insert({ event_id: body.eventId, name: body.name.trim(), contribution_type: body.contributionType ?? "other", contribution_value_cop: Math.max(0, Number(body.contributionValueCop ?? 0)), notes: body.notes?.trim() ?? "", created_by: ctx.userId }).select("id").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json(result.data, { status: 201 });
  }
  if (body.action === "courtesy" && body.name?.trim() && body.quantity && body.quantity > 0) {
    const result = await ctx.supabase!.from("event_complimentary_allocations").insert({ event_id: body.eventId, ticket_type_id: body.ticketTypeId || null, recipient_name: body.name.trim(), recipient_email: body.email?.trim() || null, quantity: body.quantity, notes: body.notes?.trim() ?? "", created_by: ctx.userId }).select("id").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json(result.data, { status: 201 });
  }
  return NextResponse.json({ error: "Operación inválida" }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const ctx = await context(); if (ctx.error) return ctx.error;
  const body = await request.json() as { publicName?: string; bio?: string; contactEmail?: string; contactPhone?: string };
  if (!body.publicName?.trim()) return NextResponse.json({ error: "Nombre público requerido" }, { status: 400 });
  const { error } = await ctx.supabase!.from("promoter_profiles").upsert({ user_id: ctx.userId, organization_id: ctx.organizationId, public_name: body.publicName.trim(), bio: body.bio?.trim() ?? "", contact_email: body.contactEmail?.trim() || null, contact_phone: body.contactPhone?.trim() || null, updated_at: new Date().toISOString() });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
