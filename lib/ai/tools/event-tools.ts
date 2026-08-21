import type { AgentServerContext } from "@/lib/ai/context";
import type { EventDraft, ToolResult } from "@/lib/ai/types";

function errorResult(code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL", error: string): ToolResult<never> { return { ok: false, code, error }; }

export async function prepareEventConfirmation(ctx: AgentServerContext, conversationId: string, draft: EventDraft): Promise<ToolResult<{ confirmationId: string; expiresAt: string }>> {
  const { data, error } = await ctx.supabase.rpc("prepare_agent_event", { target_conversation: conversationId, event_payload: draft });
  if (error || !data) return errorResult(error?.message.includes("FORBIDDEN") ? "FORBIDDEN" : "INVALID_INPUT", error?.message ?? "No fue posible preparar el evento.");
  return { ok: true, data: { confirmationId: data as string, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}

export async function createEvent(ctx: AgentServerContext, confirmationId: string): Promise<ToolResult<{ eventId: string; externalKey: string; href: string }>> {
  const { data, error } = await ctx.supabase.rpc("execute_confirmed_agent_event", { target_confirmation: confirmationId });
  if (error || !data) return errorResult(error?.message.includes("FORBIDDEN") ? "FORBIDDEN" : error?.message.includes("ALREADY_USED") || error?.message.includes("EXPIRED") ? "CONFLICT" : "INVALID_INPUT", error?.message ?? "No fue posible crear el evento.");
  const result = data as { eventId: string; externalKey: string };
  return { ok: true, data: { ...result, href: "/admin/eventos" } };
}
