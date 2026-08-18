import type { ToolKind } from "@/lib/ai/types";

export type ToolDefinition = {
  name: string;
  description: string;
  kind: ToolKind;
  inputSchema: Record<string, unknown>;
  requiredCapability?: string;
};

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  { name: "get_current_user", description: "Obtiene la identidad y el rol activos.", kind: "READ", inputSchema: { type: "object", additionalProperties: false } },
  { name: "get_current_organization", description: "Obtiene la organización activa.", kind: "READ", inputSchema: { type: "object", additionalProperties: false } },
  { name: "list_establishments", description: "Lista establecimientos administrables de la organización activa.", kind: "READ", requiredCapability: "venue.manage", inputSchema: { type: "object", additionalProperties: false } },
  { name: "search_products", description: "Busca productos reales y disponibles del menú de una sede.", kind: "READ", requiredCapability: "venue.manage", inputSchema: { type: "object", additionalProperties: false, properties: { venueId: { type: "string", format: "uuid" }, query: { type: "string", minLength: 1 } }, required: ["venueId", "query"] } },
  { name: "list_active_promotions", description: "Lista promociones de una sede.", kind: "READ", requiredCapability: "venue.manage", inputSchema: { type: "object", additionalProperties: false, properties: { venueId: { type: "string", format: "uuid" } }, required: ["venueId"] } },
  { name: "draft_promotion", description: "Construye una propuesta sin modificar datos.", kind: "DRAFT", requiredCapability: "venue.manage", inputSchema: { type: "object", additionalProperties: false } },
  { name: "validate_promotion", description: "Valida catálogo, horario y mecánica sin modificar datos.", kind: "DRAFT", requiredCapability: "venue.manage", inputSchema: { type: "object", additionalProperties: false } },
  { name: "create_promotion", description: "Crea promoción y reglas tras consumir una confirmación explícita válida.", kind: "WRITE", requiredCapability: "venue.manage", inputSchema: { type: "object", additionalProperties: false, properties: { confirmationId: { type: "string", format: "uuid" } }, required: ["confirmationId"] } },
] as const;

export function getTool(name: string) { return TOOL_REGISTRY.find((tool) => tool.name === name); }
