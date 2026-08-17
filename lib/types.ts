export type ModoServicio = "barra" | "zona" | "mesa";
export type MedioPago = "digital" | "efectivo" | "datafono";

// Estados operativos del pedido (spec §9):
// creado → (pagado | pendiente_pago) → preparando → listo → en_camino →
// entregado / vencido / anulado / reembolsado
export type EstadoPedido =
  | "nuevo" // creado y aceptado a cola (pagado o pendiente de pago)
  | "preparando"
  | "listo"
  | "en_camino"
  | "entregado"
  | "vencido"
  | "anulado";

export type EstadoPago = "pagado" | "pendiente" | "reembolsado" | "no_pagado";

export interface Categoria {
  id: string;
  nombre: string;
  icono: string; // emoji
}

export interface Tamano {
  id: string;
  nombre: string;
  delta: number; // COP adicionales sobre el precio base
}

export interface Extra {
  id: string;
  nombre: string;
  precio: number;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: number;
  icono: string; // emoji
  color: string; // acento de la tarjeta
  imagenUrl?: string;
  disponible: boolean;
  tamanos?: Tamano[];
  extras?: Extra[];
}

export interface Zona {
  id: string;
  nombre: string;
  tipo: "zona" | "mesa" | "vip";
  entregable: boolean;
  consumoMinimo?: number;
}

export interface ItemPedido {
  productoId: string;
  menuItemId?: string;
  nombre: string; // snapshot
  precioUnit: number; // snapshot con tamaño y extras
  cantidad: number;
  tamano?: string;
  extras?: string[];
}

export interface Cobro {
  medio: MedioPago;
  monto: number;
  referencia?: string; // nro aprobación datáfono o ref transacción digital
  cobradoPor?: string; // staff id
  ts: number;
}

export interface Pedido {
  id: string;
  numero: number; // número corto
  localId: string;
  modo: ModoServicio;
  zonaId?: string;
  items: ItemPedido[];
  subtotal: number;
  descuento?: number;
  descuentoPct?: number;
  propina: number;
  total: number;
  medioPago: MedioPago;
  estadoPago: EstadoPago;
  estado: EstadoPedido;
  pin: string;
  color?: string; // hex asignado en modo zona
  colorNombre?: string;
  patron?: string; // solido | pulso | franjas | destello
  senalNumero?: number; // identificador único entre entregas activas de la misma zona
  meseroId?: string;
  cobro?: Cobro;
  clienteToken: string;
  telefono?: string;
  timestamps: Partial<Record<string, number>>; // estado → epoch ms
  creadoEn: number;
  tipo?: "inmediato" | "preorden";
  programadoPara?: number;
  politicasPreordenVersion?: string;
  politicasPreordenAceptadasEn?: number;
  pagoAlFinal?: boolean;
  vaquitaId?: string;
  promotionRedemptionId?: string;
  promotionTitle?: string;
  despachos?: DespachoPedido[];
  notas?: string;
  barraRecogidaId?: string;
  barraRecogidaNombre?: string;
}

export interface DespachoPedido {
  estacionId: string;
  itemIndices: number[];
  estado: "pendiente" | "preparando" | "listo";
}

export interface EstacionDespacho {
  id: string;
  nombre: string;
  categorias: string[];
  zonasCercanas: string[];
  activa: boolean;
}

export interface UsuarioStaff {
  id: string;
  nombre: string;
  rol: "barra" | "cocina" | "mesero" | "admin";
  pin: string;
  activo: boolean;
}

export type EstadoCancion = "pendiente" | "sonando" | "reproducida";

export interface SolicitudCancion {
  id: string;
  titulo: string;
  artista?: string;
  solicitadoPor?: string;
  clienteToken: string;
  estado: EstadoCancion;
  creadoEn: number;
  actualizadoEn: number;
}

export interface AporteVaquita {
  id: string;
  nombre: string;
  monto: number;
  clienteToken: string;
  creadoEn: number;
}

export interface Vaquita {
  id: string;
  codigo: string;
  items: ItemPedido[];
  total: number;
  participantesObjetivo: number;
  aportes: AporteVaquita[];
  creadorToken: string;
  creadaEn: number;
  estado: "abierta" | "completa" | "convertida";
  pedidoId?: string;
}

export interface ConfigLocal {
  nombre: string;
  funciones: {
    rockola: boolean;
    preorden: boolean;
    recepcionBarra: boolean;
    recepcionZona: boolean;
    recepcionMesa: boolean;
  };
  mediosHabilitados: Record<MedioPago, boolean>;
  efectivoEnZona: boolean; // modo B con efectivo requiere autorización expresa
  topeContraEntrega: number; // por encima exige pago anticipado
  recaudoActivo: boolean; // kill switch → conmutar a contra entrega
  ventanaAbierta: boolean; // horario de servicio
  minutosVencimiento: number; // pedido pagado no retirado
  minutosNoEncontrado: number; // modo B → pasa a barra
  preciosDinamicos: ConfigPreciosDinamicos;
  pagoAlFinalActivo: boolean;
}

export interface ConfigPreciosDinamicos {
  activo: boolean;
  volatilidadPct: number;
  sensibilidadDemandaPct: number;
  intervaloMinutos: number;
  precioMinPct: number;
  precioMaxPct: number;
}

export interface LocalResumen {
  id: string;
  nombre: string;
  ciudad: string;
  fase: 1 | 2 | 3;
  estadoRecaudo: "activo" | "en_vinculacion" | "pendiente";
  pedidosNoche: number;
  ticketProm: number;
  pctDigital: number;
  activo: boolean;
}

export interface DB {
  version: number;
  categorias: Categoria[];
  productos: Producto[];
  zonas: Zona[];
  staff: UsuarioStaff[];
  config: ConfigLocal;
  pedidos: Pedido[];
  contador: number;
  nocheCerrada: boolean;
  efectivoDeclarado: Record<string, number>; // staffId → monto declarado en cierre
  solicitudesCanciones: SolicitudCancion[];
  vaquitas: Vaquita[];
  estacionesDespacho: EstacionDespacho[];
}
