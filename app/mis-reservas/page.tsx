"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { useReservas } from "@/lib/reservations";

const etiqueta={pendiente:"Pendiente",confirmada:"Confirmada",rechazada:"Rechazada",cancelada:"Cancelada",usada:"Completada"};
export default function MisReservas(){const reservas=useReservas();return <main className="flex-1 px-5 py-8 max-w-lg mx-auto w-full space-y-6"><header className="flex justify-between"><Logo size="text-3xl"/><Link href="/" className="text-sm text-muted">← Explorar</Link></header><nav className="grid grid-cols-2 gap-2"><Link href="/mis-entradas" className="card p-3 text-center text-muted">Entradas</Link><span className="chip-active rounded-xl border p-3 text-center font-semibold">Reservas</span></nav><div><h1 className="text-3xl font-bold">Mis reservas</h1><p className="text-muted mt-1">Solicitudes, confirmaciones y espacios reservados.</p></div><section className="space-y-3">{reservas.slice().reverse().map(r=>{const e=eventoPorId(r.eventoId);const l=e?lugarPorId(e.lugarId):undefined;return <Link key={r.id} href={`/mis-reservas/${r.id}`} className="card p-5 flex justify-between gap-4"><span><span className="text-xs text-neon3">{l?.nombre}</span><b className="block text-lg">{e?.nombre}</b><span className="text-xs text-muted">{r.tipoNombre} · {r.personas} personas</span></span><span className="text-xs font-bold self-start rounded-full bg-neon3/10 text-neon3 px-3 py-1">{etiqueta[r.estado]}</span></Link>})}{!reservas.length&&<div className="card p-10 text-center text-muted">Todavía no tienes reservas.</div>}</section></main>}
