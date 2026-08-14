"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Logo } from "@/components/ui";
import { seleccionarLocal, useDB, useLocalesAfiliados } from "@/lib/store";

const ROLES = [
  { href: "/barra", nombre: "Preparación", icono: "👨‍🍳" },
  { href: "/mesero", nombre: "Mesero", icono: "🛎️" },
  { href: "/dj", nombre: "DJ", icono: "🎧" },
  { href: "/admin", nombre: "Administrador", icono: "📊" },
];

export default function Accesos() {
  const router = useRouter();
  const db = useDB();
  const locales = useLocalesAfiliados();
  const [localId, setLocalId] = useState("");
  const local = useMemo(() => locales.find((item) => item.id === localId), [locales, localId]);

  function seleccionar(id: string) {
    const elegido = locales.find((item) => item.id === id);
    setLocalId(id);
    if (elegido) seleccionarLocal(elegido.id, elegido.nombre);
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-6">
      <header className="text-center space-y-2">
        <Logo size="text-4xl" />
        <h1 className="text-2xl font-bold">Accesos del establecimiento</h1>
        <p className="text-sm text-muted">Selecciona el lugar y el perfil operativo.</p>
      </header>
      <select value={localId} onChange={(evento) => seleccionar(evento.target.value)} className="card w-full px-4 py-3.5 bg-background">
        <option value="">Selecciona un establecimiento</option>
        {locales.map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.ciudad}</option>)}
      </select>
      {local && (
        <section className="space-y-3">
          <button onClick={() => router.push("/m")} className="btn-neon w-full rounded-2xl p-4 font-bold">🍸 Entrar como cliente</button>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.filter((rol) => rol.href !== "/dj" || db?.config.funciones.rockola).map((rol) => (
              <Link key={rol.href} href={rol.href} className="card p-4 hover:border-neon1/60 transition">
                <div className="text-2xl">{rol.icono}</div>
                <div className="font-semibold mt-2">{rol.nombre}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <Link href="/" className="block text-center text-sm text-muted">← Volver a descubrir</Link>
      <Link href="/super" className="block text-center text-xs text-muted">Operador NOCTA</Link>
    </main>
  );
}
