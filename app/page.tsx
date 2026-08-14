"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Logo } from "@/components/ui";
import { EVENTOS, formatearFecha, LUGARES } from "@/lib/discovery";
import { useExperienciasSociales } from "@/lib/social-events";

const CATEGORIAS = ["Todos", "Hoy", "Este fin de semana", "Gratis"];

export default function Descubrimiento() {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("Todos");
  const experiencias = useExperienciasSociales().filter((item) => item.estado === "open");

  const eventos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return EVENTOS.filter((evento) => {
      const lugar = LUGARES.find((item) => item.id === evento.lugarId);
      const coincideTexto = !texto || [evento.nombre, evento.resumen, lugar?.nombre, ...evento.generos]
        .some((valor) => valor?.toLowerCase().includes(texto));
      const coincideFiltro = filtro === "Todos"
        || (filtro === "Gratis" && evento.precioDesde === 0)
        || (filtro === "Hoy" && evento.id === "ritual-caribe")
        || (filtro === "Este fin de semana" && ["ritual-caribe", "jugada-live", "luna-afro"].includes(evento.id));
      return coincideTexto && coincideFiltro;
    });
  }, [busqueda, filtro]);

  return (
    <main className="flex-1 pb-12">
      <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <Logo size="text-3xl" />
          <div className="flex items-center gap-4"><Link href="/mis-entradas" className="text-xs text-neon3">Mis entradas</Link><Link href="/accesos" className="text-xs text-muted hover:text-foreground">Operación →</Link></div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 space-y-9">
        <section className="pt-10 md:pt-16 space-y-5">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-neon3 mb-2">Cartagena · Esta noche</p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">Tu noche empieza aquí.</h1>
            <p className="text-muted mt-3 md:text-lg">Descubre lugares, eventos y experiencias para salir en Cartagena.</p>
          </div>
          <div className="card p-2 flex items-center gap-3 max-w-2xl focus-within:border-neon2/60">
            <span className="pl-3 text-xl">⌕</span>
            <input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              className="w-full bg-transparent px-1 py-3 outline-none"
              placeholder="Busca un evento, lugar o género"
              aria-label="Buscar eventos"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIAS.map((categoria) => (
              <button
                key={categoria}
                onClick={() => setFiltro(categoria)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${filtro === categoria ? "chip-active bg-neon2/10" : "border-line text-muted"}`}
              >
                {categoria}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neon2">Selección NOCTA</p>
              <h2 className="text-2xl font-bold mt-1">Próximos eventos</h2>
            </div>
            <span className="text-xs text-muted">{eventos.length} resultados</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {eventos.map((evento) => {
              const lugar = LUGARES.find((item) => item.id === evento.lugarId)!;
              return (
                <Link key={evento.id} href={`/eventos/${evento.id}`} className="card overflow-hidden group hover:border-neon1/60 transition">
                  <div className="h-36 p-5 flex flex-col justify-between relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${evento.color}55, #100e1c 75%)` }}>
                    <div className="absolute -right-4 -bottom-8 text-8xl opacity-20 group-hover:scale-110 transition">{lugar.icono}</div>
                    <span className="self-start rounded-full bg-black/35 backdrop-blur px-3 py-1 text-xs">{lugar.categoria} · {lugar.zona}</span>
                    <div>
                      <h3 className="text-2xl font-bold">{evento.nombre}</h3>
                      <p className="text-sm text-white/70">{lugar.nombre}</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-neon3 capitalize">{formatearFecha(evento.fechaISO)}</span>
                      <span className="text-sm font-bold">{evento.precioDesde ? `Desde $${evento.precioDesde.toLocaleString("es-CO")}` : "Entrada libre"}</span>
                    </div>
                    <p className="text-sm text-muted">{evento.resumen}</p>
                    <div className="flex gap-2 flex-wrap">
                      {evento.generos.map((genero) => <span key={genero} className="text-xs rounded-full bg-surface2 px-2.5 py-1 text-muted">{genero}</span>)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {eventos.length === 0 && <div className="card p-10 text-center text-muted">No encontramos planes con esos filtros.</div>}
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neon3">Conecta en persona</p>
            <h2 className="text-2xl font-bold mt-1">Experiencias sociales</h2>
            <p className="text-sm text-muted mt-1">Eventos guiados para conocer personas con intereses afines.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {experiencias.map((experiencia) => (
              <Link key={experiencia.id} href={`/experiencias/${experiencia.id}`} className="card p-5 hover:border-neon3/60 transition relative overflow-hidden">
                <div className="absolute -right-4 -bottom-8 text-8xl opacity-10">✨</div>
                <p className="text-xs uppercase tracking-wider text-neon3">{experiencia.tipo} · por {experiencia.promotor}</p>
                <h3 className="text-xl font-bold mt-2">{experiencia.nombre}</h3>
                <p className="text-sm text-muted mt-2">{experiencia.descripcion}</p>
                <div className="flex justify-between gap-3 mt-5 text-xs"><span>{experiencia.lugarNombre}</span><span className="text-neon2">{experiencia.participantes.length}/{experiencia.capacidad} confirmados →</span></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neon3">Explora</p>
            <h2 className="text-2xl font-bold mt-1">Lugares para tu noche</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 snap-x">
            {LUGARES.map((lugar) => (
              <Link key={lugar.id} href={`/lugares/${lugar.id}`} className="card min-w-[260px] md:min-w-[300px] p-5 snap-start hover:border-neon1/60 transition" style={{ borderTopColor: lugar.color }}>
                <div className="text-4xl mb-5">{lugar.icono}</div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-lg">{lugar.nombre}</h3>
                  <span className="text-neon3">→</span>
                </div>
                <p className="text-xs text-neon3 mt-1">{lugar.zona} · {lugar.rangoPrecio}</p>
                <p className="text-sm text-muted mt-3">{lugar.descripcion}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
