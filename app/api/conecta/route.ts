import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ experiences: [] });
  const { data: claims } = await supabase.auth.getClaims();
  let query = supabase.from("conecta_modules").select("id,external_key,event_id,name,description,experience_type,matching_mode,capacity,reveal_at,status,owner_promoter_id,location_name,location_address,location_city,created_at,conecta_participants(count)").order("created_at", { ascending: false });
  if (!claims?.claims?.sub) query = query.in("status", ["open", "matching", "revealed"]);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const eventIds = (data ?? []).flatMap((item) => item.event_id ? [item.event_id] : []);
  const { data: events } = eventIds.length ? await supabase.from("events").select("id,starts_at").in("id", eventIds) : { data: [] };
  const startsById = new Map((events ?? []).map((event) => [event.id, event.starts_at]));
  return NextResponse.json({ experiences: (data ?? []).map((item) => ({ ...item, starts_at: item.event_id ? startsById.get(item.event_id) : null })) });
}

export async function POST(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: promoter } = await supabase.from("promoter_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (!promoter) return NextResponse.json({ error: "Tu cuenta necesita el rol Promotor independiente." }, { status: 403 });
  const body = await request.json() as { name?: string; description?: string; type?: string; matchingMode?: string; capacity?: number; startsAt?: string; revealAt?: string; venueExternalKey?: string; locationName?: string; locationAddress?: string; locationCity?: string };
  if (!body.name?.trim() || !body.startsAt || !body.type || !body.matchingMode || !body.capacity || body.capacity < 4) return NextResponse.json({ error: "Datos de Conecta incompletos" }, { status: 400 });
  const externalKey = `conecta-${crypto.randomUUID()}`;
  const requiresVenueApproval = Boolean(body.venueExternalKey);
  const { data: selectedVenue } = body.venueExternalKey
    ? await supabase.from("venues").select("id,name,address,city").eq("external_key", body.venueExternalKey).maybeSingle()
    : { data: null };
  if (body.venueExternalKey && !selectedVenue) return NextResponse.json({ error: "El establecimiento seleccionado no está disponible." }, { status: 400 });
  if (!body.venueExternalKey && !body.locationName?.trim()) return NextResponse.json({ error: "Indica el lugar de la experiencia." }, { status: 400 });
  const { data: event, error: eventError } = await supabase.from("events").insert({ external_key: externalKey, owner_user_id: userId, name: body.name.trim(), starts_at: body.startsAt, capacity: body.capacity, status: requiresVenueApproval ? "draft" : "published" }).select("id").single();
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 });
  const revealAt = body.revealAt ? new Date(`${body.startsAt.slice(0, 10)}T${body.revealAt}:00`).toISOString() : null;
  const { data: conecta, error: conectaError } = await supabase.from("conecta_modules").insert({ external_key: externalKey, owner_promoter_id: userId, event_id: event.id, name: body.name.trim(), description: body.description ?? "", experience_type: body.type, matching_mode: body.matchingMode, capacity: body.capacity, reveal_at: revealAt, status: requiresVenueApproval ? "draft" : "open", location_name: selectedVenue?.name ?? body.locationName?.trim(), location_address: selectedVenue?.address ?? (body.locationAddress?.trim() || null), location_city: selectedVenue?.city ?? (body.locationCity?.trim() || null) }).select("id,external_key").single();
  if (conectaError) { await supabase.from("events").delete().eq("id", event.id); return NextResponse.json({ error: conectaError.message }, { status: 400 }); }
  if (selectedVenue) {
    const { error: collaborationError } = await supabase.from("event_venue_collaborations").insert({ event_id: event.id, venue_id: selectedVenue.id, requested_by: userId, status: "requested" });
    if (collaborationError) {
      await supabase.from("conecta_modules").delete().eq("id", conecta.id);
      await supabase.from("events").delete().eq("id", event.id);
      return NextResponse.json({ error: collaborationError.message }, { status: 400 });
    }
  }
  return NextResponse.json({ id: conecta.id, externalKey: conecta.external_key }, { status: 201 });
}
