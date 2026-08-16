import Link from "next/link";
import { notFound } from "next/navigation";
import { EntrarLugar, PreordenarEvento } from "@/components/entrar-lugar";
import { Logo } from "@/components/ui";
import { FavoriteButton } from "@/components/favorites";
import { EVENTOS, formatearFecha, LUGARES, lugarPorId } from "@/lib/discovery";

export function generateStaticParams() {
  return LUGARES.map((lugar) => ({ id: lugar.id }));
}

export default async function LugarPage({ params }: PageProps<"/lugares/[id]">) {
  const { id } = await params;
  const lugar = lugarPorId(id);
  if (!lugar) notFound();
  const eventos = EVENTOS.filter((evento) => evento.lugarId === lugar.id);

  return (
    <main className="flex-1 pb-12">
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-muted">← Explorar</Link>
          <Logo size="text-2xl" />
        </div>
      </header>

      <article className="max-w-3xl mx-auto">
        <div
          className="min-h-64 p-6 md:p-10 flex items-end relative overflow-hidden"
          style={{ background: `radial-gradient(circle at 80% 15%, ${lugar.color}99, transparent 42%), linear-gradient(145deg, ${lugar.color}44, #100e1c 75%)` }}
        >
          <FavoriteButton type="venue" entityKey={lugar.id} className="absolute right-5 top-5 z-10" />
          <div className="absolute right-6 top-5 text-9xl opacity-20">{lugar.icono}</div>
          <div className="relative">
            <span className="rounded-full bg-black/30 px-3 py-1 text-xs capitalize">{lugar.categoria} · {lugar.rangoPrecio}</span>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mt-4">{lugar.nombre}</h1>
            <p className="text-lg text-white/70 mt-2">{lugar.zona} · {lugar.ciudad}</p>
          </div>
        </div>

        <div className="px-5 py-8 space-y-8">
          <section>
            <p className="text-muted leading-relaxed">{lugar.descripcion}</p>
            <div className="flex gap-2 flex-wrap mt-4">
              {lugar.estilos.map((estilo) => (
                <span key={estilo} className="rounded-full bg-surface2 px-3 py-1 text-xs text-muted">{estilo}</span>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neon2">Antes de llegar</p>
              <h2 className="text-2xl font-bold mt-1">Próximos eventos</h2>
              <p className="text-sm text-muted mt-1">Selecciona el evento para comprar acceso o dejar tu preorden lista.</p>
            </div>
            {eventos.map((evento) => (
              <div key={evento.id} className="card p-5 space-y-4">
                <Link href={`/eventos/${evento.id}`} className="block group">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-neon3 capitalize">{formatearFecha(evento.fechaISO)}</p>
                      <h3 className="text-xl font-bold mt-1 group-hover:text-neon2 transition">{evento.nombre}</h3>
                      <p className="text-sm text-muted mt-2">{evento.resumen}</p>
                    </div>
                    <span className="text-neon2">→</span>
                  </div>
                </Link>
                <PreordenarEvento
                  lugarId={lugar.id}
                  lugarNombre={lugar.nombre}
                  eventoId={evento.id}
                  eventoNombre={evento.nombre}
                  fechaISO={evento.fechaISO}
                />
              </div>
            ))}
            {eventos.length === 0 && <div className="card p-6 text-center text-muted">No hay eventos publicados próximamente.</div>}
          </section>

          <section className="pt-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Durante tu visita</p>
            <EntrarLugar lugarId={lugar.id} nombre={lugar.nombre} />
          </section>
        </div>
      </article>
    </main>
  );
}
