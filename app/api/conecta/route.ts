import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ experiences: [] });
  const { data, error } = await supabase.from("conecta_modules").select("id,external_key,event_id,name,description,experience_type,matching_mode,capacity,reveal_at,status,owner_promoter_id,created_at,conecta_participants(count)").in("status", ["open", "matching", "revealed"]).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ experiences: data });
}

export async function POST(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: promoter } = await supabase.from("promoter_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (!promoter) return NextResponse.json({ error: "Tu cuenta necesita el rol Promotor independiente." }, { status: 403 });
  const body = await request.json() as { name?: string; description?: string; type?: string; matchingMode?: string; capacity?: number; startsAt?: string; revealAt?: string; venueExternalKey?: string };
  if (!body.name?.trim() || !body.startsAt || !body.type || !body.matchingMode || !body.capacity || body.capacity < 4) return NextResponse.json({ error: "Datos de Conecta incompletos" }, { status: 400 });
  const externalKey = `conecta-${crypto.randomUUID()}`;
  const { data: event, error: eventError } = await supabase.from("events").insert({ external_key: externalKey, owner_user_id: userId, name: body.name.trim(), starts_at: body.startsAt, capacity: body.capacity, status: "published" }).select("id").single();
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 });
  const revealAt = body.revealAt ? new Date(`${body.startsAt.slice(0, 10)}T${body.revealAt}:00`).toISOString() : null;
  const { data: conecta, error: conectaError } = await supabase.from("conecta_modules").insert({ external_key: externalKey, owner_promoter_id: userId, event_id: event.id, name: body.name.trim(), description: body.description ?? "", experience_type: body.type, matching_mode: body.matchingMode, capacity: body.capacity, reveal_at: revealAt, status: "open" }).select("id,external_key").single();
  if (conectaError) { await supabase.from("events").delete().eq("id", event.id); return NextResponse.json({ error: conectaError.message }, { status: 400 }); }
  if (body.venueExternalKey) {
    const { data: venue } = await supabase.from("venues").select("id").eq("external_key", body.venueExternalKey).maybeSingle();
    if (venue) await supabase.from("event_venue_collaborations").insert({ event_id: event.id, venue_id: venue.id, requested_by: userId, status: "requested" });
  }
  return NextResponse.json({ id: conecta.id, externalKey: conecta.external_key }, { status: 201 });
}

