import type { AgentServerContext } from "@/lib/ai/context";
import { parseBuyXGetY, parseWindow, preservePromotionFlow, startsNewPromotion } from "@/lib/ai/conversation";
import { fallbackIntent, routeIntent } from "@/lib/ai/intent-router";
import type { AgentReply, PromotionDraft, PromotionEngineDraft, PromotionMechanic, PromotionMutationAction, PromotionMutationDraft } from "@/lib/ai/types";
import { cleanText, isUuid } from "@/lib/ai/validation";
import { createPromotion, executePromotionEngineConfiguration, executePromotionMutation, getPromotionEngineCatalog, listActivePromotions, listEstablishments, listManageablePromotions, preparePromotionConfirmation, preparePromotionEngineConfiguration, preparePromotionMutation, searchProducts } from "@/lib/ai/tools/promotion-tools";

const MAX_STEPS = 8;
type ConversationState = { intent?: string; promotionId?: string; action?: string; promotionDraft?: PromotionDraft; mutationDraft?: PromotionMutationDraft; pendingMutationAction?: PromotionMutationAction; engineDraft?: PromotionEngineDraft };

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
  let state = conversation.state;
  const resetForNewPromotion = startsNewPromotion(message);
  if (resetForNewPromotion) {
    const { error } = await ctx.supabase.rpc("reset_agent_promotion_flow", { target_conversation: conversation.id });
    if (error) throw new OrchestratorError("CONVERSATION_RESET_FAILED", 500, "No fue posible iniciar la nueva promoción.");
    state = {};
  }
  const venue = requestedVenue ?? venues.find((item) => item.id === state.promotionDraft?.venueId) ?? (venues.length === 1 ? venues[0] : undefined);
  const productResult = venue ? await searchProducts(ctx, venue.id) : { ok: true as const, data: [] };
  if (!productResult.ok) return failReply(conversation.id, productResult.error);
  let intent;
  try {
    intent = await routeIntent(message, { now: new Date().toISOString(), venueName: venue?.name, products: productResult.data.map(({ id, name }) => ({ id, name })), currentDraft: state.promotionDraft });
  } catch {
    intent = fallbackIntent(message);
  }
  if (resetForNewPromotion) intent = { ...intent, intent: "CREATE_PROMOTION" as const, confidence: 1 };
  intent = preservePromotionFlow(state, intent);
  if (state.intent === "UPDATE_PROMOTION" && intent.intent !== "LIST_PROMOTIONS") intent = { ...intent, intent: "UPDATE_PROMOTION", confidence: Math.max(intent.confidence, 0.9) };
  if (state.intent === "CONFIGURE_PROMOTION_ENGINE") intent = { ...intent, intent: "CONFIGURE_PROMOTION_ENGINE", confidence: Math.max(intent.confidence, 0.95) };
  const run = await startRun(ctx, conversation.id, intent.intent);

  if (intent.intent === "LIST_PROMOTIONS") {
    if (!venue) return completeRunWithMessage(ctx, run.id, started, reply(conversation.id, run.id, "needs_input", "¿De cuál establecimiento quieres consultar las promociones?", []), 2);
    const promotions = await listActivePromotions(ctx, venue.id);
    await recordTool(ctx, run.id, "list_active_promotions", "READ", { venueId: venue.id }, promotions, started);
    if (!promotions.ok) return completeRun(ctx, run.id, started, failReply(conversation.id, promotions.error, run.id), 2);
    const text = promotions.data.length ? `Tienes ${promotions.data.length} ${promotions.data.length === 1 ? "promoción activa" : "promociones activas"}: ${promotions.data.map((item) => item.title).join(", ")}.` : `No hay promociones activas en ${venue.name}.`;
    return completeRunWithMessage(ctx, run.id, started, reply(conversation.id, run.id, "completed", text, [{ type: "tool_result", title: "Promociones activas", detail: text, href: "/admin/promociones" }]), 2);
  }

  if (intent.intent === "UPDATE_PROMOTION") return handlePromotionMutation(ctx, conversation, run.id, started, message, intent.entities, venue);
  if (intent.intent === "CONFIGURE_PROMOTION_ENGINE") return handlePromotionEngine(ctx, conversation, run.id, started, message, venue);

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
  const isMutation = conversation.state.intent === "UPDATE_PROMOTION";
  const isEngine = conversation.state.intent === "CONFIGURE_PROMOTION_ENGINE";
  const run = await startRun(ctx, conversation.id, isEngine ? "CONFIGURE_PROMOTION_ENGINE" : isMutation ? "UPDATE_PROMOTION" : "CREATE_PROMOTION");
  if (isEngine) {
    const result = await executePromotionEngineConfiguration(ctx, input.confirmationId);
    await recordTool(ctx, run.id, "configure_promotion_engine", "WRITE", { confirmationId: input.confirmationId }, result, started);
    if (!result.ok) return completeRun(ctx, run.id, started, failReply(conversation.id, friendlyToolError(result.error), run.id), 1);
    const message = result.data.mappingVerified ? "El mapping, la regla y la atribución quedaron configurados." : "El mapping quedó propuesto. La regla atribuible se activará cuando la marca apruebe el mapping.";
    await addMessage(ctx, conversation.id, "assistant", message, { promotionId: result.data.promotionId, status: result.data.status });
    return completeRun(ctx, run.id, started, reply(conversation.id, run.id, "completed", message, [{ type: "tool_result", title: result.data.mappingVerified ? "Motor configurado" : "Mapping pendiente de marca", detail: message, href: result.data.href }]), 1);
  }
  if (isMutation) {
    const result = await executePromotionMutation(ctx, input.confirmationId);
    await recordTool(ctx, run.id, conversation.state.mutationDraft?.action ?? "update_promotion", "WRITE", { confirmationId: input.confirmationId }, result, started);
    if (!result.ok) return completeRun(ctx, run.id, started, failReply(conversation.id, friendlyToolError(result.error), run.id), 1);
    const message = mutationSuccessMessage(result.data.action);
    await addMessage(ctx, conversation.id, "assistant", message, { promotionId: result.data.promotionId });
    return completeRun(ctx, run.id, started, reply(conversation.id, run.id, "completed", message, [{ type: "tool_result", title: "Promoción actualizada", detail: `ID: ${result.data.promotionId}`, href: result.data.href }]), 1);
  }
  const result = await createPromotion(ctx, input.confirmationId);
  await recordTool(ctx, run.id, "create_promotion", "WRITE", { confirmationId: input.confirmationId }, result, started);
  if (!result.ok) return completeRun(ctx, run.id, started, failReply(conversation.id, friendlyToolError(result.error), run.id), 1);
  const message = "La promoción fue creada y activada correctamente mediante el motor real de NOCTA.";
  await addMessage(ctx, conversation.id, "assistant", message, { promotionId: result.data.promotionId });
  return completeRun(ctx, run.id, started, reply(conversation.id, run.id, "completed", message, [{ type: "tool_result", title: "Promoción creada", detail: `ID: ${result.data.promotionId}`, href: result.data.href }]), 1);
}

