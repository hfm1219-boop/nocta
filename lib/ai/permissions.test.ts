import assert from "node:assert/strict";
import test from "node:test";
import { canUsePromotionWrites } from "./permissions.ts";

const venueA = "10000000-0000-4000-8000-000000000001";
const venueB = "10000000-0000-4000-8000-000000000002";

test("usuario sin permiso no puede crear promoción", () => {
  assert.equal(canUsePromotionWrites({ role: "establishment", organizationId: "org-a", manageableVenueIds: [venueA] }, venueB), false);
});

test("el alcance de organización no filtra recursos de otra sede", () => {
  assert.equal(canUsePromotionWrites({ role: "establishment", organizationId: "org-a", manageableVenueIds: [venueA] }, venueA), true);
  assert.equal(canUsePromotionWrites({ role: "establishment", organizationId: "org-a", manageableVenueIds: [venueA] }, venueB), false);
});
