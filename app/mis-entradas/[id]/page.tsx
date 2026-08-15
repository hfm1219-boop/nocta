"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QREntrada } from "@/components/qr-entrada";
import { eventoPorId, formatearFecha, lugarPorId } from "@/lib/discovery";
import { anularEntrada, transferirEntrada, useEntradas } from "@/lib/tickets";
import { useState } from "react";

export default function DetalleEntrada() {
  const { id } = useParams<{ id: string }>();
  const entrada = useEntradas().find((item) => item.id === id);
  const [transferir, setTransferir] = useState(false); const [titular, setTitular] = useState(""); const [email, setEmail] = useState(""); const [confirmarAnulacion, setConfirmarAnulacion] = useState(false);
  if (!entrada) return <main className="p-8 text-muted">Entrada no encontrada.</main>;
  const evento = eventoPorId(entrada.eventoId);
  const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
  return (
    <main className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-6">
      <Link href="/mis-entradas" className="text-sm text-muted">← Mis entradas</Link>
      <section className="card p-6 text-center space-y-5">
        <div><p className="text-neon3 text-sm">{lugar?.nombre}</p><h1 className="text-3xl font-bold mt-1">{evento?.nombre}</h1>{evento && <p className="text-sm text-muted capitalize mt-2">{formatearFecha(evento.fechaISO, true)}</p>}</div>
        {entrada.estado === "valida" && <QREntrada codigo={entrada.codigo} />}
        <div><p className="text-xs text-muted">Código de acceso</p><p className="font-mono font-bold tracking-wider mt-1 break-all">{entrada.codigo}</p></div>
        <div className={`rounded-xl p-3 font-bold ${entrada.estado === "valida" ? "bg-lime/15 text-lime" : entrada.estado === "anulada" ? "bg-danger/15 text-danger" : "bg-muted/15 text-muted"}`}>{entrada.estado === "valida" ? "Entrada válida · Presenta este QR" : entrada.estado === "anulada" ? "Entrada anulada" : "Entrada ya utilizada"}</div>
      </section>
      {entrada.estado === "valida" && <section className="card p-5 space-y-3"><h2 className="font-bold">Gestionar entrada</h2><p className="text-xs text-muted">Puedes transferirla a otra persona. Al anularla, el cupo vuelve al inventario.</p><div className="flex gap-2"><button onClick={() => setTransferir(!transferir)} className="flex-1 rounded-xl border border-line p-3">Transferir</button><button onClick={() => setConfirmarAnulacion(!confirmarAnulacion)} className="flex-1 rounded-xl border border-danger/40 text-danger p-3">Anular</button></div>{transferir && <div className="space-y-3 pt-2"><input value={titular} onChange={(e)=>setTitular(e.target.value)} className="entrada" placeholder="Nuevo titular"/><input value={email} onChange={(e)=>setEmail(e.target.value)} className="entrada" type="email" placeholder="Correo del nuevo titular"/><button disabled={!titular.trim()||!email.includes("@") } onClick={()=>{ if(transferirEntrada(id,titular,email)) setTransferir(false); }} className="btn-neon w-full rounded-xl p-3 disabled:opacity-40">Confirmar transferencia</button></div>}{confirmarAnulacion && <div className="rounded-xl bg-danger/10 p-4"><p className="text-sm">Esta acción invalida el QR inmediatamente.</p><button onClick={()=>anularEntrada(id)} className="mt-3 rounded-xl bg-danger px-4 py-2 font-bold">Sí, anular entrada</button></div>}</section>}
      <p className="text-xs text-center text-muted">El QR es personal y solo puede validarse una vez.</p>
    </main>
  );
}
