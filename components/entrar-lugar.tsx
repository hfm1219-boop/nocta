"use client";

import { useRouter } from "next/navigation";
import { seleccionarLocal } from "@/lib/store";
import { guardarIntencionPreorden, limpiarIntencionPedido } from "@/lib/order-intent";

export function EntrarLugar({ lugarId, nombre }: { lugarId: string; nombre: string }) {
  const router = useRouter();

  return (
    <button
      className="w-full rounded-2xl border border-neon1/50 px-5 py-4 font-semibold text-neon3 hover:bg-neon1/10 transition"
      onClick={() => {
        limpiarIntencionPedido();
        seleccionarLocal(lugarId, nombre);
        router.push("/m");
      }}
    >
      Ya estoy aquí · Ver menú
    </button>
  );
}

export function PreordenarEvento({
  lugarId, lugarNombre, eventoId, eventoNombre, fechaISO,
}: {
  lugarId: string;
  lugarNombre: string;
  eventoId: string;
  eventoNombre: string;
  fechaISO: string;
}) {
  const router = useRouter();

  return (
    <button
      className="btn-neon w-full rounded-2xl px-5 py-4 font-bold"
      onClick={() => {
        seleccionarLocal(lugarId, lugarNombre);
        guardarIntencionPreorden({
          tipo: "preorden",
          eventoId,
          eventoNombre,
          llegadaSugerida: fechaISO,
        });
        router.push("/m");
      }}
    >
      🗓️ Preordenar para el evento
    </button>
  );
}
