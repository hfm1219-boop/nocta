"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";

export function contenidoQRMesa(mesaId: string) {
  return `nocta:mesa:${mesaId}`;
}

export function extraerMesaQR(contenido: string): string | null {
  const valor = contenido.trim();
  if (valor.startsWith("nocta:mesa:")) return valor.slice("nocta:mesa:".length);
  try {
    const url = new URL(valor);
    return url.searchParams.get("mesa");
  } catch {
    return null;
  }
}

export function CodigoQRMesa({ mesaId, nombre }: { mesaId: string; nombre: string }) {
  const [imagen, setImagen] = useState("");

  useEffect(() => {
    let vigente = true;
    void import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(contenidoQRMesa(mesaId), {
        width: 320,
        margin: 2,
        color: { dark: "#07060d", light: "#ffffff" },
      }),
    ).then((url) => {
      if (vigente) setImagen(url);
    });
    return () => { vigente = false; };
  }, [mesaId]);

  return (
    <div className="flex items-center gap-2">
      {imagen ? (
        <a href={imagen} download={`nocta-${mesaId}.png`} title={`Descargar QR de ${nombre}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagen} alt={`QR de ${nombre}`} className="w-14 h-14 rounded bg-white p-0.5" />
        </a>
      ) : <div className="w-14 h-14 rounded bg-white/10 animate-pulse" />}
      {imagen && (
        <a
          href={imagen}
          download={`nocta-${mesaId}.png`}
          className="text-xs text-neon3 border border-line rounded-full px-3 py-1.5"
        >
          ↓ QR
        </a>
      )}
    </div>
  );
}

export function EscanerMesa({
  onDetectar, onCerrar,
}: {
  onDetectar: (mesaId: string) => boolean;
  onCerrar: () => void;
}) {
  const reactId = useId();
  const elementId = `lector-qr-${reactId.replace(/:/g, "")}`;
  const resultadoRef = useRef(onDetectar);
  const [error, setError] = useState("");
  const [codigoManual, setCodigoManual] = useState("");

  useEffect(() => {
    resultadoRef.current = onDetectar;
  }, [onDetectar]);

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
          (texto) => {
            const mesaId = extraerMesaQR(texto);
            if (!mesaId || !resultadoRef.current(mesaId)) {
              setError("Este QR no corresponde a una mesa o VIP disponible de Nocta.");
            }
          },
          () => undefined,
        );
      } catch {
        setError("No pudimos abrir la cámara. Revisa el permiso o ingresa el código manualmente.");
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
    const mesaId = extraerMesaQR(codigoManual) ?? codigoManual.trim();
    if (!mesaId || !resultadoRef.current(mesaId)) {
      setError("Código de mesa no válido.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end sm:items-center justify-center">
      <section className="bg-surface border border-line w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-neon3">MESA / VIP</p>
            <h2 className="text-xl font-bold">Escanea el QR de tu mesa</h2>
          </div>
          <button onClick={onCerrar} className="text-muted text-2xl px-2" aria-label="Cerrar escáner">×</button>
        </div>
        <div id={elementId} className="overflow-hidden rounded-2xl bg-black min-h-64" />
        <p className="text-xs text-muted text-center">
          Apunta la cámara al código ubicado en la mesa. No necesitas tomar una foto.
        </p>
        {error && <p className="text-xs text-danger text-center">{error}</p>}
        <form onSubmit={validarManual} className="flex gap-2">
          <input
            value={codigoManual}
            onChange={(evento) => setCodigoManual(evento.target.value)}
            placeholder="Código manual, ej. mesa-1"
            className="card min-w-0 flex-1 px-3 py-2 bg-transparent outline-none text-sm"
          />
          <button className="rounded-full px-4 py-2 border border-neon3/50 text-neon3 text-sm font-semibold">
            Validar
          </button>
        </form>
      </section>
    </div>
  );
}
