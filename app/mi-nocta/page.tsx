"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QRAcceso } from "@/components/qr-acceso";

type Balance = { available: number; pending: number; total: number; redeemed: number };
type Tx = { id: string; points: number; status: string; concept: string; created_at: string };
type Reward = { slug: string; name: string; description: string; points_required: number; stock: number; terms: string; venues?: { name?: string } | null };
type Redemption = { id: string; token: string; points: number; status: string; expires_at: string; loyalty_rewards?: { name?: string; venues?: { name?: string } | null } | null };
type Mission = { slug: string; name: string; description: string; reward_points: number; ends_at: string; requires_audit: boolean; evidence_schema?: { required?: string[]; labels?: Record<string, string> } };
type Execution = { id: string; status: string; points_awarded?: number; review_notes?: string; loyalty_missions?: { slug?: string; name?: string } | null };
type Payload = { balance: Balance; transactions: Tx[]; rewards: Reward[]; redemptions: Redemption[]; missions: Mission[]; executions: Execution[] };

const LEVELS = [{ name: "Bronce", min: 0, next: 500 }, { name: "Plata", min: 500, next: 1500 }, { name: "Oro", min: 1500, next: 3500 }, { name: "Black", min: 3500, next: 3500 }];
const STATUS: Record<string, string> = { in_review: "En revisión", approved: "Aprobada", needs_fix: "Requiere corrección", rejected: "Rechazada", requested: "Disponible", delivered: "Utilizado", cancelled: "Vencido", pending: "Pendiente", confirmed: "Confirmado" };

