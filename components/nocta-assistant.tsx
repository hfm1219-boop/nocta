"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AgentCard, AgentReply, PromotionDraft } from "@/lib/ai/types";
import { ACTIVE_VENUE_EVENT, ACTIVE_VENUE_KEY } from "@/lib/active-venue";

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; cards?: AgentCard[] };
const QUICK_ACTIONS = ["Crear promoción", "¿Qué promociones tengo activas?", "Ayúdame a aumentar ventas este fin de semana"];

export function NoctaAssistant({ writeActionsEnabled }: { writeActionsEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [venueId, setVenueId] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setVenueId(window.localStorage.getItem(ACTIVE_VENUE_KEY) ?? "");
    sync(); window.addEventListener(ACTIVE_VENUE_EVENT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(ACTIVE_VENUE_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function submit(text: string) {
    const clean = text.trim(); if (!clean || busy) return;
    setInput(""); setOpen(true); setBusy(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }]);
    await request({ message: clean, conversationId, venueId: venueId || undefined });
  }

  async function confirm(confirmationId: string) {
    if (!conversationId || busy) return;
    setBusy(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: "Confirmar" }]);
    await request({ action: "confirm", conversationId, confirmationId });
  }

  async function request(body: Record<string, unknown>) {
    try {
      const response = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error ?? "No fue posible contactar al asistente."); }
      if (!response.body) throw new Error("El servidor no devolvió una respuesta.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let result: AgentReply | undefined;
      while (true) {
        const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) { const event = JSON.parse(line) as { type: string; value: AgentReply }; if (event.type === "result") result = event.value; }
        if (done) break;
      }
      if (!result) throw new Error("La respuesta del asistente está incompleta.");
      setConversationId(result.conversationId);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: result.message, cards: result.cards }]);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: error instanceof Error ? error.message : "Ocurrió un error.", cards: [{ type: "error", title: "Error", detail: error instanceof Error ? error.message : "Ocurrió un error." }] }]);
    } finally { setBusy(false); }
  }

  function onSubmit(event: FormEvent) { event.preventDefault(); void submit(input); }

  return <>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Abrir NOCTA Assistant" className="fixed bottom-20 right-4 z-[70] grid h-14 w-14 place-items-center rounded-full border border-neon2/40 bg-neon2 text-xl font-black text-background shadow-[0_0_35px_rgba(85,255,200,.28)] transition hover:scale-105 md:bottom-6 md:right-6">N<span className="sr-only">OCTA Assistant</span></button>
    {open && <section role="dialog" aria-label="NOCTA Assistant" className="fixed inset-x-3 bottom-36 z-[69] flex max-h-[min(690px,75dvh)] flex-col overflow-hidden rounded-3xl border border-line bg-background/98 shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-24 md:right-6 md:h-[650px] md:w-[430px]">
      <header className="flex items-start justify-between border-b border-line bg-surface/70 p-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-neon2">NOCTA Assistant</p><h2 className="mt-1 font-bold">¿Qué quieres lograr?</h2><p className="text-xs text-muted">Opera tu negocio con lenguaje natural.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-line px-2 py-1 text-muted" aria-label="Cerrar">×</button></header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!messages.length && <div className="space-y-3"><AgentSuggestionCard title="Acciones sugeridas" actions={QUICK_ACTIONS} onAction={(action) => void submit(action)}/>{!writeActionsEnabled && <p className="rounded-xl border border-neon3/25 bg-neon3/10 p-3 text-xs text-neon3">Modo seguro: puedes consultar y preparar propuestas; la creación está deshabilitada.</p>}</div>}
        {messages.map((message) => <article key={message.id} className={message.role === "user" ? "ml-10" : "mr-3"}><p className={`rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "bg-neon2 text-background" : "border border-line bg-surface"}`}>{message.text}</p>{message.cards?.map((card, index) => <Card key={`${message.id}-${index}`} card={card} writeActionsEnabled={writeActionsEnabled} busy={busy} onAction={(action) => void submit(action)} onConfirm={(id) => void confirm(id)}/>)}</article>)}
        {busy && <p className="mr-20 animate-pulse rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">NOCTA está consultando y validando…</p>}
        <div ref={endRef}/>
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-3"><label className="sr-only" htmlFor="nocta-agent-input">Mensaje</label><input id="nocta-agent-input" value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} maxLength={2000} placeholder="Ej. Crea una promo de gin mañana…" className="entrada min-w-0 flex-1"/><button disabled={busy || !input.trim()} className="btn-neon rounded-xl px-4 disabled:opacity-40">Enviar</button></form>
    </section>}
  </>;
}

