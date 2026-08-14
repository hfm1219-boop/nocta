"use client";

import Link from "next/link";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { useEntradas } from "@/lib/tickets";
import { Logo } from "@/components/ui";

export default function MisEntradas() {
  const entradas = useEntradas();
  return (
    <main className="flex-1 px-5 py-8 max-w-lg mx-auto w-full space-y-6">
      <header className="flex items-center justify-between"><Logo size="text-3xl" /><Link href="/" className="text-sm text-muted">← Explorar</Link></header>
      <div><h1 className="text-3xl font-bold">Mis entradas</h1><p className="text-muted mt-1">Tus accesos disponibles y utilizados.</p></div>
      <section className="space-y-3">
        {entradas.slice().reverse().map((entrada) => {
          const evento = eventoPorId(entrada.eventoId);
          const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
          return (
            <Link key={entrada.id} href={`/mis-entradas/${entrada.id}`} className={`card p-5 flex items-center justify-between gap-4 ${entrada.estado === "usada" ? "opacity-60" : "hover:border-neon1/60"}`}>
              <span><span className="text-xs text-neon3">{lugar?.nombre}</span><b className="block text-lg">{evento?.nombre ?? "Evento"}</b><span className="text-xs text-muted">{entrada.tipoNombre} · {entrada.titular}</span></span>
              <span className={`text-xs font-bold rounded-full px-3 py-1 ${entrada.estado === "valida" ? "bg-lime/15 text-lime" : "bg-muted/15 text-muted"}`}>{entrada.estado === "valida" ? "Válida" : "Usada"}</span>
            </Link>
          );
        })}
        {!entradas.length && <div className="card p-10 text-center text-muted">Todavía no tienes entradas.</div>}
      </section>
    </main>
  );
}
