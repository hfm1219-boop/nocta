"use client";

import { useMemo, useSyncExternalStore } from "react";

export type TipoExperiencia = "dating" | "networking" | "social" | "community";
export type ModoMatching = "one-to-one" | "groups" | "rounds";
export type EstadoExperiencia = "draft" | "open" | "matching" | "revealed" | "closed";

export interface RespuestasAfinidad {
  intent?: string;
  openness?: number;
  energy?: string;
  ambition?: number;
  wellness?: number;
  interests?: string[];
  convType?: string;
  phrase?: string;
}

export interface ParticipanteSocial {
  id: string;
  nombre: string;
  telefono: string;
  edad: number;
  genero: string;
  intencion: string;
  consentimiento: boolean;
  respuestas: RespuestasAfinidad;
  cuestionarioCompleto: boolean;
  checkin: boolean;
  matchId?: string;
  compatibilidad?: number;
  feedback?: { rating: number; volveria: string; comentario: string };
  creadoEn: number;
}

export interface ExperienciaSocial {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: TipoExperiencia;
  lugarId: string;
  lugarNombre: string;
  fechaISO: string;
  capacidad: number;
  modoMatching: ModoMatching;
  horaRevelacion: string;
  estado: EstadoExperiencia;
  promotor: string;
  participantes: ParticipanteSocial[];
  creadaEn: number;
  demo?: boolean;
}

export const PREGUNTAS_AFINIDAD = [
  { id: "intent", type: "single", text: "¿Qué buscas principalmente esta noche?", options: ["Conocer pareja", "Networking profesional", "Nuevas amistades", "Ampliar mi comunidad"] },
  { id: "openness", type: "scale", text: "¿Qué tan abierto/a estás a conocer personas nuevas?", labels: ["Prefiero pocos", "Entre más, mejor"] },
  { id: "energy", type: "single", text: "¿Cómo describes tu energía social esta noche?", options: ["Tranquila y observadora", "Equilibrada", "Activa y conversadora", "Muy sociable"] },
  { id: "ambition", type: "scale", text: "¿Qué tanto valoras la ambición profesional en los demás?", labels: ["Poco relevante", "Muy importante"] },
  { id: "wellness", type: "scale", text: "¿Qué tan central es la vida saludable en tu estilo de vida?", labels: ["No es prioridad", "Es fundamental"] },
  { id: "interests", type: "multi", text: "Elige hasta tres intereses que más te representen.", options: ["Gastronomía", "Viajes", "Música", "Deporte", "Negocios", "Arte", "Tecnología", "Vida nocturna"] },
  { id: "convType", type: "single", text: "¿Qué tipo de conversación disfrutas más?", options: ["Ideas y proyectos", "Viajes y experiencias", "Cultura y arte", "Cotidianidad y humor"] },
  { id: "phrase", type: "single", text: "¿Cuál frase te describe mejor?", options: ["Prefiero pocos momentos intensos a muchos superficiales", "Me energiza conocer gente nueva", "Busco conversaciones que me hagan pensar diferente", "Valoro la autenticidad por encima de todo"] },
] as const;

const KEY = "nocta-social-events-v1";
const SESSION_KEY = "nocta-social-participant-v1";
const EVENT = "nocta-social-events-change";

function participanteSemilla(id: string, nombre: string, edad: number, intencion: string, intereses: string[], energia: string): ParticipanteSocial {
  return {
    id, nombre, telefono: "+57 300 000 0000", edad, genero: "Prefiero no decir", intencion,
    consentimiento: true, cuestionarioCompleto: true, checkin: true, creadoEn: Date.now() - edad * 1000,
    respuestas: { intent: intencion, openness: 4, energy: energia, ambition: 4, wellness: 3, interests: intereses, convType: "Viajes y experiencias", phrase: "Valoro la autenticidad por encima de todo" },
  };
}

export const EXPERIENCIA_DEMO: ExperienciaSocial = {
  id: "cartagena-social-match", nombre: "Cartagena Social Match Night",
  descripcion: "Conexiones reales, afinidad y conversaciones auténticas en una experiencia guiada.",
  tipo: "social", lugarId: "casa-la-movida", lugarNombre: "Casa La Movida",
  fechaISO: "2026-08-22T20:00:00-05:00", capacidad: 40, modoMatching: "one-to-one",
  horaRevelacion: "21:30", estado: "open", promotor: "NOCTA Social Club", creadaEn: Date.now() - 86_400_000,
  demo: true,
  participantes: [
    participanteSemilla("demo-valentina", "Valentina M.", 29, "Networking profesional", ["Gastronomía", "Viajes", "Música"], "Activa y conversadora"),
    participanteSemilla("demo-santiago", "Santiago R.", 34, "Conocer pareja", ["Viajes", "Deporte", "Música"], "Equilibrada"),
    participanteSemilla("demo-isabela", "Isabela C.", 27, "Nuevas amistades", ["Arte", "Música", "Gastronomía"], "Muy sociable"),
  ],
};

function snapshot() {
  if (typeof window === "undefined") return "[]";
  const actual = localStorage.getItem(KEY);
  if (actual) return actual;
  const inicial = JSON.stringify([EXPERIENCIA_DEMO]);
  localStorage.setItem(KEY, inicial);
  return inicial;
}