export default function MiNocta() {
  const [data, setData] = useState<Payload>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [openMission, setOpenMission] = useState("");
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/loyalty", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "No fue posible cargar Mi NOCTA");
    setData(body);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/loyalty", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No fue posible cargar Mi NOCTA");
      if (active) setData(body);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function act(body: Record<string, unknown>, key: string, success: string) {
    setBusy(key); setError(""); setNotice("");
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await fetch("/api/loyalty", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No fue posible completar la operación");
      setNotice(success); setOpenMission(""); setEvidence({}); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(""); }
  }

  const executionBySlug = useMemo(() => { const map = new Map<string | undefined, Execution>(); for (const item of data?.executions ?? []) if (!map.has(item.loyalty_missions?.slug)) map.set(item.loyalty_missions?.slug, item); return map; }, [data]);
  if (loading) return <main className="p-8 text-muted">Preparando tu experiencia NOCTA…</main>;
  if (!data) return <main className="p-8"><p className="text-danger">{error}</p><Link href="/">← Volver</Link></main>;

  const level = [...LEVELS].reverse().find((item) => data.balance.total >= item.min) ?? LEVELS[0];
  const progress = level.name === "Black" ? 100 : Math.min(100, data.balance.total / level.next * 100);
  const activeRedemptions = data.redemptions.filter((item) => item.status === "requested");

  return <main className="flex-1 px-5 py-8 max-w-6xl mx-auto w-full space-y-8">
    <header><Link href="/mis-planes" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground">← Volver a Mis planes</Link><p className="text-xs uppercase tracking-[.2em] text-neon3 mt-7">Mi membresía</p><h1 className="text-3xl md:text-5xl font-bold mt-2">Mi NOCTA</h1><p className="text-muted mt-2">Tus puntos, misiones, beneficios y actividad en un solo lugar.</p></header>
    <section className="card p-6 overflow-hidden relative"><div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-neon1/10 blur-3xl"/><div className="relative"><div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-neon2">Nivel {level.name}</p><h1 className="text-4xl font-black mt-2">{data.balance.available.toLocaleString("es-CO")} <span className="text-base text-muted font-medium">puntos</span></h1></div><p className="text-xs text-muted text-right">{level.name === "Black" ? "Nivel máximo" : `${Math.max(0, level.next - data.balance.total)} para el siguiente nivel`}</p></div><div className="h-2 bg-surface2 rounded-full mt-5"><div className="h-full bg-gradient-to-r from-neon1 to-neon2 rounded-full" style={{ width: `${progress}%` }}/></div><div className="grid grid-cols-3 gap-3 mt-5"><Kpi t="Por confirmar" v={data.balance.pending}/><Kpi t="Histórico" v={data.balance.total}/><Kpi t="Usados" v={data.balance.redeemed}/></div></div></section>
    {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-lime/40 bg-lime/10 p-3 text-lime">{notice}</p>}

    {activeRedemptions.length > 0 && <section><Heading title="Listos para usar" detail="Muestra el QR únicamente al establecimiento indicado."/><div className="grid md:grid-cols-2 gap-4 mt-4">{activeRedemptions.map((item) => <article key={item.id} className="card p-6 text-center border-neon3/30"><QRAcceso contenido={item.token} alt="Código de redención"/><b className="block text-xl mt-4">{item.loyalty_rewards?.name}</b><p className="text-sm text-neon3">{item.loyalty_rewards?.venues?.name}</p><p className="font-mono tracking-widest mt-3">{item.token}</p><p className="text-xs text-muted mt-2">Válido hasta {new Date(item.expires_at).toLocaleString("es-CO")}</p></article>)}</div></section>}

    <section><Heading title="Misiones disponibles" detail="Participa, envía la evidencia y sigue el estado desde aquí."/><div className="grid md:grid-cols-2 gap-4 mt-4">{data.missions.map((mission) => {
      const execution = executionBySlug.get(mission.slug); const fields = mission.evidence_schema?.required ?? [];
      return <article key={mission.slug} className="card p-5"><div className="flex justify-between gap-3"><div><h3 className="font-bold text-lg">{mission.name}</h3><p className="text-sm text-muted mt-1">{mission.description}</p></div><b className="text-lime whitespace-nowrap">+{mission.reward_points}</b></div><p className="text-xs text-muted mt-3">{mission.requires_audit ? "Validación del equipo" : "Acreditación inmediata"} · hasta {new Date(mission.ends_at).toLocaleDateString("es-CO")}</p>
        {execution && execution.status !== "needs_fix" && <div className="rounded-xl bg-surface2 p-3 mt-4 text-sm"><span className="text-muted">Estado</span><b className="block">{STATUS[execution.status] ?? execution.status}</b>{execution.review_notes && <p className="text-amber mt-1">{execution.review_notes}</p>}</div>}
        {execution?.status === "needs_fix" && openMission !== mission.slug && <div className="mt-4"><div className="rounded-xl bg-amber/10 border border-amber/30 p-3 text-sm"><b className="text-amber">Requiere corrección</b><p className="text-muted mt-1">{execution.review_notes}</p></div><button onClick={() => { setOpenMission(mission.slug); setEvidence({}); }} className="btn-neon rounded-xl p-3 mt-3 w-full">Corregir y reenviar</button></div>}
        {(!execution || execution.status === "needs_fix") && openMission === mission.slug && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void act({ action: "execute", missionSlug: mission.slug, evidence }, mission.slug, "Misión enviada correctamente."); }}>{fields.length ? fields.map((field) => <label key={field} className="block text-sm"><span className="text-muted">{mission.evidence_schema?.labels?.[field] ?? field.replaceAll("_", " ")}</span><input required value={evidence[field] ?? ""} onChange={(event) => setEvidence((current) => ({ ...current, [field]: event.target.value }))} className="entrada mt-1" placeholder="Escribe la evidencia"/></label>) : <p className="text-sm text-muted">Confirma que realizaste esta actividad.</p>}<div className="flex gap-2"><button type="button" onClick={() => { setOpenMission(""); setEvidence({}); }} className="rounded-xl border border-line p-3 flex-1">Cancelar</button><button disabled={Boolean(busy)} className="btn-neon rounded-xl p-3 flex-1">{busy === mission.slug ? "Enviando…" : "Enviar"}</button></div></form>}
        {!execution && openMission !== mission.slug && <button onClick={() => { setOpenMission(mission.slug); setEvidence({}); }} className="btn-neon rounded-xl p-3 mt-4 w-full">Participar</button>}
      </article>;
    })}{!data.missions.length && <p className="card p-8 text-muted">Pronto habrá nuevas misiones.</p>}</div></section>

    <section><Heading title="Beneficios" detail="Reserva con puntos y úsalo en el comercio antes del vencimiento."/><div className="grid md:grid-cols-3 gap-4 mt-4">{data.rewards.map((reward) => <article key={reward.slug} className="card p-5 flex flex-col"><p className="text-xs uppercase tracking-wider text-neon3">{reward.venues?.name} · {reward.stock} disponibles</p><h3 className="text-xl font-bold mt-2">{reward.name}</h3><p className="text-sm text-muted mt-2 flex-1">{reward.description}</p>{reward.terms && <p className="text-xs text-muted mt-3">{reward.terms}</p>}<p className="font-bold text-lg mt-4">{reward.points_required.toLocaleString("es-CO")} puntos</p><button onClick={() => void act({ action: "redeem", rewardSlug: reward.slug }, reward.slug, "Beneficio reservado. Ya puedes mostrar el QR.")} disabled={reward.stock < 1 || data.balance.available < reward.points_required || Boolean(busy)} className="btn-neon rounded-xl p-3 mt-3 disabled:opacity-40">{busy === reward.slug ? "Reservando…" : reward.stock < 1 ? "Agotado" : data.balance.available < reward.points_required ? "Te faltan puntos" : "Canjear beneficio"}</button></article>)}</div></section>

    <section><Heading title="Actividad" detail="Tu historial contable de puntos y redenciones."/><div className="card mt-4 overflow-hidden">{data.transactions.map((tx) => <div key={tx.id} className="p-4 border-b border-line flex justify-between gap-4"><div><b>{tx.concept}</b><p className="text-xs text-muted">{STATUS[tx.status] ?? tx.status} · {new Date(tx.created_at).toLocaleString("es-CO")}</p></div><b className={tx.points > 0 ? "text-lime" : "text-amber"}>{tx.points > 0 ? "+" : ""}{tx.points}</b></div>)}{!data.transactions.length && <p className="p-8 text-center text-muted">Tu actividad aparecerá aquí.</p>}</div></section>
  </main>;
}

function Heading({ title, detail }: { title: string; detail: string }) { return <div><h2 className="text-2xl font-bold">{title}</h2><p className="text-sm text-muted mt-1">{detail}</p></div>; }
function Kpi({ t, v }: { t: string; v: number }) { return <div><p className="text-xs text-muted">{t}</p><p className="text-xl font-bold">{v.toLocaleString("es-CO")}</p></div>; }
