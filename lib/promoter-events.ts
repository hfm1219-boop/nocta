"use client";

import { useMemo, useSyncExternalStore } from "react";

export interface TipoEntradaPromotor { id:string; nombre:string; precio:number; descripcion:string; cupo:number }
export interface EventoPromotorNocta {
  id:string; nombre:string; resumen:string; descripcion:string; lugarNombre:string; ciudad:string; zona:string;
  fechaISO:string; horaFin:string; generos:string[]; edadMinima:number; dressCode:string; color:string;
  promotor:string; estado:"borrador"|"publicado"|"cerrado"; tiposEntrada:TipoEntradaPromotor[];
  reservasActivas:boolean; listasActivas:boolean; capacidad:number; creadoEn:number;
}
const KEY="nocta-promoter-events-v1";const EVENT="nocta-promoter-events-change";
function snapshot(){return typeof window==="undefined"?"[]":localStorage.getItem(KEY)??"[]"}
function parsear(raw:string):EventoPromotorNocta[]{try{return JSON.parse(raw) as EventoPromotorNocta[]}catch{return[]}}
function guardar(eventos:EventoPromotorNocta[]){localStorage.setItem(KEY,JSON.stringify(eventos));window.dispatchEvent(new Event(EVENT))}
function suscribir(listener:()=>void){window.addEventListener(EVENT,listener);window.addEventListener("storage",listener);return()=>{window.removeEventListener(EVENT,listener);window.removeEventListener("storage",listener)}}
export function useEventosPromotor(){const raw=useSyncExternalStore(suscribir,snapshot,()=>"[]");return useMemo(()=>parsear(raw),[raw])}
export function eventoPromotorPorId(id:string){return parsear(snapshot()).find(e=>e.id===id)}
export function crearEventoPromotor(datos:Omit<EventoPromotorNocta,"id"|"estado"|"creadoEn">){if(!datos.nombre.trim()||!datos.lugarNombre.trim()||!datos.promotor.trim()||!datos.tiposEntrada.length)return null;const evento:EventoPromotorNocta={...datos,id:`plan-${Date.now()}`,estado:"borrador",creadoEn:Date.now()};guardar([...parsear(snapshot()),evento]);return evento}
export function actualizarEventoPromotor(id:string,mutar:(evento:EventoPromotorNocta)=>void){const eventos=parsear(snapshot());const evento=eventos.find(e=>e.id===id);if(!evento)return false;mutar(evento);guardar(eventos);return true}
