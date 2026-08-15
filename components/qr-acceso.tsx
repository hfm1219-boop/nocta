"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function QRAcceso({ contenido, alt }: { contenido: string; alt: string }) {
  const [imagen, setImagen] = useState("");
  useEffect(() => { let vigente = true; void import("qrcode").then(({default: QRCode}) => QRCode.toDataURL(contenido, { width: 420, margin: 2, color: {dark:"#07060d",light:"#ffffff"} })).then(url => { if(vigente) setImagen(url); }); return () => { vigente=false; }; }, [contenido]);
  return imagen ? <Image src={imagen} width={240} height={240} unoptimized alt={alt} className="mx-auto rounded-2xl bg-white p-2"/> : <div className="w-60 h-60 mx-auto rounded-2xl bg-white/10 animate-pulse"/>;
}
