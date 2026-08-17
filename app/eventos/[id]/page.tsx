import Link from "next/link";
import { notFound } from "next/navigation";
import { EntrarLugar, PreordenarEvento } from "@/components/entrar-lugar";
import { Logo } from "@/components/ui";
import { FavoriteButton } from "@/components/favorites";
import { DemandTracker } from "@/components/demand-tracker";
import { EVENTOS, eventoPorId, formatearFecha, lugarPorId } from "@/lib/discovery";

export function generateStaticParams() {
  return EVENTOS.map((evento) => ({ id: evento.id }));
}

export default async function EventoPage({ params }: PageProps<"/eventos/[id]">) {
  const { id } = await params;
  const evento = eventoPorId(id);
  if (!evento) notFound();
  const lugar = lugarPorId(evento.lugarId);
  if (!lugar) notFound();

  const estado = evento.disponibilidad === "ultimos" ? "Últimas entradas"
    : evento.disponibilidad === "lista" ? "Solo lista" : "Disponible";

  return (
    <main className="flex-1 pb-12">
      <DemandTracker type="event_view" entityType="event" entityKey={evento.id}/>
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-muted">← Explorar</Link>
          <Logo size="text-2xl" />
        </div>
      </header>

      <article className="max-w-3xl mx-auto">
        <div className="min-h-72 p-6 md:p-10 flex items-end relative overflow-hidden" style={{ background: `radial-gradient(circle at 80% 20%, ${evento.color}99, transparent 42%), linear-gradient(145deg, ${evento.color}44, #100e1c 75%)` }}>
          <FavoriteButton type="event" entityKey={evento.id} className="absolute right-5 top-5 z-10" />
          <div className="absolute right-5 top-6 text-9xl opacity-20">{lugar.icono}</div>
          <div className="relative max-w-xl">
            <span className="inline-block rounded-full bg-black/30 px-3 py-1 text-xs mb-4">{estado}</span>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">{evento.nombre}</h1>
            <p className="text-lg text-white/70 mt-2">{lugar.nombre} · {lugar.zona}</p>
          </div>
        </div>

        <div className="px-5 py-8 grid md:grid-cols-[1fr_280px] gap-8">
          <div className="space-y-8">
            <section>
              <p className="text-neon3 font-semibold capitalize">{formatearFecha(evento.fechaISO, true)} – {evento.horaFin}</p>
              <p className="text-muted leading-relaxed mt-4">{evento.descripcion}</p>
            </section>
            <section className="grid grid-cols-2 gap-3">
              <Dato titulo="Edad mínima" valor={`${evento.edadMinima}+`} />
              <Dato titulo="Dress code" valor={evento.dressCode} />
              <Dato titulo="Zona" valor={lugar.zona} />
              <Dato titulo="Ambiente" valor={evento.generos.join(" · ")} />
            </section>
            <section className="card p-5">
              <h2 className="font-bold">Sobre {lugar.nombre}</h2>
              <p className="text-sm text-muted mt-2">{lugar.descripcion}</p>
            </section>
          </div>

          <aside className="space-y-3 md:sticky md:top-5 self-start">
            <div className="card p-5 space-y-3 border-neon3/40 bg-neon3/5">
              <div>
                <p className="text-xs uppercase tracking-wider text-neon3">Antes de llegar</p>
                <h2 className="font-bold text-lg mt-1">Deja tu pedido listo</h2>
                <p className="text-xs text-muted mt-2">Elige productos ahora y programa la entrega para tu llegada al evento.</p>
              </div>
              <PreordenarEvento
                lugarId={lugar.id}
                lugarNombre={lugar.nombre}
                eventoId={evento.id}
                eventoNombre={evento.nombre}
                fechaISO={evento.fechaISO}
              />
            </div>
            <div className="card p-5 space-y-4">
              <div>
                <p className="text-xs text-muted">Entrada</p>
                <p className="text-2xl font-bold mt-1">{evento.precioDesde ? `Desde $${evento.precioDesde.toLocaleString("es-CO")}` : "Entrada libre"}</p>
              </div>
              <Link href={`/eventos/${evento.id}/entradas`} className="block text-center w-full rounded-2xl border border-neon2/60 px-5 py-4 font-bold text-neon2">
                {evento.disponibilidad === "lista" ? "Solicitar lista" : evento.precioDesde ? "Comprar entrada" : "Confirmar asistencia"}
              </Link>
              <p className="text-[11px] text-center text-muted">Recibirás un QR único para validar en puerta.</p>
            </div>
            <div className="card p-5 space-y-3"><div><p className="text-xs uppercase tracking-wider text-neon2">Mesas y VIP</p><h2 className="font-bold text-lg mt-1">Reserva tu espacio</h2><p className="text-xs text-muted mt-2">Selecciona capacidad, consumo mínimo y envía tu solicitud al establecimiento.</p></div><Link href={`/eventos/${evento.id}/reservar`} className="block text-center rounded-2xl border border-neon1/60 px-5 py-4 font-bold text-neon1">Ver opciones de reserva</Link></div>
            <EntrarLugar lugarId={lugar.id} nombre={lugar.nombre} />
          </aside>
        </div>
      </article>
    </main>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="text-sm font-semibold mt-1">{valor}</p>
    </div>
  );
}
