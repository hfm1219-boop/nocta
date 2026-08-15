"use client";

import { useMemo, useSyncExternalStore } from "react";

export type TipoExperiencia = "dating" | "networking" | "social" | "community";
export type ModoMatching = "one-to-one" | "groups" | "rounds";
export type EstadoExperiencia = "draft" | "open" | "matching" | "revealed" | "closed";

export interface RespuestasAfinidad {
  intent?: string; openness?: number; energy?: string; ambition?: number;
  wellness?: number; interests?: string[]; convType?: string; phrase?: string;
}

export interface ParticipanteSocial {
  id: string; nombre: string; telefono: string; edad: number; genero: string;
  intencion: string; consentimiento: boolean; respuestas: RespuestasAfinidad;
  cuestionarioCompleto: boolean; checkin: boolean; matchId?: string;
  compatibilidad?: number; feedback?: { rating: number; volveria: string; comentario: string };
  creadoEn: number;
}

export interface AsignacionSocial {
  id: string;
  tipo: ModoMatching;
  ronda: number;
  participantesIds: string[];
  compatibilidad: number;
}

export interface InteraccionSocial {
  id: string;
  tipo: "saludo" | "contacto";
  deId: string;
  paraId: string;
  estado: "enviado" | "aceptado" | "rechazado";
  creadaEn: number;
  actualizadaEn?: number;
}

export interface ReporteSocial {
  id: string;
  reportanteId: string;
  reportadoId?: string;
  motivo: string;
  detalle: string;
  estado: "abierto" | "revisado" | "resuelto";
  creadoEn: number;
}

export interface ExperienciaSocial {
  id: string; nombre: string; descripcion: string; tipo: TipoExperiencia;
  lugarId: string; lugarNombre: string; direccion?: string; ciudad?: string;
  fechaISO: string; capacidad: number; modoMatching: ModoMatching;
  horaRevelacion: string; estado: EstadoExperiencia; promotor: string;
  participantes: ParticipanteSocial[]; asignaciones: AsignacionSocial[];
  interacciones: InteraccionSocial[]; reportes: ReporteSocial[];
  creadaEn: number; demo?: boolean;
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
  return { id, nombre, telefono: "+57 300 000 0000", edad, genero: "Prefiero no decir", intencion,
    consentimiento: true, cuestionarioCompleto: true, checkin: true, creadoEn: Date.now() - edad * 1000,
    respuestas: { intent: intencion, openness: 4, energy: energia, ambition: 4, wellness: 3, interests: intereses, convType: "Viajes y experiencias", phrase: "Valoro la autenticidad por encima de todo" } };
}

export const EXPERIENCIA_DEMO: ExperienciaSocial = {
  id: "cartagena-social-match", nombre: "Cartagena Social Match Night",
  descripcion: "Conexiones reales, afinidad y conversaciones auténticas en una experiencia guiada.",
  tipo: "social", lugarId: "casa-la-movida", lugarNombre: "Casa La Movida", ciudad: "Cartagena",
  fechaISO: "2026-08-22T20:00:00-05:00", capacidad: 40, modoMatching: "one-to-one",
  horaRevelacion: "21:30", estado: "open", promotor: "NOCTA Social Club", creadaEn: Date.now() - 86_400_000,
  demo: true, asignaciones: [], interacciones: [], reportes: [],
  participantes: [
    participanteSemilla("demo-valentina", "Valentina M.", 29, "Networking profesional", ["Gastronomía", "Viajes", "Música"], "Activa y conversadora"),
    participanteSemilla("demo-santiago", "Santiago R.", 34, "Conocer pareja", ["Viajes", "Deporte", "Música"], "Equilibrada"),
    participanteSemilla("demo-isabela", "Isabela C.", 27, "Nuevas amistades", ["Arte", "Música", "Gastronomía"], "Muy sociable"),
  ],
};

function normalizar(evento: ExperienciaSocial): ExperienciaSocial {
  evento.asignaciones ??= [];
  evento.interacciones ??= [];
  evento.reportes ??= [];
  evento.participantes ??= [];
  evento.modoMatching ??= "one-to-one";
  return evento;
}

function snapshot() {
  if (typeof window === "undefined") return "[]";
  const actual = localStorage.getItem(KEY);
  if (actual) return actual;
  const inicial = JSON.stringify([EXPERIENCIA_DEMO]);
  localStorage.setItem(KEY, inicial);
  return inicial;
}

