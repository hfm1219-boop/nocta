"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
export function useListasPromotor() { const raw=useSyncExternalStore(suscribir,snapshot,()=>"[]");const [autorizadas,setAutorizadas]=useState(false);useEffect(()=>{void fetch("/api/guest-lists",{cache:"no-store"}).then(async r=>{if(r.status===401){guardar([]);return;}if(!r.ok)return;const d=await r.json() as {lists?:Array<Record<string,unknown>>};const previas=new Map(parsear(snapshot()).map(l=>[l.id,l]));const listas:ListaPromotor[]=(d.lists??[]).map(f=>{const previa=previas.get(String(f.id));const evento=Array.isArray(f.events)?f.events[0]:f.events;const colaboraciones=(evento as {event_venue_collaborations?:Array<{venues?:{name?:string}}>}|null)?.event_venue_collaborations??[];const invitados=((f.guest_list_entries??[]) as Array<Record<string,unknown>>).map(i=>({id:String(i.id),codigo:String(i.access_token??""),nombre:String(i.guest_name),telefono:String(i.phone??""),email:String(i.email??""),acompanantes:Number(i.companions),ingresados:Number(i.checked_in_count??0),estado:({confirmed:"confirmado",cancelled:"cancelado",checked_in:"ingresado"}[String(i.status)]??"confirmado") as EstadoInvitado,creadoEn:new Date(String(i.created_at)).getTime(),ingresoEn:i.checked_in_at?new Date(String(i.checked_in_at)).getTime():undefined}));return{id:String(f.id),eventoId:String((evento as {external_key?:string}|null)?.external_key??previa?.eventoId??""),eventoNombre:String((evento as {name?:string}|null)?.name??previa?.eventoNombre??"Evento"),lugarNombre:String(colaboraciones[0]?.venues?.name??previa?.lugarNombre??"Por confirmar"),nombre:String(f.name),promotor:String(f.promoter_name??""),cupoPersonas:Number(f.capacity),horaLimite:f.closes_at?new Date(String(f.closes_at)).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:false}):"23:59",condiciones:String(f.conditions??""),estado:f.active?"activa":"cerrada",invitados,creadaEn:new Date(String(f.created_at)).getTime()};});guardar(listas);}).catch(()=>undefined).finally(()=>setAutorizadas(true));},[]);const listas=useMemo(()=>parsear(raw),[raw]);return autorizadas?listas:[];}

function codigoSeguro() { const bytes = new Uint8Array(7); crypto.getRandomValues(bytes); return `LST-${Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").toUpperCase()}`; }
export function crearLista(datos: { eventoId: string; nombre: string; promotor: string; cupoPersonas: number; horaLimite: string; condiciones: string; idRemoto?:string }) {
  const evento = eventoPorId(datos.eventoId); const lugar = evento ? lugarPorId(evento.lugarId) : undefined; const plan=eventoPromotorPorId(datos.eventoId);
  if (((!evento || !lugar) && !plan) || !datos.nombre.trim() || !datos.promotor.trim() || !Number.isInteger(datos.cupoPersonas) || datos.cupoPersonas < 1) return null;
  const lista: ListaPromotor = { id: datos.idRemoto??`lista-${Date.now()}`, eventoId: evento?.id??plan!.id, eventoNombre: evento?.nombre??plan!.nombre, lugarNombre: lugar?.nombre??plan!.lugarNombre,
    nombre: datos.nombre.trim(), promotor: datos.promotor.trim(), cupoPersonas: datos.cupoPersonas, horaLimite: datos.horaLimite,
    condiciones: datos.condiciones.trim(), estado: "activa", invitados: [], creadaEn: Date.now() };
  guardar([...parsear(snapshot()), lista]); return lista;
}