function parsear(raw: string): ExperienciaSocial[] {
  try { const lista = JSON.parse(raw) as ExperienciaSocial[]; return lista.length ? lista : [EXPERIENCIA_DEMO]; } catch { return [EXPERIENCIA_DEMO]; }
}

function guardar(lista: ExperienciaSocial[]) {
  localStorage.setItem(KEY, JSON.stringify(lista));
  window.dispatchEvent(new Event(EVENT));
}

function suscribir(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}

export function useExperienciasSociales() {
  const raw = useSyncExternalStore(suscribir, snapshot, () => "[]");
  return useMemo(() => parsear(raw), [raw]);
}

export function crearExperiencia(datos: Omit<ExperienciaSocial, "id" | "estado" | "participantes" | "creadaEn">) {
  const experiencia: ExperienciaSocial = { ...datos, id: `social-${Date.now()}`, estado: "open", participantes: [], creadaEn: Date.now() };
  guardar([...parsear(snapshot()), experiencia]);
  return experiencia;
}

export function actualizarExperiencia(id: string, mutar: (experiencia: ExperienciaSocial) => void) {
  const lista = parsear(snapshot());
  const experiencia = lista.find((item) => item.id === id);
  if (!experiencia) return false;
  mutar(experiencia);
  guardar(lista);
  return true;
}

export function registrarParticipante(eventoId: string, datos: Pick<ParticipanteSocial, "nombre" | "telefono" | "edad" | "genero" | "intencion" | "consentimiento">) {
  const lista = parsear(snapshot());
  const evento = lista.find((item) => item.id === eventoId);
  if (!evento || evento.estado !== "open" || evento.participantes.length >= evento.capacidad) return null;
  if (!datos.nombre.trim() || !datos.telefono.trim() || datos.edad < 18 || !datos.consentimiento) return null;
  const participante: ParticipanteSocial = { ...datos, id: `part-${Date.now()}`, respuestas: {}, cuestionarioCompleto: false, checkin: false, creadoEn: Date.now() };
  evento.participantes.push(participante);
  localStorage.setItem(`${SESSION_KEY}:${eventoId}`, participante.id);
  guardar(lista);
  return participante;
}

export function idParticipanteActual(eventoId: string) {
  return typeof window === "undefined" ? null : localStorage.getItem(`${SESSION_KEY}:${eventoId}`);
}

export function useIdParticipanteActual(eventoId: string) {
  return useSyncExternalStore(
    suscribir,
    () => idParticipanteActual(eventoId) ?? "",
    () => "",
  );
}

export function guardarCuestionario(eventoId: string, participanteId: string, respuestas: RespuestasAfinidad) {
  return actualizarExperiencia(eventoId, (evento) => {
    const participante = evento.participantes.find((item) => item.id === participanteId);
    if (participante) { participante.respuestas = respuestas; participante.cuestionarioCompleto = true; }
  });
}

export function confirmarCheckin(eventoId: string, participanteId: string) {
  return actualizarExperiencia(eventoId, (evento) => {
    const participante = evento.participantes.find((item) => item.id === participanteId);
    if (participante) participante.checkin = true;
  });
}

function similitud(a: ParticipanteSocial, b: ParticipanteSocial) {
  const ai = a.respuestas.interests ?? [];
  const bi = b.respuestas.interests ?? [];
  const compartidos = ai.filter((item) => bi.includes(item)).length;
  let score = 55 + compartidos * 9;
  if (a.respuestas.convType === b.respuestas.convType) score += 8;
  if (a.respuestas.energy === b.respuestas.energy) score += 5;
  if (a.intencion === b.intencion) score += 7;
  score -= Math.min(8, Math.abs((a.respuestas.openness ?? 3) - (b.respuestas.openness ?? 3)) * 2);
  return Math.max(45, Math.min(96, score));
}

export function ejecutarMatching(eventoId: string) {
  actualizarExperiencia(eventoId, (evento) => {
    const disponibles = evento.participantes.filter((p) => p.cuestionarioCompleto && p.checkin).map((p) => p.id);
    evento.participantes.forEach((p) => { p.matchId = undefined; p.compatibilidad = undefined; });
    while (disponibles.length > 1) {
      const primeroId = disponibles.shift()!;
      const primero = evento.participantes.find((p) => p.id === primeroId)!;
      let mejorIndice = 0;
      let mejorScore = -1;
      disponibles.forEach((id, indice) => {
        const candidato = evento.participantes.find((p) => p.id === id)!;
        const score = similitud(primero, candidato);
        if (score > mejorScore) { mejorScore = score; mejorIndice = indice; }
      });
      const segundoId = disponibles.splice(mejorIndice, 1)[0];
      const segundo = evento.participantes.find((p) => p.id === segundoId)!;
      primero.matchId = segundo.id; segundo.matchId = primero.id;
      primero.compatibilidad = mejorScore; segundo.compatibilidad = mejorScore;
    }
    evento.estado = "matching";
  });
}

export function enviarFeedback(eventoId: string, participanteId: string, feedback: NonNullable<ParticipanteSocial["feedback"]>) {
  actualizarExperiencia(eventoId, (evento) => {
    const participante = evento.participantes.find((p) => p.id === participanteId);
    if (participante) participante.feedback = feedback;
  });
}
