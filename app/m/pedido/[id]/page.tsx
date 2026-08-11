"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cambiarZonaPedidoCliente, useDB, cop } from "@/lib/store";
import { ETIQUETA_MODO } from "@/components/ui";
import { reemplazarCarrito } from "@/lib/cart";

const PASOS = ["Recibido", "Preparando", "Listo", "Entregado"] as const;

function pasoActual(estado: string): number {
  switch (estado) {
    case "nuevo": return 0;
    case "preparando": return 1;
    case "listo":
    case "en_camino": return 2;
    case "entregado": return 3;
    default: return -1;
  }
}

export default function EstadoPedido() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB();
  const [luzAbierta, setLuzAbierta] = useState(false);
  const [cambiandoZona, setCambiandoZona] = useState(false);
  const [zonaConfirmada, setZonaConfirmada] = useState(false);

  if (!db) return null;
  const p = db.pedidos.find((x) => x.id === id);
  if (!p) return <p className="p-8 text-muted">Pedido no encontrado.</p>;

  const paso = pasoActual(p.estado);
  const terminal = ["vencido", "anulado"].includes(p.estado);
  const puedeCambiarZona = p.modo === "zona" && !["entregado", "vencido", "anulado"].includes(p.estado);
  const zonaActual = db.zonas.find((zona) => zona.id === p.zonaId);
  const zonasDisponibles = db.zonas.filter(
    (zona) => zona.tipo === "zona" && zona.entregable,
  );

  if (luzAbierta && p.estado === "en_camino" && p.color) {
    return (
      <button
        onClick={() => setLuzAbierta(false)}
        className={`fixed inset-0 z-50 pat-${p.patron ?? "solido"} flex flex-col items-center justify-center gap-6`}
        style={{ background: p.color }}
      >
        <span className="rounded-full bg-black/70 text-white px-6 py-3 text-4xl font-black">
          {String(p.senalNumero ?? 1).padStart(2, "0")}
        </span>
        <p className="text-black/70 font-bold text-xl">Mantén esta pantalla visible</p>
        <p className="text-black/60 text-sm">Toca para volver</p>
      </button>
    );
  }

  return (
    <main className="px-4 pt-6 pb-10 space-y-6 max-w-md mx-auto">
      <header className="text-center space-y-1">
        {p.tipo === "preorden" && (
          <span className="inline-block rounded-full px-3 py-1 text-xs font-bold bg-neon3/15 text-neon3 border border-neon3/30">
            🗓️ PREORDEN
          </span>
        )}
        <p className="text-muted text-sm">{ETIQUETA_MODO[p.modo]}</p>
        <h1 className="text-6xl font-bold wordmark">#{p.numero}</h1>
        <p className="text-muted text-sm">
          Guarda este link: aquí consultas tu pedido aunque pierdas conexión.
        </p>
      </header>

      {p.tipo === "preorden" && p.programadoPara && (
        <section className="card p-4 border-neon3/40 text-center">
          <p className="text-xs text-muted">Programado para recoger</p>
          <p className="text-lg font-bold text-neon3 mt-1">
            {new Date(p.programadoPara).toLocaleString("es-CO", {
              weekday: "long", day: "numeric", month: "long",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
          <p className="text-xs text-muted mt-1">Te avisaremos cuando esté listo en barra express.</p>
        </section>
      )}

      {puedeCambiarZona && (
        <section className="card p-4 border-neon3/35 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Zona de entrega actual</p>
              <p className="font-bold text-neon3">📍 {zonaActual?.nombre ?? "Sin zona"}</p>
            </div>
            <button
              onClick={() => {
                setCambiandoZona((abierto) => !abierto);
                setZonaConfirmada(false);
              }}
              className="rounded-full px-4 py-2 text-sm font-semibold border border-neon3/50 text-neon3"
            >
              Cambiar zona
            </button>
          </div>
          {p.estado === "en_camino" && (
            <p className="text-xs text-amber">
              Tu pedido ya va en camino. El mesero recibirá la nueva ubicación inmediatamente.
            </p>
          )}
          {cambiandoZona && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {zonasDisponibles.map((zona) => (
                <button
                  key={zona.id}
                  onClick={() => {
                    if (cambiarZonaPedidoCliente(p.id, zona.id)) {
                      setCambiandoZona(false);
                      setZonaConfirmada(true);
                    }
                  }}
                  disabled={zona.id === p.zonaId}
                  className={`rounded-xl px-3 py-3 text-sm border transition ${
                    zona.id === p.zonaId
                      ? "border-neon3 bg-neon3/10 text-neon3 font-semibold"
                      : "border-line text-muted hover:text-foreground"
                  }`}
                >
                  {zona.nombre}
                </button>
              ))}
            </div>
          )}
          {zonaConfirmada && (
            <p className="text-xs text-lime font-semibold">✓ Zona actualizada para el personal.</p>
          )}
        </section>
      )}

      {terminal ? (
        <div className="card p-5 border-danger/50 text-center space-y-2">
          <p className="text-danger font-bold text-lg">
            {p.estado === "vencido" ? "Pedido vencido" : "Pedido anulado"}
          </p>
          <p className="text-muted text-sm">
            {p.estado === "vencido"
              ? `No fue retirado en ${db.config.minutosVencimiento} minutos. Aplica la política de reembolso del local.`
              : p.notas ?? "Contacta al personal del local."}
          </p>
        </div>
      ) : (
        <section className="card p-5">
          <div className="flex justify-between">
            {PASOS.map((etiqueta, i) => {
              const done = i <= paso;
              const esActual = i === paso;
              const label =
                i === 2 && p.modo === "zona"
                  ? p.estado === "en_camino" ? "En camino" : "Listo"
                  : etiqueta;
              return (
                <div key={etiqueta} className="flex-1 flex flex-col items-center gap-1.5 relative">
                  {i > 0 && (
                    <div
                      className={`absolute top-3.5 right-1/2 w-full h-0.5 ${
                        done ? "bg-neon2" : "bg-line"
                      }`}
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 ${
                      done
                        ? "bg-neon2 text-white"
                        : "bg-surface2 text-muted border border-line"
                    } ${esActual ? "ring-4 ring-neon2/25" : ""}`}
                  >
                    {done && i < paso ? "✓" : i + 1}
                  </div>
                  <span className={`text-[10px] text-center ${done ? "font-semibold" : "text-muted"}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 text-center text-sm text-muted">
            {p.estado === "nuevo" && (
              p.tipo === "preorden"
                ? "Tu preorden está confirmada. La barra la preparará para tu llegada."
                : "Tu pedido entró a la cola de preparación."
            )}
            {p.estado === "preparando" && "El equipo está preparando tu pedido. 👨‍🍳"}
            {p.estado === "listo" && p.modo !== "zona" && (
              <span className="text-lime font-semibold text-base">
                ¡Listo! Pasa por la barra express con tu número{p.estadoPago === "pendiente" ? " y paga al retirar" : ""}.
              </span>
            )}
            {p.estado === "listo" && p.modo === "zona" && "Asignando mesero para tu entrega…"}
            {p.estado === "en_camino" && (
              <span className="text-neon1 font-semibold text-base">
                Tu pedido va en camino — mantén tu pantalla visible.
              </span>
            )}
            {p.estado === "entregado" && "Entregado. ¡Disfruta la noche! ✨"}
            {p.notas && <p className="mt-2 text-amber text-xs">{p.notas}</p>}
          </div>
        </section>
      )}

      {p.estado === "listo" && p.barraRecogidaNombre && (
        <section className="card p-5 border-amber/50 bg-amber/5 text-center space-y-2">
          <p className="text-2xl">📍</p>
          <h2 className="font-bold text-amber text-lg">Recoge tu pedido en {p.barraRecogidaNombre}</h2>
          <p className="text-sm text-muted">
            El mesero no logró encontrarte en la zona. Presenta el número #{p.numero} y tu PIN para recibirlo.
          </p>
        </section>
      )}

      {p.estado === "en_camino" && p.color && (
        <button
          onClick={() => setLuzAbierta(true)}
          className={`w-full rounded-2xl py-6 font-bold text-black text-lg pat-${p.patron}`}
          style={{ background: p.color, boxShadow: `0 0 30px ${p.color}66` }}
        >
          Abrir señal {String(p.senalNumero ?? 1).padStart(2, "0")} · {p.colorNombre}
        </button>
      )}

      {!terminal && p.estado !== "entregado" && (
        <section className="card p-5 border-neon1/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neon1 font-semibold text-sm">Código de verificación (PIN)</p>
              <p className="text-muted text-xs mt-0.5">
                Compártelo solo con quien te entrega tu pedido.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3 justify-center">
            {p.pin.split("").map((d, i) => (
              <div
                key={i}
                className="w-14 h-16 card flex items-center justify-center text-3xl font-bold border-neon1/40"
              >
                {d}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Recibo</h2>
        {p.items.map((i, idx) => (
          <div key={idx} className="flex justify-between text-muted">
            <span>
              {i.cantidad}× {i.nombre}
              {i.tamano && i.tamano !== "Normal" ? ` (${i.tamano})` : ""}
            </span>
            <span>{cop(i.precioUnit * i.cantidad)}</span>
          </div>
        ))}
        {p.propina > 0 && (
          <div className="flex justify-between text-muted">
            <span>Propina</span>
            <span>{cop(p.propina)}</span>
          </div>
        )}
        {!!p.descuento && (
          <div className="flex justify-between text-lime font-semibold">
            <span>Descuento por volumen ({p.descuentoPct}%)</span>
            <span>− {cop(p.descuento)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-line pt-2">
          <span>Total</span>
          <span className="text-neon2">{cop(p.total)}</span>
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>Pago</span>
          <span>
            {p.pagoAlFinal && p.estadoPago !== "pagado"
              ? "Cuenta abierta · pagas al final"
              : p.estadoPago === "pagado"
              ? `Pagado ${p.cobro?.referencia ? `· ${p.cobro.referencia}` : ""}`
              : "Pagas al recibir"}
          </span>
        </div>
        <button className="w-full text-center text-xs text-neon3 pt-1">
          Enviar recibo por WhatsApp o correo
        </button>
      </section>

      <button
        onClick={() => {
          reemplazarCarrito(p.items);
          router.push("/m/carrito");
        }}
        className="btn-neon w-full rounded-full py-4 px-6 text-white font-bold flex items-center justify-between"
      >
        <span>🍻 Otra ronda</span>
        <span>{cop(p.subtotal)}</span>
      </button>
      <p className="text-[10px] text-muted text-center -mt-4">
        Copia todos los productos al carrito para confirmar una nueva ronda.
      </p>

      <Link href="/m" className="block text-center text-muted text-sm">
        ← Volver al menú
      </Link>
    </main>
  );
}
