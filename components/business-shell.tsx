"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ActiveVenueSwitcher } from "@/components/active-venue-switcher";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { ContextSwitcher } from "@/components/context-switcher";
import { Logo } from "@/components/ui";

type Kind = "establishment" | "promoter" | "brand_distributor";
type NavItem = [href: string, label: string, icon: string];

const NAV: Record<Kind, NavItem[]> = {
  establishment: [["/admin","Inicio","⌂"],["/admin/establecimientos","Establecimientos","⌖"],["/admin/operacion","Operación","◉"],["/admin/eventos","Eventos","◇"],["/admin/promociones","Promociones","%"],["/admin/menu","Menú","≡"],["/admin/clientes","Clientes","◎"],["/admin/analitica","Analítica","↗"],["/admin/equipo","Equipo","♙"],["/admin/configuracion","Configuración","⚙"]],
  promoter: [["/promotor","Inicio","⌂"],["/promotor/eventos","Eventos","◇"],["/promotor/tickets","Tickets","▣"],["/promotor/audiencia","Audiencia","◎"],["/promotor/alianzas","Alianzas","⇄"],["/promotor/liquidaciones","Liquidaciones","$"],["/promotor/analitica","Analítica","↗"],["/promotor/equipo","Equipo","♙"],["/promotor/configuracion","Configuración","⚙"]],
  brand_distributor: [["/marca","Inicio","⌂"],["/marca/campanas","Campañas","◆"],["/marca/portafolio","Marcas y productos","▦"],["/marca/establecimientos","Establecimientos","⌖"],["/marca/eventos","Eventos","◇"],["/marca/audiencias","Audiencias","◎"],["/marca/resultados","Resultados","↗"],["/marca/equipo","Equipo","♙"],["/marca/configuracion","Configuración","⚙"]],
};
const LABEL: Record<Kind, string> = {
  establishment: "NOCTA Business · Establecimiento",
  promoter: "NOCTA Business · Promotor",
  brand_distributor: "NOCTA Business · Marca / Distribuidor",
};

export function BusinessShell({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = NAV[kind];
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryItems = items.slice(0, 4);
  const secondaryItems = items.slice(4);
  const desktopItems = kind === "establishment" ? items.filter((_, index) => index !== 1) : items;
  const root = kind === "establishment" ? "/admin" : kind === "promoter" ? "/promotor" : "/marca";
  const active = (href: string) => href === root ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const navLink = ([href, label, icon]: NavItem) => (
    <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${active(href) ? "border-neon2/35 bg-neon2/15 font-semibold text-neon2" : "border-transparent text-muted hover:border-line hover:bg-surface2 hover:text-foreground"}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface2 text-base">{icon}</span>
      <span>{label}</span>
    </Link>
  );

  return <div className="min-h-dvh md:flex">
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-line bg-surface/70 p-5 backdrop-blur-xl md:flex">
      <Link href={root} className="flex items-center justify-between gap-3">
        <Logo size="text-2xl"/>
        <span className="rounded-full border border-neon2/25 bg-neon2/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-neon2">Business</span>
      </Link>
      <p className="mt-3 text-[10px] uppercase tracking-[.16em] text-muted">{LABEL[kind]}</p>

      <section className="mt-5 space-y-4 rounded-2xl border border-line bg-background/70 p-4">
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-muted">Perfil activo</p><ContextSwitcher compact/></div>
        {kind === "establishment" && <div className="border-t border-line pt-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted">Sede activa</p><ActiveVenueSwitcher/></div>}
      </section>

      {kind === "establishment" && <Link href="/admin/establecimientos" aria-current={active("/admin/establecimientos") ? "page" : undefined}
        className={`mt-4 flex items-center gap-3 rounded-2xl border p-3 text-sm font-semibold transition ${active("/admin/establecimientos") ? "border-neon2/50 bg-neon2/15 text-neon2" : "border-line bg-background/50 hover:border-neon2/40"}`}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-neon2/10 text-neon2">⌖</span>
        <span><span className="block">Sedes</span><span className="block text-[10px] font-normal text-muted">Administrar establecimientos</span></span>
      </Link>}

      <p className="mb-2 mt-5 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted">Módulos</p>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label={LABEL[kind]}>{desktopItems.map(navLink)}</nav>
      <div className="mt-3 border-t border-line pt-4"><CerrarSesion/></div>
    </aside>

    <div className="min-w-0 flex-1 pb-24 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-background/95 px-4 py-3 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href={root} className="flex min-w-0 items-center gap-3"><Logo size="text-2xl"/><span className="truncate text-[10px] uppercase tracking-[.12em] text-muted">{kind === "establishment" ? "Establecimiento" : kind === "promoter" ? "Promotor" : "Marca"}</span></Link>
          <CerrarSesion/>
        </div>
        <div className={`mt-3 grid gap-2 ${kind === "establishment" ? "grid-cols-2" : "grid-cols-1"}`}>
          <section className="min-w-0 rounded-xl border border-line bg-surface p-2.5"><p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted">Perfil</p><ContextSwitcher compact/></section>
          {kind === "establishment" && <section className="min-w-0 rounded-xl border border-neon2/25 bg-neon2/5 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-muted">Sede</p><ActiveVenueSwitcher compact/></section>}
        </div>
      </header>
      {children}
    </div>

    {moreOpen && <div className="fixed inset-0 z-40 bg-black/70 md:hidden" onClick={() => setMoreOpen(false)} aria-hidden="true"/>}
    {moreOpen && <section className="fixed inset-x-3 bottom-20 z-50 rounded-2xl border border-line bg-background p-3 shadow-2xl md:hidden" aria-label="Más opciones"><div className="grid grid-cols-2 gap-2">{secondaryItems.map(([href,label,icon]) => <Link key={href} href={href} onClick={() => setMoreOpen(false)} className={`card flex items-center gap-3 p-4 ${active(href) ? "border-neon2/50 text-neon2" : ""}`}><span className="text-xl">{icon}</span><span className="text-sm font-semibold">{label}</span></Link>)}</div></section>}
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-background/95 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden" aria-label={`${LABEL[kind]} móvil`}>
      <div className="grid grid-cols-5 px-2">{primaryItems.map(([href,label,icon]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} onClick={() => setMoreOpen(false)} className={`flex min-w-0 flex-col items-center rounded-xl py-2 text-[10px] ${active(href) ? "bg-neon2/10 text-neon2" : "text-muted"}`}><span className="mb-1 text-lg leading-none">{icon}</span><span className="max-w-full truncate px-1">{label}</span></Link>)}<button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)} className={`flex min-w-0 flex-col items-center rounded-xl py-2 text-[10px] ${secondaryItems.some(([href]) => active(href)) || moreOpen ? "bg-neon2/10 text-neon2" : "text-muted"}`}><span className="mb-1 text-lg leading-none">•••</span>Más</button></div>
    </nav>
  </div>;
}
