export const APP_ROLES = [
  "platform_owner",
  "platform_support",
  "venue_owner",
  "venue_admin",
  "organizer",
  "promoter",
  "door_staff",
  "reservation_host",
  "cashier",
  "bartender",
  "waiter",
  "dj",
  "analyst",
  "customer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const PRINCIPAL_ROLES = ["consumer", "establishment", "promoter", "brand_distributor", "nocta_admin"] as const;
export const ORGANIZATION_ROLES = ["owner", "admin", "member", "establishment_admin", "bar", "waiter", "cashier"] as const;
export const BUSINESS_TYPES = ["manufacturer", "importer", "distributor", "brand_owner", "representative", "mixed"] as const;
export type PrincipalRole = (typeof PRINCIPAL_ROLES)[number];
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const PRINCIPAL_ROLE_LABELS: Record<PrincipalRole, string> = {
  consumer: "Consumidor",
  establishment: "Establecimiento",
  promoter: "Promotor",
  brand_distributor: "Marca / distribuidor",
  nocta_admin: "Administrador NOCTA",
};

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Propietario de organización",
  admin: "Administrador de organización",
  member: "Miembro",
  establishment_admin: "Administrador de establecimiento",
  bar: "Barra",
  waiter: "Mesero",
  cashier: "Caja",
};

type RouteRole = AppRole | PrincipalRole;
export const ROUTE_ROLES: ReadonlyArray<{ prefix: string; roles: readonly RouteRole[] }> = [
  { prefix: "/super", roles: ["platform_owner"] },
  { prefix: "/admin", roles: ["venue_owner", "venue_admin"] },
  { prefix: "/promotor", roles: ["promoter", "organizer", "platform_owner"] },
  { prefix: "/marca", roles: ["brand_distributor", "platform_owner"] },
  { prefix: "/acceso", roles: ["door_staff", "venue_owner", "venue_admin", "organizer"] },
  { prefix: "/accesos", roles: ["promoter", "organizer", "venue_owner", "venue_admin", "door_staff", "reservation_host", "cashier", "bartender", "waiter", "dj"] },
  { prefix: "/reservas", roles: ["reservation_host", "venue_owner", "venue_admin", "organizer"] },
  { prefix: "/barra", roles: ["bartender", "cashier", "venue_owner", "venue_admin"] },
  { prefix: "/mesero", roles: ["waiter", "venue_owner", "venue_admin"] },
  { prefix: "/dj", roles: ["dj", "venue_owner", "venue_admin"] },
];

export const ROLE_LABELS: Record<AppRole, string> = {
  platform_owner: "Propietario NOCTA",
  platform_support: "Soporte NOCTA",
  venue_owner: "Propietario de establecimiento",
  venue_admin: "Administrador de establecimiento",
  organizer: "Organizador",
  promoter: "Promotor independiente",
  door_staff: "Puerta / acceso",
  reservation_host: "Reservas",
  cashier: "Cajero",
  bartender: "Barra",
  waiter: "Mesero",
  dj: "DJ",
  analyst: "Analista",
  customer: "Consumidor",
};

export function rolesParaRuta(pathname: string) {
  const roles = ROUTE_ROLES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.roles;
  return roles && !roles.includes("platform_owner") ? ["platform_owner" as RouteRole, ...roles] : roles;
}
