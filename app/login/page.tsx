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
  const [registro, setRegistro] = useState(false);
  const [tipoCuenta, setTipoCuenta] = useState<"customer"|"promoter">("customer");

  function mensajeRegistro(codigo?: string, detalle?: string) {
    if (codigo === "user_already_exists" || detalle?.toLowerCase().includes("already registered")) return "Este correo ya tiene una cuenta. Pulsa ‘Ya tengo cuenta’ o recupera la contraseña.";
    if (codigo === "weak_password" || detalle?.toLowerCase().includes("password")) return "La contraseña no cumple los requisitos. Usa mínimo 6 caracteres.";
    if (codigo === "over_email_send_rate_limit" || detalle?.toLowerCase().includes("rate limit")) return "Se alcanzó temporalmente el límite de correos. Espera unos minutos e inténtalo nuevamente.";
    if (codigo === "email_address_invalid") return "El correo ingresado no es válido.";
    return detalle ? `No fue posible crear la cuenta: ${detalle}` : "No fue posible crear la cuenta.";
  }

  async function ingresar(event: FormEvent) {
    event.preventDefault();
    const supabase = crearClienteSupabase();
    if (!supabase) {
      setMensaje("Supabase aún no está configurado. NOCTA continúa en modo demo local.");
      return;
    }
    setCargando(true);
    const { data, error } = registro
      ? await supabase.auth.signUp({ email, password, options: { data: { account_type: tipoCuenta } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) return setMensaje(registro ? mensajeRegistro(error.code, error.message) : "No fue posible iniciar sesión. Revisa tus credenciales.");
    if (registro && data.user?.identities?.length === 0) return setMensaje("Este correo ya tiene una cuenta. Pulsa ‘Ya tengo cuenta’ o recupera la contraseña.");
    if (registro && !data.session) return setMensaje("Cuenta creada. Abre el correo de confirmación enviado por NOCTA antes de iniciar sesión. Revisa también spam.");
    if (data.user?.user_metadata?.account_type === "promoter") {
      await supabase.from("promoter_profiles").upsert({ user_id: data.user.id, public_name: data.user.email?.split("@")[0] ?? "Promotor NOCTA" });
    }
    const next = params.get("next");
    const destinoCuenta = data.user?.user_metadata?.account_type === "promoter" ? "/promotor" : "/";
    router.replace(next?.startsWith("/") ? next : destinoCuenta);
    router.refresh();
  }

  async function recuperar() {
    if (!email) return setMensaje("Escribe tu correo primero.");
    const supabase = crearClienteSupabase();
    if (!supabase) return setMensaje("Supabase aún no está configurado.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/update-password` });
    if (error?.code === "over_email_send_rate_limit") return setMensaje("Supabase alcanzó temporalmente el límite de correos. Espera unos minutos antes de volver a solicitar la recuperación.");
    setMensaje(error ? `No fue posible enviar la recuperación: ${error.message}` : "Revisa tu correo para crear una nueva contraseña.");
  }

  return <main className="flex-1 px-5 py-12 max-w-md mx-auto w-full">
    <section className="card p-6 space-y-6">
      <header><Logo size="text-3xl" /><p className="text-xs uppercase tracking-wider text-neon2 mt-2">Identidad NOCTA</p><h1 className="text-2xl font-bold mt-1">{registro ? "Crea tu cuenta" : "Ingresa a tu cuenta"}</h1></header>
      <form onSubmit={ingresar} className="space-y-4">
        {registro&&<label className="block text-sm"><span className="text-muted text-xs">Tipo de cuenta</span><select value={tipoCuenta} onChange={e=>setTipoCuenta(e.target.value as "customer"|"promoter")} className="entrada"><option value="customer">Asistente / consumidor</option><option value="promoter">Promotor independiente</option></select></label>}
        <label className="block text-sm"><span className="text-muted text-xs">Correo</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="entrada" autoComplete="email" /></label>
        <label className="block text-sm"><span className="text-muted text-xs">Contraseña {registro && "(mínimo 6 caracteres)"}</span><input type="password" required minLength={registro ? 6 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className="entrada" autoComplete={registro ? "new-password" : "current-password"} /></label>
        {mensaje && <p className="text-sm text-neon3" role="alert">{mensaje}</p>}
        <button disabled={cargando} className="btn-neon w-full rounded-2xl p-4 font-bold disabled:opacity-50">{cargando ? "Procesando…" : registro ? "Crear cuenta" : "Ingresar"}</button>
        {!registro&&<button type="button" onClick={recuperar} className="w-full text-sm text-muted">Olvidé mi contraseña</button>}
        <button type="button" onClick={()=>{setRegistro(!registro);setMensaje("")}} className="w-full text-sm text-neon2">{registro ? "Ya tengo cuenta" : "Crear una cuenta nueva"}</button>
      </form>
    </section>
  </main>;
}
