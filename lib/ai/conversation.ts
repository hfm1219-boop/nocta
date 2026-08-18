import type { AgentIntent, PromotionDraft } from "./types.ts";

type ConversationState = { intent?: string; promotionDraft?: PromotionDraft };

export function startsNewPromotion(message: string) {
  const normalized = normalize(message);
  return /\b(?:nueva|nuevo|otra|otro)\s+(?:promocion|promo)\b|\b(?:promocion|promo)\s+(?:nueva|nuevo|distinta|diferente)\b/.test(normalized);
}

export function matchByLabel<T>(message: string, items: T[], label: (item: T) => string) {
  const query = normalizeLabel(message);
  const exact = items.find((item) => normalizeLabel(label(item)) === query);
  if (exact) return exact;
  const contained = items.filter((item) => {
    const candidate = normalizeLabel(label(item));
    return candidate.length > 0 && (query.includes(candidate) || candidate.includes(query));
  });
  if (contained.length === 1) return contained[0];
  const scored = items.map((item) => ({
    item,
    score: normalizeLabel(label(item)).split(/\s+/).filter((word) => word.length >= 3 && query.includes(word)).length,
  })).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 && scored[0].score > (scored[1]?.score ?? -1) ? scored[0].item : undefined;
}

export function preservePromotionFlow(state: ConversationState, intent: AgentIntent): AgentIntent {
  if (state.intent !== "CREATE_PROMOTION" || intent.intent === "CREATE_PROMOTION" || intent.intent === "LIST_PROMOTIONS") return intent;
  return { ...intent, intent: "CREATE_PROMOTION", confidence: Math.max(intent.confidence, 0.9) };
}

export function parseBuyXGetY(message: string) {
  const normalized = normalize(message);
  if (/\b2\s*x\s*1\b|\b2x1\b/.test(normalized)) return { buyQuantity: 1, getQuantity: 1 };
  const match = normalized.match(/\b(?:paga|pague|compra|compre)\s*(\d+)\s*(?:y\s*)?(?:lleva|lleve|recibe|reciba)\s*(\d+)\b/);
  if (!match) return null;
  const paid = Number(match[1]); const total = Number(match[2]);
  return paid > 0 && total > paid ? { buyQuantity: paid, getQuantity: total - paid } : null;
}

export function parseWindow(message: string, entities: Record<string, unknown>, previousStart?: string) {
  const entityStart = cleanEntity(entities.startsAt); const entityEnd = cleanEntity(entities.endsAt);
  if (entityStart && entityEnd && !Number.isNaN(Date.parse(entityStart)) && !Number.isNaN(Date.parse(entityEnd))) return { startsAt: new Date(entityStart).toISOString(), endsAt: new Date(entityEnd).toISOString() };
  const normalized = normalize(message);
  const now = bogotaDateParts(new Date());
  const date = new Date(`${now.date}T12:00:00-05:00`);
  if (normalized.includes("manana")) date.setUTCDate(date.getUTCDate() + 1);
  else {
    const days = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    const index = days.findIndex((day) => normalized.includes(day));
    if (index < 0 && !previousStart) return {};
    if (index < 0 && previousStart) date.setTime(new Date(previousStart).getTime());
    else {
      const current = new Date(`${now.date}T12:00:00-05:00`).getUTCDay();
      let delta = (index - current + 7) % 7; if (delta === 0) delta = 7;
      date.setUTCDate(date.getUTCDate() + delta);
    }
  }
  const times = [...message.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)/gi)].map((match) => {
    let hour = Number(match[1]); const minute = Number(match[2] ?? 0); const pm = normalize(match[3]).startsWith("p");
    if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0;
    return { hour, minute };
  });
  if (!times.length) return {};
  const day = bogotaDateParts(date).date;
  const start = new Date(`${day}T${pad(times[0].hour)}:${pad(times[0].minute)}:00-05:00`);
  if (times.length === 1 && previousStart) {
    const previous = new Date(previousStart);
    const end = new Date(`${bogotaDateParts(previous).date}T${pad(times[0].hour)}:${pad(times[0].minute)}:00-05:00`);
    if (end <= previous) end.setUTCDate(end.getUTCDate() + 1);
    return { endsAt: end.toISOString() };
  }
  if (times.length === 1) return { startsAt: start.toISOString() };
  const end = new Date(`${day}T${pad(times[1].hour)}:${pad(times[1].minute)}:00-05:00`);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function cleanEntity(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 50) : ""; }
function bogotaDateParts(date: Date) { return { date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) }; }
function pad(value: number) { return String(value).padStart(2, "0"); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO"); }
function normalizeLabel(value: string) { return normalize(value).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
