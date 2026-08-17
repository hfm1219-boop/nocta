import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

type CartItem = { menuItemId?: unknown; quantity?: unknown };

function validCart(value: unknown): value is CartItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  const valid = value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as CartItem;
    return typeof row.menuItemId === "string" && /^[0-9a-f-]{36}$/i.test(row.menuItemId)
      && Number.isInteger(row.quantity) && Number(row.quantity) > 0 && Number(row.quantity) <= 100;
  });
  return valid && new Set(value.map((item) => item.menuItemId)).size === value.length
    && value.reduce((sum, item) => sum + Number(item.quantity), 0) <= 100;
}

export async function POST(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const body = await request.json() as Record<string, unknown>;
  if (typeof body.venueId !== "string" || !validCart(body.cart)) {
    return NextResponse.json({ error: "Establecimiento y carrito válido requeridos" }, { status: 400 });
  }

  if (body.action === "evaluate") {
    let eventId = typeof body.eventId === "string" ? body.eventId : null;
    if (!eventId && typeof body.eventKey === "string") {
      const { data: event } = await supabase.from("events").select("id").eq("external_key", body.eventKey).maybeSingle();
      eventId = event?.id ?? null;
    }
    const { data, error } = await supabase.rpc("evaluate_promotions", {
      target_venue: body.venueId,
      cart: body.cart,
      at_time: new Date().toISOString(),
      target_event: eventId,
    });
    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ promotions: data ?? [] });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
