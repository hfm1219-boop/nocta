"use client";

import { useMemo, useSyncExternalStore } from "react";
import { eventoPorId, lugarPorId } from "@/lib/discovery";
import { eventoPromotorPorId } from "@/lib/promoter-events";

export type EstadoLista = "activa" | "cerrada";
export type EstadoInvitado = "confirmado" | "rechazado" | "cancelado" | "ingresado";

export interface InvitadoLista {
  id: string; codigo: string; nombre: string; telefono: string; email: string;
  acompanantes: number; ingresados: number; estado: EstadoInvitado; creadoEn: number; ingresoEn?: number;
}

export interface ListaPromotor {
  id: string; eventoId: string; eventoNombre: string; lugarNombre: string; nombre: string;
  promotor: string; cupoPersonas: number; horaLimite: string; condiciones: string;
  estado: EstadoLista; invitados: InvitadoLista[]; creadaEn: number;
}

const KEY = "nocta-guest-lists-v1"; const EVENT = "nocta-guest-lists-change";
function snapshot() { return typeof window === "undefined" ? "[]" : localStorage.getItem(KEY) ?? "[]"; }
function parsear(raw: string): ListaPromotor[] { try { return JSON.parse(raw) as ListaPromotor[]; } catch { return []; } }
function guardar(listas: ListaPromotor[]) { localStorage.setItem(KEY, JSON.stringify(listas)); window.dispatchEvent(new Event(EVENT)); }
function suscribir(listener: () => void) { window.addEventListener(EVENT, listener); window.addEventListener("storage", listener); return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); }; }
export function useListasPromotor() { const raw = useSyncExternalStore(suscribir, snapshot, () => "[]"); return useMemo(() => parsear(raw), [raw]); }

function codigoSeguro() { const bytes = new Uint8Array(7); crypto.getRandomValues(bytes); return `LST-${Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").toUpperCase()}`; }
export function crearLista(datos: { eventoId: string; nombre: string; promotor: string; cupoPersonas: number; horaLimite: string; condiciones: string }) {
  const evento = eventoPorId(datos.eventoId); const lugar = evento ? lugarPorId(evento.lugarId) : undefined; const plan=eventoPromotorPorId(datos.eventoId);
  if (((!evento || !lugar) && !plan) || !datos.nombre.trim() || !datos.promotor.trim() || !Number.isInteger(datos.cupoPersonas) || datos.cupoPersonas < 1) return null;
  const lista: ListaPromotor = { id: `lista-${Date.now()}`, eventoId: evento?.id??plan!.id, eventoNombre: evento?.nombre??plan!.nombre, lugarNombre: lugar?.nombre??plan!.lugarNombre,
    nombre: datos.nombre.trim(), promotor: datos.promotor.trim(), cupoPersonas: datos.cupoPersonas, horaLimite: datos.horaLimite,
    condiciones: datos.condiciones.trim(), estado: "activa", invitados: [], creadaEn: Date.now() };
  guardar([...parsear(snapshot()), lista]); return lista;
}

export function personasEnLista(lista: ListaPromotor) { return lista.invitados.filter(i => !["rechazado", "cancelado"].includes(i.estado)).reduce((s, i) => s + 1 + i.acompanantes, 0); }
export function agregarInvitado(listaId: string, datos: { nombre: string; telefono: string; email: string; acompanantes: number }) {
  const listas = parsear(snapshot()); const lista = listas.find(l => l.id === listaId); if (!lista || lista.estado !== "activa") return null;
  const cantidad = 1 + datos.acompanantes; if (!datos.nombre.trim() || datos.acompanantes < 0 || datos.acompanantes > 5 || personasEnLista(lista) + cantidad > lista.cupoPersonas) return null;
  const duplicado = listas.filter(l => l.eventoId === lista.eventoId).flatMap(l => l.invitados).some(i => i.estado !== "cancelado" && ((datos.telefono.trim() && i.telefono === datos.telefono.trim()) || (datos.email.trim() && i.email === datos.email.trim()))); if (duplicado) return null;
  const invitado: InvitadoLista = { id: `inv-${Date.now()}`, codigo: codigoSeguro(), nombre: datos.nombre.trim(), telefono: datos.telefono.trim(),
    email: datos.email.trim(), acompanantes: datos.acompanantes, ingresados: 0, estado: "confirmado", creadoEn: Date.now() };
  lista.invitados.push(invitado); guardar(listas); return invitado;
}

export function cambiarEstadoLista(id: string, estado: EstadoLista) { const listas = parsear(snapshot()); const lista = listas.find(l => l.id === id); if (!lista) return false; lista.estado = estado; guardar(listas); return true; }
export function cancelarInvitado(listaId: string, invitadoId: string) { const listas = parsear(snapshot()); const lista = listas.find(l => l.id === listaId); const invitado = lista?.invitados.find(i => i.id === invitadoId); if (!invitado || invitado.ingresados > 0) return false; invitado.estado = "cancelado"; guardar(listas); return true; }

export function contenidoInvitadoQR(codigo: string) { return `nocta:lista:${codigo}`; }
function listaDentroDeHorario(lista: ListaPromotor) { const fechaISO=eventoPorId(lista.eventoId)?.fechaISO??eventoPromotorPorId(lista.eventoId)?.fechaISO;if(!fechaISO)return false;const inicio=new Date(fechaISO);const limite=new Date(fechaISO);const [hora,minuto]=lista.horaLimite.split(":").map(Number);limite.setHours(hora,minuto,0,0);if(hora<inicio.getHours())limite.setDate(limite.getDate()+1);return Date.now()<=limite.getTime(); }
export function validarInvitado(valor: string, cantidad?: number): { estado: "aceptado"|"parcial"|"usado"|"invalido"; lista?: ListaPromotor; invitado?: InvitadoLista; ingresados?: number } {
  const codigo = valor.trim().replace(/^nocta:lista:/, ""); const listas = parsear(snapshot()); const lista = listas.find(l => l.invitados.some(i => i.codigo === codigo)); const invitado = lista?.invitados.find(i => i.codigo === codigo);
  if (!lista || !invitado || lista.estado !== "activa" || !listaDentroDeHorario(lista) || invitado.estado !== "confirmado") return invitado?.estado === "ingresado" ? { estado: "usado", lista, invitado } : { estado: "invalido", lista, invitado };
  const disponibles = 1 + invitado.acompanantes - invitado.ingresados; if (disponibles <= 0) return { estado: "usado", lista, invitado };
  const entran = Math.max(1, Math.min(cantidad ?? disponibles, disponibles)); invitado.ingresados += entran; invitado.ingresoEn = Date.now(); if (invitado.ingresados >= 1 + invitado.acompanantes) invitado.estado = "ingresado"; guardar(listas);
  return { estado: invitado.estado === "ingresado" ? "aceptado" : "parcial", lista, invitado, ingresados: entran };
}