async function handlePromotionEngine(ctx: AgentServerContext, conversation: { id: string; state: ConversationState }, runId: string, started: number, message: string, venue?: { id: string; name: string }) {
  if (!venue) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", "¿En cuál establecimiento quieres configurar el motor de la promoción?", []), 2);
  const result = await getPromotionEngineCatalog(ctx, venue.id);
  await recordTool(ctx, runId, "get_promotion_engine_catalog", "READ", { venueId: venue.id }, result.ok ? { ok: true, promotions: result.data.promotions.length, products: result.data.menuItems.length, skus: result.data.brandProducts.length, activations: result.data.activations.length } : result, started);
  if (!result.ok) return completeRun(ctx, runId, started, failReply(conversation.id, result.error, runId), 2);
  const catalog = result.data; let draft = conversation.state.engineDraft;
  if (!draft) {
    const promotion = catalog.promotions.find((item) => item.id === conversation.state.promotionId) ?? matchNamed(message, catalog.promotions, (item) => item.title);
    if (!promotion) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", "¿Qué promoción quieres configurar?", [{ type: "suggestion", title: "Promociones", actions: catalog.promotions.slice(0, 8).map((item) => item.title) }]), 3);
    const relation = Array.isArray(promotion.promotion_rules) ? promotion.promotion_rules[0] : promotion.promotion_rules;
    const rule = relation as Record<string, unknown> | null;
    draft = { promotionId: promotion.id, promotionTitle: promotion.title, venueId: venue.id, mechanic: String(rule?.mechanic ?? "percentage") as PromotionMechanic, benefit: Number(rule?.percentage_off ?? rule?.fixed_amount_cop ?? rule?.fixed_price_cop) || undefined, buyQuantity: Number(rule?.buy_quantity) || undefined, getQuantity: Number(rule?.get_quantity) || undefined, minimumQuantity: Number(rule?.minimum_quantity) || 1, minimumSpendCop: Number(rule?.minimum_spend_cop) || 0, maximumDiscountCop: Number(rule?.maximum_discount_cop) || undefined, perUserLimit: Number(rule?.per_user_limit) || undefined, totalLimit: Number(rule?.total_redemption_limit) || undefined, budgetCop: Number(rule?.budget_cop) || undefined, timeStart: typeof rule?.local_time_start === "string" ? rule.local_time_start : undefined, timeEnd: typeof rule?.local_time_end === "string" ? rule.local_time_end : undefined, weekdays: Array.isArray(rule?.weekdays) ? rule.weekdays as number[] : [0,1,2,3,4,5,6], priority: Number(rule?.priority) || 100, stackable: Boolean(rule?.stackable) };
    const items = Array.isArray(rule?.promotion_rule_items) ? rule.promotion_rule_items as Array<{ venue_menu_item_id?: string; brand_product_id?: string }> : [];
    const linked = items[0]; if (linked?.venue_menu_item_id) draft.menuItemId = linked.venue_menu_item_id; if (linked?.brand_product_id) draft.brandProductId = linked.brand_product_id;
  }
  const menuItem = catalog.menuItems.find((item) => item.id === draft?.menuItemId) ?? matchNamed(message, catalog.menuItems, (item) => item.name);
  if (menuItem) { draft.menuItemId = menuItem.id; draft.menuItemName = menuItem.name; }
  const brandProduct = catalog.brandProducts.find((item) => item.id === draft?.brandProductId) ?? matchNamed(message, catalog.brandProducts, (item) => `${item.brandName} ${item.sku} ${item.name}`);
  if (brandProduct) { draft.brandProductId = brandProduct.id; draft.brandProductName = `${brandProduct.brandName} · ${brandProduct.name}`; draft.brandSku = brandProduct.sku; }
  const activation = catalog.activations.find((item) => item.id === draft?.activationId) ?? matchNamed(message, catalog.activations, (item) => `${item.brandName} ${item.campaignName} ${item.name}`) ?? (catalog.activations.length === 1 ? catalog.activations[0] : undefined);
  if (activation) { draft.activationId = activation.id; draft.activationName = `${activation.campaignName} · ${activation.name}`; }
  const composition = normalize(message).match(/(\d+(?:[.,]\d+)?)\s*(ml|g|gramos?|unidades?|porciones?)/);
  if (composition) { draft.brandQuantity = Number(composition[1].replace(",", ".")); draft.brandUnit = composition[2].startsWith("ml") ? "ml" : composition[2].startsWith("g") ? "g" : composition[2].startsWith("unidad") ? "unit" : "serving"; }
  const minSpend = message.match(/(?:compra|minimo|mínimo)[^\d]{0,12}\$?\s*(\d{3,}(?:[.,]\d{3})*)/i); if (minSpend) draft.minimumSpendCop = Number(minSpend[1].replace(/[.,]/g, ""));
  const perUser = message.match(/(?:por usuario|por persona)[^\d]{0,8}(\d+)/i); if (perUser) draft.perUserLimit = Number(perUser[1]);
  await updateConversation(ctx, conversation.id, { intent: "CONFIGURE_PROMOTION_ENGINE", engineDraft: draft }, venue.id);
  if (!draft.menuItemId) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", `¿Qué producto del menú corresponde a “${draft.promotionTitle}”?`, [{ type: "suggestion", title: "Productos del menú", actions: catalog.menuItems.slice(0, 8).map((item) => item.name) }]), 3);
  if (!draft.brandProductId) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", "¿Qué SKU de marca se consume con ese producto?", [{ type: "suggestion", title: "SKU de marca", actions: catalog.brandProducts.slice(0, 8).map((item) => `${item.brandName} · ${item.sku} · ${item.name}`) }]), 3);
  if (!draft.brandQuantity || !draft.brandUnit) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", `¿Qué cantidad de ${draft.brandProductName} consume cada ${draft.menuItemName}? Por ejemplo: “45 ml”.`, []), 3);
  if (!draft.activationId) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", "¿A qué campaña y activación debemos atribuir el sell-out?", [{ type: "suggestion", title: "Activaciones", actions: catalog.activations.slice(0, 8).map((item) => `${item.brandName} · ${item.campaignName} · ${item.name}`) }]), 3);
  const prepared = await preparePromotionEngineConfiguration(ctx, conversation.id, draft);
  await recordTool(ctx, runId, "validate_promotion_engine", "DRAFT", { draft }, prepared, started);
  if (!prepared.ok) return completeRun(ctx, runId, started, failReply(conversation.id, prepared.error, runId), 4);
  const text = prepared.data.mappingVerified ? "El mapping ya está verificado. Preparé la regla y la atribución para confirmar." : "Preparé el mapping y la regla. La atribución quedará pendiente hasta la aprobación de la marca.";
  await addMessage(ctx, conversation.id, "assistant", text, { confirmationId: prepared.data.confirmationId });
  return completeRun(ctx, runId, started, reply(conversation.id, runId, "needs_confirmation", text, [{ type: "promotion_engine_preview", confirmationId: prepared.data.confirmationId, draft, mappingVerified: prepared.data.mappingVerified, expiresAt: prepared.data.expiresAt }, { type: "confirmation", confirmationId: prepared.data.confirmationId, prompt: "¿Confirmas esta configuración del motor?" }]), 4);
}

