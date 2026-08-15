"use client";

import { useEffect, useState } from "react";
import { EVENTOS, LUGARES, type EventoNocta, type LugarNocta } from "./discovery";
import { crearClienteSupabase } from "./supabase/client";

export interface CatalogoNocta { lugares: LugarNocta[]; eventos: EventoNocta[]; remoto: boolean }

export function useCatalogoNocta(): CatalogoNocta {
  const [catalogo, setCatalogo] = useState<CatalogoNocta>({ lugares: LUGARES, eventos: EVENTOS, remoto: false });
  useEffect(() => {
    const supabase = crearClienteSupabase();
    if (!supabase) return;
    let activo = true;
    Promise.all([
      supabase.from("venues").select("external_key,name,city,address,active").eq("active", true),
      supabase.from("events").select("id,external_key,name,starts_at,ends_at,status").eq("status", "published"),
      supabase.from("ticket_types").select("event_id,price_cop,active").eq("active", true),
    ]).then(([lugaresRespuesta, eventosRespuesta, entradasRespuesta]) => {
      if (!activo || lugaresRespuesta.error || eventosRespuesta.error || entradasRespuesta.error) return;
      const lugaresRemotos = new Map((lugaresRespuesta.data ?? []).map((item) => [item.external_key, item]));
      const precios = new Map<string, number>();
      for (const entrada of entradasRespuesta.data ?? []) precios.set(entrada.event_id, Math.min(precios.get(entrada.event_id) ?? Infinity, entrada.price_cop));
      const eventosRemotos = new Map((eventosRespuesta.data ?? []).map((item) => [item.external_key, item]));
      setCatalogo({
        remoto: true,
        lugares: LUGARES.filter((base) => lugaresRemotos.has(base.id)).map((base) => {
          const remoto = lugaresRemotos.get(base.id)!;
          return { ...base, nombre: remoto.name, ciudad: remoto.city, zona: remoto.address || base.zona };
        }),
        eventos: EVENTOS.filter((base) => eventosRemotos.has(base.id)).map((base) => {
          const remoto = eventosRemotos.get(base.id)!;
          return { ...base, nombre: remoto.name, fechaISO: remoto.starts_at, precioDesde: precios.get(remoto.id) ?? base.precioDesde };
        }),
      });
    });
    return () => { activo = false; };
  }, []);
  return catalogo;
}

