"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { compraPorId, useEntradas } from "@/lib/tickets";

export default function ComprobanteCompra() {
  const { id } = useParams<{ id: string }>(); const entradas = useEntradas(); const compra = compraPorId(id, entradas);
  if (!compra) return <main className="p-8 text-muted">Compra no encontrada.</main>;
  const grupo = entradas.filter((e) => e.compraId === id); const evento = eventoPorId(compra.eventoId); const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
  return <main className="flex-1 px-5 py-10 max-w-lg mx-auto w-full space-y-6"><header className="text-center"><div className="text-6xl">✓</div><p className="text-lime font-semibold mt-3">Compra confirmada</p><h1 className="text-3xl font-bold mt-1">Tus entradas están listas</h1><p className="text-muted mt-2">{evento?.nombre} · {lugar?.nombre}</p></header><section className="card p-5 grid grid-cols-2 gap-4 text-sm"><Dato t="Referencia" v={compra.id}/><Dato t="Localidad" v={compra.tipoNombre}/><Dato t="Cantidad" v={String(compra.cantidad)}/><Dato t="Total" v={compra.total ? `$${compra.total.toLocaleString("es-CO")}` : "Gratis"}/></section><section className="space-y-3"><h2 className="font-bold">Entradas de esta compra</h2>{grupo.map((entrada, i) => <Link key={entrada.id} href={`/mis-entradas/${entrada.id}`} className="card p-4 flex justify-between items-center"><span><b>Entrada {i + 1}</b><span className="block text-xs text-muted">{entrada.titular} · {entrada.tipoNombre}</span></span><span className="text-neon2">Ver QR →</span></Link>)}</section><Link href="/mis-entradas" className="btn-neon block text-center rounded-2xl p-4 font-bold">Ir a Mis entradas</Link></main>;
}
function Dato({t,v}:{t:string;v:string}) { return <div><p className="text-xs text-muted">{t}</p><p className="font-semibold break-all mt-1">{v}</p></div>; }
