import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";
import { routeForContext, type AccessContext } from "@/lib/auth/context";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  if (code) {
    const supabase = await crearClienteSupabaseServidor();
    const { error } = supabase ? await supabase.auth.exchangeCodeForSession(code) : { error: new Error("Supabase no configurado") };
    if (!error && supabase) {
      const { data } = await supabase.auth.getUser();
      const { data: access } = await supabase.rpc("get_my_access_context");
      const destinoCuenta = access ? routeForContext(access as AccessContext) : data.user?.user_metadata?.account_type === "promoter" ? "/promotor" : "/";
      return NextResponse.redirect(new URL(next?.startsWith("/") ? next : destinoCuenta, request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
