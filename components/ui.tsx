"use client";

import Link from "next/link";
import { cop } from "@/lib/store";
import type { EstadoPedido, MedioPago, ModoServicio } from "@/lib/types";

export function Logo({ size = "text-3xl" }: { size?: string }) {
  return (
    <span className={`wordmark font-bold ${size} select-none`}>nocta</span>
  );
}

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  nuevo: "Recibido",
  preparando: "Preparando",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  vencido: "Vencido",
  anulado: "Anulado",
};

export const ETIQUETA_MODO: Record<ModoServicio, string> = {
  barra: "Barra express",
  zona: "Entrega por zona",
  mesa: "Mesa / VIP",
};

export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  digital: "Pago digital",
  efectivo: "Efectivo al recibir",
  datafono: "Datáfono al recibir",
};

export function BadgeEstado({ estado }: { estado: EstadoPedido }) {
  const colores: Record<EstadoPedido, string> = {
    nuevo: "bg-neon3/15 text-neon3",
    preparando: "bg-amber/15 text-amber",
    listo: "bg-lime/15 text-lime",
    en_camino: "bg-neon1/20 text-neon1",
    entregado: "bg-muted/15 text-muted",
    vencido: "bg-danger/15 text-danger",
    anulado: "bg-danger/15 text-danger",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colores[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

export function BadgePendienteCobro() {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/40">
      PENDIENTE DE COBRO
    </span>
  );
}

export function BotonPrimario({
  children, onClick, disabled, className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-neon rounded-full px-6 py-3.5 font-semibold text-white disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition ${className}`}
    >
      {children}
    </button>
  );
}

export function Precio({ valor, className = "" }: { valor: number; className?: string }) {
  return <span className={`font-bold text-neon2 ${className}`}>{cop(valor)}</span>;
}

export function VolverMenuRoles({ compacto = false }: { compacto?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Volver al menú de roles"
      className={`inline-flex items-center justify-center rounded-full border border-line text-muted hover:text-foreground hover:border-neon2/60 transition ${
        compacto ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
      }`}
    >
      <span className="sm:hidden">← Roles</span>
      <span className="hidden sm:inline">← Cambiar rol</span>
    </Link>
  );
}

export function EncabezadoStaff({
  titulo, subtitulo, extra,
}: {
  titulo: string;
  subtitulo?: string;
  extra?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur-lg bg-background/80 border-b border-line px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Logo size="text-xl" />
        <div className="min-w-0">
          <h1 className="font-bold leading-tight truncate">{titulo}</h1>
          {subtitulo && <p className="text-xs text-muted truncate">{subtitulo}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {extra}
        <VolverMenuRoles compacto />
      </div>
    </header>
  );
}

/** Muestra de color+patrón para modo B (mini pantalla-luz). */
export function MuestraLuz({
  color, patron, codigo, grande = false,
}: {
  color?: string;
  patron?: string;
  codigo?: number;
  grande?: boolean;
}) {
  if (!color) return null;
  return (
    <div
      className={`rounded-xl pat-${patron ?? "solido"} flex items-center justify-center ${grande ? "w-20 h-20" : "w-10 h-10"}`}
      style={{ background: color, boxShadow: `0 0 ${grande ? 24 : 12}px ${color}66` }}
    >
      {codigo && (
        <span className={`rounded-full bg-black/70 text-white font-black ${grande ? "px-3 py-1.5 text-xl" : "px-1.5 py-0.5 text-xs"}`}>
          {String(codigo).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}
