import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { rolesParaRuta } from "@/lib/auth/roles";
import { variablesSupabase } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const config = variablesSupabase();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const rolesPermitidos = rolesParaRuta(request.nextUrl.pathname);
  if (!data?.claims) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (rolesPermitidos) {
    const { data: permitido, error } = await supabase.rpc("current_user_has_any_role", {
      required_roles: [...rolesPermitidos],
    });
    if (error || !permitido) {
      const destino = request.nextUrl.clone();
      destino.pathname = "/sin-acceso";
      destino.search = "";
      return NextResponse.redirect(destino);
    }
  }
  return response;
}

export const config = {
  matcher: ["/super/:path*", "/admin/:path*", "/promotor/:path*", "/acceso/:path*", "/accesos/:path*", "/reservas/:path*", "/barra/:path*", "/mesero/:path*", "/dj/:path*", "/mis-entradas/:path*", "/mis-reservas/:path*", "/mi-nocta/:path*", "/api/auth/context", "/api/organizations"],
};
