import type { AccessContext } from "@/lib/auth/context";
import type { AgentContext } from "@/lib/ai/types";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export type ServerSupabase = NonNullable<Awaited<ReturnType<typeof crearClienteSupabaseServidor>>>;

export type AgentServerContext = AgentContext & { supabase: ServerSupabase };

export async function getAgentServerContext(): Promise<AgentServerContext> {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) throw new AgentContextError("SUPABASE_NOT_CONFIGURED", 503, "Supabase no está configurado.");
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new AgentContextError("AUTH_REQUIRED", 401, "Inicia sesión para usar el asistente.");
  const { data, error } = await supabase.rpc("get_my_access_context");
  if (error || !data) throw new AgentContextError("ACCESS_CONTEXT_ERROR", 403, "No fue posible validar tu contexto de acceso.");
  const access = data as unknown as AccessContext;
  const active = access.activeContext;
  if (active?.role !== "establishment" || !active.organizationId) throw new AgentContextError("ESTABLISHMENT_CONTEXT_REQUIRED", 403, "Selecciona un contexto de establecimiento.");
  const organization = access.organizations.find((item) => item.id === active.organizationId && item.membershipStatus === "active");
  if (!organization) throw new AgentContextError("ORGANIZATION_FORBIDDEN", 403, "La organización activa no está disponible.");
  const roles = organization.roles.filter((item) => item.context === "establishment");
  const managesAll = roles.some((item) => ["owner", "admin"].includes(item.role) || (item.role === "establishment_admin" && !item.venueId));
  const manageableVenueIds = managesAll ? null : roles.filter((item) => item.role === "establishment_admin" && item.venueId).map((item) => item.venueId as string);
  if (!managesAll && !manageableVenueIds?.length) throw new AgentContextError("VENUE_MANAGE_FORBIDDEN", 403, "Tu rol no permite administrar promociones.");
  return { supabase, userId, userName: access.user.fullName, organizationId: organization.id, organizationName: organization.name, role: active.role, manageableVenueIds };
}

export class AgentContextError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
