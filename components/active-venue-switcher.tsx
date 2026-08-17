"use client";

import { useEffect, useState } from "react";
import { type ActiveVenue, useActiveVenue } from "@/lib/active-venue";

export function ActiveVenueSwitcher({ compact = false }: { compact?: boolean }) {
  const [venues, setVenues] = useState<ActiveVenue[]>([]);
  const { activeVenue, activeVenueId, selectVenue } = useActiveVenue(venues);

  useEffect(() => {
    let active = true;
    void fetch("/api/establishment", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (active && response.ok) setVenues(body.venues ?? []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!activeVenue) return null;
  if (venues.length === 1) return <p className={`${compact ? "truncate text-[10px]" : "text-xs"} mt-2 font-semibold text-neon2`}>● {activeVenue.name}</p>;

  return <label className={`${compact ? "block min-w-0 text-[9px]" : "block text-[10px]"} mt-2 uppercase tracking-wider text-muted`}>Sede activa<select value={activeVenueId} onChange={(event) => selectVenue(event.target.value)} className={`${compact ? "mt-1 h-9 py-1 text-xs" : "mt-1"} entrada bg-background normal-case tracking-normal`} aria-label="Cambiar sede activa global">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.city}</option>)}</select></label>;
}
