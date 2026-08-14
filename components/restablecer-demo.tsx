"use client";

import { useState } from "react";
import { restablecerTodaLaDemo } from "@/lib/reset-demo";

export function RestablecerDemo() {
  const [confirmando, setConfirmando] = useState(false);

  function restablecer() {
    restablecerTodaLaDemo();
    window.location.reload();
  }

  return (
    <section className="border-t border-line pt-8 pb-2 text-center">
      {!confirmando ? (
        <button onClick={() => setConfirmando(true)} className="text-xs text-muted hover:text-danger transition">
          Restablecer todos los datos de prueba
        </button>
      ) : (
        <div className="card max-w-md mx-auto p-5 space-y-4 border-danger/40">
          <div>
            <p className="font-bold text-danger">¿Restablecer toda la aplicación?</p>
            <p className="text-xs text-muted mt-2">
              Se eliminarán pedidos, carritos, entradas, check-ins, experiencias, participantes, matches, establecimientos personalizados y configuraciones guardadas en este dispositivo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setConfirmando(false)} className="rounded-xl border border-line p-3 text-sm">Cancelar</button>
            <button onClick={restablecer} className="rounded-xl bg-danger p-3 text-sm font-bold text-white">Sí, restablecer</button>
          </div>
        </div>
      )}
    </section>
  );
}
