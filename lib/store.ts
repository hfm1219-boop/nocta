"use client";

import { useEffect, useState } from "react";
import { crearDBInicial, crearDBParaLocal, COLORES_LUZ, PATRONES } from "./seed";
import type {
  DB, DespachoPedido, EstadoCancion, ItemPedido, MedioPago, ModoServicio, Pedido, SolicitudCancion, Vaquita,
} from "./types";

const LEGACY_KEY = "nocta-db-v1";
const ACTIVE_LOCAL_KEY = "nocta-active-local-v1";
const CHANNEL = "nocta-sync";

let cache: DB | null = null;
let canal: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

export function idLocalActivo(): string {
  if (typeof window === "undefined") return "la-movida";
  return localStorage.getItem(ACTIVE_LOCAL_KEY) || "la-movida";
}

function claveDB(): string {
  return `${LEGACY_KEY}:${idLocalActivo()}`;
}

export function seleccionarLocal(id: string, nombre?: string) {
  localStorage.setItem(ACTIVE_LOCAL_KEY, id);
  const key = `${LEGACY_KEY}:${id}`;
  if (!localStorage.getItem(key)) {
    const inicial = crearDBParaLocal(id, nombre || id);
    localStorage.setItem(key, JSON.stringify(inicial));
  }
  cache = null;
  emitir();
}

function normalizarDB(db: DB): DB {
  if (!Array.isArray(db.categorias)) db.categorias = crearDBInicial().categorias;
  if (!Array.isArray(db.solicitudesCanciones)) db.solicitudesCanciones = [];
  if (!Array.isArray(db.vaquitas)) db.vaquitas = [];
  if (!Array.isArray(db.estacionesDespacho)) {
    db.estacionesDespacho = crearDBInicial().estacionesDespacho;
  }
  db.config.preciosDinamicos ??= {
    activo: false,
    volatilidadPct: 12,
    sensibilidadDemandaPct: 8,
    intervaloMinutos: 5,
    precioMinPct: 80,
    precioMaxPct: 125,
  };
  db.config.pagoAlFinalActivo ??= false;
  return db;
}

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
  if (cache) return normalizarDB(cache);
  if (typeof window === "undefined") return crearDBInicial();
  try {
    const key = claveDB();
    const raw = localStorage.getItem(key)
      ?? (idLocalActivo() === "la-movida" ? localStorage.getItem(LEGACY_KEY) : null);
    if (raw) {
      cache = normalizarDB(JSON.parse(raw) as DB);
      return cache;
    }
  } catch {
    // datos corruptos → re-seed
  }
  cache = crearDBInicial();
  localStorage.setItem(claveDB(), JSON.stringify(cache));
  return cache;
}

export function guardarDB(mutar: (db: DB) => void) {
  // Relee localStorage antes de mutar: otra pestaña pudo escribir y el
  // evento 'storage' es asíncrono (evita contadores duplicados).
  cache = null;
  const db = leerDB();
  mutar(db);
  cache = db;
  localStorage.setItem(claveDB(), JSON.stringify(db));
  getCanal()?.postMessage("sync");
  emitir();
}

