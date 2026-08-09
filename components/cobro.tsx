"use client";

import { useState } from "react";
import { cop, registrarCobro } from "@/lib/store";
import type { Pedido } from "@/lib/types";
import { BotonPrimario } from "./ui";

/** Modal de registro de cobro contra entrega (efectivo o datáfono). */
export function ModalCobro({
  pedido, staffId, permitirEfectivo = true, onCerrar, onCobrado,
}: {
  pedido: Pedido;
  staffId: string;
  permitirEfectivo?: boolean;
  onCerrar: () => void;
  onCobrado?: () => void;
}) {
  const [medio, setMedio] = useState<"efectivo" | "datafono">(
    permitirEfectivo ? "efectivo" : "datafono",
  );
  const [recibido, setRecibido] = useState("");
  const [aprobacion, setAprobacion] = useState("");

  const vuelto = medio === "efectivo" && recibido
    ? Math.max(0, Number(recibido) - pedido.total)
    : 0;
  const valido =
    medio === "efectivo"
      ? Number(recibido) >= pedido.total
      : aprobacion.trim().length >= 4;

  function confirmar() {
    registrarCobro(
      pedido.id,
      medio,
      staffId,
      medio === "datafono" ? aprobacion.trim() : undefined,
    );
    onCobrado?.();
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="card w-full max-w-sm p-5 space-y-4 bg-surface">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">Cobrar pedido #{pedido.numero}</h2>
          <button onClick={onCerrar} className="text-muted text-xl px-2">✕</button>
        </div>
        <p className="text-3xl font-bold text-neon2">{cop(pedido.total)}</p>

        <div className="grid grid-cols-2 gap-2">
          {permitirEfectivo && (
            <button
              onClick={() => setMedio("efectivo")}
              className={`card py-3 text-sm ${medio === "efectivo" ? "chip-active font-semibold" : "text-muted"}`}
            >
              💵 Efectivo
            </button>
          )}
          <button
            onClick={() => setMedio("datafono")}
            className={`card py-3 text-sm ${medio === "datafono" ? "chip-active font-semibold" : "text-muted"} ${!permitirEfectivo ? "col-span-2" : ""}`}
          >
            💳 Datáfono
          </button>
        </div>

        {medio === "efectivo" ? (
          <div className="space-y-2">
            <input
              value={recibido}
              onChange={(e) => setRecibido(e.target.value.replace(/\D/g, ""))}
              placeholder="¿Con cuánto paga?"
              inputMode="numeric"
              className="card w-full px-4 py-3 bg-transparent outline-none text-lg"
            />
            {Number(recibido) >= pedido.total && (
              <p className="text-lime font-bold text-lg text-center">
                Vuelto: {cop(vuelto)}
              </p>
            )}
            <div className="flex gap-2">
              {[pedido.total, 50000, 100000].map((v) => (
                <button
                  key={v}
                  onClick={() => setRecibido(String(v))}
                  className="card flex-1 py-2 text-xs text-muted"
                >
                  {v === pedido.total ? "Exacto" : cop(v)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <input
              value={aprobacion}
              onChange={(e) => setAprobacion(e.target.value)}
              placeholder="Nro. de aprobación del datáfono"
              className="card w-full px-4 py-3 bg-transparent outline-none"
            />
            <p className="text-[11px] text-muted">
              Obligatorio: sin este número el cuadre nocturno contra el lote del
              datáfono no es posible.
            </p>
          </div>
        )}

        <BotonPrimario onClick={confirmar} disabled={!valido} className="w-full">
          Registrar cobro
        </BotonPrimario>
        <p className="text-[11px] text-muted text-center">
          Quien cobra queda registrado. Es la defensa contra descuadres.
        </p>
      </div>
    </div>
  );
}