function parsear(raw: string): ExperienciaSocial[] {
  try {
    const lista = JSON.parse(raw) as ExperienciaSocial[];
    return (lista.length ? lista : [structuredClone(EXPERIENCIA_DEMO)]).map(normalizar);
  } catch { return [structuredClone(EXPERIENCIA_DEMO)]; }
}

function guardar(lista: ExperienciaSocial[]) {
  localStorage.setItem(KEY, JSON.stringify(lista));
  window.dispatchEvent(new Event(EVENT));
}

function suscribir(listener: () => void) {
  window.addEventListener(EVENT, listener); window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}

export function useExperienciasSociales() {
  const raw = useSyncExternalStore(suscribir, snapshot, () => "[]");
  return useMemo(() => parsear(raw), [raw]);
}

export function crearExperiencia(datos: Omit<ExperienciaSocial, "id" | "estado" | "participantes" | "asignaciones" | "interacciones" | "reportes" | "creadaEn">, idExterno?: string) {
  const experiencia: ExperienciaSocial = { ...datos, id: idExterno ?? `social-${Date.now()}`, estado: "open", participantes: [], asignaciones: [], interacciones: [], reportes: [], creadaEn: Date.now() };
  guardar([...parsear(snapshot()), experiencia]);
  return experiencia;
}

export function actualizarExperiencia(id: string, mutar: (experiencia: ExperienciaSocial) => void) {
  const lista = parsear(snapshot());
  const experiencia = lista.find((item) => item.id === id);
  if (!experiencia) return false;
  mutar(experiencia); guardar(lista); return true;
}

export function registrarParticipante(eventoId: string, datos: Pick<ParticipanteSocial, "nombre" | "telefono" | "edad" | "genero" | "intencion" | "consentimiento">) {
  const lista = parsear(snapshot());
  const evento = lista.find((item) => item.id === eventoId);
  if (!evento || evento.estado !== "open" || evento.participantes.length >= evento.capacidad) return null;
  if (!datos.nombre.trim() || !datos.telefono.trim() || datos.edad < 18 || !datos.consentimiento) return null;
  const participante: ParticipanteSocial = { ...datos, id: `part-${Date.now()}`, respuestas: {}, cuestionarioCompleto: false, checkin: false, creadoEn: Date.now() };
  evento.participantes.push(participante);
  localStorage.setItem(`${SESSION_KEY}:${eventoId}`, participante.id);
  guardar(lista); return participante;
}

export function idParticipanteActual(eventoId: string) {
  return typeof window === "undefined" ? null : localStorage.getItem(`${SESSION_KEY}:${eventoId}`);
}

export function useIdParticipanteActual(eventoId: string) {
  return useSyncExternalStore(suscribir, () => idParticipanteActual(eventoId) ?? "", () => "");
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
    if (participante?.cuestionarioCompleto) participante.checkin = true;
  });
}

export function compatibilidadEntre(a: ParticipanteSocial, b: ParticipanteSocial) {
  const ai = a.respuestas.interests ?? []; const bi = b.respuestas.interests ?? [];
  const compartidos = ai.filter((item) => bi.includes(item)).length;
  let score = 48 + compartidos * 10;
  if (a.respuestas.convType === b.respuestas.convType) score += 8;
  if (a.respuestas.energy === b.respuestas.energy) score += 5;
  if (a.intencion === b.intencion) score += 8;
  score += Math.max(0, 5 - Math.abs((a.respuestas.ambition ?? 3) - (b.respuestas.ambition ?? 3)) * 2);
  score += Math.max(0, 5 - Math.abs((a.respuestas.wellness ?? 3) - (b.respuestas.wellness ?? 3)) * 2);
  score -= Math.min(8, Math.abs((a.respuestas.openness ?? 3) - (b.respuestas.openness ?? 3)) * 2);
  return Math.max(40, Math.min(97, score));
}

function scoreGrupo(ids: string[], participantes: ParticipanteSocial[]) {
  const scores: number[] = [];
  ids.forEach((id, i) => ids.slice(i + 1).forEach((otro) => scores.push(compatibilidadEntre(participantes.find((p) => p.id === id)!, participantes.find((p) => p.id === otro)!))));
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
}