async function handlePromotionMutation(ctx: AgentServerContext, conversation: { id: string; state: ConversationState }, runId: string, started: number, message: string, entities: Record<string, unknown>, venue?: { id: string; name: string }) {
  if (!venue) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", "¿En cuál establecimiento quieres administrar la promoción?", []), 2);
  const result = await listManageablePromotions(ctx, venue.id);
  await recordTool(ctx, runId, "list_manageable_promotions", "READ", { venueId: venue.id }, result.ok ? { ok: true, count: result.data.length } : result, started);
  if (!result.ok) return completeRun(ctx, runId, started, failReply(conversation.id, result.error, runId), 2);
  let draft = conversation.state.mutationDraft;
  if (!draft) {
    const action = conversation.state.pendingMutationAction ?? detectMutationAction(message, entities);
    const target = result.data.find((item) => item.id === conversation.state.promotionId) ?? matchPromotion(message, cleanText(entities.promotionTitle, 120), result.data);
    if (!target) {
      await updateConversation(ctx, conversation.id, { intent: "UPDATE_PROMOTION", pendingMutationAction: action }, venue.id);
      const names = result.data.slice(0, 8).map((item) => item.title);
      const text = names.length ? `¿Cuál promoción quieres ${actionLabel(action)}? Puedes elegir: ${names.join(", ")}.` : "No encontré promociones administrables en este establecimiento.";
      return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", text, names.length ? [{ type: "suggestion", title: "Promociones", actions: names }] : []), 3);
    }
    draft = { action, promotionId: target.id, title: target.title, venueId: venue.id, active: action === "reactivate_promotion" ? true : action === "pause_promotion" ? false : undefined };
  }
  const benefit = Number(entities.benefit) || Number(message.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/)?.[1]?.replace(",", "."));
  if (Number.isFinite(benefit) && benefit > 0) draft.benefit = benefit;
  const quantities = parseBuyXGetY(message);
  if (quantities) { draft.mechanic = "buy_x_get_y"; draft.buyQuantity = quantities.buyQuantity; draft.getQuantity = quantities.getQuantity; draft.benefit = undefined; }
  const window = parseWindow(message, entities, draft.startsAt);
  if (window.startsAt) draft.startsAt = window.startsAt; if (window.endsAt) draft.endsAt = window.endsAt;
  await updateConversation(ctx, conversation.id, { intent: "UPDATE_PROMOTION", mutationDraft: draft }, venue.id);
  if (draft.action === "update_promotion" && !draft.benefit && !draft.mechanic && !draft.startsAt && !draft.endsAt) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", `¿Qué quieres cambiar en “${draft.title}”? Por ejemplo: “cambia el descuento a 25%”, “pague 3 lleve 5” o “extiéndela este viernes de 6:00 p. m. a 11:00 p. m.”`, []), 3);
  if (draft.action === "duplicate_promotion" && (!draft.startsAt || !draft.endsAt)) return completeRunWithMessage(ctx, runId, started, reply(conversation.id, runId, "needs_input", `¿Qué día y horario tendrá la copia de “${draft.title}”?`, []), 3);
  const prepared = await preparePromotionMutation(ctx, conversation.id, draft);
  await recordTool(ctx, runId, "validate_promotion_mutation", "DRAFT", { draft }, prepared, started);
  if (!prepared.ok) return completeRun(ctx, runId, started, failReply(conversation.id, prepared.error, runId), 4);
  const text = `Preparé el cambio para “${draft.title}”. Revisa y confirma solo si está correcto.`;
  await addMessage(ctx, conversation.id, "assistant", text, { confirmationId: prepared.data.confirmationId });
  return completeRun(ctx, runId, started, reply(conversation.id, runId, "needs_confirmation", text, [{ type: "promotion_mutation_preview", confirmationId: prepared.data.confirmationId, draft, expiresAt: prepared.data.expiresAt }, { type: "confirmation", confirmationId: prepared.data.confirmationId, prompt: "¿Confirmas este cambio?" }]), 4);
}

