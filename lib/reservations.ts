"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { eventoPorId } from "@/lib/discovery";
import { eventoPromotorPorId } from "@/lib/promoter-events";

export type EstadoReserva = "pendiente" | "confirmada" | "rechazada" | "cancelada" | "usada";
export type TipoReserva = "mesa" | "mesa-premium" | "vip";

export interface OpcionReserva {
  id: TipoReserva; nombre: string; descripcion: string; capacidad: number;
  consumoMinimo: number; anticipo: number; cupo: number;
}

export interface ReservaNocta {
  id: string; codigo: string; eventoId: string; lugarId: string; tipoId: TipoReserva;
  tipoNombre: string; fechaISO: string; personas: number; titular: string; telefono: string;
  email: string; ocasion: string; notas: string; consumoMinimo: number; anticipo: number;
  estado: EstadoReserva; creadaEn: number; actualizadaEn?: number;
}

export const OPCIONES_RESERVA: OpcionReserva[] = [
  { id: "mesa", nombre: "Mesa", descripcion: "Ubicación reservada y servicio a la mesa.", capacidad: 4, consumoMinimo: 400000, anticipo: 120000, cupo: 6 },
  { id: "mesa-premium", nombre: "Mesa premium", descripcion: "Mejor ubicación, anfitrión y servicio prioritario.", capacidad: 6, consumoMinimo: 800000, anticipo: 240000, cupo: 3 },
  { id: "vip", nombre: "Experiencia VIP", descripcion: "Zona privada, ingreso prioritario y atención dedicada.", capacidad: 10, consumoMinimo: 1500000, anticipo: 450000, cupo: 2 },
];

const KEY = "nocta-reservations-v1"; const EVENT = "nocta-reservations-change";
function snapshot() { return typeof window === "undefined" ? "[]" : localStorage.getItem(KEY) ?? "[]"; }
function parsear(raw: string): ReservaNocta[] { try { return JSON.parse(raw) as ReservaNocta[]; } catch { return []; } }
function guardar(reservas: ReservaNocta[]) { localStorage.setItem(KEY, JSON.stringify(reservas)); window.dispatchEvent(new Event(EVENT)); }
function suscribir(listener: () => void) { window.addEventListener(EVENT, listener); window.addEventListener("storage", listener); return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); }; }
export function useReservas() {
  const raw = useSyncExternalStore(suscribir, snapshot, () => "[]");
  const [autorizadas,setAutorizadas]=useState(false);
  useEffect(()=>{void fetch("/api/reservations",{cache:"no-store"}).then(async respuesta=>{if(!respuesta.ok)return;const datos=await respuesta.json() as {reservations?:Array<Record<string,unknown>>};const anteriores=new Map(parsear(snapshot()).map(item=>[item.id,item]));const porId=new Map<string,ReservaNocta>();for(const fila of datos.reservations??[]){const nombre=String(fila.zone_name??"Mesa");const tipo=OPCIONES_RESERVA.find(item=>item.nombre===nombre)??OPCIONES_RESERVA[0];const previa=anteriores.get(String(fila.id));const estadoRemoto={pending:"pendiente",confirmed:"confirmada",checked_in:"usada",completed:"usada",cancelled:"cancelada",no_show:"rechazada"}[String(fila.status)] as EstadoReserva;const evento=Array.isArray(fila.events)?fila.events[0]:fila.events;const venue=Array.isArray(fila.venues)?fila.venues[0]:fila.venues;porId.set(String(fila.id),{id:String(fila.id),codigo:previa?.codigo??"",eventoId:String((evento as {external_key?:string}|null)?.external_key??previa?.eventoId??""),lugarId:String((venue as {external_key?:string}|null)?.external_key??previa?.lugarId??""),tipoId:tipo.id,tipoNombre:tipo.nombre,fechaISO:String(fila.reserved_for),personas:Number(fila.party_size),titular:String(fila.customer_name),telefono:String(fila.phone??""),email:String(fila.customer_email??""),ocasion:previa?.ocasion??"",notas:String(fila.notes??""),consumoMinimo:tipo.consumoMinimo,anticipo:Number(fila.deposit_cop),estado:estadoRemoto,creadaEn:new Date(String(fila.created_at)).getTime(),actualizadaEn:fila.updated_at?new Date(String(fila.updated_at)).getTime():undefined});}guardar([...porId.values()]);}).catch(()=>undefined).finally(()=>setAutorizadas(true));},[]);
  const reservas=useMemo(() => parsear(raw), [raw]);
  return autorizadas?reservas:[];
}

