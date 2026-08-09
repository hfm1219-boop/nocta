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
  notas?: string;
}

export interface UsuarioStaff {
  id: string;
  nombre: string;
  rol: "barra" | "mesero" | "admin";
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

export interface ConfigLocal {
  nombre: string;
  mediosHabilitados: Record<MedioPago, boolean>;
  efectivoEnZona: boolean; // modo B con efectivo requiere autorización expresa
  topeContraEntrega: number; // por encima exige pago anticipado
  recaudoActivo: boolean; // kill switch → conmutar a contra entrega
  ventanaAbierta: boolean; // horario de servicio
  minutosVencimiento: number; // pedido pagado no retirado
  minutosNoEncontrado: number; // modo B → pasa a barra
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
  productos: Producto[];
  zonas: Zona[];
  staff: UsuarioStaff[];
  config: ConfigLocal;
  pedidos: Pedido[];
  contador: number;
  nocheCerrada: boolean;
  efectivoDeclarado: Record<string, number>; // staffId → monto declarado en cierre
  solicitudesCanciones: SolicitudCancion[];
}
