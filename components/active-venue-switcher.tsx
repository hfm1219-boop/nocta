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

  if (!activeVenue) return <p className="mt-1 truncate text-xs text-muted">Cargando sede…</p>;
  if (venues.length === 1) return <p className="mt-1 truncate text-xs font-semibold text-neon2">● {activeVenue.name} · {activeVenue.city}</p>;

  return <select value={activeVenueId} onChange={(event) => selectVenue(event.target.value)}
    className={`mt-1 block w-full rounded-lg border border-line bg-background text-foreground outline-none focus:border-neon2 ${compact ? "h-9 px-2 text-[11px]" : "h-10 px-3 text-xs"}`}
    aria-label="Cambiar sede activa global">
    {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.city}</option>)}
  </select>;
}
