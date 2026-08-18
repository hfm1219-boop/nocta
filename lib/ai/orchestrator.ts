import type { AgentServerContext } from "@/lib/ai/context";
import { parseBuyXGetY, parseWindow, preservePromotionFlow } from "@/lib/ai/conversation";
import { fallbackIntent, routeIntent } from "@/lib/ai/intent-router";
import type { AgentReply, PromotionDraft, PromotionMechanic } from "@/lib/ai/types";
import { cleanText, isUuid } from "@/lib/ai/validation";
import { createPromotion, listActivePromotions, listEstablishments, preparePromotionConfirmation, searchProducts } from "@/lib/ai/tools/promotion-tools";

const MAX_STEPS = 8;
type ConversationState = { intent?: string; promotionDraft?: PromotionDraft };

export async function handleAgentMessage(ctx: AgentServerContext, input: { conversationId?: string; venueId?: string; message: string }): Promise<AgentReply> {
  const started = Date.now();
  const message = cleanText(input.message, 2_000);
  if (!message) throw new OrchestratorError("INVALID_MESSAGE", 400, "Escribe qué quieres lograr.");
  const conversation = await getConversation(ctx, input.conversationId, input.venueId);
  await addMessage(ctx, conversation.id, "user", message);
  const venuesResult = await listEstablishments(ctx);
  if (!venuesResult.ok) return failReply(conversation.id, venuesResult.error);
  const venues = venuesResult.data;
  const requestedVenue = input.venueId ? venues.find((venue) => venue.id === input.venueId) : undefined;
  const state = conversation.state;
  const venue = requestedVenue ?? venues.find((item) => item.id === state.promotionDraft?.venueId) ?? (venues.length === 1 ? venues[0] : undefined);
  const productResult = venue ? await searchProducts(ctx, venue.id) : { ok: true as const, data: [] };
  if (!productResult.ok) return failReply(conversation.id, productResult.error);
  let intent;
  try {
    intent = await routeIntent(message, { now: new Date().toISOString(), venueName: venue?.name, products: productResult.data.map(({ id, name }) => ({ id, name })), currentDraft: state.promotionDraft });
  } catch {
    intent = fallbackIntent(message);
  }
  intent = preservePromotionFlow(state, intent);
  const run = await startRun(ctx, conversation.id, intent.intent);

  if (intent.intent === "LIST_PROMOTIONS") {
    if (!venue) return completeRunWithMessage(ctx, run.id, started, reply(conversation.id, run.id, "needs_input", "¿De cuál establecimiento quieres consultar las promociones?", []), 2);
    const promotions = await listActivePromotions(ctx, venue.id);
    await recordTool(ctx, run.id, "list_active_promotions", "READ", { venueId: venue.id }, promotions, started);
    if (!promotions.ok) return completeRun(ctx, run.id, started, failReply(conversation.id, promotions.error, run.id), 2);
    const text = promotions.data.length ? `Tienes ${promotions.data.length} ${promotions.data.length === 1 ? "promoción activa" : "promociones activas"}: ${promotions.data.map((item) => item.title).join(", ")}.` : `No hay promociones activas en ${venue.name}.`;
    return completeRunWithMessage(ctx, run.id, started, reply(conversation.id, run.id, "completed", text, [{ type: "tool_result", title: "Promociones activas", detail: text, href: "/admin/promociones" }]), 2);
  }

  if (intent.intent !== "CREATE_PROMOTION") {
    const text = intent.intent === "CREATE_EVENT" ? "La creación conversacional de eventos será la siguiente capacidad. En este sprint ya puedes crear promociones de punta a punta." : "Por ahora puedo crear promociones o consultar las promociones activas de tu establecimiento.";
    return completeRunWithMessage(ctx, run.id, started, reply(conversation.id, run.id, "completed", text, [{ type: "suggestion", title: "Prueba una acción", actions: ["Crear promoción", "¿Qué promociones tengo activas?"] }]), 1);
  }

  const draft = enrichDraft(state.promotionDraft, message, intent.entities, venue, productResult.data);
  await updateConversation(ctx, conversation.id, { intent: "CREATE_PROMOTION", promotionDraft: draft }, venue?.id);
  await recordTool(ctx, run.id, "search_products", "READ", { venueId: venue?.id, query: "contextual" }, { ok: true, count: productResult.data.length }, started);
  const question = nextQuestion(draft, venues.length);
  if (question) {
    await addMessage(ctx, conversation.id, "assistant", question.message, { actions: question.actions });
    return completeRun(ctx, run.id, started, reply(conversation.id, run.id, "needs_input", question.message, question.actions.length ? [{ type: "suggestion", title: question.title, actions: question.actions }] : []), 3);
  }

  const prepared = await preparePromotionConfirmation(ctx, conversation.id, draft);
  await recordTool(ctx, run.id, "validate_promotion", "DRAFT", { draft }, prepared, started);
  if (!prepared.ok) return completeRun(ctx, run.id, started, failReply(conversation.id, prepared.error, run.id), 4);
  const previewMessage = `Preparé “${draft.title}” para ${draft.venueName}. Revisa la propuesta y confirma solo si todo está correcto.`;
  await addMessage(ctx, conversation.id, "assistant", previewMessage, { confirmationId: prepared.data.confirmationId });
  return completeRun(ctx, run.id, started, reply(conversation.id, run.id, "needs_confirmation", previewMessage, [
    { type: "promotion_preview", confirmationId: prepared.data.confirmationId, draft, expiresAt: prepared.data.expiresAt },
    { type: "confirmation", confirmationId: prepared.data.confirmationId, prompt: "¿Confirmas la creación de esta promoción?" },
  ]), 4);
}

