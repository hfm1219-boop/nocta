"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";

const suscribirOrigen = () => () => undefined;

export function QRExperiencia({ eventoId, nombre }: { eventoId: string; nombre: string }) {
  const [qr, setQr] = useState(""); const [copiado, setCopiado] = useState(false);
  const origen = useSyncExternalStore(suscribirOrigen, () => window.location.origin, () => "");
  const url = `${origen}/experiencias/${eventoId}`;
  useEffect(() => { void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(`${window.location.origin}/experiencias/${eventoId}`, { width: 640, margin: 2, color: { dark: "#08080d", light: "#ffffff" } })).then(setQr); }, [eventoId]);
  async function copiar() { await navigator.clipboard.writeText(url); setCopiado(true); window.setTimeout(() => setCopiado(false), 1500); }
  return <section className="card p-5"><h2 className="font-bold">Invitación y registro</h2><p className="text-xs text-muted mt-1">Comparte este enlace o imprime el QR para que los asistentes se registren.</p><div className="flex flex-col sm:flex-row gap-5 items-center mt-4">{qr && <Image src={qr} width={160} height={160} unoptimized alt={`QR de ${nombre}`} className="rounded-xl"/>}<div className="min-w-0 flex-1 w-full"><p className="font-mono text-xs break-all">{url}</p><div className="flex flex-wrap gap-2 mt-4"><button onClick={copiar} className="rounded-xl border border-line px-4 py-2 text-sm">{copiado ? "✓ Copiado" : "Copiar enlace"}</button>{qr && <a href={qr} download={`qr-${eventoId}.png`} className="btn-neon rounded-xl px-4 py-2 text-sm">Descargar QR</a>}</div></div></div></section>;
}
