"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/ui";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { seleccionarLocal, useDB, useLocalesAfiliados } from "@/lib/store";

const ROLES = [
  { href: "/acceso", nombre: "Puerta / Acceso", icono: "🎟️", permiso: "door" },
  { href: "/reservas", nombre: "Reservas", icono: "🛋️", permiso: "reservations" },
  { href: "/barra", nombre: "Preparación", icono: "👨‍🍳", permiso: "bar" },
  { href: "/mesero", nombre: "Mesero", icono: "🛎️", permiso: "waiter" },
  { href: "/dj", nombre: "DJ", icono: "🎧", permiso: "dj" },
  { href: "/admin", nombre: "Administrador", icono: "📊", permiso: "admin" },
  { href: "/admin/eventos", nombre: "Solicitudes de eventos", icono: "📅", permiso: "admin" },
];

export default function Accesos() {
  const router = useRouter();
  const db = useDB();
  const locales = useLocalesAfiliados();
  const [localId, setLocalId] = useState("");
  const [permisos, setPermisos] = useState<Record<string,boolean>>({});
  const local = useMemo(() => locales.find((item) => item.id === localId), [locales, localId]);
  useEffect(()=>{fetch("/api/access/context",{cache:"no-store"}).then(async respuesta=>{if(respuesta.ok){const datos=await respuesta.json();setPermisos(datos.permissions??{});}})},[]);

  function seleccionar(id: string) {
    const elegido = locales.find((item) => item.id === id);
    setLocalId(id);
    if (elegido) seleccionarLocal(elegido.id, elegido.nombre);
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-6">
      <header className="text-center space-y-2">
        <div className="flex justify-end"><CerrarSesion /></div>
        <Logo size="text-4xl" />
        <h1 className="text-2xl font-bold">Accesos operativos</h1>
        <p className="text-sm text-muted">Entra como promotor independiente o selecciona un establecimiento.</p>
      </header>
      {permisos.promoter&&<Link href="/promotor" className="card p-5 flex items-center justify-between gap-4 border-neon3/40 hover:border-neon3 transition">
        <span><span className="text-2xl">✨</span><b className="block mt-2">Panel del promotor</b><span className="text-xs text-muted">Crea eventos y módulos Conecta sin pertenecer a un establecimiento.</span></span><span className="text-neon3 text-xl">→</span>
      </Link>}
      {permisos.venue&&<div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted">Personal del establecimiento</p>
      <select value={localId} onChange={(evento) => seleccionar(evento.target.value)} className="card w-full px-4 py-3.5 bg-background">
        <option value="">Selecciona un establecimiento</option>
        {locales.map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.ciudad}</option>)}
      </select>
      </div>}
      {local && (
        <section className="space-y-3">
          <button onClick={() => router.push("/m")} className="btn-neon w-full rounded-2xl p-4 font-bold">🍸 Entrar como cliente</button>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.filter((rol) => permisos[rol.permiso] && (rol.href !== "/dj" || db?.config.funciones.rockola)).map((rol) => (
              <Link key={rol.href} href={rol.href} className="card p-4 hover:border-neon1/60 transition">
                <div className="text-2xl">{rol.icono}</div>
                <div className="font-semibold mt-2">{rol.nombre}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <Link href="/" className="block text-center text-sm text-muted">← Volver a descubrir</Link>
      {permisos.platform&&<Link href="/super" className="block text-center text-xs text-muted">Operador NOCTA</Link>}
    </main>
  );
}
