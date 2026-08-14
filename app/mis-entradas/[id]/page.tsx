"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QREntrada } from "@/components/qr-entrada";
import { eventoPorId, formatearFecha, lugarPorId } from "@/lib/discovery";
import { useEntradas } from "@/lib/tickets";

export default function DetalleEntrada() {
  const { id } = useParams<{ id: string }>();
  const entrada = useEntradas().find((item) => item.id === id);
  if (!entrada) return <main className="p-8 text-muted">Entrada no encontrada.</main>;
  const evento = eventoPorId(entrada.eventoId);
  const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
  return (
    <main className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-6">
      <Link href="/mis-entradas" className="text-sm text-muted">← Mis entradas</Link>
      <section className="card p-6 text-center space-y-5">
        <div><p className="text-neon3 text-sm">{lugar?.nombre}</p><h1 className="text-3xl font-bold mt-1">{evento?.nombre}</h1>{evento && <p className="text-sm text-muted capitalize mt-2">{formatearFecha(evento.fechaISO, true)}</p>}</div>
        <QREntrada codigo={entrada.codigo} />
        <div><p className="text-xs text-muted">Código de acceso</p><p className="font-mono font-bold tracking-wider mt-1 break-all">{entrada.codigo}</p></div>
        <div className={`rounded-xl p-3 font-bold ${entrada.estado === "valida" ? "bg-lime/15 text-lime" : "bg-muted/15 text-muted"}`}>{entrada.estado === "valida" ? "Entrada válida · Presenta este QR" : "Entrada ya utilizada"}</div>
      </section>
      <p className="text-xs text-center text-muted">El QR es personal y solo puede validarse una vez.</p>
    </main>
  );
}
