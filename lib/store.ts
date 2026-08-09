"use client";

import { useEffect, useState } from "react";
import { crearDBInicial, COLORES_LUZ, PATRONES } from "./seed";
import type {
  DB, ItemPedido, MedioPago, ModoServicio, Pedido,
} from "./types";

const KEY = "nocta-db-v1";
const CHANNEL = "nocta-sync";

let cache: DB | null = null;
let canal: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function getCanal() {
  if (!canal && typeof window !== "undefined" && "BroadcastChannel" in window) {
    canal = new BroadcastChannel(CHANNEL);
    canal.onmessage = () => {
      cache = null;
      emitir();
    };
  }
  return canal;
}

function emitir() {
  listeners.forEach((l) => l());
}

export function leerDB(): DB {
  if (cache) return cache;
  if (typeof window === "undefined") return crearDBInicial();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      cache = JSON.parse(raw) as DB;
      return cache;
    }
  } catch {
    // datos corruptos → re-seed
  }
  cache = crearDBInicial();
  localStorage.setItem(KEY, JSON.stringify(cache));
  return cache;
}

export function guardarDB(mutar: (db: DB) => void) {
  // Relee localStorage antes de mutar: otra pestaña pudo escribir y el
  // evento 'storage' es asíncrono (evita contadores duplicados).
  cache = null;
  const db = leerDB();
  mutar(db);
  cache = db;
  localStorage.setItem(KEY, JSON.stringify(db));
  getCanal()?.postMessage("sync");
  emitir();
}

export function resetDemo() {
  cache = crearDBInicial();
  localStorage.setItem(KEY, JSON.stringify(cache));
  getCanal()?.postMessage("sync");
  emitir();
}

/** Hook: re-renderiza cuando cambia la DB (esta pestaña u otra). */
export function useDB(): DB | null {
  const [db, setDb] = useState<DB | null>(null);
  useEffect(() => {
    const refrescar = () => setDb({ ...leerDB() });
    refrescar();
    listeners.add(refrescar);
    getCanal();
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        cache = null;
        refrescar();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(refrescar);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return db;
}

/** Reloj compartido para edades/tiempos que corren. Devuelve el "ahora". */
export function useReloj(ms = 1000): number {
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    // Primer tick rápido para no mostrar 0:00 un segundo completo
    const primero = setTimeout(() => setAhora(Date.now()), 50);
    const id = setInterval(() => setAhora(Date.now()), ms);
    return () => {
      clearTimeout(primero);
      clearInterval(id);
    };
  }, [ms]);
  return ahora;
}

// ---------- Sesión cliente ----------
export function tokenCliente(): string {
  if (typeof window === "undefined") return "ssr";
  let t = localStorage.getItem("nocta-token");
  if (!t) {
    t = `c-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("nocta-token", t);
  }
  return t;
}

// ---------- Mutaciones de pedidos ----------
export function crearPedido(datos: {
  items: ItemPedido[];
  modo: ModoServicio;
  zonaId?: string;
  medioPago: MedioPago;
  propina: number;
  telefono?: string;
}): Pedido {
  let creado!: Pedido;
  guardarDB((db) => {
    db.contador += 1;
    const subtotal = datos.items.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
    const anticipado = datos.medioPago === "digital";
    creado = {
      id: `p-${Date.now()}-${db.contador}`,
      numero: db.contador,
      localId: "eclipse",
      modo: datos.modo,
      zonaId: datos.zonaId,
      items: datos.items,
      subtotal,
      propina: datos.propina,
      total: subtotal + datos.propina,
      medioPago: datos.medioPago,
      estadoPago: anticipado ? "pagado" : "pendiente",
      estado: "nuevo",
      pin: String(1000 + Math.floor(Math.random() * 9000)),
      clienteToken: tokenCliente(),
      telefono: datos.telefono,
      timestamps: { nuevo: Date.now() },
      creadoEn: Date.now(),
      cobro: anticipado
        ? {
            medio: "digital", monto: subtotal + datos.propina,
            referencia: `TX-${Math.floor(100000 + Math.random() * 899999)}`,
            ts: Date.now(),
          }
        : undefined,
    };
    db.pedidos.push(creado);
  });
  return creado;
}

function asignarLuz(db: DB, pedido: Pedido) {
  const activas = db.pedidos.filter(
    (p) => p.estado === "en_camino" && p.zonaId === pedido.zonaId && p.id !== pedido.id,
  );
  const usadas = new Set(activas.map((p) => `${p.color}|${p.patron}`));
  for (const pat of PATRONES) {
    for (const c of COLORES_LUZ) {
      if (!usadas.has(`${c.hex}|${pat}`)) {
        pedido.color = c.hex;
        pedido.colorNombre = c.nombre;
        pedido.patron = pat;
        return;
      }
    }
  }
  pedido.color = COLORES_LUZ[0].hex;
  pedido.colorNombre = COLORES_LUZ[0].nombre;
  pedido.patron = "solido";
}

export function avanzarPedido(id: string, nuevoEstado: Pedido["estado"]) {
  guardarDB((db) => {
    const p = db.pedidos.find((x) => x.id === id);
    if (!p) return;
    p.estado = nuevoEstado;
    p.timestamps[nuevoEstado] = Date.now();
    if (nuevoEstado === "en_camino") {
      if (p.modo === "zona") asignarLuz(db, p);
      if (!p.meseroId) {
        const meseros = db.staff.filter((s) => s.rol === "mesero" && s.activo);
        const carga = new Map(meseros.map((m) => [m.id, 0]));
        db.pedidos
          .filter((x) => x.estado === "en_camino" && x.meseroId)
          .forEach((x) => carga.set(x.meseroId!, (carga.get(x.meseroId!) ?? 0) + 1));
        p.meseroId = [...carga.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      }
    }
  });
}

export function registrarCobro(
  id: string,
  medio: MedioPago,
  cobradoPor: string,
  referencia?: string,
) {
  guardarDB((db) => {
    const p = db.pedidos.find((x) => x.id === id);
    if (!p) return;
    p.estadoPago = "pagado";
    p.cobro = { medio, monto: p.total, referencia, cobradoPor, ts: Date.now() };
  });
}

export function noEncontrado(id: string) {
  // Modo B: el cliente no aparece → pasa a recogida en barra express
  guardarDB((db) => {
    const p = db.pedidos.find((x) => x.id === id);
    if (!p) return;
    p.modo = "barra";
    p.estado = "listo";
    p.timestamps["a_barra"] = Date.now();
    p.notas = "Pasó a recogida en barra: cliente no localizado en zona";
  });
}

export function anularPedido(id: string, motivo: string) {
  guardarDB((db) => {
    const p = db.pedidos.find((x) => x.id === id);
    if (!p) return;
    p.estado = "anulado";
    p.timestamps["anulado"] = Date.now();
    p.notas = motivo;
    if (p.estadoPago === "pendiente") p.estadoPago = "no_pagado";
  });
}

export function toggleDisponible(productoId: string) {
  guardarDB((db) => {
    const pr = db.productos.find((x) => x.id === productoId);
    if (pr) pr.disponible = !pr.disponible;
  });
}

export function editarPrecio(productoId: string, precio: number) {
  guardarDB((db) => {
    const pr = db.productos.find((x) => x.id === productoId);
    if (pr && precio > 0) pr.precio = precio;
  });
}

// ---------- Helpers de formato ----------
export function cop(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

export function mmss(desde: number, ahora: number): string {
  const s = Math.max(0, Math.floor((ahora - desde) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
