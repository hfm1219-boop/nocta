"use client";

import { useMemo, useState } from "react";
import {
  avanzarPedido, cop, mmss, noEncontrado, useDB, useReloj,
} from "@/lib/store";
import {
  BadgePendienteCobro, EncabezadoStaff, MuestraLuz,
} from "@/components/ui";
import { ModalCobro } from "@/components/cobro";
import type { Pedido } from "@/lib/types";

export default function Mesero() {
  const db = useDB();
  const ahora = useReloj(1000);
  const [staffId, setStaffId] = useState("st-mesero1");
  const [validando, setValidando] = useState<Pedido | null>(null);
  const [pinIngresado, setPinIngresado] = useState("");
  const [pinError, setPinError] = useState(false);
  const [cobrando, setCobrando] = useState<Pedido | null>(null);
  const [noLocalizado, setNoLocalizado] = useState<Pedido | null>(null);
  const [barraSeleccionada, setBarraSeleccionada] = useState("");

  const entregas = useMemo(() => {
    if (!db) return [];
    return db.pedidos
      .filter((p) => p.estado === "en_camino" && p.meseroId === staffId)
      .sort((a, b) => a.creadoEn - b.creadoEn);
  }, [db, staffId]);

  if (!db) return null;
  const meseros = db.staff.filter((s) => s.rol === "mesero" && s.activo);
  const propinasNoche = db.pedidos
    .filter((p) => p.meseroId === staffId && p.estado === "entregado")
    .reduce((s, p) => s + p.propina, 0);
  const barrasRecogida = Array.from(new Map(
    db.estacionesDespacho
      .filter((estacion) => estacion.activa)
      .map((estacion) => {
        const terraza = estacion.nombre.toLowerCase().includes("terraza");
        const id = terraza ? "barra-terraza" : "barra-principal";
        const nombre = terraza ? "Barra Terraza" : "Barra Principal";
        return [id, { id, nombre }] as const;
      }),
  ).values());
  const entregasPorZona = Array.from(
    entregas.reduce((grupos, pedido) => {
      const clave = pedido.zonaId ?? "sin-zona";
      grupos.set(clave, [...(grupos.get(clave) ?? []), pedido]);
      return grupos;
    }, new Map<string, Pedido[]>()),
  ).map(([zonaId, pedidos]) => ({
    zonaId,
    nombre: db.zonas.find((zona) => zona.id === zonaId)?.nombre ?? "Sin zona asignada",
    pedidos,
  }));

  function tocarDigito(d: string) {
    if (!validando) return;
    const nuevo = (pinIngresado + d).slice(0, 4);
    setPinIngresado(nuevo);
    setPinError(false);
    if (nuevo.length === 4) {
      if (nuevo === validando.pin) {
        const p = validando;
        setValidando(null);
        setPinIngresado("");
        if (p.estadoPago === "pendiente" && !p.pagoAlFinal) {
          setCobrando(p);
        } else {
          avanzarPedido(p.id, "entregado");
        }
      } else {
        setPinError(true);
        setTimeout(() => setPinIngresado(""), 500);
      }
    }
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-md w-full mx-auto">
      <EncabezadoStaff
        titulo="Mesero — entregas"
        subtitulo={`Propinas de la noche: ${cop(propinasNoche)}`}
        extra={null}
      />

      <div className="px-4 py-3 flex gap-1.5">
        {meseros.map((m) => (
          <button
            key={m.id}
            onClick={() => setStaffId(m.id)}
            className={`text-sm px-3 py-1.5 rounded-full border transition ${
              staffId === m.id
                ? "border-neon2 text-neon2 font-semibold"
                : "border-line text-muted"
            }`}
          >
            {m.nombre}
          </button>
        ))}
      </div>

      <main className="flex-1 px-4 pb-8 space-y-3">
        {entregas.length === 0 && (
          <p className="text-muted text-center py-16 text-sm">
            Sin entregas activas. Cuando barra marque un pedido como listo,
            aparecerá aquí con su zona y color.
          </p>
        )}
        {entregasPorZona.map((grupo) => (
          <section key={grupo.zonaId} className="card p-3 space-y-3 border-neon3/35">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <p className="font-bold text-neon3">📍 {grupo.nombre}</p>
                <p className="text-xs text-muted">Lleva estos pedidos en un solo recorrido</p>
              </div>
              <span className="rounded-full bg-neon3/15 text-neon3 px-3 py-1 text-xs font-bold">
                {grupo.pedidos.length} {grupo.pedidos.length === 1 ? "pedido" : "pedidos"}
              </span>
            </div>
          {grupo.pedidos.map((p) => {
          const zona = db.zonas.find((z) => z.id === p.zonaId);
          const esZona = p.modo === "zona";
          return (
            <div key={p.id} className="rounded-xl border border-line bg-surface2 p-4 space-y-3">
              <div className="flex items-center gap-3">
                {esZona ? (
                  <MuestraLuz color={p.color} patron={p.patron} grande />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-surface2 flex items-center justify-center text-3xl">
                    🪑
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold wordmark">#{p.numero}</span>
                    <span className="font-mono text-xs text-muted">⏱ {mmss(p.timestamps.en_camino ?? p.creadoEn, ahora)}</span>
                  </div>
                  <div className="text-neon3 font-semibold">📍 {zona?.nombre}</div>
                  {esZona && (
                    <div className="text-xs text-muted">
                      Luz: {p.colorNombre} · {p.patron}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-sm space-y-0.5">
                {p.items.map((i, idx) => (
                  <div key={idx}>
                    <b>{i.cantidad}×</b> {i.nombre}
                    {i.tamano && i.tamano !== "Normal" && (
                      <span className="text-muted"> · {i.tamano}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {p.pagoAlFinal && p.estadoPago === "pendiente" ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-neon1/15 text-neon1">
                    🧾 CUENTA ABIERTA
                  </span>
                ) : p.estadoPago === "pendiente" ? (
                  <>
                    <BadgePendienteCobro />
                    <span className="font-bold text-danger">{cop(p.total)}</span>
                  </>
                ) : (
                  <span className="text-xs text-lime font-semibold">✓ Ya pagado</span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (esZona) {
                      setValidando(p);
                      setPinIngresado("");
                      setPinError(false);
                    } else if (p.estadoPago === "pendiente" && !p.pagoAlFinal) {
                      setCobrando(p);
                    } else {
                      avanzarPedido(p.id, "entregado");
                    }
                  }}
                  className="flex-1 btn-neon rounded-xl py-3 font-semibold text-white active:scale-[0.98]"
                >
                  {esZona
                    ? "Validar PIN"
                    : p.pagoAlFinal && p.estadoPago === "pendiente"
                      ? "Entregar · cuenta abierta"
                      : p.estadoPago === "pendiente" ? "Cobrar y entregar" : "Entregado"}
                </button>
                {esZona && (
                  <button
                    onClick={() => {
                      setNoLocalizado(p);
                      setBarraSeleccionada("");
                    }}
                    className="rounded-xl px-4 py-3 text-sm font-semibold border border-amber/50 text-amber active:scale-[0.98]"
                  >
                    No encontrado
                  </button>
                )}
              </div>
            </div>
          );
          })}
          </section>
        ))}
      </main>

      {validando && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="card bg-surface w-full max-w-xs p-5 space-y-4 text-center">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">PIN del cliente — #{validando.numero}</h2>
              <button
                onClick={() => setValidando(null)}
                className="text-muted text-xl px-2"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-12 h-14 card flex items-center justify-center text-2xl font-bold ${
                    pinError ? "border-danger text-danger" : ""
                  }`}
                >
                  {pinIngresado[i] ?? ""}
                </div>
              ))}
            </div>
            {pinError && <p className="text-danger text-sm font-semibold">PIN incorrecto</p>}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) =>
                d === "" ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() =>
                      d === "⌫"
                        ? setPinIngresado((s) => s.slice(0, -1))
                        : tocarDigito(d)
                    }
                    className="card py-3.5 text-xl font-semibold active:scale-95 transition"
                  >
                    {d}
                  </button>
                ),
              )}
            </div>
            <p className="text-[11px] text-muted">
              El PIN obliga contacto cara a cara: ahí se valida la edad del cliente.
            </p>
          </div>
        </div>
      )}

      {cobrando && (
        <ModalCobro
          pedido={cobrando}
          staffId={staffId}
          permitirEfectivo={cobrando.modo !== "zona" || db.config.efectivoEnZona}
          onCerrar={() => setCobrando(null)}
          onCobrado={() => avanzarPedido(cobrando.id, "entregado")}
        />
      )}

      {noLocalizado && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="card bg-surface w-full max-w-sm p-5 space-y-4">
            <div>
              <h2 className="font-bold text-lg">¿Cliente no encontrado?</h2>
              <p className="text-sm text-muted mt-1">
                Confirma dónde dejarás el pedido #{noLocalizado.numero}. El cliente verá esta ubicación para recogerlo.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted">Selecciona la barra de recogida</p>
              {barrasRecogida.map((barra) => (
                <button
                  key={barra.id}
                  type="button"
                  onClick={() => setBarraSeleccionada(barra.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    barraSeleccionada === barra.id
                      ? "border-amber bg-amber/10 text-amber font-semibold"
                      : "border-line text-muted"
                  }`}
                >
                  📍 {barra.nombre}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNoLocalizado(null)}
                className="flex-1 rounded-xl py-3 border border-line text-muted font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!barraSeleccionada}
                onClick={() => {
                  const barra = barrasRecogida.find((item) => item.id === barraSeleccionada);
                  if (!barra) return;
                  noEncontrado(noLocalizado.id, barra.id, barra.nombre);
                  setNoLocalizado(null);
                  setBarraSeleccionada("");
                }}
                className="flex-1 rounded-xl py-3 bg-amber text-black font-bold disabled:opacity-40"
              >
                Sí, dejar en barra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
