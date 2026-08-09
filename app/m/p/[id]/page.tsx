"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useDB, cop, useReloj } from "@/lib/store";
import { agregarItem } from "@/lib/cart";
import { BotonPrimario } from "@/components/ui";
import { cotizarProducto } from "@/lib/mercado";

export default function DetalleProducto() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB();
  const ahora = useReloj(10_000);
  const [tamano, setTamano] = useState("normal");
  const [extras, setExtras] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);

  if (!db) return null;
  const p = db.productos.find((x) => x.id === id);
  if (!p) return <p className="p-8 text-muted">Producto no encontrado.</p>;

  const cotizacion = cotizarProducto(p, db, ahora);
  const deltaTamano = p.tamanos?.find((t) => t.id === tamano)?.delta ?? 0;
  const precioExtras = (p.extras ?? [])
    .filter((e) => extras.includes(e.id))
    .reduce((s, e) => s + e.precio, 0);
  const precioUnit = cotizacion.precio + deltaTamano + precioExtras;

  function agregar() {
    if (!p) return;
    agregarItem({
      productoId: p.id,
      nombre: p.nombre,
      precioUnit,
      cantidad,
      tamano: p.tamanos ? p.tamanos.find((t) => t.id === tamano)?.nombre : undefined,
      extras: (p.extras ?? []).filter((e) => extras.includes(e.id)).map((e) => e.nombre),
    });
    router.push("/m");
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <div className="px-4 pt-5 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-2xl text-muted">←</button>
        <span className="text-muted text-xl">♡</span>
      </div>

      <div className="flex-1 px-5 pb-32 space-y-5">
        <div
          role={p.imagenUrl ? "img" : undefined}
          aria-label={p.imagenUrl ? p.nombre : undefined}
          className="mx-auto mt-4 w-44 h-44 rounded-[2rem] flex items-center justify-center text-8xl bg-center bg-cover"
          style={p.imagenUrl
            ? { backgroundImage: `url(${p.imagenUrl})`, boxShadow: `0 0 80px ${p.color}44` }
            : {
                background: `radial-gradient(circle at 40% 30%, ${p.color}33, transparent 70%)`,
                boxShadow: `0 0 80px ${p.color}44`,
              }}
        >
          {!p.imagenUrl && p.icono}
        </div>

        <div>
          <h1 className="text-3xl font-bold">{p.nombre}</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="text-neon2 text-2xl font-bold">{cop(precioUnit)}</div>
            {db.config.preciosDinamicos.activo && (
              <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                cotizacion.tendencia === "sube"
                  ? "bg-danger/10 text-danger"
                  : cotizacion.tendencia === "baja" ? "bg-lime/10 text-lime" : "bg-muted/10 text-muted"
              }`}>
                {cotizacion.tendencia === "sube" ? "▲" : cotizacion.tendencia === "baja" ? "▼" : "•"}{" "}
                {Math.abs(cotizacion.cambioPct).toFixed(1)}%
              </span>
            )}
          </div>
          {db.config.preciosDinamicos.activo && (
            <p className="text-[11px] text-muted mt-1">📈 Precio en vivo · se congela al agregar</p>
          )}
          <p className="text-muted mt-2">{p.descripcion}</p>
        </div>

        {p.tamanos && (
          <section>
            <h2 className="font-semibold mb-2">Tamaño</h2>
            <div className="grid grid-cols-3 gap-2">
              {p.tamanos.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTamano(t.id)}
                  className={`card py-3 text-sm transition ${
                    tamano === t.id ? "chip-active font-semibold" : "text-muted"
                  }`}
                >
                  <div>{t.nombre}</div>
                  {t.delta > 0 && <div className="text-xs">+ {cop(t.delta)}</div>}
                </button>
              ))}
            </div>
          </section>
        )}

        {p.extras && p.extras.length > 0 && (
          <section>
            <h2 className="font-semibold mb-2">Extras</h2>
            <div className="space-y-2">
              {p.extras.map((e) => {
                const marcado = extras.includes(e.id);
                return (
                  <label
                    key={e.id}
                    className="card px-4 py-3 flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() =>
                          setExtras((prev) =>
                            marcado ? prev.filter((x) => x !== e.id) : [...prev, e.id],
                          )
                        }
                        className="accent-[var(--neon-2)] w-4 h-4"
                      />
                      {e.nombre}
                    </span>
                    <span className="text-muted text-sm">+ {cop(e.precio)}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-4 backdrop-blur-lg bg-background/85 border-t border-line flex items-center gap-3">
        <div className="card flex items-center rounded-full">
          <button
            onClick={() => setCantidad((c) => Math.max(1, c - 1))}
            className="px-4 py-3 text-neon2 font-bold text-lg"
          >
            −
          </button>
          <span className="w-6 text-center font-bold">{cantidad}</span>
          <button
            onClick={() => setCantidad((c) => c + 1)}
            className="px-4 py-3 text-neon2 font-bold text-lg"
          >
            +
          </button>
        </div>
        <BotonPrimario onClick={agregar} className="flex-1 flex justify-between px-6">
          <span>Agregar</span>
          <span>{cop(precioUnit * cantidad)}</span>
        </BotonPrimario>
      </div>
    </main>
  );
}
