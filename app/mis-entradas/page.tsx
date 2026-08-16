"use client";

import Link from "next/link";
import { useState } from "react";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { useEventosPromotor } from "@/lib/promoter-events";
import { useEntradas, type EntradaComprada } from "@/lib/tickets";

type Filtro = "activas" | "historial" | "todas";

const ESTADOS: Record<EntradaComprada["estado"], { etiqueta: string; clase: string }> = {
  valida: { etiqueta: "Válida", clase: "bg-lime/15 text-lime" },
  usada: { etiqueta: "Utilizada", clase: "bg-neon2/10 text-neon2" },
  anulada: { etiqueta: "Anulada", clase: "bg-danger/10 text-danger" },
};

export default function MisEntradas() {
  const entradas = useEntradas();
  const planes = useEventosPromotor();
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const activas = entradas.filter((entrada) => entrada.estado === "valida");
  const utilizadas = entradas.filter((entrada) => entrada.estado === "usada");
  const visibles = entradas
    .filter((entrada) => filtro === "todas" || (filtro === "activas" ? entrada.estado === "valida" : entrada.estado !== "valida"))
    .sort((a, b) => b.compradaEn - a.compradaEn);

  return <main className="flex-1 w-full max-w-4xl mx-auto px-5 py-8 space-y-7">
    <header>
      <Link href="/mis-planes" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground">← Volver a Mis planes</Link>
      <p className="mt-7 text-xs uppercase tracking-[.2em] text-neon2">Tus accesos</p>
      <h1 className="mt-2 text-3xl md:text-5xl font-bold">Todas las entradas</h1>
      <p className="mt-2 text-muted">Encuentra rápidamente los códigos que debes presentar al ingresar.</p>
    </header>

    <section className="grid grid-cols-3 gap-3" aria-label="Resumen de entradas">
      <Resumen valor={entradas.length} etiqueta="Total" />
      <Resumen valor={activas.length} etiqueta="Activas" />
      <Resumen valor={utilizadas.length} etiqueta="Utilizadas" />
    </section>

    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar entradas">
      {(["activas", "historial", "todas"] as Filtro[]).map((opcion) => <button
        key={opcion}
        type="button"
        onClick={() => setFiltro(opcion)}
        className={`shrink-0 rounded-full border px-4 py-2 text-sm capitalize ${filtro === opcion ? "chip-active bg-neon2/10" : "border-line text-muted"}`}
      >{opcion}</button>)}
    </nav>

    <section className="space-y-3">
      {visibles.map((entrada) => {
        const evento = eventoPorId(entrada.eventoId);
        const plan = planes.find((item) => item.id === entrada.eventoId);
        const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
        return <TarjetaEntrada
          key={entrada.id}
          entrada={entrada}
          evento={evento?.nombre ?? plan?.nombre ?? "Evento"}
          lugar={lugar?.nombre ?? plan?.lugarNombre ?? "Lugar por confirmar"}
          fecha={evento?.fechaISO ?? plan?.fechaISO}
        />;
      })}
      {!visibles.length && <div className="card p-10 text-center">
        <p className="text-3xl">◇</p>
        <h2 className="mt-3 text-xl font-bold">{entradas.length ? "No hay entradas en esta sección" : "Todavía no tienes entradas"}</h2>
        <p className="mt-2 text-sm text-muted">{entradas.length ? "Prueba otro filtro para consultar el resto de tus accesos." : "Elige un evento y asegura tu acceso a la próxima noche."}</p>
        {!entradas.length && <Link href="/eventos" className="btn-neon inline-block mt-5 rounded-xl px-5 py-3 font-semibold">Explorar eventos</Link>}
      </div>}
    </section>
  </main>;
}

function TarjetaEntrada({ entrada, evento, lugar, fecha }: { entrada: EntradaComprada; evento: string; lugar: string; fecha?: string }) {
  const estado = ESTADOS[entrada.estado];
  return <Link href={`/mis-entradas/${entrada.id}`} className="card block p-5 hover:border-neon2/50 transition-colors">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-xs text-neon3">{lugar}</p>
        <h2 className="mt-1 truncate text-xl font-bold">{evento}</h2>
      </div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${estado.clase}`}>{estado.etiqueta}</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
      <Dato etiqueta="Fecha" valor={fecha ? new Date(fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "Por confirmar"} />
      <Dato etiqueta="Localidad" valor={entrada.tipoNombre} />
      <Dato etiqueta="Titular" valor={entrada.titular} />
      <Dato etiqueta="Código" valor={entrada.codigo} mono />
    </div>
    <p className="mt-4 text-right text-sm font-semibold text-neon2">{entrada.estado === "valida" ? "Mostrar QR" : "Ver detalle"} →</p>
  </Link>;
}

function Resumen({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return <div className="card p-4"><p className="text-2xl font-bold">{valor}</p><p className="mt-1 text-xs text-muted">{etiqueta}</p></div>;
}

function Dato({ etiqueta, valor, mono = false }: { etiqueta: string; valor: string; mono?: boolean }) {
  return <div className="min-w-0"><p className="text-xs text-muted">{etiqueta}</p><p className={`mt-1 truncate font-medium ${mono ? "font-mono" : ""}`}>{valor}</p></div>;
}
