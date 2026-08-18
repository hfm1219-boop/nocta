import type { AgentServerContext } from "@/lib/ai/context";
import type { PromotionDraft, PromotionMutationDraft, ToolResult } from "@/lib/ai/types";
import { validatePromotionDraft } from "@/lib/ai/validation";

export type VenueRecord = { id: string; name: string; city: string };
export type ProductRecord = { id: string; name: string; description: string; priceCop: number };

function errorResult(code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL", error: string): ToolResult<never> { return { ok: false, code, error }; }

function venueAllowed(ctx: AgentServerContext, venueId: string) { return ctx.manageableVenueIds === null || ctx.manageableVenueIds.includes(venueId); }

export async function listEstablishments(ctx: AgentServerContext): Promise<ToolResult<VenueRecord[]>> {
  let query = ctx.supabase.from("venues").select("id,name,city").eq("organization_id", ctx.organizationId).eq("active", true).order("name");
  if (ctx.manageableVenueIds) query = query.in("id", ctx.manageableVenueIds);
  const { data, error } = await query;
  if (error) return errorResult("INTERNAL", error.message);
  return { ok: true, data: (data ?? []).map((row) => ({ id: row.id, name: row.name, city: row.city })) };
}
export async function searchProducts(ctx: AgentServerContext, venueId: string, query = ""): Promise<ToolResult<ProductRecord[]>> {
  if (!venueAllowed(ctx, venueId)) return errorResult("FORBIDDEN", "No puedes administrar este establecimiento.");
  const venue = await ctx.supabase.from("venues").select("id").eq("id", venueId).eq("organization_id", ctx.organizationId).maybeSingle();
  if (!venue.data) return errorResult("NOT_FOUND", "El establecimiento no pertenece a la organización activa.");
  let builder = ctx.supabase.from("venue_menu_items").select("id,name,description,price_cop").eq("venue_id", venueId).eq("available", true).order("name").limit(100);
  if (query.trim()) builder = builder.ilike("name", `%${query.trim().replaceAll("%", "")}%`);
  const { data, error } = await builder;
  if (error) return errorResult("INTERNAL", error.message);
  return { ok: true, data: (data ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description ?? "", priceCop: row.price_cop })) };
}

export async function listActivePromotions(ctx: AgentServerContext, venueId: string) {
  if (!venueAllowed(ctx, venueId)) return errorResult("FORBIDDEN", "No puedes administrar este establecimiento.");
  const { data, error } = await ctx.supabase.from("promotions").select("id,title,starts_at,ends_at,active").eq("venue_id", venueId).eq("active", true).order("starts_at", { ascending: false }).limit(50);
  if (error) return errorResult("INTERNAL", error.message);
  return { ok: true as const, data: data ?? [] };
}

export async function listManageablePromotions(ctx: AgentServerContext, venueId: string) {
  if (!venueAllowed(ctx, venueId)) return errorResult("FORBIDDEN", "No puedes administrar este establecimiento.");
  const { data, error } = await ctx.supabase.from("promotions").select("id,title,starts_at,ends_at,active,promotion_rules(mechanic,percentage_off,fixed_amount_cop,buy_quantity,get_quantity,fixed_price_cop)").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(100);
  if (error) return errorResult("INTERNAL", error.message);
  return { ok: true as const, data: data ?? [] };
}

export async function preparePromotionMutation(ctx: AgentServerContext, conversationId: string, draft: PromotionMutationDraft): Promise<ToolResult<{ confirmationId: string; expiresAt: string }>> {
  if (!venueAllowed(ctx, draft.venueId)) return errorResult("FORBIDDEN", "No puedes administrar este establecimiento.");
  const { data, error } = await ctx.supabase.rpc("prepare_agent_promotion_mutation", { target_conversation: conversationId, target_promotion: draft.promotionId, mutation_action: draft.action, mutation_payload: draft });
  if (error || !data) return errorResult(error?.message.includes("FORBIDDEN") ? "FORBIDDEN" : "INVALID_INPUT", error?.message ?? "No fue posible preparar el cambio.");
  return { ok: true, data: { confirmationId: data as string, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}

export async function executePromotionMutation(ctx: AgentServerContext, confirmationId: string): Promise<ToolResult<{ promotionId: string; action: string; href: string }>> {
  const { data, error } = await ctx.supabase.rpc("execute_confirmed_agent_promotion_mutation", { target_confirmation: confirmationId });
  if (error || !data) return errorResult(error?.message.includes("FORBIDDEN") ? "FORBIDDEN" : error?.message.includes("ALREADY_USED") || error?.message.includes("EXPIRED") ? "CONFLICT" : "INVALID_INPUT", error?.message ?? "No fue posible aplicar el cambio.");
  const result = data as { promotionId: string; action: string };
  return { ok: true, data: { ...result, href: "/admin/promociones" } };
}

export async function validatePromotion(ctx: AgentServerContext, draft: PromotionDraft): Promise<ToolResult<PromotionDraft>> {
  if (!draft.venueId || !venueAllowed(ctx, draft.venueId)) return errorResult("FORBIDDEN", "Establecimiento no autorizado.");
  const products = await searchProducts(ctx, draft.venueId);
  if (!products.ok) return products;
  const errors = validatePromotionDraft(draft, new Set(products.data.map((item) => item.id)));
  if (errors.length) return errorResult("INVALID_INPUT", errors.join(" "));
  return { ok: true, data: draft };
}

export async function preparePromotionConfirmation(ctx: AgentServerContext, conversationId: string, draft: PromotionDraft): Promise<ToolResult<{ confirmationId: string; expiresAt: string }>> {
  const valid = await validatePromotion(ctx, draft);
  if (!valid.ok) return valid;
  const { data, error } = await ctx.supabase.rpc("prepare_agent_promotion", { target_conversation: conversationId, promotion_payload: draft });
  if (error || !data) return errorResult(error?.message.includes("FORBIDDEN") ? "FORBIDDEN" : "INVALID_INPUT", error?.message ?? "No fue posible preparar la confirmación.");
  return { ok: true, data: { confirmationId: data as string, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}

export async function createPromotion(ctx: AgentServerContext, confirmationId: string): Promise<ToolResult<{ promotionId: string; href: string }>> {
  const { data, error } = await ctx.supabase.rpc("execute_confirmed_agent_promotion", { target_confirmation: confirmationId });
  if (error || !data) {
    const code = error?.message.includes("FORBIDDEN") ? "FORBIDDEN" : error?.message.includes("ALREADY_USED") || error?.message.includes("EXPIRED") ? "CONFLICT" : "INVALID_INPUT";
    return errorResult(code, error?.message ?? "No fue posible crear la promoción.");
  }
  return { ok: true, data: { promotionId: data as string, href: "/admin/promociones" } };
}
