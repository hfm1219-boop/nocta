"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui";
import { crearClienteSupabase } from "@/lib/supabase/client";

export default function Login() {
  return <Suspense fallback={<main className="flex-1 px-5 py-12 max-w-md mx-auto w-full"><section className="card p-6 text-muted">Preparando acceso…</section></main>}><FormularioLogin /></Suspense>;
}

function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  async function ingresar(event: FormEvent) {
    event.preventDefault();
    const supabase = crearClienteSupabase();
    if (!supabase) {
      setMensaje("Supabase aún no está configurado. NOCTA continúa en modo demo local.");
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) return setMensaje("No fue posible iniciar sesión. Revisa tus credenciales.");
    const next = params.get("next");
    router.replace(next?.startsWith("/") ? next : "/accesos");
    router.refresh();
  }

  return <main className="flex-1 px-5 py-12 max-w-md mx-auto w-full">
    <section className="card p-6 space-y-6">
      <header><Logo size="text-3xl" /><p className="text-xs uppercase tracking-wider text-neon2 mt-2">Acceso de operación</p><h1 className="text-2xl font-bold mt-1">Ingresa a tu cuenta</h1></header>
      <form onSubmit={ingresar} className="space-y-4">
        <label className="block text-sm"><span className="text-muted text-xs">Correo</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="entrada" autoComplete="email" /></label>
        <label className="block text-sm"><span className="text-muted text-xs">Contraseña</span><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="entrada" autoComplete="current-password" /></label>
        {mensaje && <p className="text-sm text-neon3" role="alert">{mensaje}</p>}
        <button disabled={cargando} className="btn-neon w-full rounded-2xl p-4 font-bold disabled:opacity-50">{cargando ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </section>
  </main>;
}
