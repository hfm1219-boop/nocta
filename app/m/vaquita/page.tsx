"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useDB } from "@/lib/store";

export default function UnirseVaquita() {
  const router = useRouter();
  const db = useDB();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");

  if (!db) return null;

  function ingresar(evento: FormEvent) {
    evento.preventDefault();
    const normalizado = codigo.trim().toUpperCase();
    if (normalizado.length !== 6) {
      setError("El código debe tener seis caracteres.");
      return;
    }
    const vaquita = db?.vaquitas.find((item) => item.codigo === normalizado);
    if (!vaquita) {
      setError("No encontramos esa vaquita. Revisa el código con tu amigo.");
      return;
    }
    setError("");
    router.push(`/m/vaquita/${normalizado}`);
  }

  return (
    <main className="px-5 pt-12 pb-28 min-h-dvh flex flex-col justify-center">
      <section className="text-center space-y-3 mb-8">
        <div className="text-6xl">🐮</div>
        <p className="text-sm font-semibold text-amber">VAQUITA NOCTA</p>
        <h1 className="text-3xl font-bold">Únete a pagar</h1>
        <p className="text-sm text-muted max-w-xs mx-auto">
          Pídele el código a quien creó la vaquita y aporta tu parte de la botella.
        </p>
      </section>

      <form onSubmit={ingresar} className="card p-5 space-y-4 border-amber/40">
        <label className="block text-center">
          <span className="text-xs text-muted">Código de seis caracteres</span>
          <input
            value={codigo}
            onChange={(evento) => {
              setCodigo(evento.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6));
              setError("");
            }}
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            maxLength={6}
            placeholder="ABC123"
            aria-label="Código de la vaquita"
            className="card w-full mt-2 px-4 py-4 bg-transparent outline-none text-center text-3xl font-mono font-bold tracking-[0.25em] uppercase focus:border-amber"
          />
        </label>
        {error && <p className="text-sm text-danger text-center">{error}</p>}
        <button
          disabled={codigo.length !== 6}
          className="w-full rounded-full py-3.5 bg-amber text-black font-bold disabled:opacity-40"
        >
          Buscar vaquita y aportar
        </button>
      </form>

      <p className="text-[11px] text-muted text-center mt-4">
        El código aparece en la pantalla de la persona que inició la vaquita.
      </p>
    </main>
  );
}
