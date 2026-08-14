"use client";

import { useMemo, useSyncExternalStore } from "react";

export type IntencionPedido = {
  tipo: "preorden";
  eventoId: string;
  eventoNombre: string;
  llegadaSugerida: string;
};

const KEY = "nocta-order-intent-v1";
const EVENT = "nocta-order-intent-change";

export function guardarIntencionPreorden(intencion: IntencionPedido) {
  localStorage.setItem(KEY, JSON.stringify(intencion));
  window.dispatchEvent(new Event(EVENT));
}

export function leerIntencionPedido(): IntencionPedido | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as IntencionPedido | null;
  } catch {
    return null;
  }
}

export function limpiarIntencionPedido() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  }
}

function suscribir(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function snapshot() {
  return localStorage.getItem(KEY) ?? "";
}

export function useIntencionPedido(): IntencionPedido | null {
  const serializada = useSyncExternalStore(suscribir, snapshot, () => "");
  return useMemo(() => {
    if (!serializada) return null;
    try {
      return JSON.parse(serializada) as IntencionPedido;
    } catch {
      return null;
    }
  }, [serializada]);
}
