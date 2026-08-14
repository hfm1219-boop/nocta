"use client";

import { useRouter } from "next/navigation";
import { seleccionarLocal } from "@/lib/store";

export function EntrarLugar({ lugarId, nombre }: { lugarId: string; nombre: string }) {
  const router = useRouter();

  return (
    <button
      className="w-full rounded-2xl border border-neon1/50 px-5 py-4 font-semibold text-neon3 hover:bg-neon1/10 transition"
      onClick={() => {
        seleccionarLocal(lugarId, nombre);
        router.push("/m");
      }}
    >
      Ya estoy aquí · Ver menú
    </button>
  );
}
