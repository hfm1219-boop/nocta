"use client";

import { FormEvent, useMemo, useState } from "react";
import { PromotionDetailData, type PromotionRecord, type SellOutMapping } from "@/components/promotion-detail-data";
import { PromotionEngineAdmin } from "@/components/promotion-engine-admin";

type Props = {
  venueId: string;
  promotions: PromotionRecord[];
  mappings: SellOutMapping[];
  send: (method: string, body: Record<string, unknown>) => Promise<boolean>;
};

function statusOf(item: PromotionRecord) {
  const now = Date.now();
  if (!item.active) return { label: "Inactiva", className: "text-muted", dot: "bg-muted" };
  if (new Date(item.starts_at).getTime() > now) return { label: "Programada", className: "text-amber", dot: "bg-amber" };
  if (new Date(item.ends_at).getTime() < now) return { label: "Vencida", className: "text-muted", dot: "bg-muted" };
  return { label: "Visible en Explorar", className: "text-lime", dot: "bg-lime" };
}

function rulesOf(item: PromotionRecord) {
  return Array.isArray(item.promotion_rules) ? item.promotion_rules : item.promotion_rules ? [item.promotion_rules] : [];
}

export function EstablishmentPromotions({ venueId, promotions, mappings, send }: Props) {
  const [selectedId, setSelectedId] = useState(promotions[0]?.id ?? "");
  const selected = promotions.find(item => item.id === selectedId) ?? promotions[0];
  const summary = useMemo(() => ({
    visible: promotions.filter(item => statusOf(item).label === "Visible en Explorar").length,
    scheduled: promotions.filter(item => statusOf(item).label === "Programada").length,
    configured: promotions.filter(item => rulesOf(item).length > 0).length,
    attributed: promotions.filter(item => rulesOf(item).some(rule => (rule.promotion_rule_items ?? []).some(detail => Boolean(detail.brand_product_id)))).length,
  }), [promotions]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void send("POST", { action: "promotion", venueId, title: data.get("title"), description: data.get("description"), terms: data.get("terms"), startsAt: new Date(String(data.get("starts"))).toISOString(), endsAt: new Date(String(data.get("ends"))).toISOString() }).then(ok => { if (ok) form.reset(); });
  }

  return <div className="space-y-6">
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Visibles", summary.visible], ["Programadas", summary.scheduled], ["Con regla", summary.configured], ["Con atribución", summary.attributed]].map(([label, value]) => <div key={label} className="card px-4 py-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
    </section>

    <details className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div><h2 className="font-bold">Crear promoción</h2><p className="text-xs text-muted">Define la publicación básica; después configura reglas y atribución.</p></div>
        <span className="rounded-xl bg-neon2 px-4 py-2 text-sm font-bold text-black"><span className="group-open:hidden">+ Nueva</span><span className="hidden group-open:inline">Cerrar</span></span>
      </summary>
      <form onSubmit={submit} className="grid gap-3 border-t border-line p-5 md:grid-cols-2">
        <input name="title" required minLength={4} className="entrada md:col-span-2" placeholder="Nombre de la promoción"/>
        <textarea name="description" required minLength={10} className="entrada md:col-span-2" placeholder="Explica claramente el beneficio"/>
        <textarea name="terms" required minLength={5} className="entrada md:col-span-2" placeholder="Condiciones generales"/>
        <label className="text-xs text-muted">Disponible desde<input name="starts" type="datetime-local" required className="entrada mt-1"/></label>
        <label className="text-xs text-muted">Disponible hasta<input name="ends" type="datetime-local" required className="entrada mt-1"/></label>
        <button className="btn-neon rounded-xl p-3 md:col-span-2">Crear y continuar configuración</button>
      </form>
    </details>

    <section className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
      <aside className="card overflow-hidden lg:sticky lg:top-24">
        <div className="border-b border-line px-4 py-3"><h2 className="font-bold">Promociones</h2><p className="text-xs text-muted">Selecciona una para revisar o administrar.</p></div>
        <div className="max-h-[65vh] overflow-y-auto p-2">{promotions.map(item => { const status = statusOf(item); const rules = rulesOf(item); return <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`mb-1 w-full rounded-xl border p-3 text-left transition ${selected?.id === item.id ? "border-neon2 bg-neon2/10" : "border-transparent hover:border-line hover:bg-white/[0.03]"}`}>
          <div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`}/><span className={`text-[11px] font-semibold ${status.className}`}>{status.label}</span></div>
          <p className="mt-1 line-clamp-1 font-semibold">{item.title}</p>
          <p className="mt-1 text-xs text-muted">{new Date(item.starts_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })} – {new Date(item.ends_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })} · {rules.length ? "Regla configurada" : "Sin regla"}</p>
        </button>; })}{!promotions.length && <p className="p-5 text-sm text-muted">Aún no hay promociones. Crea la primera desde el botón superior.</p>}</div>
      </aside>

      {selected ? <article className="card overflow-hidden">
        <header className="border-b border-line p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className={`text-xs font-semibold ${statusOf(selected).className}`}>{statusOf(selected).label}</p><h2 className="mt-1 text-2xl font-bold">{selected.title}</h2><p className="mt-1 text-sm text-muted">{selected.description}</p></div><button type="button" onClick={() => void send("PATCH", { action: "promotion_status", id: selected.id, active: !selected.active })} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${selected.active ? "border-danger/30 text-danger" : "border-lime/30 text-lime"}`}>{selected.active ? "Desactivar" : "Activar"}</button></div>
        </header>
        <div className="p-5">
          <dl className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">Condiciones</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{selected.terms}</dd></div><div><dt className="text-xs text-muted">Desde</dt><dd className="mt-1 text-sm">{new Date(selected.starts_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</dd></div><div><dt className="text-xs text-muted">Hasta</dt><dd className="mt-1 text-sm">{new Date(selected.ends_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</dd></div></dl>
          <PromotionDetailData promotion={selected} mappings={mappings}/>
        </div>
      </article> : <div className="card p-8 text-muted">Selecciona o crea una promoción para ver sus detalles.</div>}
    </section>

    <details className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden"><div><h2 className="font-bold">Configuración avanzada</h2><p className="text-xs text-muted">Reglas comerciales, SKU atribuible, activaciones y mapping de sell-out.</p></div><span className="text-neon3"><span className="group-open:hidden">Abrir ↓</span><span className="hidden group-open:inline">Cerrar ↑</span></span></summary>
      <div className="border-t border-line p-4"><PromotionEngineAdmin venueId={venueId}/></div>
    </details>
  </div>;
}
