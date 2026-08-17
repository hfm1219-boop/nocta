"use client";

import { useEffect, useState } from "react";
import { idLocalActivo } from "./store";

export type VenueMenuItem = { id: string; category_id: string | null; name: string; description: string; sku: string | null; price_cop: number; image_url: string | null };
export type VenueMenuCategory = { id: string; name: string; sort_order: number };
export type VenueMenu = { venue?: { id: string; external_key: string; name: string }; categories: VenueMenuCategory[]; items: VenueMenuItem[]; loading: boolean; error?: string };

export function useVenueMenu(): VenueMenu {
  const [state, setState] = useState<VenueMenu>({ categories: [], items: [], loading: true });
  useEffect(() => {
    let active = true;
    void fetch(`/api/menu?venueKey=${encodeURIComponent(idLocalActivo())}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!active) return;
      setState(response.ok ? { ...data, loading: false } : { categories: [], items: [], loading: false, error: data.error ?? "Menú no disponible" });
    }).catch(() => active && setState({ categories: [], items: [], loading: false, error: "Menú no disponible" }));
    return () => { active = false; };
  }, []);
  return state;
}
