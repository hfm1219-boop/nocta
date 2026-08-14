"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { actualizarExperiencia, ejecutarMatching, useExperienciasSociales } from "@/lib/social-events";

export default function GestionExperiencia() {
  const { id } = useParams<{ id: string }>();
  const evento = useExperienciasSociales().find((item) => item.id === id);
  if (!evento) return <main className="p-8 text-muted">Experiencia no encontrada.</main>;
  const completos = evento.participantes.filter((p) => p.cuestionarioCompleto).length;
  const checkins = evento.participantes.filter((p) => p.checkin).length;
  const matches = Math.floor(evento.participantes.filter((p) => p.matchId).length / 2);
  const ratings = evento.participantes.flatMap((p) => p.feedback ? [p.feedback.rating] : []);
  const promedio = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";
  return (
    <main className="flex-1 px-5 py-8 max-w-5xl mx-auto w-full space-y-6">
      <header className="flex items-start justify-between gap-4"><div><Link href="/promotor" className="text-sm text-muted">← Promotor</Link><h1 className="text-3xl font-bold mt-3">{evento.nombre}</h1><p className="text-sm text-muted mt-1">{evento.lugarNombre} · {new Date(evento.fechaISO).toLocaleString("es-CO")}</p></div><span className="rounded-full bg-neon3/10 text-neon3 px-4 py-2 text-xs font-bold uppercase">{evento.estado}</span></header>
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3"><Kpi t="Registrados" v={evento.participantes.length} /><Kpi t="Cuestionarios" v={completos} /><Kpi t="Check-ins" v={checkins} /><Kpi t="Matches" v={matches} /><Kpi t="Feedback" v={promedio} /></section>
      <section className="grid md:grid-cols-4 gap-3">
        <button onClick={() => actualizarExperiencia(id, (e) => { e.estado = e.estado === "open" ? "closed" : "open"; })} className="card p-4 font-semibold">{evento.estado === "open" ? "🔒 Cerrar registro" : "🔓 Abrir registro"}</button>
        <button onClick={() => ejecutarMatching(id)} className="btn-neon rounded-2xl p-4 font-semibold">⚡ Ejecutar matching</button>
        <button disabled={!matches} onClick={() => actualizarExperiencia(id, (e) => { e.estado = "revealed"; })} className="card p-4 font-semibold disabled:opacity-40">👁 Revelar matches</button>
        <Link href={`/experiencias/${id}`} className="card p-4 text-center font-semibold">↗ Ver como asistente</Link>
      </section>
      <section className="card overflow-hidden"><div className="p-5 border-b border-line"><h2 className="font-bold">Participantes</h2><p className="text-xs text-muted">Solo se muestran datos necesarios para operar la experiencia.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-muted"><tr>{["Nombre", "Edad", "Interés", "Cuestionario", "Check-in", "Match"].map((h) => <th key={h} className="text-left p-3 font-normal">{h}</th>)}</tr></thead><tbody>{evento.participantes.map((p) => <tr key={p.id} className="border-t border-line"><td className="p-3 font-semibold">{p.nombre}</td><td className="p-3 text-muted">{p.edad}</td><td className="p-3 text-muted">{p.intencion}</td><td className="p-3">{p.cuestionarioCompleto ? "✓" : "—"}</td><td className="p-3">{p.checkin ? "✓" : "—"}</td><td className="p-3">{p.matchId ? `${p.compatibilidad}%` : "—"}</td></tr>)}</tbody></table></div></section>
      <section className="card p-5"><p className="text-xs text-muted">Link para compartir</p><p className="font-mono text-sm mt-1 break-all">{typeof window !== "undefined" ? `${window.location.origin}/experiencias/${id}` : `/experiencias/${id}`}</p></section>
    </main>
  );
}

function Kpi({ t, v }: { t: string; v: string | number }) { return <div className="card p-4"><p className="text-xs text-muted">{t}</p><p className="text-2xl font-bold mt-1">{v}</p></div>; }