function Card({ card, writeActionsEnabled, busy, onAction, onConfirm }: { card: AgentCard; writeActionsEnabled: boolean; busy: boolean; onAction: (value: string) => void; onConfirm: (id: string) => void }) {
  if (card.type === "promotion_preview") return <PromotionPreviewCard draft={card.draft}/>;
  if (card.type === "confirmation") return <ConfirmationCard prompt={card.prompt} disabled={busy || !writeActionsEnabled} onConfirm={() => onConfirm(card.confirmationId)}/>;
  if (card.type === "tool_result") return <ToolResultCard title={card.title} detail={card.detail} href={card.href}/>;
  if (card.type === "suggestion") return <AgentSuggestionCard title={card.title} actions={card.actions} onAction={onAction}/>;
  return <ErrorCard title={card.title} detail={card.detail}/>;
}

export function PromotionPreviewCard({ draft }: { draft: PromotionDraft }) {
  const mechanic = draft.mechanic === "percentage" ? `${draft.benefit}% OFF` : draft.mechanic === "buy_x_get_y" ? "2×1" : draft.mechanic === "fixed_price" ? `Precio $${draft.benefit?.toLocaleString("es-CO")}` : `$${draft.benefit?.toLocaleString("es-CO")} OFF`;
  return <section className="mt-2 rounded-2xl border border-neon2/30 bg-neon2/5 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-neon2">Promoción propuesta</p><h3 className="mt-1 font-bold">{draft.title}</h3><p className="mt-1 text-xs text-muted">{draft.venueName}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><p className="rounded-xl bg-background p-2"><span className="block text-muted">Inicio</span>{formatDate(draft.startsAt)}</p><p className="rounded-xl bg-background p-2"><span className="block text-muted">Fin</span>{formatDate(draft.endsAt)}</p></div><p className="mt-3 text-xl font-black text-neon2">{mechanic}</p><p className="mt-1 text-xs text-muted">{draft.products.length} producto{draft.products.length === 1 ? "" : "s"}: {draft.products.map((product) => product.name).join(", ")}</p>{draft.budgetCop && <p className="mt-2 text-xs">Presupuesto: ${draft.budgetCop.toLocaleString("es-CO")}</p>}</section>;
}

export function ConfirmationCard({ prompt, disabled, onConfirm }: { prompt: string; disabled: boolean; onConfirm: () => void }) { return <section className="mt-2 rounded-2xl border border-neon3/30 bg-neon3/5 p-3"><p className="text-sm font-semibold">{prompt}</p><button type="button" disabled={disabled} onClick={onConfirm} className="btn-neon mt-3 w-full rounded-xl p-2.5 disabled:cursor-not-allowed disabled:opacity-40">{disabled ? "Creación no habilitada" : "Confirmar creación"}</button></section>; }
export function ToolResultCard({ title, detail, href }: { title: string; detail: string; href?: string }) { return <section className="mt-2 rounded-2xl border border-lime/30 bg-lime/5 p-3"><p className="font-bold text-lime">✓ {title}</p><p className="mt-1 text-xs text-muted">{detail}</p>{href && <Link href={href} className="mt-2 inline-block text-xs font-bold text-neon2">Abrir en NOCTA →</Link>}</section>; }
export function AgentSuggestionCard({ title, actions, onAction }: { title: string; actions: string[]; onAction: (value: string) => void }) { return <section className="rounded-2xl border border-line bg-surface p-3"><p className="text-xs font-bold">{title}</p><div className="mt-2 flex flex-wrap gap-2">{actions.map((action) => <button type="button" key={action} onClick={() => onAction(action)} className="rounded-full border border-neon2/25 bg-neon2/10 px-3 py-2 text-left text-xs text-neon2 hover:border-neon2">{action}</button>)}</div></section>; }
export function ErrorCard({ title, detail }: { title: string; detail: string }) { return <section className="mt-2 rounded-2xl border border-danger/30 bg-danger/10 p-3"><p className="font-bold text-danger">{title}</p><p className="mt-1 text-xs text-muted">{detail}</p></section>; }
export function EventPreviewCard() { return <section className="rounded-2xl border border-line p-3 text-sm text-muted">Vista previa de evento disponible en la siguiente capacidad.</section>; }

function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(value)) : "Sin definir"; }
