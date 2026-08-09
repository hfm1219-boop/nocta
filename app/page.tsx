"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";
import { resetDemo } from "@/lib/store";

const ROLES = [
  { href: "/m", nombre: "Cliente", desc: "Ver el menú y hacer pedidos", icono: "🍸" },
  { href: "/barra", nombre: "Bartender", desc: "Cola de pedidos y despacho", icono: "🍹" },
  { href: "/mesero", nombre: "Mesero", desc: "Entregas por zona, PIN y cobro", icono: "🛎️" },
  { href: "/admin", nombre: "Admin del local", desc: "Menú, zonas, pagos, cierre y reportes", icono: "📊" },
  { href: "/super", nombre: "Superadmin", desc: "Locales, recaudo y métricas globales", icono: "🌐" },
];

export default function Landing() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10">
      <div className="text-center space-y-4 max-w-sm">
        <Logo size="text-6xl" />
        <p className="text-xl font-semibold">Pide. Disfruta. Sin filas.</p>
        <p className="text-muted text-sm">
          Escanea el código QR de tu local y pide tus bebidas al instante.
          Sin descargar nada, sin registrarte.
        </p>
      </div>

      <section className="w-full max-w-md space-y-3">
        <div className="text-center">
          <h2 className="text-lg font-bold">Elige cómo quieres ingresar</h2>
          <p className="text-xs text-muted mt-1">Demo de Eclipse Rooftop</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className={`card p-4 hover:border-neon1/60 transition space-y-1 ${
                r.href === "/m" ? "col-span-2 border-neon2/40" : ""
              }`}
            >
              <div className="text-2xl">{r.icono}</div>
              <div className="font-semibold">{r.nombre}</div>
              <div className="text-xs text-muted leading-snug">{r.desc}</div>
            </Link>
          ))}
        </div>
        <button
          onClick={() => {
            resetDemo();
            alert("Demo reiniciada: datos de la noche regenerados.");
          }}
          className="w-full text-center text-xs text-muted hover:text-foreground transition py-2"
        >
          ↺ Reiniciar datos de la demo
        </button>
      </section>
    </main>
  );
}