export async function confirmAgentAction(ctx: AgentServerContext, input: { conversationId: string; confirmationId: string }): Promise<AgentReply> {
  if (!isUuid(input.conversationId) || !isUuid(input.confirmationId)) throw new OrchestratorError("INVALID_CONFIRMATION", 400, "La confirmación no es válida.");
  const conversation = await getConversation(ctx, input.conversationId);
  const started = Date.now();
  const run = await startRun(ctx, conversation.id, "CREATE_PROMOTION");
  const result = await createPromotion(ctx, input.confirmationId);
  await recordTool(ctx, run.id, "create_promotion", "WRITE", { confirmationId: input.confirmationId }, result, started);
  if (!result.ok) return completeRun(ctx, run.id, started, failReply(conversation.id, friendlyToolError(result.error), run.id), 1);
  const message = "La promoción fue creada y activada correctamente mediante el motor real de NOCTA.";
  await addMessage(ctx, conversation.id, "assistant", message, { promotionId: result.data.promotionId });
  return completeRun(ctx, run.id, started, reply(conversation.id, run.id, "completed", message, [{ type: "tool_result", title: "Promoción creada", detail: `ID: ${result.data.promotionId}`, href: result.data.href }]), 1);
}

async function getConversation(ctx: AgentServerContext, conversationId?: string, venueId?: string) {
  if (conversationId) {
    if (!isUuid(conversationId)) throw new OrchestratorError("INVALID_CONVERSATION", 400, "La conversación no es válida.");
    const { data } = await ctx.supabase.from("ai_conversations").select("id,state,status,venue_id").eq("id", conversationId).eq("user_id", ctx.userId).eq("organization_id", ctx.organizationId).maybeSingle();
    if (!data || data.status !== "active") throw new OrchestratorError("CONVERSATION_NOT_FOUND", 404, "La conversación terminó o no está disponible.");
    return { id: data.id, state: (data.state ?? {}) as ConversationState, venueId: data.venue_id as string | null };
  }
  const safeVenue = venueId && isUuid(venueId) ? venueId : null;
  const { data, error } = await ctx.supabase.from("ai_conversations").insert({ user_id: ctx.userId, organization_id: ctx.organizationId, venue_id: safeVenue, state: {} }).select("id,state,venue_id").single();
  if (error || !data) throw new OrchestratorError("CONVERSATION_CREATE_FAILED", 500, "No fue posible iniciar la conversación.");
  return { id: data.id, state: {} as ConversationState, venueId: data.venue_id as string | null };
}

