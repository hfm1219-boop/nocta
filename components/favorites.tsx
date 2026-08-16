"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type FavoriteType = "venue" | "event" | "experience" | "promotion";
type Favorite = { entity_type: FavoriteType; entity_key: string };
type FavoritesContextValue = {
  isFavorite: (type: FavoriteType, key: string) => boolean;
  toggle: (type: FavoriteType, key: string) => Promise<void>;
  busy: (type: FavoriteType, key: string) => boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);
const favoriteId = (type: FavoriteType, key: string) => `${type}:${key}`;

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/discovery", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { favorites?: Favorite[] };
      if (active) setFavorites(body.favorites ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const isFavorite = useCallback((type: FavoriteType, key: string) => favorites.some((item) => item.entity_type === type && item.entity_key === key), [favorites]);
  const busy = useCallback((type: FavoriteType, key: string) => pending.has(favoriteId(type, key)), [pending]);
  const toggle = useCallback(async (type: FavoriteType, key: string) => {
    const id = favoriteId(type, key);
    if (pending.has(id)) return;
    setError("");
    const next = !favorites.some((item) => item.entity_type === type && item.entity_key === key);
    setPending((current) => new Set(current).add(id));
    try {
      const response = await fetch("/api/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: type, entityKey: key, favorite: next }) });
      if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(pathname)}`); return; }
      if (!response.ok) { const body=await response.json().catch(()=>({})) as {error?:string};throw new Error(body.error??"No fue posible actualizar el favorito"); }
      setFavorites((current) => next
        ? current.some((item) => item.entity_type === type && item.entity_key === key) ? current : [...current, { entity_type: type, entity_key: key }]
        : current.filter((item) => item.entity_type !== type || item.entity_key !== key));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible actualizar el favorito");
    } finally {
      setPending((current) => { const copy = new Set(current); copy.delete(id); return copy; });
    }
  }, [favorites, pathname, pending, router]);

  const value = useMemo(() => ({ isFavorite, toggle, busy }), [isFavorite, toggle, busy]);
  return <FavoritesContext.Provider value={value}>{children}{error&&<div role="alert" className="fixed z-[70] left-1/2 -translate-x-1/2 bottom-24 max-w-sm w-[calc(100%-2rem)] rounded-xl border border-danger/40 bg-background p-3 text-sm text-danger shadow-xl">{error}<button type="button" onClick={()=>setError("")} className="float-right ml-3" aria-label="Cerrar aviso">×</button></div>}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error("useFavorites debe usarse dentro de FavoritesProvider");
  return context;
}

export function FavoriteButton({ type, entityKey, className = "" }: { type: FavoriteType; entityKey: string; className?: string }) {
  const { isFavorite, toggle, busy } = useFavorites();
  const active = isFavorite(type, entityKey);
  const loading = busy(type, entityKey);
  return <button
    type="button"
    aria-label={active ? "Quitar de favoritos" : "Guardar en favoritos"}
    aria-pressed={active}
    disabled={loading}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggle(type, entityKey); }}
    className={`rounded-full min-h-10 min-w-10 grid place-items-center text-xl transition ${active ? "text-neon1 bg-neon1/10" : "text-muted bg-background/60 hover:text-neon1"} disabled:opacity-50 ${className}`}
  >{active ? "♥" : "♡"}</button>;
}
