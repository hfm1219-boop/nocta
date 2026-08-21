import { NextRequest } from "next/server";
import { AgentContextError, getAgentServerContext } from "@/lib/ai/context";
import { agentFlags } from "@/lib/ai/flags";
import { confirmAgentAction, handleAgentMessage, OrchestratorError } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";

export async function GET() {
  const flags = agentFlags();
  if (!flags.enabled) return Response.json({ enabled: false }, { status: 404 });
  try {
    const ctx = await getAgentServerContext();
    return Response.json({ enabled: true, writeActionsEnabled: flags.writeActionsEnabled, role: ctx.role, quickActions: ["Crear evento", "Crear promoción", "¿Qué promociones tengo activas?", "Configurar motor de una promoción"] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  const flags = agentFlags();
  if (!flags.enabled) return Response.json({ error: "El asistente no está habilitado." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const ctx = await getAgentServerContext();
    if (body.action === "confirm") {
      if (!flags.writeActionsEnabled) return Response.json({ error: "Las acciones de escritura del asistente están deshabilitadas." }, { status: 403 });
      const result = await confirmAgentAction(ctx, { conversationId: String(body.conversationId ?? ""), confirmationId: String(body.confirmationId ?? "") });
      return streamReply(result);
    }
    const result = await handleAgentMessage(ctx, { conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined, venueId: typeof body.venueId === "string" ? body.venueId : undefined, promotionId: typeof body.promotionId === "string" ? body.promotionId : undefined, message: String(body.message ?? "") });
    return streamReply(result);
  } catch (error) { return errorResponse(error); }
}

function streamReply(result: Awaited<ReturnType<typeof handleAgentMessage>>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(`${JSON.stringify({ type: "status", value: "processing" })}\n`));
    controller.enqueue(encoder.encode(`${JSON.stringify({ type: "result", value: result })}\n`));
    controller.close();
  } });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof AgentContextError || error instanceof OrchestratorError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  console.error("[nocta-agent] unhandled", error instanceof Error ? error.message : "unknown");
  return Response.json({ error: "El asistente encontró un error inesperado." }, { status: 500 });
}
