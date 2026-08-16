"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { Logo } from "@/components/ui";

const ITEMS = [
  { href: "/super", label: "Resumen", icon: "⌂", exact: true },
  { href: "/super/usuarios", label: "Accesos", icon: "◎" },
  { href: "/super/fidelidad", label: "Fidelización", icon: "✦" },
  { href: "/super/integridad", label: "Integridad", icon: "✓" },
];

export function SuperNav() {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => exact ? pathname === href : pathname.startsWith(href);
  return <>
    <aside className="hidden lg:flex sticky top-0 h-dvh w-64 shrink-0 border-r border-line bg-background/95 p-5 flex-col">
      <Link href="/super"><Logo size="text-2xl"/></Link>
      <div className="mt-2"><p className="text-[10px] uppercase tracking-[.2em] text-neon2">Administración</p><p className="text-sm text-muted">Control de plataforma</p></div>
      <nav aria-label="Navegación del superadministrador" className="mt-8 space-y-2">{ITEMS.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href, item.exact) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${active(item.href, item.exact) ? "bg-neon2/15 text-neon2 border border-neon2/30 font-semibold" : "text-muted hover:bg-surface2 hover:text-foreground"}`}><span className="text-lg w-5 text-center">{item.icon}</span>{item.label}</Link>)}</nav>
      <div className="mt-auto space-y-3"><Link href="/" className="block rounded-xl border border-line p-3 text-center text-sm text-muted hover:text-foreground">Ver aplicación</Link><CerrarSesion/></div>
    </aside>
    <header className="lg:hidden sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur px-4 py-3 flex items-center justify-between"><Link href="/super"><Logo size="text-xl"/></Link><div className="flex items-center gap-3"><span className="text-[10px] uppercase tracking-wider text-neon2">Superadmin</span><CerrarSesion/></div></header>
    <nav aria-label="Navegación móvil del superadministrador" className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-line bg-background/95 backdrop-blur px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2"><div className="grid grid-cols-4 max-w-xl mx-auto">{ITEMS.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href, item.exact) ? "page" : undefined} className={`flex flex-col items-center rounded-xl py-2 text-[10px] ${active(item.href, item.exact) ? "text-neon2 bg-neon2/10 font-semibold" : "text-muted"}`}><span className="text-lg leading-none mb-1">{item.icon}</span>{item.label}</Link>)}</div></nav>
  </>;
}
