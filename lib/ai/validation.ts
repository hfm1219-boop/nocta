import { AGENT_INTENTS, type AgentIntent, type PromotionDraft, type PromotionMechanic } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MECHANICS = new Set<PromotionMechanic>(["percentage", "fixed_amount", "buy_x_get_y", "fixed_price"]);

export function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
export function cleanText(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function finiteNumber(value: unknown) { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : undefined; }

export function parseIntent(value: unknown): AgentIntent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.intent !== "string" || !AGENT_INTENTS.includes(row.intent as AgentIntent["intent"])) return null;
  const confidence = finiteNumber(row.confidence);
  if (confidence === undefined || confidence < 0 || confidence > 1) return null;
  const entities = row.entities && typeof row.entities === "object" && !Array.isArray(row.entities) ? row.entities as Record<string, unknown> : {};
  const missingFields = Array.isArray(row.missingFields) ? row.missingFields.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  return { intent: row.intent as AgentIntent["intent"], confidence, entities, missingFields };
}

export function validatePromotionDraft(draft: PromotionDraft, allowedProductIds: Set<string>) {
  const errors: string[] = [];
  if (!isUuid(draft.venueId)) errors.push("El establecimiento es obligatorio.");
  if (!draft.title || draft.title.trim().length < 4) errors.push("El título debe tener al menos 4 caracteres.");
  if (!draft.description || draft.description.trim().length < 10) errors.push("La descripción debe tener al menos 10 caracteres.");
  if (!draft.terms || draft.terms.trim().length < 5) errors.push("Las condiciones son obligatorias.");
  const start = draft.startsAt ? new Date(draft.startsAt) : null;
  const end = draft.endsAt ? new Date(draft.endsAt) : null;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime()) || end <= start) errors.push("La vigencia no es válida.");
  if (!draft.mechanic || !MECHANICS.has(draft.mechanic)) errors.push("La mecánica no es válida.");
  if (!draft.productIds.length) errors.push("Selecciona al menos un producto.");
  if (draft.productIds.some((id) => !allowedProductIds.has(id))) errors.push("Uno o más productos no pertenecen al catálogo del establecimiento.");
  if (draft.mechanic === "percentage" && (!draft.benefit || draft.benefit <= 0 || draft.benefit > 100)) errors.push("El porcentaje debe estar entre 1 y 100.");
  if (["fixed_amount", "fixed_price"].includes(draft.mechanic ?? "") && (!draft.benefit || draft.benefit <= 0)) errors.push("El valor del beneficio debe ser positivo.");
  if (draft.mechanic === "buy_x_get_y" && (!draft.buyQuantity || !draft.getQuantity || draft.buyQuantity < 1 || draft.getQuantity < 1)) errors.push("La mecánica 2x1 requiere cantidades válidas.");
  return errors;
}

export function requiresExplicitConfirmation(kind: "READ" | "DRAFT" | "WRITE") { return kind === "WRITE"; }