export function resetDemo() {
  const id = idLocalActivo();
  const nombre = leerDB().config.nombre;
  cache = crearDBParaLocal(id, nombre);
  localStorage.setItem(claveDB(), JSON.stringify(cache));
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
      if (e.key === claveDB() || e.key === ACTIVE_LOCAL_KEY) {
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
  tipo?: "inmediato" | "preorden";
  programadoPara?: number;
  descuento?: number;
  descuentoPct?: number;
  politicasPreordenVersion?: string;
  politicasPreordenAceptadasEn?: number;
  pagoAlFinal?: boolean;
  vaquitaId?: string;
}): Pedido {
  let creado!: Pedido;
  guardarDB((db) => {
    const subtotal = datos.items.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
    const descuento = datos.descuento ?? 0;
    const total = subtotal - descuento + datos.propina;
    const vaquitaPago = datos.vaquitaId
      ? db.vaquitas.find((vaquita) => vaquita.id === datos.vaquitaId)
      : undefined;
    if (datos.vaquitaId && (!vaquitaPago || vaquitaPago.estado !== "completa" || vaquitaPago.total !== total)) {
      throw new Error("La vaquita no está completa o no coincide con el total del pedido.");
    }
    db.contador += 1;
    const anticipado = datos.medioPago === "digital";
    const despachos = crearDespachosPedido(datos.items, datos.zonaId, db);
    creado = {
      id: `p-${Date.now()}-${db.contador}`,
      numero: db.contador,
      localId: idLocalActivo(),
      modo: datos.modo,
      zonaId: datos.zonaId,
      items: datos.items,
      subtotal,
      descuento,
      descuentoPct: datos.descuentoPct,
      propina: datos.propina,
      total,
      medioPago: datos.medioPago,
      estadoPago: anticipado ? "pagado" : "pendiente",
      estado: "nuevo",
      pin: String(1000 + Math.floor(Math.random() * 9000)),
      clienteToken: tokenCliente(),
      telefono: datos.telefono,
      timestamps: { nuevo: Date.now() },
      creadoEn: Date.now(),
      tipo: datos.tipo ?? "inmediato",
      programadoPara: datos.programadoPara,
      politicasPreordenVersion: datos.politicasPreordenVersion,
      politicasPreordenAceptadasEn: datos.politicasPreordenVersion
        ? (datos.politicasPreordenAceptadasEn ?? Date.now())
        : undefined,
      pagoAlFinal: datos.pagoAlFinal,
      vaquitaId: datos.vaquitaId,
      despachos,
      cobro: anticipado
        ? {
            medio: "digital", monto: total,
            referencia: datos.vaquitaId
              ? `VAQ-${vaquitaPago?.codigo ?? "GRUPO"}`
              : `TX-${Math.floor(100000 + Math.random() * 899999)}`,
            ts: Date.now(),
          }
        : undefined,
    };
    db.pedidos.push(creado);
    if (datos.vaquitaId) {
      const vaquita = db.vaquitas.find((item) => item.id === datos.vaquitaId);
      if (vaquita && vaquita.estado === "completa") {
        vaquita.estado = "convertida";
        vaquita.pedidoId = creado.id;
      }
    }
  });
  return creado;
}

function crearDespachosPedido(items: ItemPedido[], zonaId: string | undefined, db: DB): DespachoPedido[] {
  const grupos = new Map<string, number[]>();
  items.forEach((item, indice) => {
    const categoria = db.productos.find((producto) => producto.id === item.productoId)?.categoria ?? "general";
    const candidatas = db.estacionesDespacho.filter(
      (estacion) => estacion.activa && estacion.categorias.includes(categoria),
    );
    const estacion = candidatas.find((itemEstacion) => zonaId && itemEstacion.zonasCercanas.includes(zonaId))
      ?? candidatas.find((itemEstacion) => itemEstacion.id.includes("principal"))
      ?? candidatas[0];
    const estacionId = estacion?.id ?? "barra-general";
    grupos.set(estacionId, [...(grupos.get(estacionId) ?? []), indice]);
  });
  return [...grupos.entries()].map(([estacionId, itemIndices]) => ({
    estacionId, itemIndices, estado: "pendiente",
  }));
}

export function avanzarDespachoPedido(
  pedidoId: string,
  estacionId: string,
  estado: DespachoPedido["estado"],
) {
  let todasListas = false;
  let modo: ModoServicio = "barra";
  guardarDB((db) => {
    const pedido = db.pedidos.find((item) => item.id === pedidoId);
    const despacho = pedido?.despachos?.find((item) => item.estacionId === estacionId);
    if (!pedido || !despacho || ["entregado", "anulado", "vencido"].includes(pedido.estado)) return;
    despacho.estado = estado;
    modo = pedido.modo;
    todasListas = pedido.despachos?.every((item) => item.estado === "listo") ?? false;
    if (!todasListas && pedido.estado === "nuevo") {
      pedido.estado = "preparando";
      pedido.timestamps.preparando = Date.now();
    }
  });
  if (todasListas) {
    avanzarPedido(pedidoId, "listo");
    if (modo !== "barra") avanzarPedido(pedidoId, "en_camino");
  }
}

// ---------- Vaquitas ----------
export function crearVaquita(items: ItemPedido[], participantes: number): Vaquita {
  let creada!: Vaquita;
  guardarDB((db) => {
    const ahora = Date.now();
    const codigo = Math.random().toString(36).slice(2, 8).toUpperCase();
    creada = {
      id: `vaquita-${ahora}-${codigo}`,
      codigo,
      items: items.map((item) => ({ ...item, extras: item.extras ? [...item.extras] : undefined })),
      total: items.reduce((suma, item) => suma + item.precioUnit * item.cantidad, 0),
      participantesObjetivo: Math.min(8, Math.max(2, Math.round(participantes))),
      aportes: [],
      creadorToken: tokenCliente(),
      creadaEn: ahora,
      estado: "abierta",
    };
    db.vaquitas.push(creada);
  });
  return creada;
}

