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

export const ROUTE_ROLES: ReadonlyArray<{ prefix: string; roles: readonly AppRole[] }> = [
  { prefix: "/super", roles: ["platform_owner", "platform_support"] },
  { prefix: "/admin", roles: ["venue_owner", "venue_admin"] },
  { prefix: "/promotor", roles: ["promoter", "organizer", "platform_owner"] },
  { prefix: "/acceso", roles: ["door_staff", "venue_owner", "venue_admin", "organizer"] },
  { prefix: "/accesos", roles: ["promoter", "organizer", "venue_owner", "venue_admin", "door_staff", "reservation_host", "cashier", "bartender", "waiter", "dj"] },
  { prefix: "/reservas", roles: ["reservation_host", "venue_owner", "venue_admin", "organizer"] },
  { prefix: "/barra", roles: ["bartender", "cashier", "venue_owner", "venue_admin"] },
  { prefix: "/mesero", roles: ["waiter", "venue_owner", "venue_admin"] },
  { prefix: "/dj", roles: ["dj", "venue_owner", "venue_admin"] },
];

export function rolesParaRuta(pathname: string) {
  return ROUTE_ROLES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.roles;
}

