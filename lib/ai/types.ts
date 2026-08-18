import type { PrincipalRole } from "@/lib/auth/roles";

export const AGENT_INTENTS = [
  "CREATE_PROMOTION", "UPDATE_PROMOTION", "LIST_PROMOTIONS", "CREATE_EVENT",
  "UPDATE_EVENT", "CONFIGURE_PROMOTION_ENGINE", "BUSINESS_ANALYSIS", "GENERAL_QUESTION", "UNKNOWN",
] as const;

export type AgentIntentName = (typeof AGENT_INTENTS)[number];
export type ToolKind = "READ" | "DRAFT" | "WRITE";
export type PromotionMechanic = "percentage" | "fixed_amount" | "buy_x_get_y" | "fixed_price";

export type AgentIntent = {
  intent: AgentIntentName;
  confidence: number;
  entities: Record<string, unknown>;
  missingFields: string[];
};

export type AgentContext = {
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  role: PrincipalRole;
  manageableVenueIds: string[] | null;
};

export type PromotionDraft = {
  venueId?: string;
  venueName?: string;
  title?: string;
  description?: string;
  terms?: string;
  startsAt?: string;
  endsAt?: string;
  mechanic?: PromotionMechanic;
  benefit?: number;
  buyQuantity?: number;
  getQuantity?: number;
  productIds: string[];
  products: Array<{ id: string; name: string; priceCop: number }>;
  budgetCop?: number;
};

export type PromotionMutationAction = "update_promotion" | "pause_promotion" | "reactivate_promotion" | "duplicate_promotion";
export type PromotionMutationDraft = {
  action: PromotionMutationAction;
  promotionId: string;
  title: string;
  venueId: string;
  active?: boolean;
  mechanic?: PromotionMechanic;
  benefit?: number;
  buyQuantity?: number;
  getQuantity?: number;
  startsAt?: string;
  endsAt?: string;
};

export type PromotionEngineDraft = {
  promotionId: string;
  promotionTitle: string;
  venueId: string;
  menuItemId?: string;
  menuItemName?: string;
  brandProductId?: string;
  brandProductName?: string;
  brandSku?: string;
  brandQuantity?: number;
  brandUnit?: "unit" | "ml" | "g" | "serving";
  activationId?: string;
  activationName?: string;
  mechanic: PromotionMechanic;
  benefit?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minimumQuantity: number;
  minimumSpendCop: number;
  maximumDiscountCop?: number;
  perUserLimit?: number;
  totalLimit?: number;
  budgetCop?: number;
  timeStart?: string;
  timeEnd?: string;
  weekdays: number[];
  priority: number;
  stackable: boolean;
};

export type AgentCard =
  | { type: "promotion_preview"; confirmationId: string; draft: PromotionDraft; expiresAt: string }
  | { type: "promotion_mutation_preview"; confirmationId: string; draft: PromotionMutationDraft; expiresAt: string }
  | { type: "promotion_engine_preview"; confirmationId: string; draft: PromotionEngineDraft; mappingVerified: boolean; expiresAt: string }
  | { type: "tool_result"; title: string; detail: string; href?: string }
  | { type: "confirmation"; confirmationId: string; prompt: string }
  | { type: "suggestion"; title: string; actions: string[] }
  | { type: "error"; title: string; detail: string };

export type AgentReply = {
  conversationId: string;
  runId?: string;
  status: "needs_input" | "needs_confirmation" | "completed" | "error";
  message: string;
  cards: AgentCard[];
};

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL"; error: string };

export type AgentFlags = { enabled: boolean; writeActionsEnabled: boolean };
