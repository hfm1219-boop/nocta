"use client";

import { useState } from "react";
import {
  cop, editarPrecio, guardarDB, toggleDisponible, useDB,
} from "@/lib/store";
import { EncabezadoStaff } from "@/components/ui";
import type { DB, MedioPago, Pedido } from "@/lib/types";

// Paleta categórica validada (dataviz, modo oscuro sobre #100e1c)
const COLOR_MEDIO: Record<MedioPago, string> = {
  digital: "#b644ff",
  datafono: "#0891b2",
  efectivo: "#65a30d",
};
const NOMBRE_MEDIO: Record<MedioPago, string> = {
  digital: "Recaudo digital",
  datafono: "Datáfono",
  efectivo: "Efectivo",
};

const TABS = [
  { id: "reportes", nombre: "Reportes" },
  { id: "menu", nombre: "Menú" },
  { id: "zonas", nombre: "Zonas y QRs" },
  { id: "pagos", nombre: "Medios de pago" },
  { id: "personal", nombre: "Personal" },
  { id: "cierre", nombre: "Cierre de noche" },
];

export default function Admin() {
  const db = useDB();
  const [tab, setTab] = useState("reportes");
  if (!db) return null;

  return (
    <div className="min-h-dvh flex flex-col">
      <EncabezadoStaff titulo="Administración" subtitulo="Eclipse Rooftop" />
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm border transition ${
              tab === t.id
                ? "border-neon2 text-neon2 font-semibold bg-neon2/10"
                : "border-line text-muted"
            }`}
          >
            {t.nombre}
          </button>
        ))}
      </div>
      <main className="flex-1 p-4 max-w-5xl w-full mx-auto">
        {tab === "reportes" && <Reportes db={db} />}
        {tab === "menu" && <MenuAdmin db={db} />}
        {tab === "zonas" && <Zonas db={db} />}
        {tab === "pagos" && <Pagos db={db} />}
        {tab === "personal" && <Personal db={db} />}
        {tab === "cierre" && <Cierre db={db} />}
      </main>
    </div>
  );
}

// ---------------- Reportes ----------------

function entregados(db: DB): Pedido[] {
  return db.pedidos.filter((p) => p.estado === "entregado");
}

function Reportes({ db }: { db: DB }) {
  const pedidos = entregados(db);
  const ventas = pedidos.reduce((s, p) => s + p.total, 0);
  const ticket = pedidos.length ? ventas / pedidos.length : 0;
  const digitales = pedidos.filter((p) => p.medioPago === "digital");
  const pctDigital = pedidos.length
    ? Math.round((digitales.length / pedidos.length) * 100)
    : 0;

  // Tiempos promedio (min)
  const tPagoListo = promedio(
    pedidos
      .filter((p) => p.timestamps.listo && p.timestamps.nuevo)
      .map((p) => (p.timestamps.listo! - p.timestamps.nuevo!) / 60000),
  );
  const tListoEntrega = promedio(
    pedidos
      .filter((p) => p.timestamps.entregado && p.timestamps.listo)
      .map((p) => (p.timestamps.entregado! - p.timestamps.listo!) / 60000),
  );

  // Ventas por hora
  const porHora = new Map<number, number>();
  pedidos.forEach((p) => {
    const h = new Date(p.creadoEn).getHours();
    porHora.set(h, (porHora.get(h) ?? 0) + p.total);
  });
  const horas = [...porHora.entries()].sort((a, b) => a[0] - b[0]);
  const maxHora = Math.max(...horas.map(([, v]) => v), 1);

  // Mezcla de medios
  const porMedio = (["digital", "datafono", "efectivo"] as MedioPago[]).map((m) => ({
    medio: m,
    total: pedidos.filter((p) => p.medioPago === m).reduce((s, p) => s + p.total, 0),
    n: pedidos.filter((p) => p.medioPago === m).length,
  }));
  const maxMedio = Math.max(...porMedio.map((x) => x.total), 1);

  // Top productos
  const porProducto = new Map<string, number>();
  pedidos.forEach((p) =>
    p.items.forEach((i) =>
      porProducto.set(i.nombre, (porProducto.get(i.nombre) ?? 0) + i.cantidad),
    ),
  );
  const top = [...porProducto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxProd = Math.max(...top.map(([, v]) => v), 1);

  // Ventas por zona
  const porZona = new Map<string, number>();
  pedidos.forEach((p) => {
    const nombre = p.zonaId
      ? db.zonas.find((z) => z.id === p.zonaId)?.nombre ?? "—"
      : "Barra express";
    porZona.set(nombre, (porZona.get(nombre) ?? 0) + p.total);
  });
  const zonas = [...porZona.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxZona = Math.max(...zonas.map(([, v]) => v), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi titulo="Ventas de la noche" valor={cop(ventas)} />
        <Kpi titulo="Pedidos entregados" valor={String(pedidos.length)} />
        <Kpi titulo="Ticket promedio" valor={cop(ticket)} />
        <Kpi titulo="% pago digital" valor={`${pctDigital}%`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi titulo="Pago → listo (prom.)" valor={`${tPagoListo.toFixed(1)} min`} sub="Meta: < 8 min" />
        <Kpi titulo="Listo → entregado (prom.)" valor={`${tListoEntrega.toFixed(1)} min`} sub="Meta: < 3 min" />
      </div>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Ventas por hora</h2>
        <div className="flex items-end gap-2 h-40">
          {horas.map(([h, v]) => (
            <div
              key={h}
              className="flex-1 flex flex-col items-center gap-1 group"
              title={`${h}:00 — ${cop(v)}`}
            >
              {v === maxHora && (
                <span className="text-[10px] text-muted">{cop(v)}</span>
              )}
              <div
                className="w-full rounded-t-[4px] transition group-hover:opacity-80"
                style={{
                  height: `${Math.max(6, (v / maxHora) * 130)}px`,
                  background: "#b644ff",
                }}
              />
              <span className="text-[10px] text-muted">{h}h</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h2 className="font-semibold mb-1">Mezcla de medios de pago</h2>
          <p className="text-xs text-muted mb-3">
            Define si el modelo de recaudo es viable (métrica clave del piloto).
          </p>
          <div className="space-y-2.5">
            {porMedio.map((x) => (
              <div key={x.medio} title={`${NOMBRE_MEDIO[x.medio]}: ${cop(x.total)} · ${x.n} pedidos`}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ background: COLOR_MEDIO[x.medio] }}
                    />
                    {NOMBRE_MEDIO[x.medio]}
                  </span>
                  <span className="text-muted">
                    {cop(x.total)} · {x.n} ped.
                  </span>
                </div>
                <div className="h-3 bg-surface2 rounded-[4px] overflow-hidden">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{
                      width: `${(x.total / maxMedio) * 100}%`,
                      background: COLOR_MEDIO[x.medio],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Top productos (unidades)</h2>
          <div className="space-y-2.5">
            {top.map(([nombre, v]) => (
              <div key={nombre} title={`${nombre}: ${v} unidades`}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="truncate">{nombre}</span>
                  <span className="text-muted">{v}</span>
                </div>
                <div className="h-3 bg-surface2 rounded-[4px] overflow-hidden">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{ width: `${(v / maxProd) * 100}%`, background: "#b644ff" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Ventas por zona</h2>
        <div className="space-y-2.5">
          {zonas.map(([nombre, v]) => (
            <div key={nombre} title={`${nombre}: ${cop(v)}`}>
              <div className="flex justify-between text-xs mb-1">
                <span>{nombre}</span>
                <span className="text-muted">{cop(v)}</span>
              </div>
              <div className="h-3 bg-surface2 rounded-[4px] overflow-hidden">
                <div
                  className="h-full rounded-r-[4px]"
                  style={{ width: `${(v / maxZona) * 100}%`, background: "#b644ff" }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function promedio(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------- Menú ----------------

function MenuAdmin({ db }: { db: DB }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Cambios en vivo: el precio se congela en cada pedido (snapshot) y el
        carrito del cliente respeta su precio por 10 minutos.
      </p>
      {db.productos.map((p) => (
        <div key={p.id} className="card px-4 py-3 flex items-center gap-3">
          <span className="text-xl">{p.icono}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{p.nombre}</div>
            <div className="text-xs text-muted">{p.descripcion}</div>
          </div>
          {editando === p.id ? (
            <div className="flex items-center gap-2">
              <input
                value={precio}
                onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoFocus
                className="card w-28 px-3 py-1.5 bg-transparent outline-none text-sm"
              />
              <button
                onClick={() => {
                  editarPrecio(p.id, Number(precio));
                  setEditando(null);
                }}
                className="text-lime text-sm font-semibold"
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditando(p.id);
                setPrecio(String(p.precio));
              }}
              className="text-neon2 font-bold text-sm"
            >
              {cop(p.precio)} ✎
            </button>
          )}
          <button
            onClick={() => toggleDisponible(p.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              p.disponible
                ? "border-lime/40 text-lime"
                : "border-danger/50 text-danger"
            }`}
          >
            {p.disponible ? "Disponible" : "AGOTADO"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Zonas ----------------

function QRFalso({ id }: { id: string }) {
  // QR ilustrativo (la generación real es parte del build de producción)
  const celdas = [];
  let seed = 0;
  for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) % 9973;
  for (let i = 0; i < 64; i++) {
    seed = (seed * 75 + 74) % 65537;
    celdas.push(seed % 2 === 0);
  }
  return (
    <svg viewBox="0 0 8 8" className="w-12 h-12 rounded bg-white p-0.5">
      {celdas.map((on, i) =>
        on ? (
          <rect key={i} x={i % 8} y={Math.floor(i / 8)} width="1" height="1" fill="#000" />
        ) : null,
      )}
    </svg>
  );
}

function Zonas({ db }: { db: DB }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Las zonas de no-entrega (ej. pista de baile) existen pero no se ofrecen en
        el checkout. Cada mesa/VIP tiene QR fijo propio.
      </p>
      {db.zonas.map((z) => (
        <div key={z.id} className="card px-4 py-3 flex items-center gap-4">
          <QRFalso id={z.id} />
          <div className="flex-1">
            <div className="font-semibold text-sm">
              {z.nombre}
              <span className="text-muted font-normal text-xs ml-2 uppercase">{z.tipo}</span>
            </div>
            {z.consumoMinimo && (
              <div className="text-xs text-amber">
                Consumo mínimo: {cop(z.consumoMinimo)}
              </div>
            )}
          </div>
          <button className="text-xs text-neon3 border border-line rounded-full px-3 py-1.5">
            🖨 Imprimir QR
          </button>
          <button
            onClick={() =>
              guardarDB((d) => {
                const x = d.zonas.find((y) => y.id === z.id);
                if (x) x.entregable = !x.entregable;
              })
            }
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              z.entregable ? "border-lime/40 text-lime" : "border-danger/50 text-danger"
            }`}
          >
            {z.entregable ? "Entregable" : "No entrega"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Pagos ----------------

function Interruptor({
  activo, onCambiar,
}: {
  activo: boolean;
  onCambiar: () => void;
}) {
  return (
    <button
      onClick={onCambiar}
      className={`w-12 h-7 rounded-full transition relative ${
        activo ? "bg-neon1" : "bg-surface2 border border-line"
      }`}
    >
      <span
        className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
          activo ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function Pagos({ db }: { db: DB }) {
  const c = db.config;
  const filas: { clave: MedioPago; nombre: string; nota: string }[] = [
    { clave: "digital", nombre: "Pago anticipado digital", nota: "Recaudo propio del local con webhook en tiempo real" },
    { clave: "efectivo", nombre: "Efectivo contra entrega", nota: "Riesgo del local: vueltas, no retirados, descuadre" },
    { clave: "datafono", nombre: "Datáfono contra entrega", nota: "Requiere nro. de aprobación para el cuadre" },
  ];
  return (
    <div className="space-y-4 max-w-2xl">
      <div
        className={`card p-4 flex items-center justify-between ${!c.recaudoActivo ? "border-amber/50" : ""}`}
      >
        <div>
          <p className="font-semibold">Recaudo digital operativo</p>
          <p className="text-xs text-muted mt-0.5">
            Kill switch: si la entidad falla, conmuta a contra entrega en un toque
            sin detener la operación.
          </p>
        </div>
        <Interruptor
          activo={c.recaudoActivo}
          onCambiar={() => guardarDB((d) => { d.config.recaudoActivo = !d.config.recaudoActivo; })}
        />
      </div>

      {filas.map((f) => (
        <div key={f.clave} className="card p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold">{f.nombre}</p>
            <p className="text-xs text-muted mt-0.5">{f.nota}</p>
          </div>
          <Interruptor
            activo={c.mediosHabilitados[f.clave]}
            onCambiar={() =>
              guardarDB((d) => {
                d.config.mediosHabilitados[f.clave] = !d.config.mediosHabilitados[f.clave];
              })
            }
          />
        </div>
      ))}

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">Efectivo en entrega por zonas (modo B)</p>
          <p className="text-xs text-muted mt-0.5">
            Desaconsejado: el mesero carga dinero entre la multitud. Actívalo solo
            de forma consciente y con tope bajo.
          </p>
        </div>
        <Interruptor
          activo={c.efectivoEnZona}
          onCambiar={() => guardarDB((d) => { d.config.efectivoEnZona = !d.config.efectivoEnZona; })}
        />
      </div>

      <div className="card p-4">
        <p className="font-semibold">Tope de pago contra entrega</p>
        <p className="text-xs text-muted mt-0.5 mb-2">
          Por encima de este valor, el checkout exige pago anticipado.
        </p>
        <input
          value={c.topeContraEntrega}
          onChange={(e) =>
            guardarDB((d) => {
              d.config.topeContraEntrega = Number(e.target.value.replace(/\D/g, "")) || 0;
            })
          }
          inputMode="numeric"
          className="card w-40 px-3 py-2 bg-transparent outline-none"
        />
        <span className="ml-2 text-muted text-sm">COP</span>
      </div>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">Ventana de pedidos abierta</p>
          <p className="text-xs text-muted mt-0.5">
            Fuera del horario de servicio el menú queda en solo lectura.
          </p>
        </div>
        <Interruptor
          activo={c.ventanaAbierta}
          onCambiar={() => guardarDB((d) => { d.config.ventanaAbierta = !d.config.ventanaAbierta; })}
        />
      </div>
    </div>
  );
}

// ---------------- Personal ----------------

function Personal({ db }: { db: DB }) {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<"mesero" | "barra">("mesero");

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="card p-4 flex gap-2 items-center flex-wrap">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del nuevo staff"
          className="card flex-1 min-w-40 px-3 py-2 bg-transparent outline-none text-sm"
        />
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value as "mesero" | "barra")}
          className="card px-3 py-2 bg-surface text-sm outline-none"
        >
          <option value="mesero">Mesero</option>
          <option value="barra">Barra</option>
        </select>
        <button
          onClick={() => {
            if (!nombre.trim()) return;
            guardarDB((d) => {
              d.staff.push({
                id: `st-${Date.now()}`,
                nombre: nombre.trim(),
                rol,
                pin: String(1000 + Math.floor(Math.random() * 9000)),
                activo: true,
              });
            });
            setNombre("");
          }}
          className="btn-neon rounded-full px-5 py-2 text-sm font-semibold text-white"
        >
          + Agregar
        </button>
      </div>
      {db.staff.map((s) => (
        <div key={s.id} className="card px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <span className="font-semibold text-sm">{s.nombre}</span>
            <span className="text-xs text-muted ml-2 uppercase">{s.rol}</span>
          </div>
          <span className="font-mono text-xs text-muted">PIN {s.pin}</span>
          {s.rol !== "admin" && (
            <button
              onClick={() =>
                guardarDB((d) => {
                  const x = d.staff.find((y) => y.id === s.id);
                  if (x) x.activo = !x.activo;
                })
              }
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                s.activo ? "border-lime/40 text-lime" : "border-line text-muted"
              }`}
            >
              {s.activo ? "Activo" : "Inactivo"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- Cierre de noche ----------------

function Cierre({ db }: { db: DB }) {
  const pedidos = db.pedidos.filter((p) => p.cobro && p.estado === "entregado");

  // Fuente 1: recaudo digital — sistema vs reporte API de la entidad
  const digital = pedidos.filter((p) => p.cobro!.medio === "digital");
  const totalDigital = digital.reduce((s, p) => s + p.cobro!.monto, 0);

  // Fuente 2: datáfono — marcas del sistema vs lote del datáfono.
  // La demo simula un comprobante que no aparece en el lote.
  const datafono = pedidos.filter((p) => p.cobro!.medio === "datafono");
  const totalDatafono = datafono.reduce((s, p) => s + p.cobro!.monto, 0);
  const faltanteLote = datafono[datafono.length - 1];
  const totalLote = totalDatafono - (faltanteLote?.cobro!.monto ?? 0);

  // Fuente 3: efectivo — esperado por cobrador vs declarado
  const efectivo = pedidos.filter((p) => p.cobro!.medio === "efectivo");
  const porCobrador = new Map<string, number>();
  efectivo.forEach((p) => {
    const id = p.cobro!.cobradoPor ?? "sin-registro";
    porCobrador.set(id, (porCobrador.get(id) ?? 0) + p.cobro!.monto);
  });

  const propinas = pedidos.reduce((s, p) => s + p.propina, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-muted">
        El cuadre concilia automáticamente las tres fuentes de dinero. Las
        diferencias quedan visibles y atribuidas a una persona, nunca ocultas.
      </p>

      <section className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">⚡ Recaudo digital</h2>
          <span className="text-lime text-sm font-semibold">✓ Cuadrado</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Dato titulo="Sistema" valor={cop(totalDigital)} />
          <Dato titulo="Reporte API entidad" valor={cop(totalDigital)} />
          <Dato titulo="Diferencia" valor={cop(0)} ok />
        </div>
        <p className="text-[11px] text-muted">
          {digital.length} transacciones verificadas contra la API (no contra el
          portal web: los portales tienen ventanas de indisponibilidad).
        </p>
      </section>

      <section className={`card p-4 space-y-2 ${faltanteLote ? "border-danger/50" : ""}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">💳 Datáfono</h2>
          {faltanteLote ? (
            <span className="text-danger text-sm font-semibold">⚠ Diferencia</span>
          ) : (
            <span className="text-lime text-sm font-semibold">✓ Cuadrado</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Dato titulo="Marcado en sistema" valor={cop(totalDatafono)} />
          <Dato titulo="Lote del datáfono" valor={cop(totalLote)} />
          <Dato
            titulo="Diferencia"
            valor={cop(totalDatafono - totalLote)}
            ok={!faltanteLote}
          />
        </div>
        {faltanteLote && (
          <p className="text-xs text-danger">
            Pedido #{faltanteLote.numero} marcado como cobrado con aprobación{" "}
            {faltanteLote.cobro!.referencia} por{" "}
            <b>
              {db.staff.find((s) => s.id === faltanteLote.cobro!.cobradoPor)?.nombre ??
                "desconocido"}
            </b>{" "}
            no aparece en el lote. Verificar comprobante físico.
          </p>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">💵 Efectivo por cobrador</h2>
        {[...porCobrador.entries()].map(([staffId, esperado]) => {
          const nombre = db.staff.find((s) => s.id === staffId)?.nombre ?? staffId;
          const declarado = db.efectivoDeclarado[staffId];
          const dif = declarado !== undefined ? declarado - esperado : undefined;
          return (
            <div key={staffId} className="flex items-center gap-3 text-sm flex-wrap">
              <span className="w-36 truncate font-medium">{nombre}</span>
              <span className="text-muted">Esperado: {cop(esperado)}</span>
              <input
                placeholder="Declara entrega"
                value={declarado ?? ""}
                onChange={(e) =>
                  guardarDB((d) => {
                    const v = e.target.value.replace(/\D/g, "");
                    if (v === "") delete d.efectivoDeclarado[staffId];
                    else d.efectivoDeclarado[staffId] = Number(v);
                  })
                }
                inputMode="numeric"
                className="card w-36 px-3 py-1.5 bg-transparent outline-none text-sm"
              />
              {dif !== undefined && (
                <span
                  className={`font-semibold ${
                    dif === 0 ? "text-lime" : "text-danger"
                  }`}
                >
                  {dif === 0 ? "✓ Cuadra" : `${dif > 0 ? "+" : ""}${cop(dif)}`}
                </span>
              )}
            </div>
          );
        })}
        {porCobrador.size === 0 && (
          <p className="text-muted text-sm">Sin cobros en efectivo esta noche.</p>
        )}
      </section>

      <section className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Dato titulo="Total noche" valor={cop(totalDigital + totalDatafono + efectivo.reduce((s, p) => s + p.cobro!.monto, 0))} />
        <Dato titulo="Propinas digitales" valor={cop(propinas)} />
        <Dato
          titulo="Anulados / vencidos"
          valor={String(db.pedidos.filter((p) => ["anulado", "vencido"].includes(p.estado)).length)}
        />
        <Dato titulo="Estado" valor={db.nocheCerrada ? "CERRADA" : "Abierta"} />
      </section>

      {!db.nocheCerrada ? (
        <button
          onClick={() => guardarDB((d) => { d.nocheCerrada = true; })}
          className="btn-neon rounded-full px-8 py-3.5 font-semibold text-white w-full sm:w-auto"
        >
          Cerrar la noche
        </button>
      ) : (
        <p className="text-lime font-semibold text-sm">
          ✓ Noche cerrada. El cierre queda como evidencia ante disputas y descuadres.
        </p>
      )}
    </div>
  );
}

function Dato({ titulo, valor, ok }: { titulo: string; valor: string; ok?: boolean }) {
  return (
    <div className="bg-surface2 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted">{titulo}</p>
      <p className={`font-bold ${ok ? "text-lime" : ""}`}>{valor}</p>
    </div>
  );
}
