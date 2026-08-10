"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDB, cop, tokenCliente } from "@/lib/store";
import { BadgeEstado } from "@/components/ui";
import { reemplazarCarrito } from "@/lib/cart";

export default function MisPedidos() {
  const db = useDB();
  const router = useRouter();

  // db solo es no-nulo tras montar en cliente, así que aquí ya hay window
  if (!db) return null;
  const token = tokenCliente();
  const mios = db.pedidos
    .filter((p) => p.clienteToken === token)
    .sort((a, b) => b.creadoEn - a.creadoEn);

  return (
    <main className="px-4 pt-6 space-y-4">
      <h1 className="text-2xl font-bold">Tus pedidos de la noche</h1>
      {mios[0] && (
        <button
          onClick={() => {
            reemplazarCarrito(mios[0].items);
            router.push("/m/carrito");
          }}
          className="btn-neon w-full rounded-2xl p-4 text-white flex items-center justify-between text-left"
        >
          <span>
            <span className="block font-bold text-lg">🍻 Otra ronda</span>
            <span className="block text-xs text-white/75">Repetir el pedido #{mios[0].numero}</span>
          </span>
          <span className="font-bold">{cop(mios[0].subtotal)} →</span>
        </button>
      )}
      {mios.length === 0 && (
        <p className="text-muted text-sm py-10 text-center">
          Aún no has pedido nada esta noche.
        </p>
      )}
      <div className="space-y-3">
        {mios.map((p) => (
          <Link key={p.id} href={`/m/pedido/${p.id}`} className="card p-4 flex items-center gap-3">
            <div className="text-2xl font-bold wordmark w-14 shrink-0">#{p.numero}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">
                {p.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(", ")}
              </div>
              <div className="text-xs text-muted">
                {new Date(p.creadoEn).toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {cop(p.total)}
              </div>
            </div>
            <BadgeEstado estado={p.estado} />
          </Link>
        ))}
      </div>
    </main>
  );
}
