import type { ConfigPreciosDinamicos, DB, Producto } from "./types";

export interface CotizacionProducto {
  precio: number;
  anterior: number;
  cambioPct: number;
  tendencia: "sube" | "baja" | "estable";
}

export const CONFIG_PRECIOS_DEFAULT: ConfigPreciosDinamicos = {
  activo: false,
  volatilidadPct: 12,
  sensibilidadDemandaPct: 8,
  intervaloMinutos: 5,
  precioMinPct: 80,
  precioMaxPct: 125,
};

function hash(texto: string): number {
  let valor = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    valor ^= texto.charCodeAt(i);
    valor = Math.imul(valor, 16777619);
  }
  return valor >>> 0;
}

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function demandaReciente(db: DB, productoId: string, ahora: number): number {
  const desde = ahora - 60 * 60_000;
  return db.pedidos
    .filter((pedido) => pedido.creadoEn >= desde && !["anulado", "vencido"].includes(pedido.estado))
    .flatMap((pedido) => pedido.items)
    .filter((item) => item.productoId === productoId)
    .reduce((total, item) => total + item.cantidad, 0);
}

function precioEnPeriodo(producto: Producto, db: DB, ahora: number, periodo: number): number {
  const config = db.config.preciosDinamicos;
  const demanda = demandaReciente(db, producto.id, ahora);
  const presionDemanda = limitar((demanda - 4) / 4, -1, 1) * config.sensibilidadDemandaPct;
  const oscilacion = ((hash(`${producto.id}:${periodo}`) % 2001) / 1000 - 1) * config.volatilidadPct;
  const cambio = limitar(presionDemanda + oscilacion, -config.volatilidadPct, config.volatilidadPct);
  const factor = limitar(
    100 + cambio,
    config.precioMinPct,
    config.precioMaxPct,
  ) / 100;
  return Math.max(500, Math.round((producto.precio * factor) / 500) * 500);
}

export function cotizarProducto(producto: Producto, db: DB, ahora: number): CotizacionProducto {
  const config = db.config.preciosDinamicos;
  if (!config.activo || ahora <= 0) {
    return { precio: producto.precio, anterior: producto.precio, cambioPct: 0, tendencia: "estable" };
  }
  const intervaloMs = Math.max(1, config.intervaloMinutos) * 60_000;
  const periodo = Math.floor(ahora / intervaloMs);
  const precio = precioEnPeriodo(producto, db, ahora, periodo);
  const anterior = precioEnPeriodo(producto, db, ahora - intervaloMs, periodo - 1);
  const cambioPct = anterior ? ((precio - anterior) / anterior) * 100 : 0;
  return {
    precio,
    anterior,
    cambioPct,
    tendencia: precio > anterior ? "sube" : precio < anterior ? "baja" : "estable",
  };
}
