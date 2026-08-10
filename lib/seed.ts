import type { DB, Pedido, Producto, UsuarioStaff, Zona } from "./types";

const TAM_COCTEL = [
  { id: "normal", nombre: "Normal", delta: 0 },
  { id: "doble", nombre: "Doble", delta: 8000 },
  { id: "jarra", nombre: "Jarra", delta: 25000 },
];

export const PRODUCTOS: Producto[] = [
  {
    id: "mojito", nombre: "Mojito Clásico", categoria: "cocteles",
    descripcion: "Ron, hierbabuena fresca, jugo de limón, azúcar y soda.",
    precio: 32000, icono: "🍹", color: "#ff2d9a", disponible: true,
    tamanos: TAM_COCTEL,
    extras: [
      { id: "hierbabuena", nombre: "Extra hierbabuena", precio: 2000 },
      { id: "sinazucar", nombre: "Sin azúcar", precio: 0 },
      { id: "extraron", nombre: "Extra ron", precio: 6000 },
    ],
  },
  {
    id: "gintonic", nombre: "Gin Tonic", categoria: "cocteles",
    descripcion: "Ginebra premium, tónica, limón y enebro.",
    precio: 28000, icono: "🍸", color: "#22d3ee", disponible: true,
    tamanos: TAM_COCTEL,
    extras: [
      { id: "pepino", nombre: "Twist de pepino", precio: 2000 },
      { id: "premium", nombre: "Tónica premium", precio: 5000 },
    ],
  },
  {
    id: "margarita", nombre: "Margarita", categoria: "cocteles",
    descripcion: "Tequila, triple sec, limón y borde de sal.",
    precio: 30000, icono: "🍸", color: "#a3e635", disponible: true,
    tamanos: TAM_COCTEL,
    extras: [{ id: "frozen", nombre: "Frozen", precio: 3000 }],
  },
  {
    id: "cubalibre", nombre: "Cuba Libre", categoria: "cocteles",
    descripcion: "Ron, cola y limón.",
    precio: 24000, icono: "🥃", color: "#fbbf24", disponible: true,
    tamanos: TAM_COCTEL,
  },
  {
    id: "aguardiente-btl", nombre: "Aguardiente — Botella", categoria: "licores",
    descripcion: "Botella 750 ml con hielera, limón y mezcladores.",
    precio: 130000, icono: "🍾", color: "#b644ff", disponible: true,
  },
  {
    id: "ron-btl", nombre: "Ron Añejo — Botella", categoria: "licores",
    descripcion: "Botella 750 ml con hielera y mezcladores.",
    precio: 180000, icono: "🍾", color: "#fbbf24", disponible: true,
  },
  {
    id: "whisky-btl", nombre: "Whisky 12 años — Botella", categoria: "licores",
    descripcion: "Botella 750 ml con hielera y mezcladores.",
    precio: 260000, icono: "🥃", color: "#f97316", disponible: true,
  },
  {
    id: "cerveza", nombre: "Cerveza Nacional", categoria: "cervezas",
    descripcion: "330 ml, bien fría.",
    precio: 9000, icono: "🍺", color: "#fbbf24", disponible: true,
  },
  {
    id: "cerveza-imp", nombre: "Cerveza Importada", categoria: "cervezas",
    descripcion: "330 ml.",
    precio: 14000, icono: "🍺", color: "#22d3ee", disponible: true,
  },
  {
    id: "michelada", nombre: "Michelada", categoria: "cervezas",
    descripcion: "Cerveza con limón, sal y salsas.",
    precio: 13000, icono: "🍺", color: "#a3e635", disponible: true,
  },
  {
    id: "shot-tequila", nombre: "Shot de Tequila", categoria: "shots",
    descripcion: "Con sal y limón.",
    precio: 15000, icono: "🥂", color: "#ff2d9a", disponible: true,
  },
  {
    id: "ronda-shots", nombre: "Ronda de Shots ×6", categoria: "shots",
    descripcion: "Seis shots para la mesa. Elige aguardiente o tequila.",
    precio: 75000, icono: "🥂", color: "#b644ff", disponible: true,
  },
  {
    id: "agua", nombre: "Agua con gas", categoria: "sinalcohol",
    descripcion: "600 ml.",
    precio: 6000, icono: "🫧", color: "#22d3ee", disponible: true,
  },
  {
    id: "gaseosa", nombre: "Gaseosa", categoria: "sinalcohol",
    descripcion: "400 ml.",
    precio: 7000, icono: "🥤", color: "#ff2d9a", disponible: true,
  },
];

