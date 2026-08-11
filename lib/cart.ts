"use client";

import { useEffect, useState } from "react";
import { idLocalActivo } from "./store";
import type { ItemPedido } from "./types";

const KEY = "nocta-cart-v2";
const listeners = new Set<() => void>();

function claveCarrito() {
  return `${KEY}:${idLocalActivo()}`;
}

function leer(): ItemPedido[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(claveCarrito()) ?? "[]");
  } catch {
    return [];
  }
}

function guardar(items: ItemPedido[]) {
  localStorage.setItem(claveCarrito(), JSON.stringify(items));
  listeners.forEach((l) => l());
}

export function useCarrito() {
  const [items, setItems] = useState<ItemPedido[]>([]);
  useEffect(() => {
    const refrescar = () => setItems(leer());
    refrescar();
    listeners.add(refrescar);
    return () => {
      listeners.delete(refrescar);
    };
  }, []);
  return items;
}

function claveItem(i: ItemPedido) {
  return `${i.productoId}|${i.tamano ?? ""}|${(i.extras ?? []).join(",")}`;
}

export function agregarItem(nuevo: ItemPedido) {
  const items = leer();
  const existente = items.find((i) => claveItem(i) === claveItem(nuevo));
  if (existente) existente.cantidad += nuevo.cantidad;
  else items.push(nuevo);
  guardar(items);
}

export function cambiarCantidad(idx: number, delta: number) {
  const items = leer();
  if (!items[idx]) return;
  items[idx].cantidad += delta;
  if (items[idx].cantidad <= 0) items.splice(idx, 1);
  guardar(items);
}

export function vaciarCarrito() {
  guardar([]);
}

export function reemplazarCarrito(items: ItemPedido[]) {
  guardar(items.map((item) => ({
    ...item,
    extras: item.extras ? [...item.extras] : undefined,
  })));
}

export function totalCarrito(items: ItemPedido[]) {
  return items.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
}
