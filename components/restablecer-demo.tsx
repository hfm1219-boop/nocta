"use client";

import { useState } from "react";
import { restablecerTodaLaDemo } from "@/lib/reset-demo";

export function RestablecerDemo() {
  const [confirmando, setConfirmando] = useState(false);
  const [cargando, setCargando] = useState(false);

  function restablecer() {
    setCargando(true);
    restablecerTodaLaDemo();
    window.location.reload();
  }

  return (
    <section className="border-t border-line pt-8 pb-2 text-center">
      {!confirmando ? (
        <button onClick={() => setConfirmando(true)} className="rounded-xl border border-neon3/35 px-4 py-3 text-sm font-semibold text-neon3 transition hover:bg-neon3/10">
          ↻ Restablecer datos de prueba
        </button>
      ) : (
        <div className="card max-w-md mx-auto p-5 space-y-4 border-neon3/40">
          <div>
            <p className="font-bold text-neon3">¿Restablecer los datos de prueba?</p>
            <p className="text-xs text-muted mt-2">
              Se reemplazarán los datos de prueba guardados en este dispositivo y volverán a cargarse establecimientos, productos, pedidos, entradas, experiencias y configuraciones demo iniciales. Las cuentas de acceso no se eliminan.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button disabled={cargando} onClick={() => setConfirmando(false)} className="rounded-xl border border-line p-3 text-sm disabled:opacity-50">Cancelar</button>
            <button disabled={cargando} onClick={restablecer} className="btn-neon rounded-xl p-3 text-sm font-bold disabled:opacity-50">{cargando ? "Restableciendo…" : "Sí, restablecer"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
