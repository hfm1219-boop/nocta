"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORIAS } from "@/lib/seed";
import { useDB, cop, useReloj } from "@/lib/store";
import { agregarItem } from "@/lib/cart";
import { Logo } from "@/components/ui";
import { cotizarProducto } from "@/lib/mercado";

export default function MenuCliente() {
  const db = useDB();
  const ahora = useReloj(10_000);
  const [cat, setCat] = useState("cocteles");
  const [busqueda, setBusqueda] = useState("");

  if (!db) return null;
  const ventanaCerrada = !db.config.ventanaAbierta;

  const productos = db.productos.filter((p) => {
    if (busqueda) {
      return p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    }
    return p.categoria === cat;
  });

  return (
    <main className="px-4 pt-5 space-y-5">
      <header className="flex items-center justify-between">
        <Logo size="text-2xl" />
        <span className="text-xs text-muted border border-line rounded-full px-3 py-1.5">
          📍 Eclipse Rooftop
        </span>
      </header>

      <div>
        <h1 className="text-2xl font-bold">Hola 👋</h1>
        <p className="text-muted">¿Qué vas a pedir hoy?</p>
      </div>

      <Link
        href="/m/carrito"
        className="card p-4 flex items-center gap-3 border-neon3/40 bg-neon3/5"
      >
        <span className="text-3xl">🗓️</span>
        <span className="flex-1">
          <span className="block font-semibold text-neon3">Preordena antes de llegar</span>
          <span className="block text-xs text-muted mt-0.5">
            Ahorra 5%, 10% o 15% según la cantidad de productos.
          </span>
        </span>
        <span className="text-neon3">→</span>
      </Link>

      {ventanaCerrada && (
        <div className="card p-3 border-amber/40 text-amber text-sm">
          El local no está recibiendo pedidos en este momento. Menú solo lectura.
        </div>
      )}

      {db.config.preciosDinamicos.activo && (
        <div className="card p-3 border-lime/40 bg-lime/5 flex items-center gap-3">
          <span className="text-2xl">📈</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-lime">Mercado de precios activo</p>
            <p className="text-[11px] text-muted">
              Los precios cambian con la demanda cada {db.config.preciosDinamicos.intervaloMinutos} min.
              El precio se congela al agregar el producto.
            </p>
          </div>
          <span className="w-2 h-2 rounded-full bg-lime animate-pulse" />
        </div>
      )}

      <div className="card flex items-center gap-2 px-4 py-3">
        <span className="text-muted">🔍</span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar bebidas"
          className="bg-transparent outline-none flex-1 text-sm placeholder:text-muted"
        />
      </div>

      {!busqueda && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`card shrink-0 px-4 py-3 flex flex-col items-center gap-1 text-xs min-w-[76px] transition ${
                cat === c.id ? "chip-active text-foreground font-semibold" : "text-muted"
              }`}
            >
              <span className="text-xl">{c.icono}</span>
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      <section className="space-y-3">
        {productos.map((p) => {
          const cotizacion = cotizarProducto(p, db, ahora);
          const colorTendencia = cotizacion.tendencia === "sube"
            ? "text-danger"
            : cotizacion.tendencia === "baja" ? "text-lime" : "text-muted";
          return <div
            key={p.id}
            className={`card p-3 flex items-center gap-3 ${!p.disponible ? "opacity-45" : ""}`}
          >
            <Link
              href={p.disponible && !ventanaCerrada ? `/m/p/${p.id}` : "#"}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div
                role={p.imagenUrl ? "img" : undefined}
                aria-label={p.imagenUrl ? p.nombre : undefined}
                className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-center bg-cover"
                style={p.imagenUrl
                  ? { backgroundImage: `url(${p.imagenUrl})`, boxShadow: `inset 0 0 0 1px ${p.color}44` }
                  : { background: `${p.color}22`, boxShadow: `inset 0 0 0 1px ${p.color}44` }}
              >
                {!p.imagenUrl && p.icono}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.nombre}</div>
                <div className="text-xs text-muted truncate">{p.descripcion}</div>
                <div className="text-neon2 font-bold text-sm mt-0.5">
                  {cop(cotizacion.precio)}
                  {db.config.preciosDinamicos.activo && (
                    <span className={`ml-2 text-[10px] ${colorTendencia}`}>
                      {cotizacion.tendencia === "sube" ? "▲" : cotizacion.tendencia === "baja" ? "▼" : "•"}{" "}
                      {Math.abs(cotizacion.cambioPct).toFixed(1)}%
                    </span>
                  )}
                  {!p.disponible && (
                    <span className="ml-2 text-danger font-semibold text-xs">AGOTADO</span>
                  )}
                </div>
              </div>
            </Link>
            {p.disponible && !ventanaCerrada && (
              <button
                onClick={() =>
                  agregarItem({
                    productoId: p.id,
                    nombre: p.nombre,
                    precioUnit: cotizacion.precio,
                    cantidad: 1,
                  })
                }
                className="w-9 h-9 rounded-full border border-neon2 text-neon2 font-bold text-lg shrink-0 active:scale-90 transition"
              >
                +
              </button>
            )}
          </div>;
        })}
        {productos.length === 0 && (
          <p className="text-center text-muted text-sm py-8">Sin resultados.</p>
        )}
      </section>

      <p className="text-[11px] text-muted text-center pb-4 leading-relaxed">
        Venta de alcohol solo para mayores de 18 años. El personal validará tu edad
        en la entrega. · Aviso de privacidad: tratamos tus datos mínimos (teléfono
        opcional) conforme a la Ley 1581 de 2012.
      </p>
    </main>
  );
}
