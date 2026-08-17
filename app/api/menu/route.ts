import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const venueKey = request.nextUrl.searchParams.get("venueKey");
  if (!venueKey) return NextResponse.json({ error: "Establecimiento requerido" }, { status: 400 });
  const { data: venue, error: venueError } = await supabase.from("venues")
    .select("id,external_key,name,active").eq("external_key", venueKey).eq("active", true).maybeSingle();
  if (venueError || !venue) return NextResponse.json({ error: "Establecimiento no disponible" }, { status: 404 });
  const [{ data: categories, error: categoryError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from("venue_menu_categories").select("id,name,sort_order").eq("venue_id", venue.id).eq("active", true).order("sort_order"),
    supabase.from("venue_menu_items").select("id,category_id,name,description,sku,price_cop,image_url").eq("venue_id", venue.id).eq("available", true).order("name"),
  ]);
  const error = categoryError ?? itemError;
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ venue, categories: categories ?? [], items: items ?? [] });
}