function asignarUnoAUno(participantes: ParticipanteSocial[]): AsignacionSocial[] {
  const disponibles = participantes.map((p) => p.id);
  const resultado: AsignacionSocial[] = [];
  while (disponibles.length > 1) {
    const primeroId = disponibles.shift()!;
    const primero = participantes.find((p) => p.id === primeroId)!;
    let indice = 0; let score = -1;
    disponibles.forEach((id, i) => { const actual = compatibilidadEntre(primero, participantes.find((p) => p.id === id)!); if (actual > score) { score = actual; indice = i; } });
    const segundoId = disponibles.splice(indice, 1)[0];
    resultado.push({ id: `match-${Date.now()}-${resultado.length}`, tipo: "one-to-one", ronda: 1, participantesIds: [primeroId, segundoId], compatibilidad: score });
  }
  return resultado;
}

function asignarGrupos(participantes: ParticipanteSocial[]): AsignacionSocial[] {
  const pendientes = [...participantes]; const grupos: string[][] = [];
  const cantidadGrupos = participantes.length < 3 ? 0 : Math.ceil(participantes.length / 4);
  const tamanos = cantidadGrupos ? Array.from({ length: cantidadGrupos }, (_, i) => Math.floor(participantes.length / cantidadGrupos) + (i < participantes.length % cantidadGrupos ? 1 : 0)) : [];
  while (pendientes.length && tamanos.length) {
    const base = pendientes.shift()!; const grupo = [base.id];
    const tamano = tamanos.shift()!;
    while (grupo.length < tamano && pendientes.length) {
      let mejor = 0; let score = -1;
      pendientes.forEach((p, i) => { const actual = grupo.reduce((s, id) => s + compatibilidadEntre(participantes.find((x) => x.id === id)!, p), 0); if (actual > score) { score = actual; mejor = i; } });
      grupo.push(pendientes.splice(mejor, 1)[0].id);
    }
    grupos.push(grupo);
  }
  return grupos.map((ids, i) => ({ id: `grupo-${Date.now()}-${i}`, tipo: "groups", ronda: 1, participantesIds: ids, compatibilidad: scoreGrupo(ids, participantes) }));
}

function asignarRondas(participantes: ParticipanteSocial[]): AsignacionSocial[] {
  const ids: Array<string | null> = participantes.map((p) => p.id);
  if (ids.length % 2) ids.push(null);
  const resultado: AsignacionSocial[] = [];
  const maxRondas = Math.min(3, ids.length - 1);
  for (let ronda = 1; ronda <= maxRondas; ronda += 1) {
    for (let i = 0; i < ids.length / 2; i += 1) {
      const a = ids[i]; const b = ids[ids.length - 1 - i];
      if (a && b) resultado.push({ id: `ronda-${Date.now()}-${ronda}-${i}`, tipo: "rounds", ronda, participantesIds: [a, b], compatibilidad: scoreGrupo([a, b], participantes) });
    }
    ids.splice(1, 0, ids.pop()!);
  }
  return resultado;
}

export function ejecutarMatching(eventoId: string) {
  let generadas = 0;
  actualizarExperiencia(eventoId, (evento) => {
    const participantes = evento.participantes.filter((p) => p.cuestionarioCompleto && p.checkin);
    evento.participantes.forEach((p) => { p.matchId = undefined; p.compatibilidad = undefined; });
    evento.asignaciones = evento.modoMatching === "groups" ? asignarGrupos(participantes)
      : evento.modoMatching === "rounds" ? asignarRondas(participantes) : asignarUnoAUno(participantes);
    if (evento.modoMatching === "one-to-one") evento.asignaciones.forEach((a) => {
      const [x, y] = a.participantesIds;
      const px = evento.participantes.find((p) => p.id === x); const py = evento.participantes.find((p) => p.id === y);
      if (px && py) { px.matchId = y; py.matchId = x; px.compatibilidad = a.compatibilidad; py.compatibilidad = a.compatibilidad; }
    });
    generadas = evento.asignaciones.length; evento.estado = "matching";
  });
  return generadas;
}

export function asignacionesDe(evento: ExperienciaSocial, participanteId: string) {
  return evento.asignaciones.filter((a) => a.participantesIds.includes(participanteId));
}

export function fechaRevelacion(evento: ExperienciaSocial) {
  const fecha = new Date(evento.fechaISO);
  const [hora, minuto] = evento.horaRevelacion.split(":").map(Number);
  fecha.setHours(hora, minuto, 0, 0); return fecha.getTime();
}

