"use client";

import Link from "next/link";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { Logo } from "@/components/ui";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { useReservas } from "@/lib/reservations";
import { useEventosPromotor } from "@/lib/promoter-events";

const etiqueta = { pendiente: "Pendiente", confirmada: "Confirmada", rechazada: "Rechazada", cancelada: "Cancelada", usada: "Completada" };

export default function MisReservas() {
  const reservas = useReservas();
  const planes = useEventosPromotor();
  return <main className="flex-1 px-5 py-8 max-w-lg mx-auto space-y-6">
    <header className="flex justify-between gap-3"><Logo size="text-3xl" /><div className="flex items-center gap-3"><Link href="/mis-planes">← Mis planes</Link><CerrarSesion /></div></header>
    <nav className="grid grid-cols-3 gap-2"><Link href="/mis-entradas" className="card p-3 text-center">Entradas</Link><span className="chip-active rounded-xl border p-3 text-center">Reservas</span><Link href="/mi-nocta" className="card p-3 text-center">Puntos</Link></nav>
    <h1 className="text-3xl font-bold">Mis reservas</h1>
    {reservas.slice().reverse().map((reserva) => {
      const evento = eventoPorId(reserva.eventoId);
      const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
      const plan = planes.find((item) => item.id === reserva.eventoId);
      return <Link key={reserva.id} href={`/mis-reservas/${reserva.id}`} className="card p-5 flex justify-between"><span><span className="text-xs text-neon3">{lugar?.nombre ?? plan?.lugarNombre}</span><b className="block text-lg">{evento?.nombre ?? plan?.nombre}</b><span className="text-xs text-muted">{reserva.tipoNombre} · {reserva.personas} personas</span></span><span className="text-xs font-bold">{etiqueta[reserva.estado]}</span></Link>;
    })}
    {!reservas.length && <div className="card p-10 text-center"><p className="text-muted">Todavía no tienes reservas.</p><Link href="/eventos" className="inline-block text-neon3 mt-4">Buscar un evento →</Link></div>}
  </main>;
}
