"use client";

import { FormEvent, useMemo, useState } from "react";
import { solicitarCancion, tokenCliente, useDB } from "@/lib/store";

const ESTADO = {
  pendiente: { texto: "En cola", clase: "text-neon3 bg-neon3/10" },
  sonando: { texto: "Sonando", clase: "text-lime bg-lime/10" },
  reproducida: { texto: "Reproducida", clase: "text-muted bg-muted/10" },
};

export default function RockolaCliente() {
  const db = useDB();
  const [titulo, setTitulo] = useState("");
  const [artista, setArtista] = useState("");
  const [nombre, setNombre] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const solicitudes = useMemo(
    () => [...(db?.solicitudesCanciones ?? [])].sort((a, b) => b.creadoEn - a.creadoEn),
    [db],
  );

  if (!db) return null;
  const miToken = tokenCliente();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (titulo.trim().length < 2) return;
    const nueva = solicitarCancion({ titulo, artista, solicitadoPor: nombre });
    setConfirmacion(`“${nueva.titulo}” entró a la rockola.`);
    setTitulo("");
    setArtista("");
  }

  return (
    <main className="px-4 pt-6 space-y-5">
      <header>
        <p className="text-neon3 text-sm font-semibold">🎵 Rockola Nocta</p>
        <h1 className="text-3xl font-bold mt-1">¿Qué quieres escuchar?</h1>
        <p className="text-sm text-muted mt-2">
          Pide una canción y el DJ la verá al instante. La selección final depende del ambiente y la programación del lugar.
        </p>
      </header>

      <form onSubmit={enviar} className="card p-4 space-y-3 border-neon1/40">
        <label className="block">
          <span className="text-xs text-muted">Canción *</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={80}
            placeholder="Ej. La canción"
            className="card w-full mt-1 px-4 py-3 bg-transparent outline-none focus:border-neon2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Artista (opcional)</span>
          <input
            value={artista}
            onChange={(e) => setArtista(e.target.value)}
            maxLength={80}
            placeholder="Nombre del artista"
            className="card w-full mt-1 px-4 py-3 bg-transparent outline-none focus:border-neon2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Tu nombre o apodo (opcional)</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={30}
            placeholder="Para que el DJ sepa quién la pidió"
            className="card w-full mt-1 px-4 py-3 bg-transparent outline-none focus:border-neon2"
          />
        </label>
        <button
          type="submit"
          disabled={titulo.trim().length < 2}
          className="btn-neon w-full rounded-full py-3.5 font-bold text-white disabled:opacity-40"
        >
          Pedir canción 🎧
        </button>
        {confirmacion && <p className="text-center text-sm text-lime">✓ {confirmacion}</p>}
      </form>

      <section className="space-y-3 pb-4">
        <div className="flex items-end justify-between">
          <h2 className="font-bold text-lg">Pedidas esta noche</h2>
          <span className="text-xs text-muted">{solicitudes.length} solicitudes</span>
        </div>
        {solicitudes.length === 0 && (
          <div className="card p-8 text-center text-muted text-sm">
            <div className="text-4xl mb-2">🎶</div>
            Sé la primera persona en pedir una canción.
          </div>
        )}
        {solicitudes.map((cancion) => (
          <div
            key={cancion.id}
            className={`card p-4 flex items-center gap-3 ${cancion.estado === "reproducida" ? "opacity-60" : ""}`}
          >
            <span className="w-10 h-10 rounded-full bg-neon1/15 flex items-center justify-center shrink-0">
              {cancion.estado === "sonando" ? "🔊" : "♫"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{cancion.titulo}</p>
              <p className="text-xs text-muted truncate">
                {cancion.artista || "Artista por confirmar"}
                {cancion.clienteToken === miToken && " · Tu solicitud"}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ESTADO[cancion.estado].clase}`}>
              {ESTADO[cancion.estado].texto}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