async function addMessage(ctx: AgentServerContext, conversationId: string, role: "user" | "assistant" | "tool", content: string, metadata: Record<string, unknown> = {}) {
  await ctx.supabase.from("ai_messages").insert({ conversation_id: conversationId, user_id: ctx.userId, role, content, metadata });
}

async function updateConversation(ctx: AgentServerContext, id: string, state: ConversationState, venueId?: string) {
  await ctx.supabase.from("ai_conversations").update({ state, venue_id: venueId ?? null, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.userId);
}

async function startRun(ctx: AgentServerContext, conversationId: string, intent: string) {
  const { data, error } = await ctx.supabase.from("ai_agent_runs").insert({ conversation_id: conversationId, user_id: ctx.userId, organization_id: ctx.organizationId, intent, status: "running", model: process.env.OPENAI_API_KEY ? process.env.OPENAI_AGENT_MODEL || "gpt-5.6-luna" : "local-fallback" }).select("id").single();
  if (error || !data) throw new OrchestratorError("RUN_CREATE_FAILED", 500, "No fue posible registrar la ejecución del agente.");
  return data;
}

async function recordTool(ctx: AgentServerContext, runId: string, toolName: string, kind: "READ" | "DRAFT" | "WRITE", input: unknown, result: unknown, started: number) {
  await ctx.supabase.from("ai_tool_calls").insert({ run_id: runId, user_id: ctx.userId, tool_name: toolName, tool_kind: kind, input, result, status: typeof result === "object" && result && "ok" in result && !(result as { ok: boolean }).ok ? "failed" : "succeeded", latency_ms: Date.now() - started });
}

async function completeRun(ctx: AgentServerContext, runId: string, started: number, response: AgentReply, steps: number) {
  await ctx.supabase.from("ai_agent_runs").update({ status: response.status === "error" ? "failed" : response.status, step_count: Math.min(steps, MAX_STEPS), latency_ms: Date.now() - started, completed_at: new Date().toISOString() }).eq("id", runId).eq("user_id", ctx.userId);
  return response;
}

async function completeRunWithMessage(ctx: AgentServerContext, runId: string, started: number, response: AgentReply, steps: number) {
  await addMessage(ctx, response.conversationId, "assistant", response.message, { status: response.status });
  return completeRun(ctx, runId, started, response, steps);
}

function enrichDraft(previous: PromotionDraft | undefined, message: string, entities: Record<string, unknown>, venue: { id: string; name: string } | undefined, products: Array<{ id: string; name: string; priceCop: number }>): PromotionDraft {
  const draft: PromotionDraft = { productIds: [], products: [], ...previous };
  if (venue) { draft.venueId = venue.id; draft.venueName = venue.name; }
  const normalized = normalize(message);
  const entityQuery = cleanText(entities.product ?? entities.productName, 100);
  const matched = products.filter((product) => {
    const productName = normalize(product.name);
    return (entityQuery && productName.includes(normalize(entityQuery))) || productName.split(/\s+/).some((word) => word.length >= 4 && normalized.includes(word));
  });
  if (matched.length) {
    draft.products = matched.slice(0, 10).map(({ id, name, priceCop }) => ({ id, name, priceCop }));
    draft.productIds = draft.products.map((product) => product.id);
  }
  const percentage = message.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (percentage) { draft.mechanic = "percentage"; draft.benefit = Number(percentage[1].replace(",", ".")); }
  const quantities = parseBuyXGetY(message);
  if (quantities) { draft.mechanic = "buy_x_get_y"; draft.buyQuantity = quantities.buyQuantity; draft.getQuantity = quantities.getQuantity; }
  if (/\bprecio especial\b/.test(normalized)) draft.mechanic = "fixed_price";
  if (/\bdescuento\b/.test(normalized) && !draft.mechanic) draft.mechanic = "percentage";
  const money = message.match(/\$?\s*(\d{2,}(?:[.,]\d{3})*)\s*(?:cop|pesos)?/i);
  if (money && draft.mechanic && draft.mechanic !== "percentage" && draft.mechanic !== "buy_x_get_y") draft.benefit = Number(money[1].replace(/[.,]/g, ""));
  const entityMechanic = cleanText(entities.mechanic, 30) as PromotionMechanic;
  if (["percentage", "fixed_amount", "buy_x_get_y", "fixed_price"].includes(entityMechanic)) draft.mechanic = entityMechanic;
  const entityBenefit = Number(entities.benefit);
  if (Number.isFinite(entityBenefit) && entityBenefit > 0) draft.benefit = entityBenefit;
  const entityBuyQuantity = Number(entities.buyQuantity); const entityGetQuantity = Number(entities.getQuantity);
  if (draft.mechanic === "buy_x_get_y" && Number.isInteger(entityBuyQuantity) && entityBuyQuantity > 0 && Number.isInteger(entityGetQuantity) && entityGetQuantity > 0) {
    draft.buyQuantity = entityBuyQuantity; draft.getQuantity = entityGetQuantity;
  }
  const window = parseWindow(message, entities, previous?.startsAt);
  if (window.startsAt) draft.startsAt = window.startsAt;
  if (window.endsAt) draft.endsAt = window.endsAt;
  const productLabel = draft.products.map((product) => product.name).join(", ");
  if (productLabel) {
    draft.title ||= `${draft.products[0].name} · Noche especial`;
    draft.description ||= `Promoción especial para impulsar ${productLabel} en ${draft.venueName}.`;
    draft.terms ||= "Sujeto a disponibilidad. No acumulable con otras promociones.";
  }
  return draft;
}

function nextQuestion(draft: PromotionDraft, venueCount: number) {
  if (!draft.venueId) return { title: "Selecciona una sede", message: venueCount ? "¿En cuál establecimiento quieres crear la promoción?" : "Tu organización no tiene establecimientos activos disponibles.", actions: [] };
  if (!draft.productIds.length) return { title: "Producto", message: "¿Qué producto del menú quieres impulsar? Escríbeme su nombre tal como aparece en tu catálogo.", actions: [] };
  if (!draft.mechanic) return { title: "Tipo de incentivo", message: "¿Qué tipo de incentivo quieres ofrecer?", actions: ["20% de descuento", "2x1", "Precio especial"] };
  if (draft.mechanic !== "buy_x_get_y" && !draft.benefit) return { title: "Valor del incentivo", message: draft.mechanic === "percentage" ? "¿Qué porcentaje de descuento quieres ofrecer?" : "¿Cuál será el valor en pesos?", actions: draft.mechanic === "percentage" ? ["10%", "15%", "20%"] : [] };
  if (!draft.startsAt) return { title: "Fecha y horario", message: "¿Qué día y a qué hora comienza? Por ejemplo: “este viernes a las 6:00 p. m.”", actions: [] };
  if (!draft.endsAt) return { title: "Hora de cierre", message: "¿Hasta qué hora estará vigente la promoción?", actions: [] };
  return null;
}

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO"); }
function reply(conversationId: string, runId: string, status: AgentReply["status"], message: string, cards: AgentReply["cards"]): AgentReply { return { conversationId, runId, status, message, cards }; }
function failReply(conversationId: string, message: string, runId?: string): AgentReply { return { conversationId, runId, status: "error", message, cards: [{ type: "error", title: "No pude completar la acción", detail: message }] }; }
function friendlyToolError(value: string) { return value.includes("ALREADY_USED") ? "Esta confirmación ya fue utilizada." : value.includes("EXPIRED") ? "La confirmación expiró. Genera una nueva propuesta." : value; }

export class OrchestratorError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
