"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { ContextSwitcher } from "@/components/context-switcher";
import { Logo } from "@/components/ui";

type Kind = "establishment" | "promoter" | "brand_distributor";
const NAV = {
  establishment: [["/admin","Inicio","⌂"],["/admin/operacion","Operación","◉"],["/admin/eventos","Eventos","◇"],["/admin/promociones","Promociones","%"],["/admin/menu","Menú","≡"],["/admin/clientes","Clientes","◎"],["/admin/analitica","Analítica","↗"],["/admin/equipo","Equipo","♙"],["/admin/configuracion","Configuración","⚙"]],
  promoter: [["/promotor","Inicio","⌂"],["/promotor/eventos","Eventos","◇"],["/promotor/tickets","Tickets","▣"],["/promotor/audiencia","Audiencia","◎"],["/promotor/alianzas","Alianzas","⇄"],["/promotor/liquidaciones","Liquidaciones","$"],["/promotor/analitica","Analítica","↗"],["/promotor/equipo","Equipo","♙"],["/promotor/configuracion","Configuración","⚙"]],
  brand_distributor: [["/marca","Inicio","⌂"],["/marca/campanas","Campañas","◆"],["/marca/portafolio","Marcas y productos","▦"],["/marca/establecimientos","Establecimientos","⌖"],["/marca/eventos","Eventos","◇"],["/marca/audiencias","Audiencias","◎"],["/marca/resultados","Resultados","↗"],["/marca/equipo","Equipo","♙"],["/marca/configuracion","Configuración","⚙"]],
} satisfies Record<Kind, string[][]>;
const LABEL = { establishment: "NOCTA Business · Establecimiento", promoter: "NOCTA Business · Promotor", brand_distributor: "NOCTA Business · Marca / Distribuidor" };

export function BusinessShell({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const pathname = usePathname(); const items = NAV[kind];
  const active = (href: string) => href === `/${kind === "establishment" ? "admin" : kind === "promoter" ? "promotor" : "marca"}` ? pathname === href : pathname.startsWith(`${href}/`) || pathname === href;
  return <div className="min-h-dvh lg:flex"><aside className="hidden lg:flex sticky top-0 h-dvh w-64 shrink-0 border-r border-line bg-background p-5 flex-col"><Link href={items[0][0]}><Logo size="text-2xl"/></Link><p className="text-[10px] uppercase tracking-[.16em] text-neon2 mt-3">{LABEL[kind]}</p><div className="mt-4"><ContextSwitcher compact/></div><nav className="mt-6 space-y-1 overflow-y-auto" aria-label={LABEL[kind]}>{items.map(([href,label,icon]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active(href) ? "bg-neon2/15 border border-neon2/30 text-neon2 font-semibold" : "text-muted hover:bg-surface2 hover:text-foreground"}`}><span className="w-5 text-center">{icon}</span>{label}</Link>)}</nav><div className="mt-auto pt-4"><CerrarSesion/></div></aside><div className="min-w-0 flex-1 pb-24 lg:pb-0"><header className="lg:hidden sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur p-3 flex items-center gap-3"><Link href={items[0][0]}><Logo size="text-xl"/></Link><div className="min-w-0 flex-1"><ContextSwitcher compact/></div><CerrarSesion/></header>{children}</div><nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-line bg-background/95 backdrop-blur overflow-x-auto pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1"><div className="flex min-w-max px-2">{items.map(([href,label,icon]) => <Link key={href} href={href} className={`w-20 flex flex-col items-center rounded-xl py-2 text-[10px] ${active(href) ? "text-neon2 bg-neon2/10" : "text-muted"}`}><span className="text-lg leading-none mb-1">{icon}</span>{label}</Link>)}</div></nav></div>;
}