export function personasEnLista(lista: ListaPromotor) { return lista.invitados.filter(i => !["rechazado", "cancelado"].includes(i.estado)).reduce((s, i) => s + 1 + i.acompanantes, 0); }
export function agregarInvitado(listaId: string, datos: { nombre: string; telefono: string; email: string; acompanantes: number; emitido?:{id:string;token:string} }) {
  const listas = parsear(snapshot()); const lista = listas.find(l => l.id === listaId); if (!lista || lista.estado !== "activa") return null;
  const cantidad = 1 + datos.acompanantes; if (!datos.nombre.trim() || datos.acompanantes < 0 || datos.acompanantes > 5 || personasEnLista(lista) + cantidad > lista.cupoPersonas) return null;
  const duplicado = listas.filter(l => l.eventoId === lista.eventoId).flatMap(l => l.invitados).some(i => i.estado !== "cancelado" && ((datos.telefono.trim() && i.telefono === datos.telefono.trim()) || (datos.email.trim() && i.email === datos.email.trim()))); if (duplicado) return null;
  const invitado: InvitadoLista = { id: datos.emitido?.id??`inv-${Date.now()}`, codigo: datos.emitido?.token??codigoSeguro(), nombre: datos.nombre.trim(), telefono: datos.telefono.trim(),
    email: datos.email.trim(), acompanantes: datos.acompanantes, ingresados: 0, estado: "confirmado", creadoEn: Date.now() };
  lista.invitados.push(invitado); guardar(listas); return invitado;
}

export function cambiarEstadoLista(id: string, estado: EstadoLista) { const listas = parsear(snapshot()); const lista = listas.find(l => l.id === id); if (!lista) return false; lista.estado = estado; guardar(listas);void fetch("/api/guest-lists",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({listId:id,active:estado==="activa"})}).catch(()=>undefined);return true; }
export function cancelarInvitado(listaId: string, invitadoId: string) { const listas = parsear(snapshot()); const lista = listas.find(l => l.id === listaId); const invitado = lista?.invitados.find(i => i.id === invitadoId); if (!invitado || invitado.ingresados > 0) return false; invitado.estado = "cancelado"; guardar(listas);void fetch("/api/guest-lists",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({entryId:invitadoId,cancelEntry:true})}).catch(()=>undefined);return true; }

export function contenidoInvitadoQR(codigo: string) { return `nocta:lista:${codigo}`; }
function listaDentroDeHorario(lista: ListaPromotor) { const fechaISO=eventoPorId(lista.eventoId)?.fechaISO??eventoPromotorPorId(lista.eventoId)?.fechaISO;if(!fechaISO)return false;const inicio=new Date(fechaISO);const limite=new Date(fechaISO);const [hora,minuto]=lista.horaLimite.split(":").map(Number);limite.setHours(hora,minuto,0,0);if(hora<inicio.getHours())limite.setDate(limite.getDate()+1);return Date.now()<=limite.getTime(); }
export function validarInvitado(valor: string, cantidad?: number): { estado: "aceptado"|"parcial"|"usado"|"invalido"; lista?: ListaPromotor; invitado?: InvitadoLista; ingresados?: number } {
  const codigo = valor.trim().replace(/^nocta:lista:/, ""); const listas = parsear(snapshot()); const lista = listas.find(l => l.invitados.some(i => i.codigo === codigo)); const invitado = lista?.invitados.find(i => i.codigo === codigo);
  if (!lista || !invitado || lista.estado !== "activa" || !listaDentroDeHorario(lista) || invitado.estado !== "confirmado") return invitado?.estado === "ingresado" ? { estado: "usado", lista, invitado } : { estado: "invalido", lista, invitado };
  const disponibles = 1 + invitado.acompanantes - invitado.ingresados; if (disponibles <= 0) return { estado: "usado", lista, invitado };
  const entran = Math.max(1, Math.min(cantidad ?? disponibles, disponibles)); invitado.ingresados += entran; invitado.ingresoEn = Date.now(); if (invitado.ingresados >= 1 + invitado.acompanantes) invitado.estado = "ingresado"; guardar(listas);
  return { estado: invitado.estado === "ingresado" ? "aceptado" : "parcial", lista, invitado, ingresados: entran };
}
