"use client";

import Link from "next/link";
import { useState } from "react";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { useReservas, type EstadoReserva, type ReservaNocta } from "@/lib/reservations";
import { useEventosPromotor } from "@/lib/promoter-events";

type Filtro = "activas" | "historial" | "todas";

const ESTADOS: Record<EstadoReserva, { etiqueta: string; clase: string }> = {
  pendiente: { etiqueta: "Pendiente", clase: "bg-amber/15 text-amber" },
  confirmada: { etiqueta: "Confirmada", clase: "bg-lime/15 text-lime" },
  rechazada: { etiqueta: "Rechazada", clase: "bg-danger/10 text-danger" },
  cancelada: { etiqueta: "Cancelada", clase: "bg-surface2 text-muted" },
  usada: { etiqueta: "Completada", clase: "bg-neon2/10 text-neon2" },
};

export default function MisReservas() {
  const reservas = useReservas();
  const planes = useEventosPromotor();
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const activas = reservas.filter((reserva) => ["pendiente", "confirmada"].includes(reserva.estado));
  const confirmadas = reservas.filter((reserva) => reserva.estado === "confirmada");
  const visibles = reservas
    .filter((reserva) => filtro === "todas" || (filtro === "activas" ? ["pendiente", "confirmada"].includes(reserva.estado) : !["pendiente", "confirmada"].includes(reserva.estado)))
    .sort((a, b) => new Date(b.fechaISO).getTime() - new Date(a.fechaISO).getTime());

  return <main className="flex-1 w-full max-w-4xl mx-auto px-5 py-8 space-y-7">
    <header>
      <Link href="/mis-planes" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground">← Volver a Mis planes</Link>
      <p className="mt-7 text-xs uppercase tracking-[.2em] text-neon2">Tu actividad</p>
      <h1 className="mt-2 text-3xl md:text-5xl font-bold">Todas las reservas</h1>
      <p className="mt-2 text-muted">Consulta solicitudes, confirmaciones y reservas anteriores.</p>
    </header>

    <section className="grid grid-cols-3 gap-3" aria-label="Resumen de reservas">
      <Resumen valor={reservas.length} etiqueta="Total" />
      <Resumen valor={activas.length} etiqueta="Activas" />
      <Resumen valor={confirmadas.length} etiqueta="Confirmadas" />
    </section>

    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar reservas">
      {(["activas", "historial", "todas"] as Filtro[]).map((opcion) => <button
        key={opcion}
        type="button"
        onClick={() => setFiltro(opcion)}
        className={`shrink-0 rounded-full border px-4 py-2 text-sm capitalize ${filtro === opcion ? "chip-active bg-neon2/10" : "border-line text-muted"}`}
      >{opcion}</button>)}
    </nav>

    <section className="space-y-3">
      {visibles.map((reserva) => {
        const evento = eventoPorId(reserva.eventoId);
        const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
        const plan = planes.find((item) => item.id === reserva.eventoId);
        return <TarjetaReserva
          key={reserva.id}
          reserva={reserva}
          evento={evento?.nombre ?? plan?.nombre ?? "Evento"}
          lugar={lugar?.nombre ?? plan?.lugarNombre ?? "Lugar por confirmar"}
        />;
      })}
      {!visibles.length && <div className="card p-10 text-center">
        <p className="text-3xl">◇</p>
        <h2 className="mt-3 text-xl font-bold">{reservas.length ? "No hay reservas en esta sección" : "Todavía no tienes reservas"}</h2>
        <p className="mt-2 text-sm text-muted">{reservas.length ? "Prueba otro filtro para consultar el resto de tu actividad." : "Explora la agenda y reserva tu espacio para la próxima noche."}</p>
        {!reservas.length && <Link href="/eventos" className="btn-neon inline-block mt-5 rounded-xl px-5 py-3 font-semibold">Explorar eventos</Link>}
      </div>}
    </section>
  </main>;
}

function TarjetaReserva({ reserva, evento, lugar }: { reserva: ReservaNocta; evento: string; lugar: string }) {
  const estado = ESTADOS[reserva.estado];
  return <Link href={`/mis-reservas/${reserva.id}`} className="card block p-5 hover:border-neon2/50 transition-colors">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-xs text-neon3">{lugar}</p>
        <h2 className="mt-1 truncate text-xl font-bold">{evento}</h2>
      </div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${estado.clase}`}>{estado.etiqueta}</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
      <Dato etiqueta="Fecha" valor={new Date(reserva.fechaISO).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} />
      <Dato etiqueta="Reserva" valor={reserva.tipoNombre} />
      <Dato etiqueta="Personas" valor={`${reserva.personas} ${reserva.personas === 1 ? "persona" : "personas"}`} />
      <Dato etiqueta="Código" valor={reserva.codigo || "Pendiente"} mono />
    </div>
    <p className="mt-4 text-right text-sm font-semibold text-neon2">Ver detalle →</p>
  </Link>;
}

function Resumen({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return <div className="card p-4"><p className="text-2xl font-bold">{valor}</p><p className="mt-1 text-xs text-muted">{etiqueta}</p></div>;
}

function Dato({ etiqueta, valor, mono = false }: { etiqueta: string; valor: string; mono?: boolean }) {
  return <div className="min-w-0"><p className="text-xs text-muted">{etiqueta}</p><p className={`mt-1 truncate font-medium ${mono ? "font-mono" : ""}`}>{valor}</p></div>;
}
