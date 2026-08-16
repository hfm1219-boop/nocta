import type { BusinessType, OrganizationRole, PrincipalRole } from "@/lib/auth/roles";

export type OrganizationAccess = {
  id: string;
  name: string;
  slug: string;
  businessType: BusinessType | null;
  membershipStatus: "invited" | "active" | "suspended";
  contexts: PrincipalRole[];
  roles: Array<{ context: PrincipalRole; role: OrganizationRole; venueId: string | null }>;
};

export type AccessContext = {
  user: { id: string; fullName: string; status: "active" | "suspended" | "invited" };
  globalRoles: PrincipalRole[];
  organizations: OrganizationAccess[];
  activeContext: { organizationId: string | null; organizationName: string | null; role: PrincipalRole } | null;
};

export function routeForContext(context: AccessContext | null | undefined) {
  switch (context?.activeContext?.role) {
    case "nocta_admin": return "/super";
    case "establishment": return "/admin";
    case "promoter": return "/promotor";
    case "brand_distributor": return "/marca";
    default: return "/";
  }
}

export function safeNextPath(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : null;
}

export function availableContexts(context: AccessContext) {
  const available: Array<{ organizationId: string | null; organizationName: string | null; role: PrincipalRole }> = [];
  if (context.globalRoles.includes("consumer")) available.push({ organizationId: null, organizationName: null, role: "consumer" });
  if (context.globalRoles.includes("nocta_admin")) available.push({ organizationId: null, organizationName: "NOCTA", role: "nocta_admin" });
  for (const organization of context.organizations.filter((item) => item.membershipStatus === "active")) for (const role of organization.contexts) {
    if (["establishment", "promoter", "brand_distributor"].includes(role)) available.push({ organizationId: organization.id, organizationName: organization.name, role });
  }
  return available;
}
