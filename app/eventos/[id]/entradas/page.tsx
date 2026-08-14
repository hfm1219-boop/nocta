"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { comprarEntradas, entradasDisponibles, TIPOS_ENTRADA, useEntradas } from "@/lib/tickets";

export default function ComprarEntradas() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const evento = eventoPorId(id);
  const lugar = evento ? lugarPorId(evento.lugarId) : undefined;
  const tipos = TIPOS_ENTRADA[id] ?? [];
  const entradas = useEntradas();
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState(1);
  const [titular, setTitular] = useState("");
  const [email, setEmail] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const tipo = tipos.find((item) => item.id === tipoId);
  const total = (tipo?.precio ?? 0) * cantidad;
  const disponibles = tipo ? entradasDisponibles(id, tipo, entradas) : 0;

  if (!evento || !lugar || !tipo) return <main className="p-8 text-muted">Evento no disponible.</main>;

  async function confirmar() {
    if (!titular.trim() || !email.includes("@") || procesando || !tipo) return;
    setError("");
    setProcesando(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    try {
      const [entrada] = comprarEntradas({ eventoId: id, tipo, cantidad, titular, email });
      router.push(`/mis-entradas/${entrada.id}`);
    } catch (compraError) {
      setError(compraError instanceof Error ? compraError.message : "No pudimos completar la compra.");
      setProcesando(false);
    }
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-lg mx-auto w-full space-y-6">
      <button onClick={() => router.back()} className="text-sm text-muted">← Volver al evento</button>
      <header>
        <p className="text-neon3 text-sm font-semibold">{lugar.nombre}</p>
        <h1 className="text-3xl font-bold mt-1">{evento.nombre}</h1>
        <p className="text-muted mt-2">Selecciona tu entrada y completa los datos del titular.</p>
      </header>
      <section className="space-y-3">
        {tipos.map((item) => (
          <button key={item.id} disabled={!entradasDisponibles(id, item, entradas)} onClick={() => { setTipoId(item.id); setCantidad(1); }} className={`card w-full p-4 text-left flex justify-between gap-4 disabled:opacity-40 ${item.id === tipoId ? "chip-active" : ""}`}>
            <span><b className="block">{item.nombre}</b><span className="text-xs text-muted">{item.descripcion}</span></span>
            <span className="text-right shrink-0"><b className="block">{item.precio ? `$${item.precio.toLocaleString("es-CO")}` : "Gratis"}</b><span className="text-[10px] text-muted">{entradasDisponibles(id, item, entradas)} disponibles</span></span>
          </button>
        ))}
      </section>
      <section className="card p-5 space-y-4">
        <label className="block text-sm">Cantidad
          <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="card w-full mt-1 px-4 py-3 bg-background">
            {[1, 2, 3, 4].filter((n) => n <= disponibles).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="block text-sm">Nombre del titular
          <input value={titular} onChange={(e) => setTitular(e.target.value)} className="card w-full mt-1 px-4 py-3 bg-transparent outline-none" />
        </label>
        <label className="block text-sm">Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="card w-full mt-1 px-4 py-3 bg-transparent outline-none" />
        </label>
      </section>
      <div className="card p-5 flex items-center justify-between"><span>Total</span><b className="text-2xl">{total ? `$${total.toLocaleString("es-CO")}` : "Gratis"}</b></div>
      {error && <p className="card p-3 text-sm text-danger border-danger/40">{error}</p>}
      <button onClick={confirmar} disabled={!titular.trim() || !email.includes("@") || procesando || disponibles < cantidad} className="btn-neon w-full rounded-2xl p-4 font-bold disabled:opacity-40">
        {procesando ? "Confirmando…" : total ? "Pagar y obtener entradas" : "Confirmar asistencia"}
      </button>
      <p className="text-[11px] text-center text-muted">Pago simulado para el MVP. Cada entrada genera un QR único.</p>
    </main>
  );
}
