"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

export function CerrarSesionCliente() {
  const [autenticado, setAutenticado] = useState(false);

  useEffect(() => {
    const supabase = crearClienteSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setAutenticado(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => setAutenticado(Boolean(sesion)));
    return () => data.subscription.unsubscribe();
  }, []);

  return autenticado
    ? <CerrarSesion />
    : <a href="/login" className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted hover:text-foreground">Ingresar</a>;
}