function detectMutationAction(message: string, entities: Record<string, unknown>): PromotionMutationAction {
  const action = cleanText(entities.action, 20); const value = normalize(message);
  if (action === "pause" || /\b(pausa|pausar|desactiva)\b/.test(value)) return "pause_promotion";
  if (action === "reactivate" || /\b(reactiva|reactivar|activa)\b/.test(value)) return "reactivate_promotion";
  if (action === "duplicate" || /\b(duplica|duplicar|repite|repetir)\b/.test(value)) return "duplicate_promotion";
  return "update_promotion";
}

function matchPromotion(message: string, entityTitle: string, promotions: Array<{ id: string; title: string }>) {
  const query = normalize(entityTitle || message);
  const exact = promotions.filter((item) => query.includes(normalize(item.title)) || normalize(item.title).includes(query));
  if (exact.length === 1) return exact[0];
  const scored = promotions.map((item) => ({ item, score: normalize(item.title).split(/\s+/).filter((word) => word.length >= 4 && query.includes(word)).length })).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 && scored[0].score > (scored[1]?.score ?? -1) ? scored[0].item : undefined;
}
function matchNamed<T>(message: string, items: T[], label: (item: T) => string) {
  const query = normalize(message); const scored = items.map((item) => ({ item, score: normalize(label(item)).split(/\s+/).filter((word) => word.length >= 3 && query.includes(word)).length })).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 && scored[0].score > (scored[1]?.score ?? -1) ? scored[0].item : undefined;
}
function actionLabel(action: PromotionMutationAction) { return action === "pause_promotion" ? "pausar" : action === "reactivate_promotion" ? "reactivar" : action === "duplicate_promotion" ? "duplicar" : "editar"; }
function mutationSuccessMessage(action: string) { return action === "pause_promotion" ? "La promoción quedó pausada." : action === "reactivate_promotion" ? "La promoción quedó activa nuevamente." : action === "duplicate_promotion" ? "La promoción fue duplicada y activada." : "La promoción fue actualizada correctamente."; }

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
