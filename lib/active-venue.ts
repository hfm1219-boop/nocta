"use client";

import { useCallback, useEffect, useState } from "react";
import { seleccionarLocal } from "@/lib/store";

export const ACTIVE_VENUE_KEY = "nocta-establishment-venue";
export const ACTIVE_VENUE_EVENT = "nocta-active-venue-change";

export type ActiveVenue = {
  id: string;
  external_key?: string | null;
  name: string;
  city: string;
};

function storedVenueId() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(ACTIVE_VENUE_KEY) ?? "";
}

export function activateVenue(venue: ActiveVenue) {
  window.localStorage.setItem(ACTIVE_VENUE_KEY, venue.id);
  seleccionarLocal(venue.external_key || venue.id, venue.name);
  window.dispatchEvent(new CustomEvent(ACTIVE_VENUE_EVENT, { detail: venue.id }));
}

export function useActiveVenue(venues: ActiveVenue[]) {
  const [selectedVenueId, setSelectedVenueId] = useState(storedVenueId);
  const venueIds = venues.map((venue) => venue.id).join("|");
  const activeVenue = venues.find((venue) => venue.id === selectedVenueId) ?? venues[0];
  const activeVenueId = activeVenue?.id ?? "";

  useEffect(() => {
    if (activeVenue && storedVenueId() !== activeVenue.id) activateVenue(activeVenue);
  }, [activeVenue]);

  useEffect(() => {
    const sync = () => {
      const saved = storedVenueId();
      if (venues.some((venue) => venue.id === saved)) setSelectedVenueId(saved);
    };
    window.addEventListener(ACTIVE_VENUE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTIVE_VENUE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [venueIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectVenue = useCallback((id: string) => {
    const venue = venues.find((item) => item.id === id);
    if (!venue) return;
    setSelectedVenueId(id);
    activateVenue(venue);
  }, [venues]);

  return {
    activeVenue,
    activeVenueId,
    selectVenue,
  };
}
