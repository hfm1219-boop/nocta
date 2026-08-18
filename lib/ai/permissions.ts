import type { AgentContext } from "@/lib/ai/types";

export function canUsePromotionWrites(context: Pick<AgentContext, "role" | "organizationId" | "manageableVenueIds">, venueId: string) {
  return context.role === "establishment" && Boolean(context.organizationId) && (context.manageableVenueIds === null || context.manageableVenueIds.includes(venueId));
}
