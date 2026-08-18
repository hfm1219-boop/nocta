import { NOCTA_AGENT_SYSTEM_PROMPT } from "./prompts/system.ts";
import { parseIntent } from "./validation.ts";
import type { AgentIntent, PromotionDraft } from "./types.ts";

type RoutingContext = { now: string; venueName?: string; products: Array<{ id: string; name: string }>; currentDraft?: PromotionDraft };

const INTENT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["CREATE_PROMOTION","UPDATE_PROMOTION","LIST_PROMOTIONS","CREATE_EVENT","UPDATE_EVENT","BUSINESS_ANALYSIS","GENERAL_QUESTION","UNKNOWN"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    entities: {
      type: "object", additionalProperties: false,
      properties: {
        product: { type: ["string", "null"] }, productName: { type: ["string", "null"] },
        mechanic: { type: ["string", "null"], enum: ["percentage", "fixed_amount", "buy_x_get_y", "fixed_price", null] },
        benefit: { type: ["number", "null"] }, startsAt: { type: ["string", "null"] }, endsAt: { type: ["string", "null"] },
      },
      required: ["product", "productName", "mechanic", "benefit", "startsAt", "endsAt"],
    },
    missingFields: { type: "array", items: { type: "string" } },
  },
  required: ["intent", "confidence", "entities", "missingFields"],
};

export async function routeIntent(message: string, context: RoutingContext): Promise<AgentIntent> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallbackIntent(message);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-5.6-luna",
      store: false,
      instructions: NOCTA_AGENT_SYSTEM_PROMPT,
      input: `Mensaje: ${message}\nContexto verificable: ${JSON.stringify(context)}`,
      text: { format: { type: "json_schema", name: "agent_intent", strict: true, schema: INTENT_SCHEMA } },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`MODEL_ERROR_${response.status}`);
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  const parsed = text ? parseIntent(JSON.parse(text) as unknown) : null;
  if (!parsed) throw new Error("MODEL_INVALID_OUTPUT");
  return parsed;
}

export function fallbackIntent(message: string): AgentIntent {
  const normalized = message.toLocaleLowerCase("es-CO");
  if (/\b(promoci[oó]n|promo|descuento|2x1|precio especial|combo)\b/.test(normalized) || /\b(mover|impulsar|aumentar)\b.*\b(ventas?|producto|gin|ron|whisk|vodka|cerveza)\b/.test(normalized)) {
    return { intent: "CREATE_PROMOTION", confidence: 0.76, entities: {}, missingFields: [] };
  }
  if (/\b(promociones).*\b(activas|tengo|listar|ver)\b/.test(normalized)) return { intent: "LIST_PROMOTIONS", confidence: 0.75, entities: {}, missingFields: [] };
  if (/\b(evento|dj|publicar)\b/.test(normalized)) return { intent: "CREATE_EVENT", confidence: 0.65, entities: {}, missingFields: [] };
  return { intent: "UNKNOWN", confidence: 0.35, entities: {}, missingFields: [] };
}
