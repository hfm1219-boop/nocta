import { NextRequest, NextResponse } from "next/server";
import { APP_ROLES } from "@/lib/auth/roles";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = await request.json() as { userId?: string; role?: string; scopeType?: string; scopeId?: string; displayName?: string };
  if (!body.userId || !body.role || !APP_ROLES.includes(body.role as never)) return NextResponse.json({ error: "Asignación inválida" }, { status: 400 });
  const { error } = await supabase.rpc("set_user_access", {
    target_user_id: body.userId,
    target_role: body.role,
    scope_type: body.scopeType ?? "platform",
    scope_id: body.scopeId || null,
    display_name: body.displayName || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = await request.json() as { userId?: string; role?: string; scopeType?: string; scopeId?: string };
  const scoped = ["organization", "venue", "event"].includes(body.scopeType ?? "");
  if (!body.userId || !body.role || !APP_ROLES.includes(body.role as never) || !body.scopeType || (scoped && !body.scopeId)) return NextResponse.json({ error: "Retiro inválido" }, { status: 400 });
  const { error } = await supabase.rpc("remove_user_access", {
    target_user_id: body.userId,
    target_role: body.role,
    scope_type: body.scopeType ?? "platform",
    scope_id: body.scopeId || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}
