import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

type CartRow = { menuItemId?: unknown; quantity?: unknown };
function validCart(value: unknown): value is CartRow[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((row) => row && typeof row === "object"
    && typeof row.menuItemId === "string" && /^[0-9a-f-]{36}$/i.test(row.menuItemId)
    && Number.isInteger(row.quantity) && Number(row.quantity) > 0 && Number(row.quantity) <= 100)
    && new Set(value.map((row) => row.menuItemId)).size === value.length;
}

export async function POST(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Inicia sesión para confirmar el pedido" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.venueKey !== "string" || typeof body.orderKey !== "string" || !validCart(body.cart)) {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("checkout_order_with_promotion", {
    venue_key: body.venueKey, order_key: body.orderKey, service: body.service,
    zone: typeof body.zone === "string" ? body.zone : null, cart: body.cart,
    tip: Number(body.tip ?? 0), payment_method_value: body.paymentMethod,
    payment_status_value: "pending", preorder_at: body.preorderAt ?? null,
    pickup_pin: body.pickupPin ?? null, selected_promotion: body.promotionId ?? null,
    promotion_idempotency: body.promotionIdempotency ?? null, event_key: body.eventKey ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("NOT_ELIGIBLE") ? 409 : 400 });
  return NextResponse.json({ checkout: data?.[0] }, { status: 201 });
}
