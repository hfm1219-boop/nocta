import assert from "node:assert/strict";
import test from "node:test";
import { availableContexts, routeForContext, safeNextPath, type AccessContext, type OrganizationAccess } from "./context.ts";

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
  assert.equal(routeForContext(model), "/marca");
});

test("NOCTA Admin aterriza en el control de plataforma", () => {
  const model: AccessContext = { user, globalRoles: ["consumer", "nocta_admin"], organizations: [], activeContext: { organizationId: null, organizationName: "NOCTA", role: "nocta_admin" } };
  assert.equal(routeForContext(model), "/super");
});

test("Una invitación pendiente no aparece como contexto seleccionable", () => {
  const invited = organization("Marca invitada", ["brand_distributor"], [{ context: "brand_distributor", role: "member", venueId: null }]);
  invited.membershipStatus = "invited";
  const model = access([invited], { organizationId: null, organizationName: null, role: "consumer" });
  assert.deepEqual(availableContexts(model).map((item) => item.role), ["consumer"]);
});

test("El retorno de autenticación solo acepta rutas internas", () => {
  assert.equal(safeNextPath("/mis-planes?tab=eventos"), "/mis-planes?tab=eventos");
  assert.equal(safeNextPath("//sitio-malicioso.example"), null);
  assert.equal(safeNextPath("/\\sitio-malicioso.example"), null);
  assert.equal(safeNextPath("https://sitio-malicioso.example"), null);
});

test("Usuario D usa una cuenta para promoter y establishment en Grupo ABC", () => {
  const model = access([organization("Grupo ABC", ["promoter", "establishment"], [{ context: "promoter", role: "admin", venueId: null }, { context: "establishment", role: "establishment_admin", venueId: null }])], { organizationId: "grupo-abc", organizationName: "Grupo ABC", role: "promoter" });
  assert.deepEqual(availableContexts(model).map((item) => item.role), ["consumer", "promoter", "establishment"]);
  assert.equal(new Set(model.organizations.map((item) => item.id)).size, 1);
});