export function reservasDisponibles(eventoId: string, tipo: OpcionReserva, reservas = parsear(snapshot())) {
  const ocupadas = reservas.filter((r) => r.eventoId === eventoId && r.tipoId === tipo.id && !["rechazada", "cancelada"].includes(r.estado)).length;
  return Math.max(0, tipo.cupo - ocupadas);
}

function codigoSeguro() { const bytes = new Uint8Array(6); crypto.getRandomValues(bytes); return `RSV-${Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").toUpperCase()}`; }

export function crearReserva(datos: { eventoId: string; tipoId: TipoReserva; personas: number; titular: string; telefono: string; email: string; ocasion: string; notas: string; emitida?: {id:string;token:string} }) {
  const evento = eventoPorId(datos.eventoId); const plan=eventoPromotorPorId(datos.eventoId); const tipo = OPCIONES_RESERVA.find((o) => o.id === datos.tipoId); const actuales = parsear(snapshot());
  if ((!evento&&!plan) || !tipo) throw new Error("Evento o tipo de reserva no válido.");
  if (!datos.titular.trim() || !datos.telefono.trim() || !/^\S+@\S+\.\S+$/.test(datos.email.trim())) throw new Error("Completa los datos de contacto.");
  if (!Number.isInteger(datos.personas) || datos.personas < 1 || datos.personas > tipo.capacidad) throw new Error(`Esta opción admite máximo ${tipo.capacidad} personas.`);
  if (!reservasDisponibles(datos.eventoId, tipo, actuales)) throw new Error("Esta opción ya no tiene disponibilidad.");
  const reserva: ReservaNocta = { id: datos.emitida?.id??`res-${Date.now()}`, codigo: datos.emitida?.token??codigoSeguro(), eventoId: evento?.id??plan!.id, lugarId: evento?.lugarId??plan!.id,
    tipoId: tipo.id, tipoNombre: tipo.nombre, fechaISO: evento?.fechaISO??plan!.fechaISO, personas: datos.personas, titular: datos.titular.trim(),
    telefono: datos.telefono.trim(), email: datos.email.trim(), ocasion: datos.ocasion.trim(), notas: datos.notas.trim(),
    consumoMinimo: tipo.consumoMinimo, anticipo: tipo.anticipo, estado: "pendiente", creadaEn: Date.now() };
  guardar([...actuales, reserva]); return reserva;
}

export async function actualizarEstadoReserva(id: string, estado: EstadoReserva) {
  const reservas = parsear(snapshot()); const indice = reservas.findIndex((r) => r.id === id); if (indice < 0) return false;
  const actual = reservas[indice]; const transiciones: Record<EstadoReserva, EstadoReserva[]> = {
    pendiente: ["confirmada", "rechazada", "cancelada"], confirmada: ["cancelada", "usada"], rechazada: [], cancelada: [], usada: [],
  };
  if (!transiciones[actual.estado].includes(estado)) return false;
  const remoto:Partial<Record<EstadoReserva,"confirmed"|"cancelled"|"completed">>={confirmada:"confirmed",rechazada:"cancelled",cancelada:"cancelled",usada:"completed"};
  if(remoto[estado]){const response=await fetch("/api/reservations",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:remoto[estado]})});if(!response.ok)return false;}reservas[indice] = { ...actual, estado, actualizadaEn: Date.now() }; guardar(reservas);
  return true;
}

export function contenidoReservaQR(codigo: string) { return `nocta:reserva:${codigo}`; }
export function validarReserva(valor: string): { estado: "aceptada"|"usada"|"invalida"; reserva?: ReservaNocta } {
  const codigo = valor.trim().replace(/^nocta:reserva:/, ""); const reservas = parsear(snapshot()); const indice = reservas.findIndex(r => r.codigo === codigo);
  if (indice < 0 || reservas[indice].estado !== "confirmada") return reservas[indice]?.estado === "usada" ? { estado: "usada", reserva: reservas[indice] } : { estado: "invalida" };
  reservas[indice] = { ...reservas[indice], estado: "usada", actualizadaEn: Date.now() }; guardar(reservas); return { estado: "aceptada", reserva: reservas[indice] };
}
