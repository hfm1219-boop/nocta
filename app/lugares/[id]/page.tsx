import Link from "next/link";
import { notFound } from "next/navigation";
import { EntrarLugar } from "@/components/entrar-lugar";
import { Logo } from "@/components/ui";
import { FavoriteButton } from "@/components/favorites";
import { DemandTracker } from "@/components/demand-tracker";
import { ProximosEventosLugar } from "@/components/proximos-eventos-lugar";
import { LUGARES, lugarPorId } from "@/lib/discovery";

export function generateStaticParams() {
  return LUGARES.map((lugar) => ({ id: lugar.id }));
}

export default async function LugarPage({ params }: PageProps<"/lugares/[id]">) {
  const { id } = await params;
  const lugar = lugarPorId(id);
  if (!lugar) notFound();

  return (
    <main className="flex-1 pb-12">
      <DemandTracker type="venue_view" entityType="venue" entityKey={lugar.id}/>
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

          <ProximosEventosLugar lugarId={lugar.id} lugarNombre={lugar.nombre} />

          <section className="pt-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Durante tu visita</p>
            <EntrarLugar lugarId={lugar.id} nombre={lugar.nombre} />
          </section>
        </div>
      </article>
    </main>
  );
}