function puedenInteractuar(evento: ExperienciaSocial, a: string, b: string) {
  return a !== b && evento.asignaciones.some((asignacion) => asignacion.participantesIds.includes(a) && asignacion.participantesIds.includes(b));
}

export function enviarSaludo(eventoId: string, deId: string, paraId: string) {
  return actualizarExperiencia(eventoId, (evento) => {
    if (puedenInteractuar(evento, deId, paraId) && !evento.interacciones.some((i) => i.tipo === "saludo" && i.deId === deId && i.paraId === paraId)) {
      evento.interacciones.push({ id: `saludo-${Date.now()}`, tipo: "saludo", deId, paraId, estado: "enviado", creadaEn: Date.now() });
    }
  });
}

export function solicitarContacto(eventoId: string, deId: string, paraId: string) {
  return actualizarExperiencia(eventoId, (evento) => {
    if (puedenInteractuar(evento, deId, paraId) && !evento.interacciones.some((i) => i.tipo === "contacto" && ((i.deId === deId && i.paraId === paraId) || (i.deId === paraId && i.paraId === deId)))) {
      evento.interacciones.push({ id: `contacto-${Date.now()}`, tipo: "contacto", deId, paraId, estado: "enviado", creadaEn: Date.now() });
    }
  });
}

export function responderContacto(eventoId: string, interaccionId: string, participanteId: string, aceptar: boolean) {
  return actualizarExperiencia(eventoId, (evento) => {
    const solicitud = evento.interacciones.find((i) => i.id === interaccionId && i.tipo === "contacto" && i.paraId === participanteId && i.estado === "enviado");
    if (solicitud) { solicitud.estado = aceptar ? "aceptado" : "rechazado"; solicitud.actualizadaEn = Date.now(); }
  });
}

export function crearReporte(eventoId: string, reportanteId: string, reportadoId: string | undefined, motivo: string, detalle: string) {
  return actualizarExperiencia(eventoId, (evento) => {
    const reportanteExiste = evento.participantes.some((p) => p.id === reportanteId);
    const reportadoValido = !reportadoId || puedenInteractuar(evento, reportanteId, reportadoId);
    if (reportanteExiste && reportadoValido && motivo.trim()) evento.reportes.push({ id: `reporte-${Date.now()}`, reportanteId, reportadoId, motivo: motivo.trim(), detalle: detalle.trim(), estado: "abierto", creadoEn: Date.now() });
  });
}

export function actualizarReporte(eventoId: string, reporteId: string, estado: ReporteSocial["estado"]) {
  return actualizarExperiencia(eventoId, (evento) => { const reporte = evento.reportes.find((r) => r.id === reporteId); if (reporte) reporte.estado = estado; });
}

export function razonesCompatibilidad(a: ParticipanteSocial, b: ParticipanteSocial) {
  const razones: string[] = [];
  const intereses = (a.respuestas.interests ?? []).filter((i) => (b.respuestas.interests ?? []).includes(i));
  if (intereses.length) razones.push(`Comparten interés en ${intereses.join(", ")}.`);
  if (a.respuestas.convType === b.respuestas.convType) razones.push(`Ambos disfrutan conversar sobre ${a.respuestas.convType?.toLowerCase()}.`);
  if (a.intencion === b.intencion) razones.push(`Llegaron con una intención compatible: ${a.intencion.toLowerCase()}.`);
  const energias = ["Tranquila y observadora", "Equilibrada", "Activa y conversadora", "Muy sociable"];
  const energiaA = energias.indexOf(a.respuestas.energy ?? ""); const energiaB = energias.indexOf(b.respuestas.energy ?? "");
  if (energiaA >= 0 && energiaB >= 0 && Math.abs(energiaA - energiaB) <= 1) razones.push("Sus estilos de energía social pueden facilitar una conversación natural.");
  return razones.slice(0, 3).length ? razones.slice(0, 3) : ["Sus perfiles muestran apertura para descubrir nuevas perspectivas."];
}

export function enviarFeedback(eventoId: string, participanteId: string, feedback: NonNullable<ParticipanteSocial["feedback"]>) {
  actualizarExperiencia(eventoId, (evento) => { const participante = evento.participantes.find((p) => p.id === participanteId); if (participante) participante.feedback = feedback; });
}