export const CATEGORIAS = [
  { id: "cocteles", nombre: "Cócteles", icono: "🍸" },
  { id: "licores", nombre: "Botellas", icono: "🍾" },
  { id: "cervezas", nombre: "Cervezas", icono: "🍺" },
  { id: "shots", nombre: "Shots", icono: "🥂" },
  { id: "sinalcohol", nombre: "Sin alcohol", icono: "🫧" },
];

export const ZONAS: Zona[] = [
  { id: "terraza1", nombre: "Terraza 1", tipo: "zona", entregable: true },
  { id: "terraza2", nombre: "Terraza 2", tipo: "zona", entregable: true },
  { id: "tarima-izq", nombre: "Tarima izquierda", tipo: "zona", entregable: true },
  { id: "tarima-der", nombre: "Tarima derecha", tipo: "zona", entregable: true },
  { id: "pista", nombre: "Pista de baile", tipo: "zona", entregable: false },
  { id: "mesa-1", nombre: "Mesa 1", tipo: "mesa", entregable: true },
  { id: "mesa-2", nombre: "Mesa 2", tipo: "mesa", entregable: true },
  { id: "mesa-3", nombre: "Mesa 3", tipo: "mesa", entregable: true },
  { id: "vip-1", nombre: "VIP 1", tipo: "vip", entregable: true, consumoMinimo: 500000 },
  { id: "vip-2", nombre: "VIP 2", tipo: "vip", entregable: true, consumoMinimo: 800000 },
];

export const STAFF: UsuarioStaff[] = [
  { id: "st-admin", nombre: "Administración", rol: "admin", pin: "0000", activo: true },
  { id: "st-barra1", nombre: "Katia (Barra)", rol: "barra", pin: "1111", activo: true },
  { id: "st-barra2", nombre: "Deivis (Barra)", rol: "barra", pin: "2222", activo: true },
  { id: "st-mesero1", nombre: "Luisa", rol: "mesero", pin: "3333", activo: true },
  { id: "st-mesero2", nombre: "Andrés", rol: "mesero", pin: "4444", activo: true },
  { id: "st-mesero3", nombre: "Paola", rol: "mesero", pin: "5555", activo: true },
];

export const COLORES_LUZ = [
  { nombre: "Fucsia", hex: "#ff2d9a" },
  { nombre: "Cian", hex: "#22d3ee" },
  { nombre: "Lima", hex: "#a3e635" },
  { nombre: "Ámbar", hex: "#fbbf24" },
  { nombre: "Violeta", hex: "#b644ff" },
];
export const PATRONES = ["solido", "pulso", "franjas", "destello"];

