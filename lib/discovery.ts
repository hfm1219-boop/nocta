export type CategoriaLugar = "club" | "bar" | "rooftop" | "restaurante";

export interface LugarNocta {
  id: string;
  nombre: string;
  ciudad: string;
  zona: string;
  categoria: CategoriaLugar;
  categorias?: string[];
  descripcion: string;
  estilos: string[];
  rangoPrecio: "$$" | "$$$" | "$$$$";
  color: string;
  icono: string;
}

export interface EventoNocta {
  id: string;
  lugarId: string;
  nombre: string;
  resumen: string;
  descripcion: string;
  fechaISO: string;
  horaFin: string;
  generos: string[];
  precioDesde: number;
  disponibilidad: "disponible" | "ultimos" | "lista";
  edadMinima: number;
  dressCode: string;
  destacado?: boolean;
  color: string;
}

export const LUGARES: LugarNocta[] = [
  {
    id: "la-movida", nombre: "La Movida", ciudad: "Cartagena", zona: "Centro Histórico",
    categoria: "club", descripcion: "Club latino de dos ambientes en el corazón de Cartagena.",
    estilos: ["Latino", "Reggaetón", "House"], rangoPrecio: "$$$", color: "#ff2d9a", icono: "💃",
  },
  {
    id: "la-jugada-club-house", nombre: "La Jugada Club House", ciudad: "Cartagena", zona: "Centro Histórico",
    categoria: "club", descripcion: "Música en vivo, coctelería y noches que mezclan clásicos con sonidos urbanos.",
    estilos: ["Live", "Urbano", "Pop"], rangoPrecio: "$$$", color: "#b644ff", icono: "🎸",
  },
  {
    id: "casa-la-movida", nombre: "Casa La Movida", ciudad: "Cartagena", zona: "Getsemaní",
    categoria: "rooftop", descripcion: "Rooftop íntimo con coctelería de autor y sesiones de DJs invitados.",
    estilos: ["Afro House", "Disco"], rangoPrecio: "$$$$", color: "#22d3ee", icono: "🌙",
  },
  {
    id: "cardinal-bar", nombre: "Cardinal Bar", ciudad: "Cartagena", zona: "Centro Histórico",
    categoria: "bar", descripcion: "Bar de coctelería contemporánea para comenzar o cerrar la noche.",
    estilos: ["Lounge", "Soul"], rangoPrecio: "$$", color: "#fbbf24", icono: "🍸",
  },
  {
    id: "lobo-de-mar", nombre: "Lobo de Mar", ciudad: "Cartagena", zona: "Centro Histórico",
    categoria: "restaurante", descripcion: "Cocina de mar, fuego y producto fresco con una propuesta mediterránea y caribeña.",
    estilos: ["Mariscos", "Mediterráneo", "Coctelería"], rangoPrecio: "$$$$", color: "#0ea5a4", icono: "🐺",
  },
];

export const EVENTOS: EventoNocta[] = [
  {
    id: "ritual-caribe", lugarId: "la-movida", nombre: "Ritual Caribe",
    resumen: "Percusión, reggaetón y una pista encendida hasta el amanecer.",
    descripcion: "Una noche diseñada alrededor de los sonidos del Caribe. DJs residentes, invitados y una puesta de luces especial toman los dos ambientes de La Movida.",
    fechaISO: "2026-08-14T22:00:00-05:00", horaFin: "04:00", generos: ["Reggaetón", "Latino"],
    precioDesde: 45000, disponibilidad: "ultimos", edadMinima: 18, dressCode: "Smart casual", destacado: true, color: "#ff2d9a",
  },
  {
    id: "jugada-live", lugarId: "la-jugada-club-house", nombre: "La Jugada Live",
    resumen: "Banda en vivo, himnos para cantar y cierre urbano.",
    descripcion: "La banda de la casa abre la noche con clásicos latinos y pop. Después de medianoche, la cabina cambia el ritmo hacia sonidos urbanos.",
    fechaISO: "2026-08-15T21:00:00-05:00", horaFin: "03:00", generos: ["Live", "Pop", "Urbano"],
    precioDesde: 35000, disponibilidad: "disponible", edadMinima: 18, dressCode: "Casual elegante", destacado: true, color: "#b644ff",
  },
  {
    id: "luna-afro", lugarId: "casa-la-movida", nombre: "Luna Afro",
    resumen: "Afro house bajo las estrellas en una sesión de cupo limitado.",
    descripcion: "Una experiencia de rooftop de formato íntimo con selectores invitados, coctelería de autor y vista sobre Getsemaní.",
    fechaISO: "2026-08-16T20:00:00-05:00", horaFin: "02:00", generos: ["Afro House", "Organic"],
    precioDesde: 60000, disponibilidad: "lista", edadMinima: 21, dressCode: "Resort chic", color: "#22d3ee",
  },
  {
    id: "cardinal-sessions", lugarId: "cardinal-bar", nombre: "Cardinal Sessions",
    resumen: "Coctelería y una selección de soul, funk y disco.",
    descripcion: "Una sesión relajada que une la carta de Cardinal con vinilos, selectores locales y un ambiente perfecto para empezar la noche.",
    fechaISO: "2026-08-20T19:00:00-05:00", horaFin: "01:00", generos: ["Soul", "Funk", "Disco"],
    precioDesde: 0, disponibilidad: "disponible", edadMinima: 18, dressCode: "Casual", color: "#fbbf24",
  },
];

export function lugarPorId(id: string) {
  return LUGARES.find((lugar) => lugar.id === id);
}

export function eventoPorId(id: string) {
  return EVENTOS.find((evento) => evento.id === id);
}

export function formatearFecha(fechaISO: string, detallada = false) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: detallada ? "long" : "short",
    day: "numeric",
    month: detallada ? "long" : "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(fechaISO));
}
