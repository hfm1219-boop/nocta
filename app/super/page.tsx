"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { afiliarLocal, cop, idLocalActivo, seleccionarLocal, useDB, useLocalesAfiliados } from "@/lib/store";
import { EncabezadoStaff } from "@/components/ui";
import Link from "next/link";

const ESTADO_RECAUDO = {
  activo: { texto: "Recaudo activo", clase: "text-lime border-lime/40" },
  en_vinculacion: { texto: "En vinculación", clase: "text-amber border-amber/40" },
  pendiente: { texto: "Sin vincular", clase: "text-muted border-line" },
};

export default function Superadmin() {
  const router = useRouter();
  const db = useDB();
  const afiliados = useLocalesAfiliados();
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");

  if (!db) return null;

  // Métricas en vivo del establecimiento seleccionado + catálogo afiliado.
  const entregados = db.pedidos.filter((p) => p.estado === "entregado");
  const ventasLocalActivo = entregados.reduce((s, p) => s + p.total, 0);
  const locales = afiliados.map((l) =>
    l.id === idLocalActivo()
      ? {
          ...l,
          pedidosNoche: entregados.length,
          ticketProm: entregados.length ? ventasLocalActivo / entregados.length : 0,
          pctDigital: entregados.length
            ? Math.round(
                (entregados.filter((p) => p.medioPago === "digital").length /
                  entregados.length) * 100,
              )
            : 0,
        }
      : l,
  );

  const totalPedidos = locales.reduce((s, l) => s + l.pedidosNoche, 0);

  return (
    <div className="min-h-dvh flex flex-col">
      <EncabezadoStaff
        titulo="Superadmin — operador"
        subtitulo="Multi-tenant: un despliegue, N locales, datos aislados"
      />
      <main className="flex-1 p-4 max-w-5xl w-full mx-auto space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi titulo="Locales activos" valor={String(locales.filter((l) => l.activo).length)} />
          <Kpi titulo="Pedidos esta noche (red)" valor={String(totalPedidos)} />
          <Kpi titulo="Locales en fase 2+" valor={String(locales.filter((l) => l.fase >= 2).length)} />
          <Kpi titulo="Vinculaciones de recaudo" valor={`${locales.filter((l) => l.estadoRecaudo === "activo").length}/${locales.length}`} />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Locales</h2>
            <div className="flex flex-wrap gap-2"><Link href="/super/integridad" className="rounded-full border border-lime/50 px-4 py-2 text-sm font-semibold text-lime">Integridad</Link><Link href="/super/usuarios" className="rounded-full border border-neon2/50 px-4 py-2 text-sm font-semibold text-neon2">Usuarios y roles</Link><button
              onClick={() => setAltaAbierta(true)}
              className="btn-neon rounded-full px-5 py-2 text-sm font-semibold text-white"
            >
              + Agregar local
            </button></div>
          </div>

          {locales.map((l) => (
            <div key={l.id} className="card p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-40">
                  <div className="font-bold">
                    {l.nombre}
                    {l.id === idLocalActivo() && (
                      <span className="text-neon3 text-xs ml-2">● SELECCIONADO</span>
                    )}
                  </div>
                  <div className="text-xs text-muted">{l.ciudad}</div>
                </div>
                <span
                  className={`text-xs px-3 py-1 rounded-full border ${ESTADO_RECAUDO[l.estadoRecaudo].clase}`}
                >
                  {ESTADO_RECAUDO[l.estadoRecaudo].texto}
                </span>
                <span className="text-xs px-3 py-1 rounded-full border border-neon1/40 text-neon1">
                  Fase {l.fase}:{" "}
                  {l.fase === 1 ? "Barra express" : l.fase === 2 ? "+ Zonas" : "+ Mesa/VIP"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Dato titulo="Pedidos/noche" valor={String(l.pedidosNoche)} />
                <Dato titulo="Ticket promedio" valor={l.ticketProm ? cop(l.ticketProm) : "—"} />
                <Dato titulo="% digital" valor={l.pedidosNoche ? `${l.pctDigital}%` : "—"} />
              </div>
              {l.estadoRecaudo === "en_vinculacion" && (
                <p className="text-[11px] text-amber">
                  Opera contra entrega mientras la entidad activa su BrandId (el
                  contra entrega es el modo de arranque durante la vinculación).
                </p>
              )}
              <button
                onClick={() => {
                  seleccionarLocal(l.id, l.nombre);
                  router.push("/admin");
                }}
                className="w-full rounded-xl border border-neon2/50 py-2.5 text-sm font-semibold text-neon2"
              >
                Configurar este local
              </button>
            </div>
          ))}

        </section>

        <section className="card p-4 text-xs text-muted leading-relaxed">
          <b className="text-foreground">Gobierno del dato (contrato):</b> cada local
          es dueño de sus datos y los ve íntegros en su panel. El operador solo usa
          información agregada y anonimizada para inteligencia de mercado. La
          información identificada de un local no se comparte con terceros sin
          autorización escrita.
        </section>
      </main>

      {altaAbierta && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="card bg-surface w-full max-w-sm p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Agregar local</h2>
              <button onClick={() => setAltaAbierta(false)} className="text-muted text-xl px-2">✕</button>
            </div>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del local"
              className="card w-full px-4 py-3 bg-transparent outline-none text-sm"
            />
            <input
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              placeholder="Ciudad"
              className="card w-full px-4 py-3 bg-transparent outline-none text-sm"
            />
            <button
              onClick={() => {
                if (!nombre.trim()) return;
                afiliarLocal(nombre, ciudad);
                setNombre("");
                setCiudad("");
                setAltaAbierta(false);
                router.push("/admin");
              }}
              className="btn-neon rounded-full w-full py-3 font-semibold text-white"
            >
              Crear local
            </button>
            <p className="text-[10px] text-muted">
              Demo: el alta real incluye NIT, credenciales de recaudo (BrandId) y
              configuración de modos y medios de pago.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-surface2 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted">{titulo}</p>
      <p className="font-bold">{valor}</p>
    </div>
  );
}