// ---- Pedidos históricos de la noche (para reportes y cierre) ----
// Determinístico para que la demo siempre cuadre igual.
function pseudoRandom(seedInit: number) {
  let seed = seedInit;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function generarHistorico(): Pedido[] {
  const rnd = pseudoRandom(42);
  const pedidos: Pedido[] = [];
  const ahora = Date.now();
  // Noche arrancó hace ~4 horas
  const inicio = ahora - 4 * 3600_000;
  const meseros = ["st-mesero1", "st-mesero2", "st-mesero3"];
  const cobradores = ["st-barra1", "st-barra2", ...meseros];
  let numero = 1;

  for (let i = 0; i < 58; i++) {
    const t = inicio + rnd() * 3.6 * 3600_000;
    const nProductos = 1 + Math.floor(rnd() * 3);
    const items = [];
    let subtotal = 0;
    for (let j = 0; j < nProductos; j++) {
      const p = PRODUCTOS[Math.floor(rnd() * PRODUCTOS.length)];
      const cant = 1 + Math.floor(rnd() * 2);
      items.push({
        productoId: p.id, nombre: p.nombre, precioUnit: p.precio, cantidad: cant,
      });
      subtotal += p.precio * cant;
    }
    const medioRoll = rnd();
    const medio = medioRoll < 0.55 ? "digital" : medioRoll < 0.8 ? "datafono" : "efectivo";
    const modoRoll = rnd();
    const modo = modoRoll < 0.5 ? "barra" : modoRoll < 0.8 ? "zona" : "mesa";
    const zonasEntregables = ZONAS.filter((z) => z.entregable);
    const zona = modo === "barra" ? undefined
      : zonasEntregables[Math.floor(rnd() * zonasEntregables.length)].id;
    const propina = rnd() < 0.4 ? Math.round((subtotal * 0.1) / 500) * 500 : 0;
    const total = subtotal + propina;
    const tListo = t + (2 + rnd() * 6) * 60_000;
    const tEntregado = tListo + (1 + rnd() * 4) * 60_000;
    const cobrador = medio === "digital" ? undefined
      : cobradores[Math.floor(rnd() * cobradores.length)];

    pedidos.push({
      id: `h-${i}`, numero: numero++, localId: "eclipse", modo,
      zonaId: zona, items, subtotal, propina, total,
      medioPago: medio, estadoPago: "pagado", estado: "entregado",
      pin: String(1000 + Math.floor(rnd() * 9000)),
      meseroId: modo === "zona" ? meseros[Math.floor(rnd() * meseros.length)] : undefined,
      cobro: {
        medio, monto: total,
        referencia: medio === "digital" ? `TX-${100000 + Math.floor(rnd() * 899999)}`
          : medio === "datafono" ? `AP-${String(10000 + Math.floor(rnd() * 89999))}` : undefined,
        cobradoPor: cobrador, ts: tEntregado,
      },
      clienteToken: `demo-${i}`,
      timestamps: { nuevo: t, preparando: t + 40_000, listo: tListo, entregado: tEntregado },
      creadoEn: t,
    });
  }
  return pedidos.sort((a, b) => a.creadoEn - b.creadoEn).map((p, i) => ({ ...p, numero: i + 1 }));
}

export function crearDBInicial(): DB {
  const historico = generarHistorico();
  return {
    version: 1,
    productos: PRODUCTOS.map((p) => ({ ...p })),
    zonas: ZONAS.map((z) => ({ ...z })),
    staff: STAFF.map((s) => ({ ...s })),
    config: {
      nombre: "Eclipse Rooftop",
      mediosHabilitados: { digital: true, efectivo: true, datafono: true },
      efectivoEnZona: false,
      topeContraEntrega: 150000,
      recaudoActivo: true,
      ventanaAbierta: true,
      minutosVencimiento: 20,
      minutosNoEncontrado: 3,
      preciosDinamicos: {
        activo: false,
        volatilidadPct: 12,
        sensibilidadDemandaPct: 8,
        intervaloMinutos: 5,
        precioMinPct: 80,
        precioMaxPct: 125,
      },
      pagoAlFinalActivo: false,
    },
    pedidos: historico,
    contador: historico.length,
    nocheCerrada: false,
    efectivoDeclarado: {},
    solicitudesCanciones: [],
    vaquitas: [],
    estacionesDespacho: [
      {
        id: "cocteles-terraza", nombre: "Coctelería Terraza",
        categorias: ["cocteles", "shots"],
        zonasCercanas: ["terraza1", "tarima-izq"], activa: true,
      },
      {
        id: "cocteles-principal", nombre: "Coctelería Principal",
        categorias: ["cocteles", "shots"],
        zonasCercanas: ["terraza2", "tarima-der", "mesa-1", "mesa-2", "mesa-3", "vip-1", "vip-2"], activa: true,
      },
      {
        id: "nevera-terraza", nombre: "Nevera Terraza",
        categorias: ["cervezas", "sinalcohol"],
        zonasCercanas: ["terraza1", "tarima-izq"], activa: true,
      },
      {
        id: "nevera-principal", nombre: "Nevera Principal",
        categorias: ["cervezas", "sinalcohol"],
        zonasCercanas: ["terraza2", "tarima-der", "mesa-1", "mesa-2", "mesa-3", "vip-1", "vip-2"], activa: true,
      },
      {
        id: "botelleria", nombre: "Botellería Principal",
        categorias: ["licores"], zonasCercanas: [], activa: true,
      },
    ],
  };
}

export const LOCALES_DEMO = [
  {
    id: "eclipse", nombre: "Eclipse Rooftop", ciudad: "Cartagena", fase: 2 as const,
    estadoRecaudo: "activo" as const, pedidosNoche: 58, ticketProm: 61000,
    pctDigital: 55, activo: true,
  },
  {
    id: "lacava", nombre: "La Cava Club", ciudad: "Barranquilla", fase: 1 as const,
    estadoRecaudo: "en_vinculacion" as const, pedidosNoche: 34, ticketProm: 48000,
    pctDigital: 0, activo: true,
  },
  {
    id: "maradentro", nombre: "Mar Adentro Beach Club", ciudad: "Cartagena", fase: 1 as const,
    estadoRecaudo: "pendiente" as const, pedidosNoche: 0, ticketProm: 0,
    pctDigital: 0, activo: false,
  },
];
