import { NextRequest, NextResponse } from "next/server";
import { PRINCIPAL_ROLES } from "@/lib/auth/roles";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

async function client() {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase no configurado" }, { status: 503 }) };
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  return { supabase };
}

export async function GET() {
  const context = await client();
  if (context.error) return context.error;
  const { data, error } = await context.supabase!.rpc("get_my_access_context");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const context = await client();
  if (context.error) return context.error;
  const body = await request.json() as { organizationId?: string | null; role?: string };
  if (!body.role || !PRINCIPAL_ROLES.includes(body.role as never)) return NextResponse.json({ error: "Contexto inválido" }, { status: 400 });
  const { data, error } = await context.supabase!.rpc("set_active_context", { target_organization: body.organizationId || null, target_role: body.role });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json(data);
}
