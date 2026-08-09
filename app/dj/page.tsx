"use client";

import { useMemo } from "react";
import { cambiarEstadoCancion, useDB } from "@/lib/store";
import { EncabezadoStaff } from "@/components/ui";
import type { EstadoCancion } from "@/lib/types";

const PRIORIDAD: Record<EstadoCancion, number> = { sonando: 0, pendiente: 1, reproducida: 2 };

export default function ConsolaDJ() {
  const db = useDB();
  const canciones = useMemo(
    () => [...(db?.solicitudesCanciones ?? [])].sort(
      (a, b) => PRIORIDAD[a.estado] - PRIORIDAD[b.estado] || a.creadoEn - b.creadoEn,
    ),
    [db],
  );

  if (!db) return null;
  const solicitudesDB = db.solicitudesCanciones;
  const pendientes = canciones.filter((c) => c.estado === "pendiente").length;
  const reproducidas = canciones.filter((c) => c.estado === "reproducida").length;

  function ponerASonar(id: string) {
    solicitudesDB
      .filter((c) => c.estado === "sonando" && c.id !== id)
      .forEach((c) => cambiarEstadoCancion(c.id, "reproducida"));
    cambiarEstadoCancion(id, "sonando");
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <EncabezadoStaff titulo="DJ — Rockola" subtitulo="Solicitudes en vivo · Eclipse Rooftop" />
      <main className="flex-1 p-4 max-w-4xl w-full mx-auto space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Kpi etiqueta="En cola" valor={pendientes} clase="text-neon3" />
          <Kpi etiqueta="Sonando" valor={canciones.some((c) => c.estado === "sonando") ? 1 : 0} clase="text-lime" />
          <Kpi etiqueta="Reproducidas" valor={reproducidas} clase="text-muted" />
        </div>

        {canciones.length === 0 && (
          <div className="card p-12 text-center text-muted">
            <div className="text-5xl mb-3">🎧</div>
            Aún no hay solicitudes. Las canciones pedidas por los clientes aparecerán aquí al instante.
          </div>
        )}

        <section className="space-y-3">
          {canciones.map((cancion, indice) => (
            <article
              key={cancion.id}
              className={`card p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
                cancion.estado === "sonando" ? "border-lime/60 shadow-[0_0_24px_rgba(163,230,53,0.12)]" :
                cancion.estado === "reproducida" ? "opacity-55" : ""
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-surface2 flex items-center justify-center text-xl font-bold shrink-0">
                {cancion.estado === "sonando" ? "🔊" : cancion.estado === "reproducida" ? "✓" : indice + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-lg truncate">{cancion.titulo}</h2>
                  {cancion.estado === "sonando" && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-lime/15 text-lime">SONANDO</span>
                  )}
                </div>
                <p className="text-sm text-muted">
                  {cancion.artista || "Artista por confirmar"} · pidió {cancion.solicitadoPor || "Cliente anónimo"}
                </p>
                <p className="text-[10px] text-muted mt-1">
                  {new Date(cancion.creadoEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {cancion.estado === "pendiente" && (
                  <button
                    onClick={() => ponerASonar(cancion.id)}
                    className="rounded-full px-4 py-2 text-sm font-semibold bg-lime/15 text-lime border border-lime/40"
                  >
                    ▶ Poner ahora
                  </button>
                )}
                {cancion.estado === "sonando" && (
                  <button
                    onClick={() => cambiarEstadoCancion(cancion.id, "reproducida")}
                    className="rounded-full px-4 py-2 text-sm font-semibold btn-neon text-white"
                  >
                    ✓ Reproducida
                  </button>
                )}
                {cancion.estado === "reproducida" && (
                  <button
                    onClick={() => cambiarEstadoCancion(cancion.id, "pendiente")}
                    className="rounded-full px-4 py-2 text-xs text-muted border border-line"
                  >
                    Volver a cola
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function Kpi({ etiqueta, valor, clase }: { etiqueta: string; valor: number; clase: string }) {
  return (
    <div className="card p-4 text-center">
      <p className={`text-2xl font-bold ${clase}`}>{valor}</p>
      <p className="text-xs text-muted mt-1">{etiqueta}</p>
    </div>
  );
}
