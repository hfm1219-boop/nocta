"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Logo } from "@/components/ui";
import { seleccionarLocal, useDB, useLocalesAfiliados } from "@/lib/store";

const ROLES_LOCAL = [
  { href: "/barra", nombre: "Bartender", desc: "Pedidos y despacho", icono: "🍹" },
  { href: "/mesero", nombre: "Mesero", desc: "Entregas y cobro", icono: "🛎️" },
  { href: "/dj", nombre: "DJ", desc: "Rockola del lugar", icono: "🎧" },
  { href: "/admin", nombre: "Administrador", desc: "Configuración del local", icono: "📊" },
];

export default function Landing() {
  const router = useRouter();
  const db = useDB();
  const afiliados = useLocalesAfiliados();
  const [busqueda, setBusqueda] = useState("");
  const [localId, setLocalId] = useState<string | null>(null);
  const local = afiliados.find((item) => item.id === localId);
  const locales = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return texto
      ? afiliados.filter((item) => item.nombre.toLowerCase().includes(texto))
      : afiliados;
  }, [afiliados, busqueda]);

  function activarLocal(id: string, nombre: string) {
    seleccionarLocal(id, nombre);
    setLocalId(id);
  }

  if (local) {
    return (
      <main className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-6">
        <button onClick={() => setLocalId(null)} className="text-sm text-muted">← Cambiar establecimiento</button>
        <header className="card p-5 border-neon2/40 text-center space-y-2">
          <Logo size="text-4xl" />
          <p className="text-xs text-muted uppercase tracking-wider">Estás en</p>
          <h1 className="text-2xl font-bold">{local.nombre}</h1>
          <span className="inline-block rounded-full bg-lime/15 text-lime px-3 py-1 text-xs font-semibold">● Afiliado a NOCTA</span>
        </header>

        <button onClick={() => router.push("/m")} className="btn-neon w-full rounded-2xl p-5 text-left text-white">
          <span className="text-3xl">🍸</span>
          <span className="block text-xl font-bold mt-2">Entrar como cliente</span>
          <span className="block text-sm text-white/80">Ver el menú y hacer pedidos en {local.nombre}</span>
        </button>

        <section className="space-y-3">
          <div>
            <h2 className="font-bold">Personal del establecimiento</h2>
            <p className="text-xs text-muted">Estos accesos pertenecen exclusivamente a {local.nombre}.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {ROLES_LOCAL.filter((rol) => rol.href !== "/dj" || db?.config.funciones.rockola).map((rol) => (
              <Link key={rol.href} href={rol.href} className="card p-4 space-y-1 hover:border-neon1/60 transition">
                <div className="text-2xl">{rol.icono}</div>
                <div className="font-semibold">{rol.nombre}</div>
                <div className="text-xs text-muted">{rol.desc}</div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-10 max-w-md mx-auto w-full space-y-7">
      <header className="text-center space-y-3">
        <Logo size="text-6xl" />
        <h1 className="text-2xl font-bold">¿Dónde estás?</h1>
        <p className="text-sm text-muted">Selecciona el establecimiento afiliado para ver su menú, precios y servicios.</p>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar establecimiento"
        className="card w-full px-4 py-3.5 bg-transparent outline-none focus:border-neon2"
      />

      <section className="space-y-3">
        {locales.map((item) => (
          <button
            key={item.id}
            onClick={() => activarLocal(item.id, item.nombre)}
            className="card w-full p-4 flex items-center gap-4 text-left hover:border-neon2/60 transition"
          >
            <span className="w-12 h-12 rounded-xl bg-neon1/15 flex items-center justify-center text-2xl">📍</span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold">{item.nombre}</span>
              <span className="block text-xs text-lime mt-0.5">● Afiliado a NOCTA</span>
            </span>
            <span className="text-muted">›</span>
          </button>
        ))}
        {locales.length === 0 && <p className="text-center text-muted text-sm py-8">No encontramos un establecimiento afiliado con ese nombre.</p>}
      </section>

      <Link href="/super" className="block text-center text-xs text-muted py-2">Acceso de operador NOCTA</Link>
    </main>
  );
}
