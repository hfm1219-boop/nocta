import type { ItemPedido } from "./types";

export const NIVELES_DESCUENTO = [
  { cantidad: 6, porcentaje: 5 },
  { cantidad: 12, porcentaje: 10 },
  { cantidad: 24, porcentaje: 15 },
] as const;

export const VERSION_POLITICAS_PREORDEN = "2026-08-09";

export const POLITICAS_PREORDEN = [
  {
    titulo: "Hora límite del descuento",
    texto: "Debes presentarte y validar tu preorden antes de las 10:00 p. m. para conservar el descuento por volumen.",
  },
  {
    titulo: "Llegada después de las 10:00 p. m.",
    texto: "Si llegas después de las 10:00 p. m., deberás pagar la diferencia entre el precio regular y el valor descontado antes de recibir el pedido.",
  },
  {
    titulo: "Inasistencia",
    texto: "Si no te presentas, se retendrá el 50% del valor pagado. El 50% restante quedará como saldo para una próxima visita, sujeto a validación del local.",
  },
  {
    titulo: "Tiempo de espera",
    texto: "El local conservará la preorden durante 30 minutos después de la hora programada. Pasado ese tiempo podrá aplicar la política de inasistencia.",
  },
  {
    titulo: "Cambios y cancelaciones",
    texto: "Los cambios de productos o de hora están sujetos a disponibilidad. Solicita cualquier modificación al menos 2 horas antes de la llegada programada.",
  },
  {
    titulo: "Disponibilidad",
    texto: "Si un producto se agota, el local ofrecerá un reemplazo equivalente o devolverá la diferencia correspondiente.",
  },
  {
    titulo: "Edad y entrega",
    texto: "La compra no reemplaza la validación de edad. Debes presentar un documento válido y el código del pedido para recibir bebidas alcohólicas.",
  },
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
