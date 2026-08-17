"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  aportarVaquita, cop, montoSiguienteAporte, tokenCliente, useDB,
} from "@/lib/store";
import { reemplazarCarrito } from "@/lib/cart";

export default function VaquitaPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const router = useRouter();
  const db = useDB();
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");

  if (!db) return null;
  const vaquita = db.vaquitas.find((item) => item.codigo === codigo.toUpperCase());
  if (!vaquita) return <main className="p-8 text-center text-muted">Vaquita no encontrada.</main>;
  const vaquitaActual = vaquita;

  const aportado = vaquita.aportes.reduce((suma, aporte) => suma + aporte.monto, 0);
  const progreso = Math.min(100, (aportado / vaquita.total) * 100);
  const siguiente = montoSiguienteAporte(vaquita);
  const esCreador = vaquita.creadorToken === tokenCliente();

  function aportar(evento: FormEvent) {
    evento.preventDefault();
    if (aportarVaquita(vaquitaActual.codigo, nombre)) {
      setNombre("");
      setMensaje("Aporte confirmado. ¡Gracias!");
    }
  }

  function hacerPedido() {
    if (vaquitaActual.estado !== "completa" || !esCreador) return;
    reemplazarCarrito(vaquitaActual.items);
    router.push(`/m/carrito?vaquita=${encodeURIComponent(vaquitaActual.id)}`);
  }

  return (
    <main className="px-4 pt-6 pb-28 space-y-5">
      <header className="text-center">
        <div className="text-5xl">🐮</div>
        <p className="text-amber font-semibold text-sm mt-2">VAQUITA NOCTA</p>
        <h1 className="text-3xl font-bold">Código {vaquita.codigo}</h1>
        <p className="text-sm text-muted mt-2">Entre {vaquita.participantesObjetivo} amigos · recogida en barra</p>
      </header>

      <section className="card p-4 space-y-3 border-amber/40">
        <div className="flex justify-between text-sm"><span className="text-muted">Reunido</span><b>{cop(aportado)} de {cop(vaquita.total)}</b></div>
        <div className="h-4 bg-surface2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber to-lime transition-all" style={{ width: `${progreso}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>{vaquita.aportes.length} aportes</span><span>{Math.round(progreso)}%</span>
        </div>
      </section>

      {vaquita.estado === "abierta" && (
        <form onSubmit={aportar} className="card p-4 space-y-3">
          <div className="text-center">
            <p className="text-xs text-muted">Tu parte</p>
            <p className="text-3xl font-bold text-amber">{cop(siguiente)}</p>
          </div>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre o apodo" maxLength={30} className="card w-full px-4 py-3 bg-transparent outline-none" />
          <button className="w-full rounded-full py-3 bg-amber text-black font-bold">Aportar {cop(siguiente)}</button>
          {mensaje && <p className="text-lime text-sm text-center">✓ {mensaje}</p>}
        </form>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Aportes</h2>
        {vaquita.aportes.map((aporte, indice) => (
          <div key={aporte.id} className="card px-4 py-3 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-lime/10 text-lime flex items-center justify-center font-bold">✓</span>
            <span className="flex-1">{aporte.nombre || `Amigo ${indice + 1}`}</span>
            <b className="text-lime">{cop(aporte.monto)}</b>
          </div>
        ))}
      </section>

      {esCreador && vaquita.estado === "abierta" && (
        <button
          onClick={() => void navigator.clipboard.writeText(window.location.href)}
          className="w-full rounded-full py-3 border border-neon3/50 text-neon3 font-semibold"
        >
          🔗 Copiar enlace para compartir
        </button>
      )}
      {esCreador && vaquita.estado === "completa" && (
        <button onClick={hacerPedido} className="btn-neon w-full rounded-full py-4 text-white font-bold">
          Vaquita completa · hacer pedido {cop(vaquita.total)}
        </button>
      )}
      {vaquita.estado === "convertida" && vaquita.pedidoId && (
        <Link href={`/m/pedido/${vaquita.pedidoId}`} className="btn-neon block w-full rounded-full py-4 text-white font-bold text-center">
          Ver pedido creado
        </Link>
      )}
    </main>
  );
}
