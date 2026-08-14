"use client";

import { useEffect, useState } from "react";
import { contenidoEntradaQR } from "@/lib/tickets";

export function QREntrada({ codigo }: { codigo: string }) {
  const [imagen, setImagen] = useState("");

  useEffect(() => {
    let vigente = true;
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(contenidoEntradaQR(codigo), {
      width: 420, margin: 2, color: { dark: "#07060d", light: "#ffffff" },
    })).then((url) => { if (vigente) setImagen(url); });
    return () => { vigente = false; };
  }, [codigo]);

  return imagen ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imagen} alt="Código QR de entrada" className="w-64 h-64 mx-auto rounded-2xl bg-white p-2" />
  ) : <div className="w-64 h-64 mx-auto rounded-2xl bg-white/10 animate-pulse" />;
}
