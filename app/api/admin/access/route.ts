import { NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const [{ data, error }, venues, events] = await Promise.all([
    supabase.rpc("admin_access_directory"),
    supabase.from("venues").select("id,name,city").eq("active", true).order("name"),
    supabase.from("events").select("id,name,starts_at,status").in("status", ["draft", "pending_venue", "published"]).order("starts_at", { ascending: false }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ users: data, venues: venues.data ?? [], events: events.data ?? [] });
}
