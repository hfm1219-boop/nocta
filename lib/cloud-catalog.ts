"use client";

import { useEffect, useState } from "react";
import { EVENTOS, LUGARES, type EventoNocta, type LugarNocta } from "./discovery";
import { crearClienteSupabase } from "./supabase/client";

export interface CatalogoNocta { lugares: LugarNocta[]; eventos: EventoNocta[]; remoto: boolean; error?: string }

function eventosVigentes(eventos: EventoNocta[]) {
  const ahora = Date.now();
  return eventos.filter((evento) => new Date(evento.fechaISO).getTime() > ahora);
}

export function useCatalogoNocta(): CatalogoNocta {
  const [catalogo, setCatalogo] = useState<CatalogoNocta>({ lugares: LUGARES, eventos: eventosVigentes(EVENTOS), remoto: false });
  useEffect(() => {
    const supabase = crearClienteSupabase();
    if (!supabase) return;
    let activo = true;
    Promise.all([
      supabase.from("venues").select("external_key,name,city,address,zone,description,category,price_range,active,venue_category_assignments(venue_categories(slug,name))").eq("active", true),
      supabase.from("events").select("id,external_key,name,starts_at,ends_at,status,details,event_venue_collaborations(status,venues(external_key))").eq("status", "published").gt("starts_at", new Date().toISOString()).order("starts_at"),
      supabase.from("ticket_types").select("event_id,price_cop,active").eq("active", true),
    ]).then(([lugaresRespuesta, eventosRespuesta, entradasRespuesta]) => {
      if (!activo) return;
      const error = lugaresRespuesta.error ?? eventosRespuesta.error ?? entradasRespuesta.error;
      if (error) {
        setCatalogo({ lugares: LUGARES, eventos: eventosVigentes(EVENTOS), remoto: false, error: error.message });
        return;
      }
      const lugaresRemotos = new Map((lugaresRespuesta.data ?? []).map((item) => [item.external_key, item]));
      const precios = new Map<string, number>();
      for (const entrada of entradasRespuesta.data ?? []) precios.set(entrada.event_id, Math.min(precios.get(entrada.event_id) ?? Infinity, entrada.price_cop));
      const eventosRemotos = new Map((eventosRespuesta.data ?? []).map((item) => [item.external_key, item]));
      setCatalogo({
        remoto: true,
        lugares: [...lugaresRemotos.values()].map((remoto) => { const base=LUGARES.find(item=>item.id===remoto.external_key);const relations=(remoto.venue_category_assignments??[])as Array<{venue_categories?:{slug?:string;name?:string}|null}>;const categories=relations.map(item=>item.venue_categories?.slug).filter((value):value is string=>Boolean(value));return { id:remoto.external_key,nombre:remoto.name,ciudad:remoto.city,zona:remoto.zone||remoto.address||base?.zona||"Zona por confirmar",descripcion:remoto.description||base?.descripcion||"Descubre este lugar en NOCTA.",categoria:(["club","bar","rooftop","restaurante"].includes(categories[0]??remoto.category??"")?(categories[0]??remoto.category):base?.categoria??"bar")as LugarNocta["categoria"],categorias:categories.length?categories:[remoto.category??base?.categoria??"bar"],estilos:base?.estilos??[],rangoPrecio:(["$$","$$$","$$$$"].includes(remoto.price_range??"")?remoto.price_range:base?.rangoPrecio??"$$")as LugarNocta["rangoPrecio"],color:base?.color??"#b644ff",icono:base?.icono??"✦"};}),
        eventos: [...eventosRemotos.values()].map((remoto) => { const base=EVENTOS.find(item=>item.id===remoto.external_key);const details=(remoto.details??{})as Record<string,unknown>;const collaborations=(remoto.event_venue_collaborations??[])as Array<{status?:string;venues?:{external_key?:string}|null}>;const lugarId=collaborations.find(item=>item.status==="approved")?.venues?.external_key??collaborations[0]?.venues?.external_key??base?.lugarId??"";return {id:remoto.external_key,lugarId,nombre:remoto.name,resumen:String(details.summary??base?.resumen??"Consulta los detalles y asegura tu acceso."),descripcion:String(details.description??base?.descripcion??"Evento publicado en NOCTA."),fechaISO:remoto.starts_at,horaFin:base?.horaFin??new Date(remoto.ends_at??remoto.starts_at).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}),generos:Array.isArray(details.genres)?details.genres.map(String):base?.generos??[],precioDesde:precios.get(remoto.id)??base?.precioDesde??0,disponibilidad:base?.disponibilidad??"disponible",edadMinima:Number(details.min_age??base?.edadMinima??18),dressCode:String(details.dress_code??base?.dressCode??"Casual"),destacado:base?.destacado??false,color:base?.color??"#b644ff"};}),
      });
    });
    return () => { activo = false; };
  }, []);
  return catalogo;
}