export function montoSiguienteAporte(vaquita: Vaquita): number {
  const aportado = vaquita.aportes.reduce((suma, aporte) => suma + aporte.monto, 0);
  const restantes = vaquita.participantesObjetivo - vaquita.aportes.length;
  if (restantes <= 1) return Math.max(0, vaquita.total - aportado);
  return Math.floor(vaquita.total / vaquita.participantesObjetivo);
}

export function aportarVaquita(codigo: string, nombre: string): boolean {
  let registrado = false;
  guardarDB((db) => {
    const vaquita = db.vaquitas.find((item) => item.codigo === codigo);
    if (!vaquita || vaquita.estado !== "abierta" || vaquita.aportes.length >= vaquita.participantesObjetivo) return;
    const monto = montoSiguienteAporte(vaquita);
    vaquita.aportes.push({
      id: `aporte-${Date.now()}-${vaquita.aportes.length + 1}`,
      nombre: nombre.trim() || `Amigo ${vaquita.aportes.length + 1}`,
      monto,
      clienteToken: tokenCliente(),
      creadoEn: Date.now(),
    });
    if (vaquita.aportes.length >= vaquita.participantesObjetivo) vaquita.estado = "completa";
    registrado = true;
  });
  return registrado;
}

function asignarLuz(db: DB, pedido: Pedido) {
  const activas = db.pedidos.filter(
    (p) => p.estado === "en_camino" && p.zonaId === pedido.zonaId && p.id !== pedido.id,
  );
  const usadas = new Set(activas.map((p) => `${p.color}|${p.patron}`));
  const numerosUsados = new Set(activas.map((p) => p.senalNumero).filter(Boolean));
  let numero = 1;
  while (numerosUsados.has(numero)) numero += 1;
  pedido.senalNumero = numero;
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
        const meseroMismaZona = db.pedidos.find(
          (x) => x.id !== p.id
            && x.estado === "en_camino"
            && x.zonaId === p.zonaId
            && x.meseroId
            && meseros.some((mesero) => mesero.id === x.meseroId),
        )?.meseroId;
        const carga = new Map(meseros.map((m) => [m.id, 0]));
        db.pedidos
          .filter((x) => x.estado === "en_camino" && x.meseroId)
          .forEach((x) => carga.set(x.meseroId!, (carga.get(x.meseroId!) ?? 0) + 1));
        p.meseroId = meseroMismaZona
          ?? [...carga.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
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

export function noEncontrado(id: string, barraId: string, barraNombre: string) {
  // Modo B: el cliente no aparece → pasa a recogida en barra express
  guardarDB((db) => {
    const p = db.pedidos.find((x) => x.id === id);
    if (!p) return;
    p.modo = "barra";
    p.estado = "listo";
    p.timestamps["a_barra"] = Date.now();
    p.barraRecogidaId = barraId;
    p.barraRecogidaNombre = barraNombre;
    p.notas = `No logramos encontrarte. Tu pedido quedó en ${barraNombre}.`;
  });
}

export function cambiarZonaPedidoCliente(id: string, zonaId: string): boolean {
  let actualizado = false;
  guardarDB((db) => {
    const pedido = db.pedidos.find((p) => p.id === id);
    const zona = db.zonas.find(
      (z) => z.id === zonaId && z.tipo === "zona" && z.entregable,
    );
    if (
      !pedido ||
      !zona ||
      pedido.clienteToken !== tokenCliente() ||
      pedido.modo !== "zona" ||
      ["entregado", "vencido", "anulado"].includes(pedido.estado)
    ) {
      return;
    }
    pedido.zonaId = zona.id;
    pedido.timestamps.zona_actualizada = Date.now();
    actualizado = true;
  });
  return actualizado;
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

// ---------- Rockola ----------
export function solicitarCancion(datos: {
  titulo: string;
  artista?: string;
  solicitadoPor?: string;
}): SolicitudCancion {
  let creada!: SolicitudCancion;
  guardarDB((db) => {
    const ahora = Date.now();
    creada = {
      id: `song-${ahora}-${Math.random().toString(36).slice(2, 7)}`,
      titulo: datos.titulo.trim(),
      artista: datos.artista?.trim() || undefined,
      solicitadoPor: datos.solicitadoPor?.trim() || undefined,
      clienteToken: tokenCliente(),
      estado: "pendiente",
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    db.solicitudesCanciones.push(creada);
  });
  return creada;
}

export function cambiarEstadoCancion(id: string, estado: EstadoCancion) {
  guardarDB((db) => {
    const cancion = db.solicitudesCanciones.find((item) => item.id === id);
    if (!cancion) return;
    cancion.estado = estado;
    cancion.actualizadoEn = Date.now();
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
