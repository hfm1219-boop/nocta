"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { QRAcceso } from "@/components/qr-acceso";
import { eventoPorId, formatearFecha, lugarPorId } from "@/lib/discovery";
import {
  actualizarEstadoReserva,
  contenidoReservaQR,
  useReservas,
} from "@/lib/reservations";
import { useEventosPromotor } from "@/lib/promoter-events";

export default function DetalleReserva() {
  const { id } = useParams<{ id: string }>();
  const reserva = useReservas().find((item) => item.id === id);
  const planes = useEventosPromotor();
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState("");

  if (!reserva) return <main className="p-8 text-muted">Reserva no encontrada.</main>;

  const evento = eventoPorId(reserva.eventoId);
  const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
  const plan = planes.find((item) => item.id === reserva.eventoId);

  async function cancelar() {
    setCancelando(true);
    setError("");
    try {
      const actualizada = await actualizarEstadoReserva(id, "cancelada");
      if (!actualizada) throw new Error("La reserva ya no puede cancelarse o no se pudo sincronizar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cancelar la reserva.");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-md mx-auto space-y-6">
      <div className="flex justify-between gap-3">
        <Link href="/mis-planes">← Mis planes</Link>
        <Link href="/mis-reservas" className="text-neon3">Todas las reservas</Link>
      </div>

      <section className="card p-6 text-center space-y-5">
        <div>
          <p className="text-neon3">{lugar?.nombre ?? plan?.lugarNombre}</p>
          <h1 className="text-3xl font-bold">{evento?.nombre ?? plan?.nombre}</h1>
          {(evento || plan) && (
            <p className="text-sm text-muted">
              {formatearFecha((evento ?? plan)!.fechaISO, true)}
            </p>
          )}
        </div>
        {reserva.estado === "confirmada" && (
          <QRAcceso contenido={contenidoReservaQR(reserva.codigo)} alt="QR de reserva" />
        )}
        <div className="rounded-xl bg-surface2 p-4">
          <p className="text-xs text-muted">Código</p>
          <p className="font-mono text-xl font-bold">{reserva.codigo}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-left">
          <Dato t="Espacio" v={reserva.tipoNombre} />
          <Dato t="Personas" v={String(reserva.personas)} />
          <Dato t="Consumo mínimo" v={`$${reserva.consumoMinimo.toLocaleString("es-CO")}`} />
          <Dato t="Anticipo" v={`$${reserva.anticipo.toLocaleString("es-CO")}`} />
        </div>
        <p className={`rounded-xl p-3 font-bold ${
          reserva.estado === "confirmada"
            ? "bg-lime/15 text-lime"
            : reserva.estado === "pendiente"
              ? "bg-amber/15 text-amber"
              : "bg-surface2 text-muted"
        }`}>
          {reserva.estado === "pendiente"
            ? "Esperando confirmación"
            : reserva.estado === "confirmada"
              ? "Confirmada · presenta este QR"
              : `Reserva ${reserva.estado}`}
        </p>
      </section>

      {["pendiente", "confirmada"].includes(reserva.estado) && (
        <button
          onClick={cancelar}
          disabled={cancelando}
          className="w-full rounded-xl border border-danger/40 text-danger p-4 disabled:opacity-60"
        >
          {cancelando ? "Cancelando…" : "Cancelar reserva"}
        </button>
      )}
      {error && <p className="text-sm text-danger text-center">{error}</p>}
    </main>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{t}</p>
      <p className="font-semibold">{v}</p>
    </div>
  );
}
