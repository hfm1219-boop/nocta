"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCarrito, totalCarrito } from "@/lib/cart";
import { cop, useDB, tokenCliente } from "@/lib/store";
import { VolverMenuRoles } from "@/components/ui";

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const items = useCarrito();
  const db = useDB();
  const enCarrito = items.reduce((s, i) => s + i.cantidad, 0);
  const misActivos = db?.pedidos.filter(
    (p) =>
      p.clienteToken === (typeof window !== "undefined" ? tokenCliente() : "") &&
      !["entregado", "anulado", "vencido"].includes(p.estado),
  ).length ?? 0;
  const cancionesPendientes = db?.solicitudesCanciones.filter(
    (c) => c.estado !== "reproducida",
  ).length ?? 0;

  const tabs = [
    { href: "/m", label: "Menú", icono: "🍸" },
    { href: "/m/pedidos", label: "Pedidos", icono: "🧾", badge: misActivos },
    { href: "/m/carrito", label: "Carrito", icono: "🛒", badge: enCarrito },
    { href: "/m/rockola", label: "Rockola", icono: "🎵", badge: cancionesPendientes },
    { href: "/", label: "Roles", icono: "👥" },
  ];

  const esFull = path.includes("/pedido/") || path.includes("/p/");

  return (
    <div className="flex-1 flex flex-col max-w-md w-full mx-auto relative min-h-dvh">
      <div className={`flex-1 ${esFull ? "" : "pb-24"}`}>{children}</div>

      {esFull && (
        <div className="fixed top-4 right-4 z-40">
          <VolverMenuRoles compacto />
        </div>
      )}

      {!esFull && (
        <>
          {enCarrito > 0 && path === "/m" && (
            <Link
              href="/m/carrito"
              className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 btn-neon rounded-full px-6 py-3 font-semibold text-white flex items-center gap-3 active:scale-[0.98] transition"
            >
              <span>Ver carrito · {enCarrito}</span>
              <span className="font-bold">{cop(totalCarrito(items))}</span>
            </Link>
          )}
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 backdrop-blur-lg bg-background/85 border-t border-line grid grid-cols-5">
            {tabs.map((t) => {
              const activo = path === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`py-3 flex flex-col items-center gap-0.5 text-[10px] sm:text-xs relative ${
                    activo ? "text-neon2 font-semibold" : "text-muted"
                  }`}
                >
                  <span className="text-lg leading-none relative">
                    {t.icono}
                    {!!t.badge && (
                      <span className="absolute -top-1.5 -right-2.5 bg-neon2 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {t.badge}
                      </span>
                    )}
                  </span>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </div>
  );
}
