"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [["/","Inicio","⌂"],["/explorar","Explorar","⌖"],["/eventos","Eventos","◇"],["/mis-planes","Mis planes","▣"],["/perfil","Perfil","◎"]];
const BUSINESS = ["/super","/admin","/promotor","/marca","/barra","/mesero","/dj","/acceso","/accesos","/reservas","/m"];
export function ConsumerNav() { const pathname = usePathname(); if (BUSINESS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || pathname.startsWith("/api/") || pathname.startsWith("/auth/") || pathname === "/login" || pathname === "/sin-acceso") return null; return <><div className="h-20 shrink-0" aria-hidden/><nav aria-label="Navegación principal" className="fixed bottom-0 inset-x-0 z-50 border-t border-line bg-background/95 backdrop-blur pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2"><div className="grid grid-cols-5 max-w-xl mx-auto px-2">{ITEMS.map(([href,label,icon]) => { const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center rounded-xl py-2 text-[10px] ${active ? "text-neon2 bg-neon2/10 font-semibold" : "text-muted"}`}><span className="text-lg leading-none mb-1">{icon}</span>{label}</Link>; })}</div></nav></>; }
