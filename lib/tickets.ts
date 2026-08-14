"use client";

import { useMemo, useSyncExternalStore } from "react";

export interface TipoEntrada {
  id: string;
  nombre: string;
  precio: number;
  descripcion: string;
  cupo: number;
}

export interface EntradaComprada {
  id: string;
  codigo: string;
  eventoId: string;
  tipoId: string;
  tipoNombre: string;
  precio: number;
  titular: string;
  email: string;
  estado: "valida" | "usada" | "anulada";
  compradaEn: number;
  usadaEn?: number;
}

const KEY = "nocta-tickets-v1";
const EVENT = "nocta-tickets-change";

export const TIPOS_ENTRADA: Record<string, TipoEntrada[]> = {
  "ritual-caribe": [
    { id: "general", nombre: "General", precio: 45000, descripcion: "Acceso a los dos ambientes.", cupo: 120 },
    { id: "fast-pass", nombre: "Fast Pass", precio: 75000, descripcion: "Ingreso por fila prioritaria.", cupo: 30 },
    { id: "vip", nombre: "VIP", precio: 140000, descripcion: "Zona VIP y bebida de bienvenida.", cupo: 16 },
  ],
  "jugada-live": [
    { id: "general", nombre: "General", precio: 35000, descripcion: "Acceso a banda en vivo y cierre urbano.", cupo: 160 },
    { id: "palco", nombre: "Palco", precio: 90000, descripcion: "Ubicación preferencial y servicio a la mesa.", cupo: 24 },
  ],
  "luna-afro": [
    { id: "lista", nombre: "Lista confirmada", precio: 60000, descripcion: "Cupo limitado sujeto a disponibilidad.", cupo: 40 },
  ],
  "cardinal-sessions": [
    { id: "cortesia", nombre: "Entrada libre", precio: 0, descripcion: "Confirma tu asistencia para obtener el QR.", cupo: 80 },
  ],
};

function snapshot() {
  return typeof window === "undefined" ? "[]" : localStorage.getItem(KEY) ?? "[]";
}

function parsear(raw: string): EntradaComprada[] {
  try { return JSON.parse(raw) as EntradaComprada[]; } catch { return []; }
}

function guardar(entradas: EntradaComprada[]) {
  localStorage.setItem(KEY, JSON.stringify(entradas));
  window.dispatchEvent(new Event(EVENT));
}

function suscribir(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useEntradas() {
  const raw = useSyncExternalStore(suscribir, snapshot, () => "[]");
  return useMemo(() => parsear(raw), [raw]);
}

export function entradasDisponibles(eventoId: string, tipo: TipoEntrada, entradas = parsear(snapshot())) {
  const emitidas = entradas.filter((entrada) =>
    entrada.eventoId === eventoId
    && entrada.tipoId === tipo.id
    && entrada.estado !== "anulada",
  ).length;
  return Math.max(0, tipo.cupo - emitidas);
}

function codigoSeguro() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").toUpperCase();
}

export function comprarEntradas(datos: {
  eventoId: string;
  tipo: TipoEntrada;
  cantidad: number;
  titular: string;
  email: string;
}) {
  const actuales = parsear(snapshot());
  const tipoCanonico = TIPOS_ENTRADA[datos.eventoId]?.find((tipo) => tipo.id === datos.tipo.id);
  if (!tipoCanonico) throw new Error("Tipo de entrada no válido para este evento.");
  if (!Number.isInteger(datos.cantidad) || datos.cantidad < 1 || datos.cantidad > 4) {
    throw new Error("La cantidad debe estar entre 1 y 4 entradas.");
  }
  if (entradasDisponibles(datos.eventoId, tipoCanonico, actuales) < datos.cantidad) {
    throw new Error("No quedan suficientes entradas de esta localidad.");
  }
  const nuevas = Array.from({ length: datos.cantidad }, (_, indice): EntradaComprada => ({
    id: `ent-${Date.now()}-${indice}`,
    codigo: codigoSeguro(),
    eventoId: datos.eventoId,
    tipoId: datos.tipo.id,
    tipoNombre: tipoCanonico.nombre,
    precio: tipoCanonico.precio,
    titular: datos.titular.trim(),
    email: datos.email.trim(),
    estado: "valida",
    compradaEn: Date.now(),
  }));
  guardar([...actuales, ...nuevas]);
  return nuevas;
}

export function contenidoEntradaQR(codigo: string) {
  return `nocta:entrada:${codigo}`;
}

export function extraerCodigoEntrada(valor: string) {
  const limpio = valor.trim();
  return limpio.startsWith("nocta:entrada:") ? limpio.slice("nocta:entrada:".length) : limpio;
}

export function validarEntrada(valor: string): { estado: "aceptada" | "usada" | "invalida"; entrada?: EntradaComprada } {
  const codigo = extraerCodigoEntrada(valor);
  const entradas = parsear(snapshot());
  const indice = entradas.findIndex((entrada) => entrada.codigo === codigo);
  if (indice < 0 || entradas[indice].estado === "anulada") return { estado: "invalida" };
  if (entradas[indice].estado === "usada") return { estado: "usada", entrada: entradas[indice] };
  entradas[indice] = { ...entradas[indice], estado: "usada", usadaEn: Date.now() };
  guardar(entradas);
  return { estado: "aceptada", entrada: entradas[indice] };
}
