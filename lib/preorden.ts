import type { ItemPedido } from "./types";

export const NIVELES_DESCUENTO = [
  { cantidad: 6, porcentaje: 5 },
  { cantidad: 12, porcentaje: 10 },
  { cantidad: 24, porcentaje: 15 },
] as const;

export function cantidadTotal(items: ItemPedido[]): number {
  return items.reduce((total, item) => total + item.cantidad, 0);
}

export function porcentajeDescuentoVolumen(items: ItemPedido[]): number {
  const cantidad = cantidadTotal(items);
  return [...NIVELES_DESCUENTO]
    .reverse()
    .find((nivel) => cantidad >= nivel.cantidad)?.porcentaje ?? 0;
}

export function descuentoVolumen(items: ItemPedido[], subtotal: number): number {
  return Math.round((subtotal * porcentajeDescuentoVolumen(items)) / 100 / 500) * 500;
}

export function siguienteNivel(items: ItemPedido[]) {
  const cantidad = cantidadTotal(items);
  return NIVELES_DESCUENTO.find((nivel) => cantidad < nivel.cantidad);
}
