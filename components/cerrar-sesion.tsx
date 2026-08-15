"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { crearClienteSupabase } from "@/lib/supabase/client";

export function CerrarSesion() {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);

  async function cerrar() {
    setCerrando(true);
    await crearClienteSupabase()?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <button type="button" disabled={cerrando} onClick={cerrar} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted hover:border-danger/60 hover:text-danger disabled:opacity-50">{cerrando ? "Cerrando…" : "Cerrar sesión"}</button>;
}
