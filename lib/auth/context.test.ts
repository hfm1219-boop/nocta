import assert from "node:assert/strict";
import test from "node:test";
import { availableContexts, routeForContext, type AccessContext, type OrganizationAccess } from "./context.ts";

const user = { id: "user", fullName: "Usuario", status: "active" as const };
function organization(name: string, contexts: OrganizationAccess["contexts"], roles: OrganizationAccess["roles"], businessType: OrganizationAccess["businessType"] = null): OrganizationAccess {
  return { id: name.toLowerCase().replaceAll(" ", "-"), name, slug: name, businessType, membershipStatus: "active", contexts, roles };
}
function access(organizations: OrganizationAccess[], activeContext: AccessContext["activeContext"]): AccessContext { return { user, globalRoles: ["consumer"], organizations, activeContext }; }

test("Usuario A pertenece a La Movida como establishment_admin", () => {
  const model = access([organization("La Movida", ["establishment"], [{ context: "establishment", role: "establishment_admin", venueId: null }])], { organizationId: "la-movida", organizationName: "La Movida", role: "establishment" });
  assert.deepEqual(availableContexts(model).map((item) => item.role), ["consumer", "establishment"]);
  assert.equal(routeForContext(model), "/admin");
});

test("Usuario B pertenece a XYZ Events como promoter", () => {
  const model = access([organization("XYZ Events", ["promoter"], [{ context: "promoter", role: "owner", venueId: null }])], { organizationId: "xyz-events", organizationName: "XYZ Events", role: "promoter" });
  assert.equal(routeForContext(model), "/promotor");
});

test("Usuario C pertenece a Dismel como brand_distributor", () => {
  const model = access([organization("Dismel", ["brand_distributor"], [{ context: "brand_distributor", role: "owner", venueId: null }], "distributor")], { organizationId: "dismel", organizationName: "Dismel", role: "brand_distributor" });
  assert.equal(availableContexts(model).at(-1)?.role, "brand_distributor");
});

test("Usuario D usa una cuenta para promoter y establishment en Grupo ABC", () => {
  const model = access([organization("Grupo ABC", ["promoter", "establishment"], [{ context: "promoter", role: "admin", venueId: null }, { context: "establishment", role: "establishment_admin", venueId: null }])], { organizationId: "grupo-abc", organizationName: "Grupo ABC", role: "promoter" });
  assert.deepEqual(availableContexts(model).map((item) => item.role), ["consumer", "promoter", "establishment"]);
  assert.equal(new Set(model.organizations.map((item) => item.id)).size, 1);
});
