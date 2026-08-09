"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useCarrito, cambiarCantidad, totalCarrito, vaciarCarrito } from "@/lib/cart";
import { useDB, cop, crearPedido } from "@/lib/store";
import { BotonPrimario, ETIQUETA_MEDIO, ETIQUETA_MODO } from "@/components/ui";
import type { MedioPago, ModoServicio } from "@/lib/types";

const PROPINAS = [0, 5, 10];

export default function Checkout() {
  const router = useRouter();
  const items = useCarrito();
  const db = useDB();
  const [modo, setModo] = useState<ModoServicio>("barra");
  const [zonaId, setZonaId] = useState<string>("");
  const [propinaPct, setPropinaPct] = useState(0);
  const [medio, setMedio] = useState<MedioPago>("digital");
  const [telefono, setTelefono] = useState("");
  const [pagando, setPagando] = useState(false);
  const enviado = useRef(false); // idempotencia: doble toque en pagar = un solo pedido

  const subtotal = totalCarrito(items);
  const propina = Math.round((subtotal * propinaPct) / 100 / 500) * 500;
  const total = subtotal + propina;

  const config = db?.config;

  const mediosDisponibles = useMemo(() => {
    if (!config) return [] as MedioPago[];
    const lista: MedioPago[] = [];
    if (config.mediosHabilitados.digital && config.recaudoActivo) lista.push("digital");
    const superaTope = total > config.topeContraEntrega;
    if (!superaTope) {
      if (config.mediosHabilitados.efectivo && (modo !== "zona" || config.efectivoEnZona)) {
        lista.push("efectivo");
      }
      if (config.mediosHabilitados.datafono) lista.push("datafono");
    }
    return lista;
  }, [config, modo, total]);

  const medioValido = mediosDisponibles.includes(medio)
    ? medio
    : mediosDisponibles[0];

  if (!db || !config) return null;

  const zonas = db.zonas.filter((z) =>
    modo === "zona" ? z.tipo === "zona" && z.entregable : modo === "mesa" ? z.tipo !== "zona" : false,
  );
  const necesitaZona = modo !== "barra";
  const superaTope = total > config.topeContraEntrega;

  // Consumo mínimo VIP: acumulado de la mesa esta noche + este pedido
  const zonaSel = db.zonas.find((z) => z.id === zonaId);
  const acumuladoMesa = zonaSel?.consumoMinimo
    ? db.pedidos
        .filter(
          (p) => p.zonaId === zonaId && !["anulado", "vencido"].includes(p.estado),
        )
        .reduce((s, p) => s + p.total, 0)
    : 0;

  async function confirmar() {
    if (!medioValido || items.length === 0) return;
    if (necesitaZona && !zonaId) return;
    if (enviado.current) return;
    enviado.current = true;
    setPagando(true);
    // Simula la confirmación del recaudo digital vía webhook (spec §8.1)
    await new Promise((r) => setTimeout(r, medioValido === "digital" ? 1600 : 400));
    const pedido = crearPedido({
      items,
      modo,
      zonaId: necesitaZona ? zonaId : undefined,
      medioPago: medioValido,
      propina,
      telefono: telefono || undefined,
    });
    vaciarCarrito();
    router.push(`/m/pedido/${pedido.id}`);
  }

  if (items.length === 0 && !pagando) {
    return (
      <main className="px-5 pt-16 text-center space-y-3">
        <div className="text-5xl">🛒</div>
        <p className="text-muted">Tu carrito está vacío.</p>
      </main>
    );
  }

  if (pagando) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-14 h-14 rounded-full border-4 border-neon1 border-t-transparent animate-spin" />
        <p className="font-semibold text-lg">
          {medioValido === "digital" ? "Confirmando tu pago…" : "Enviando tu pedido…"}
        </p>
        <p className="text-muted text-sm">
          {medioValido === "digital"
            ? "Esperando confirmación de la entidad de recaudo (webhook en tiempo real)."
            : "Tu pedido entrará a la cola de barra como pendiente de pago."}
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 pt-5 space-y-6 pb-10">
      <h1 className="text-2xl font-bold">Tu pedido</h1>

      <section className="space-y-2">
        {items.map((i, idx) => (
          <div key={idx} className="card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">
                {i.nombre}
                {i.tamano && i.tamano !== "Normal" && (
                  <span className="text-muted"> · {i.tamano}</span>
                )}
              </div>
              {!!i.extras?.length && (
                <div className="text-xs text-muted truncate">{i.extras.join(", ")}</div>
              )}
              <div className="text-neon2 font-bold text-sm">{cop(i.precioUnit)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => cambiarCantidad(idx, -1)}
                className="w-8 h-8 rounded-full border border-line text-muted font-bold"
              >
                −
              </button>
              <span className="w-5 text-center font-semibold">{i.cantidad}</span>
              <button
                onClick={() => cambiarCantidad(idx, 1)}
                className="w-8 h-8 rounded-full border border-neon2 text-neon2 font-bold"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-semibold mb-2">¿Cómo recibes tu pedido?</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["barra", "zona", "mesa"] as ModoServicio[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setModo(m);
                setZonaId("");
              }}
              className={`card py-3 px-1 text-xs transition ${
                modo === m ? "chip-active font-semibold" : "text-muted"
              }`}
            >
              <div className="text-lg mb-1">{m === "barra" ? "🍹" : m === "zona" ? "📍" : "🪑"}</div>
              {ETIQUETA_MODO[m]}
            </button>
          ))}
        </div>
        {modo === "barra" && (
          <p className="text-xs text-muted mt-2">
            Te avisamos cuando esté listo y lo recoges en la barra express, sin fila.
          </p>
        )}
        {modo === "zona" && (
          <p className="text-xs text-muted mt-2">
            Un mesero te lo lleva. Mantén tu pantalla-luz visible para que te encuentre.
          </p>
        )}
      </section>

      {necesitaZona && (
        <section>
          <h2 className="font-semibold mb-2">{modo === "zona" ? "Tu zona" : "Tu mesa"}</h2>
          <div className="grid grid-cols-2 gap-2">
            {zonas.map((z) => (
              <button
                key={z.id}
                onClick={() => setZonaId(z.id)}
                className={`card py-3 px-2 text-sm transition ${
                  zonaId === z.id ? "chip-active font-semibold" : "text-muted"
                }`}
              >
                {z.nombre}
                {z.consumoMinimo && (
                  <div className="text-[10px]">Consumo mín. {cop(z.consumoMinimo)}</div>
                )}
              </button>
            ))}
          </div>
          {zonaSel?.consumoMinimo && (
            <div className="card p-3 mt-2 text-xs border-amber/40">
              <div className="flex justify-between text-muted">
                <span>Consumo mínimo {zonaSel.nombre}</span>
                <span>{cop(zonaSel.consumoMinimo)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Acumulado con este pedido</span>
                <span
                  className={
                    acumuladoMesa + total >= zonaSel.consumoMinimo
                      ? "text-lime font-semibold"
                      : "text-amber font-semibold"
                  }
                >
                  {cop(acumuladoMesa + total)}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-2">Propina</h2>
        <div className="grid grid-cols-3 gap-2">
          {PROPINAS.map((p) => (
            <button
              key={p}
              onClick={() => setPropinaPct(p)}
              className={`card py-2.5 text-sm transition ${
                propinaPct === p ? "chip-active font-semibold" : "text-muted"
              }`}
            >
              {p === 0 ? "Sin propina" : `${p}%`}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Medio de pago</h2>
        {superaTope && (
          <p className="text-xs text-amber mb-2">
            Por el valor del pedido (más de {cop(config.topeContraEntrega)}), este local
            exige pago anticipado.
          </p>
        )}
        {!config.recaudoActivo && (
          <p className="text-xs text-amber mb-2">
            El pago digital no está disponible en este momento. Paga al recibir.
          </p>
        )}
        {mediosDisponibles.length === 0 && (
          <div className="card p-3 border-danger/50 text-sm text-danger">
            Ningún medio de pago disponible para este pedido en este momento.
            Reduce el valor del pedido o acércate a la barra: el personal puede
            ayudarte.
          </div>
        )}
        <div className="space-y-2">
          {mediosDisponibles.map((m) => (
            <button
              key={m}
              onClick={() => setMedio(m)}
              className={`card w-full px-4 py-3 flex items-center justify-between transition ${
                medioValido === m ? "chip-active" : ""
              }`}
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <span className="text-lg">
                  {m === "digital" ? "⚡" : m === "efectivo" ? "💵" : "💳"}
                </span>
                {ETIQUETA_MEDIO[m]}
              </span>
              {m === "digital" && (
                <span className="text-[10px] text-neon3 font-semibold">INSTANTÁNEO</span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-1">Avisos por WhatsApp (opcional)</h2>
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Tu celular — solo para avisarte"
          inputMode="tel"
          className="card w-full px-4 py-3 bg-transparent outline-none text-sm placeholder:text-muted"
        />
      </section>

      <section className="card p-4 space-y-1 text-sm">
        <div className="flex justify-between text-muted">
          <span>Subtotal</span>
          <span>{cop(subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Propina</span>
          <span>{cop(propina)}</span>
        </div>
        <div className="flex justify-between font-bold text-base pt-1 border-t border-line">
          <span>Total</span>
          <span className="text-neon2">{cop(total)}</span>
        </div>
      </section>

      <p className="text-[11px] text-muted leading-relaxed">
        ⚠️ Venta de alcohol prohibida a menores de 18 años; valida tu edad en la
        entrega. Pedidos pagados no retirados vencen a los {config.minutosVencimiento}{" "}
        minutos según la política del local (visible aquí en el checkout).
      </p>

      <BotonPrimario
        onClick={confirmar}
        disabled={items.length === 0 || (necesitaZona && !zonaId) || !medioValido}
        className="w-full text-lg"
      >
        {medioValido === "digital" ? `Pagar ${cop(total)}` : `Pedir · pagar al recibir ${cop(total)}`}
      </BotonPrimario>
    </main>
  );
}
