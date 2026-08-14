"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { eventoPorId } from "@/lib/discovery";
import { validarEntrada, type EntradaComprada } from "@/lib/tickets";
import { Logo } from "@/components/ui";

type Resultado = { estado: "aceptada" | "usada" | "invalida"; entrada?: EntradaComprada };

export default function ControlAcceso() {
  const reactId = useId();
  const elementId = `lector-entrada-${reactId.replace(/:/g, "")}`;
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [errorCamara, setErrorCamara] = useState("");
  const bloqueado = useRef(false);

  function comprobar(valor: string) {
    if (bloqueado.current) return;
    bloqueado.current = true;
    setResultado(validarEntrada(valor));
    window.setTimeout(() => { bloqueado.current = false; }, 1400);
  }

  useEffect(() => {
    let lector: import("html5-qrcode").Html5Qrcode | null = null;
    let cancelado = false;
    void import("html5-qrcode").then(async ({ Html5Qrcode }) => {
      if (cancelado) return;
      lector = new Html5Qrcode(elementId);
      try {
        await lector.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          (texto) => comprobar(texto),
          () => undefined,
        );
      } catch {
        setErrorCamara("No pudimos abrir la cámara. Usa el código manual.");
      }
    });
    return () => {
      cancelado = true;
      if (lector?.isScanning) void lector.stop().then(() => lector?.clear()).catch(() => undefined);
      else lector?.clear();
    };
  }, [elementId]);

  function validarManual(evento: FormEvent) {
    evento.preventDefault();
    if (codigo.trim()) comprobar(codigo);
  }

  const evento = resultado?.entrada ? eventoPorId(resultado.entrada.eventoId) : undefined;
  const estilo = resultado?.estado === "aceptada" ? "border-lime bg-lime/10 text-lime"
    : resultado?.estado === "usada" ? "border-amber bg-amber/10 text-amber"
      : "border-danger bg-danger/10 text-danger";

  return (
    <main className="flex-1 px-4 py-5 max-w-md mx-auto w-full space-y-5">
      <header className="flex items-center justify-between"><div><Logo size="text-2xl" /><h1 className="font-bold text-lg mt-1">Control de acceso</h1></div><Link href="/accesos" className="text-sm text-muted">← Roles</Link></header>
      <div id={elementId} className="rounded-2xl overflow-hidden bg-black min-h-72 border border-line" />
      {errorCamara && <p className="text-xs text-amber text-center">{errorCamara}</p>}
      <form onSubmit={validarManual} className="flex gap-2">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código manual" className="card flex-1 min-w-0 px-4 py-3 bg-transparent outline-none font-mono text-sm" />
        <button className="rounded-xl px-4 border border-neon3/50 text-neon3 font-semibold">Validar</button>
      </form>
      {resultado && (
        <section className={`rounded-2xl border-2 p-6 text-center space-y-2 ${estilo}`}>
          <p className="text-5xl">{resultado.estado === "aceptada" ? "✓" : resultado.estado === "usada" ? "!" : "×"}</p>
          <h2 className="text-2xl font-black">{resultado.estado === "aceptada" ? "ACCESO PERMITIDO" : resultado.estado === "usada" ? "ENTRADA YA USADA" : "ENTRADA INVÁLIDA"}</h2>
          {resultado.entrada && <><p className="font-semibold">{resultado.entrada.titular}</p><p className="text-sm opacity-80">{evento?.nombre} · {resultado.entrada.tipoNombre}</p></>}
        </section>
      )}
      <p className="text-xs text-muted text-center">Cada QR válido se marca como utilizado inmediatamente.</p>
    </main>
  );
}
