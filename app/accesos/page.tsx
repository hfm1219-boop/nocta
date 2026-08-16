"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/ui";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { seleccionarLocal, useDB } from "@/lib/store";

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
  const [locales, setLocales] = useState<Array<{id:string;external_key:string;name:string;city:string}>>([]);
  const [localId, setLocalId] = useState("");
  const [permisos, setPermisos] = useState<Record<string,boolean>>({});
  const [loading,setLoading]=useState(true);const[error,setError]=useState("");
  const local = useMemo(() => locales.find((item) => item.external_key === localId), [locales, localId]);
  useEffect(()=>{let active=true;fetch("/api/access/context",{cache:"no-store"}).then(async respuesta=>{const datos=await respuesta.json();if(!respuesta.ok)throw new Error(datos.error??"No fue posible cargar los accesos");if(active){setPermisos(datos.permissions??{});setLocales(datos.venues??[]);if(datos.venues?.length===1){const venue=datos.venues[0];setLocalId(venue.external_key);seleccionarLocal(venue.external_key,venue.name)}}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"No fue posible cargar los accesos")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);

  function seleccionar(id: string) {
    const elegido = locales.find((item) => item.external_key === id);
    setLocalId(id);
    if (elegido) seleccionarLocal(elegido.external_key, elegido.name);
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-6">
      <header className="text-center space-y-2">
        <div className="flex justify-end"><CerrarSesion /></div>
        <Logo size="text-4xl" />
        <h1 className="text-2xl font-bold">Accesos operativos</h1>
        <p className="text-sm text-muted">Entra como promotor independiente o selecciona un establecimiento.</p>
      </header>
      {loading&&<section className="card p-6 text-center text-muted" role="status">Cargando tus permisos y sedes…</section>}
      {error&&<section className="card border-danger/40 p-5"><p className="font-bold text-danger">No pudimos cargar los accesos</p><p className="text-sm text-muted mt-2">{error}</p><button onClick={()=>window.location.reload()} className="btn-neon rounded-xl px-4 py-3 mt-4">Reintentar</button></section>}
      {permisos.promoter&&<Link href="/promotor" className="card p-5 flex items-center justify-between gap-4 border-neon3/40 hover:border-neon3 transition">
        <span><span className="text-2xl">✨</span><b className="block mt-2">Panel del promotor</b><span className="text-xs text-muted">Crea eventos y módulos Conecta sin pertenecer a un establecimiento.</span></span><span className="text-neon3 text-xl">→</span>
      </Link>}
      {permisos.venue&&<div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted">Personal del establecimiento</p>
      <select value={localId} onChange={(evento) => seleccionar(evento.target.value)} className="card w-full px-4 py-3.5 bg-background">
        <option value="">Selecciona un establecimiento</option>
        {locales.map((item) => <option key={item.id} value={item.external_key}>{item.name} · {item.city}</option>)}
      </select>
      {!loading&&!locales.length&&<p className="card p-4 text-sm text-muted">Tu organización no tiene una sede activa asignada. Solicita al administrador que cree o habilite el establecimiento.</p>}
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
