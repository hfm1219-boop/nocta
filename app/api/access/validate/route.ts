import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = await request.json() as { token?: string };
  if (!body.token?.trim()) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const token = body.token.trim().replace(/^nocta:entrada:/, "");
  const { data, error } = await supabase.rpc("validate_ticket", { ticket_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json(data?.[0] ?? { result: "invalid" });
}
