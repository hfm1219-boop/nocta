"use client";

import Link from "next/link";
import { PreordenarEvento } from "@/components/entrar-lugar";
import { useCatalogoNocta } from "@/lib/cloud-catalog";
import { EVENTOS, formatearFecha } from "@/lib/discovery";

interface ProximosEventosLugarProps {
  lugarId: string;
  lugarNombre: string;
}

export function ProximosEventosLugar({ lugarId, lugarNombre }: ProximosEventosLugarProps) {
  const catalogo = useCatalogoNocta();
  const eventos = catalogo.eventos
    .filter((evento) => evento.lugarId === lugarId)
    .sort((a, b) => new Date(a.fechaISO).getTime() - new Date(b.fechaISO).getTime());

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-neon2">Antes de llegar</p>
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold mt-1">Próximos eventos</h2>
          {eventos.length > 0 && (
            <span className="text-xs text-muted whitespace-nowrap">
              {eventos.length} {eventos.length === 1 ? "evento" : "eventos"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted mt-1">Selecciona el evento para comprar acceso o dejar tu preorden lista.</p>
      </div>

      {eventos.map((evento) => {
        const href = EVENTOS.some((item) => item.id === evento.id) ? `/eventos/${evento.id}` : `/planes/${evento.id}`;
        return (
        <div key={evento.id} className="card p-5 space-y-4">
          <Link href={href} className="block group">
            <div className="flex justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-neon3 capitalize">{formatearFecha(evento.fechaISO)}</p>
                <h3 className="text-xl font-bold mt-1 group-hover:text-neon2 transition">{evento.nombre}</h3>
                <p className="text-sm text-muted mt-2">{evento.resumen}</p>
              </div>
              <span className="text-neon2">→</span>
            </div>
          </Link>
          <PreordenarEvento
            lugarId={lugarId}
            lugarNombre={lugarNombre}
            eventoId={evento.id}
            eventoNombre={evento.nombre}
            fechaISO={evento.fechaISO}
          />
        </div>
      );})}

      {!catalogo.remoto && !catalogo.error && eventos.length === 0 && (
        <div className="card p-6 text-center text-muted">Consultando próximos eventos…</div>
      )}
      {(catalogo.remoto || catalogo.error) && eventos.length === 0 && (
        <div className="card p-6 text-center text-muted">No hay eventos publicados próximamente.</div>
      )}
    </section>
  );
}
