"use client";

import Link from "next/link";
import { useExperienciasSociales } from "@/lib/social-events";
import { useEventosPromotor } from "@/lib/promoter-events";

export default function PanelPromotor() {
  const experiencias = useExperienciasSociales();
  const planes = useEventosPromotor();
  return (
    <main className="flex-1 px-5 py-8 max-w-4xl mx-auto w-full space-y-7">
      <header className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-neon2">Promotor</p><h1 className="text-3xl font-bold mt-1">Inicio</h1><p className="text-sm text-muted">Resumen de eventos y experiencias.</p></div><Link href="/promotor/eventos" className="btn-neon rounded-xl px-4 py-3 font-semibold">Gestionar eventos</Link></header>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi titulo="Experiencias" valor={experiencias.length} />
        <Kpi titulo="Registrados" valor={experiencias.reduce((s, e) => s + e.participantes.length, 0)} />
        <Kpi titulo="Check-ins" valor={experiencias.reduce((s, e) => s + e.participantes.filter((p) => p.checkin).length, 0)} />
        <Kpi titulo="Asignaciones" valor={experiencias.reduce((s, e) => s + e.asignaciones.length, 0)} />
      </section>
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Eventos comerciales</h1>{planes.map(evento=><Link key={evento.id} href={`/promotor/planes/${evento.id}`} className="card p-5 flex justify-between"><span><span className="text-xs uppercase text-neon2">{evento.estado} · {evento.promotor}</span><b className="block text-xl mt-1">{evento.nombre}</b><span className="text-sm text-muted">{evento.lugarNombre} · {evento.tiposEntrada.length} localidades</span></span><span className="text-neon2">→</span></Link>)}{!planes.length&&<p className="card p-5 text-muted">Crea tu primer evento comercial con entradas, reservas y listas.</p>}
        <h1 className="text-2xl font-bold">Tus experiencias sociales</h1>
        {experiencias.map((evento) => (
          <Link key={evento.id} href={`/promotor/eventos/${evento.id}`} className="card p-5 flex items-center justify-between gap-5 hover:border-neon1/60 transition">
            <span><span className="text-xs text-neon3 uppercase">{evento.tipo} · {evento.estado}</span><b className="block text-xl mt-1">{evento.nombre}</b><span className="text-sm text-muted">{evento.lugarNombre} · {evento.participantes.length}/{evento.capacidad} registrados</span></span><span className="text-neon2 text-xl">→</span>
          </Link>
        ))}
      </section>
    </main>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: number }) {
  return <div className="card p-4"><p className="text-xs text-muted">{titulo}</p><p className="text-2xl font-bold mt-1">{valor}</p></div>;
}
