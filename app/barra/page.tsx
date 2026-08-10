"use client";

import { useEffect, useMemo, useState } from "react";
import {
  avanzarDespachoPedido, avanzarPedido, cop, guardarDB, mmss, toggleDisponible, useDB, useReloj,
} from "@/lib/store";
import {
  BadgePendienteCobro, EncabezadoStaff, ETIQUETA_MODO,
} from "@/components/ui";
import { ModalCobro } from "@/components/cobro";
import type { Pedido } from "@/lib/types";

const DEMORADO_MIN = 5;

export default function Barra() {
  const db = useDB();
  const ahora = useReloj(1000);
  const [staffId, setStaffId] = useState("st-barra1");
  const [cobrando, setCobrando] = useState<Pedido | null>(null);
  const [panelAgotados, setPanelAgotados] = useState(false);
  const [verLote, setVerLote] = useState(false);

  // La pantalla de barra actúa como "servidor" de la demo:
  // vence pedidos pagados no retirados según la política del local.
  useEffect(() => {
    if (!db) return;
    const limite = db.config.minutosVencimiento * 60_000;
    db.pedidos.forEach((p) => {
      if (
        p.estado === "listo" && p.modo === "barra" &&
        p.estadoPago === "pagado" && p.timestamps.listo &&
        Date.now() - p.timestamps.listo > limite
      ) {
        guardarDB((d) => {
          const x = d.pedidos.find((y) => y.id === p.id);
          if (x && x.estado === "listo") {
            x.estado = "vencido";
            x.timestamps.vencido = Date.now();
            x.notas = "Vencido: no retirado. Aplica política de reembolso del local.";
          }
        });
      }
    });
  });

  const cola = useMemo(() => {
    if (!db) return [];
    return db.pedidos
      .filter((p) =>
        ["nuevo", "preparando", "listo"].includes(p.estado) &&
        (p.tipo !== "preorden" || !p.programadoPara || p.programadoPara <= ahora + 60 * 60_000),
      )
      .sort((a, b) => (a.programadoPara ?? a.creadoEn) - (b.programadoPara ?? b.creadoEn));
  }, [ahora, db]);

  const lote = useMemo(() => {
    const agg = new Map<string, number>();
    cola
      .filter((p) => ["nuevo", "preparando"].includes(p.estado))
      .forEach((p) =>
        p.items.forEach((i) => {
          const k = `${i.nombre}${i.tamano && i.tamano !== "Normal" ? ` (${i.tamano})` : ""}`;
          agg.set(k, (agg.get(k) ?? 0) + i.cantidad);
        }),
      );
    return [...agg.entries()].sort((a, b) => b[1] - a[1]);
  }, [cola]);

  if (!db) return null;
  const barristas = db.staff.filter((s) => s.rol === "barra" && s.activo);
  const agotados = db.productos.filter((p) => !p.disponible).length;

  function marcarListo(p: Pedido) {
    avanzarPedido(p.id, "listo");
    // En zona y mesa, "listo" dispara la asignación de mesero (y luz en zona)
    if (p.modo !== "barra") avanzarPedido(p.id, "en_camino");
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <EncabezadoStaff
        titulo="Barra — despacho"
        subtitulo="Eclipse Rooftop"
        extra={
          <div className="flex gap-1.5">
            {barristas.map((b) => (
              <button
                key={b.id}
                onClick={() => setStaffId(b.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  staffId === b.id
                    ? "border-neon2 text-neon2 font-semibold"
                    : "border-line text-muted"
                }`}
              >
                {b.nombre.split(" ")[0]}
              </button>
            ))}
          </div>
        }
      />

      <div className="px-4 py-3 flex gap-2 flex-wrap items-center">
        <span className="card px-3 py-1.5 text-sm">
          En cola: <b className="text-neon3">{cola.length}</b>
        </span>
        <button
          onClick={() => setVerLote(!verLote)}
          className={`card px-3 py-1.5 text-sm transition ${verLote ? "chip-active" : "text-muted"}`}
        >
          🧮 Preparar en lote
        </button>
        <button
          onClick={() => setPanelAgotados(true)}
          className="card px-3 py-1.5 text-sm text-muted"
        >
          🚫 Agotados{agotados > 0 && <b className="text-danger"> · {agotados}</b>}
        </button>
      </div>

      {verLote && (
        <div className="mx-4 mb-3 card p-4">
          <h2 className="font-semibold text-sm mb-2 text-neon3">
            Items agrupados (pedidos en preparación)
          </h2>
          {lote.length === 0 ? (
            <p className="text-muted text-sm">Nada pendiente de preparar.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {lote.map(([nombre, cant]) => (
                <div key={nombre} className="bg-surface2 rounded-lg px-3 py-2 text-sm">
                  <b className="text-neon2">{cant}×</b> {nombre}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <main className="flex-1 px-4 pb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 content-start">
        {cola.length === 0 && (
          <p className="text-muted text-center col-span-full py-16">
            Sin pedidos en cola. Los nuevos aparecen aquí al instante.
          </p>
        )}
        {cola.map((p) => {
          const demorado =
            ahora > 0 &&
            ahora - (p.tipo === "preorden" && p.programadoPara ? p.programadoPara : p.creadoEn) >
              DEMORADO_MIN * 60_000 &&
            p.estado !== "listo";
          return (
            <div
              key={p.id}
              className={`card p-4 space-y-2 ${demorado ? "alerta-demorado" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold wordmark">#{p.numero}</span>
                <div className="text-right">
                  {p.tipo === "preorden" && p.programadoPara && ahora < p.programadoPara ? (
                    <div className="text-xs text-neon3 font-semibold">Programado</div>
                  ) : (
                    <div className={`font-mono text-sm ${demorado ? "text-danger font-bold" : "text-muted"}`}>
                      ⏱ {mmss(p.tipo === "preorden" && p.programadoPara ? p.programadoPara : p.creadoEn, ahora)}
                    </div>
                  )}
                  <div className="text-[10px] text-muted">{ETIQUETA_MODO[p.modo]}</div>
                </div>
              </div>

              {p.tipo === "preorden" && p.programadoPara && (
                <div className="rounded-lg bg-neon3/10 border border-neon3/30 px-3 py-2 text-xs">
                  <b className="text-neon3">🗓️ PREORDEN</b>
                  <span className="text-muted ml-2">
                    Llegada {new Date(p.programadoPara).toLocaleString("es-CO", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              )}

              {p.despachos?.length ? (
                <div className="space-y-2">
                  {p.despachos.map((despacho) => {
                    const estacion = db.estacionesDespacho.find((item) => item.id === despacho.estacionId);
                    return (
                      <section key={despacho.estacionId} className="rounded-xl bg-surface2 p-3 border border-line">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-bold text-neon3">
                            {despacho.estacionId.includes("nevera") ? "❄️" : despacho.estacionId.includes("botelleria") ? "🍾" : "🍸"}{" "}
                            {estacion?.nombre ?? "Barra general"}
                          </p>
                          <span className={`text-[10px] font-bold ${
                            despacho.estado === "listo" ? "text-lime" : despacho.estado === "preparando" ? "text-amber" : "text-muted"
                          }`}>
                            {despacho.estado === "listo" ? "LISTO" : despacho.estado === "preparando" ? "PREPARANDO" : "PENDIENTE"}
                          </span>
                        </div>
                        <div className="text-sm space-y-0.5">
                          {despacho.itemIndices.map((indice) => {
                            const item = p.items[indice];
                            return item ? (
                              <div key={indice}>
                                <b>{item.cantidad}×</b> {item.nombre}
                                {item.tamano && item.tamano !== "Normal" && <span className="text-muted"> · {item.tamano}</span>}
                              </div>
                            ) : null;
                          })}
                        </div>
                        {despacho.estado !== "listo" && (
                          <button
                            onClick={() => avanzarDespachoPedido(
                              p.id,
                              despacho.estacionId,
                              despacho.estado === "pendiente" ? "preparando" : "listo",
                            )}
                            className={`w-full mt-2 rounded-lg py-2 text-xs font-semibold border ${
                              despacho.estado === "pendiente"
                                ? "bg-amber/10 text-amber border-amber/30"
                                : "bg-lime/10 text-lime border-lime/30"
                            }`}
                          >
                            {despacho.estado === "pendiente" ? "Iniciar estación" : "✓ Estación lista"}
                          </button>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm space-y-0.5">
                  {p.items.map((i, idx) => (
                    <div key={idx}><b>{i.cantidad}×</b> {i.nombre}</div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {p.estadoPago === "pendiente" && <BadgePendienteCobro />}
                {p.zonaId && (
                  <span className="text-xs text-neon3">
                    📍 {db.zonas.find((z) => z.id === p.zonaId)?.nombre}
                  </span>
                )}
                <span className="text-xs text-muted ml-auto">{cop(p.total)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                {p.estado === "nuevo" && !p.despachos?.length && (
                  <button
                    onClick={() => avanzarPedido(p.id, "preparando")}
                    className="flex-1 rounded-xl py-2.5 font-semibold bg-amber/15 text-amber border border-amber/40 active:scale-[0.98]"
                  >
                    Preparando
                  </button>
                )}
                {p.estado === "preparando" && !p.despachos?.length && (
                  <button
                    onClick={() => marcarListo(p)}
                    className="flex-1 rounded-xl py-2.5 font-semibold bg-lime/15 text-lime border border-lime/40 active:scale-[0.98]"
                  >
                    ✓ Listo
                  </button>
                )}
                {p.estado === "listo" && p.modo === "barra" && (
                  <>
                    {p.estadoPago === "pendiente" ? (
                      <button
                        onClick={() => setCobrando(p)}
                        className="flex-1 rounded-xl py-2.5 font-semibold bg-danger/15 text-danger border border-danger/40 active:scale-[0.98]"
                      >
                        💰 Cobrar
                      </button>
                    ) : (
                      <button
                        onClick={() => avanzarPedido(p.id, "entregado")}
                        className="flex-1 rounded-xl py-2.5 font-semibold btn-neon text-white active:scale-[0.98]"
                      >
                        Entregado
                      </button>
                    )}
                  </>
                )}
                {p.estado === "listo" && p.modo !== "barra" && (
                  <span className="flex-1 text-center text-xs text-muted py-2">
                    Esperando asignación de mesero…
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {cobrando && (
        <ModalCobro
          pedido={cobrando}
          staffId={staffId}
          onCerrar={() => setCobrando(null)}
          onCobrado={() => avanzarPedido(cobrando.id, "entregado")}
        />
      )}

      {panelAgotados && (
        <div className="fixed inset-0 z-50 bg-black/70 flex justify-end">
          <div className="bg-surface w-full max-w-sm h-full overflow-y-auto p-5 space-y-3 border-l border-line">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg">Marcar agotados</h2>
              <button onClick={() => setPanelAgotados(false)} className="text-muted text-xl px-2">
                ✕
              </button>
            </div>
            <p className="text-xs text-muted">
              Dos toques: el producto desaparece del menú del cliente al instante.
            </p>
            {db.productos.map((pr) => (
              <button
                key={pr.id}
                onClick={() => toggleDisponible(pr.id)}
                className={`card w-full px-4 py-3 flex items-center justify-between text-sm ${
                  !pr.disponible ? "border-danger/50" : ""
                }`}
              >
                <span>
                  {pr.icono} {pr.nombre}
                </span>
                <span className={pr.disponible ? "text-lime text-xs" : "text-danger text-xs font-bold"}>
                  {pr.disponible ? "Disponible" : "AGOTADO"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
