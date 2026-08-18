import assert from "node:assert/strict";
import test from "node:test";
import { fallbackIntent } from "./intent-router.ts";
import { requiresExplicitConfirmation, validatePromotionDraft } from "./validation.ts";

const productId = "10000000-0000-4000-8000-000000000001";

test("crear una promo para mañana enruta a CREATE_PROMOTION", () => {
  assert.equal(fallbackIntent("Crear una promo para mañana" ).intent, "CREATE_PROMOTION");
});

test("WRITE requiere confirmación y READ/DRAFT no", () => {
  assert.equal(requiresExplicitConfirmation("WRITE"), true);
  assert.equal(requiresExplicitConfirmation("READ"), false);
  assert.equal(requiresExplicitConfirmation("DRAFT"), false);
});

test("rechaza un producto inventado", () => {
  const errors = validatePromotionDraft({
    venueId: "20000000-0000-4000-8000-000000000001", title: "Gin Friday", description: "Promoción válida de gin.", terms: "Sujeto a disponibilidad.",
    startsAt: "2026-08-21T23:00:00.000Z", endsAt: "2026-08-22T02:00:00.000Z", mechanic: "percentage", benefit: 20,
    productIds: [productId], products: [],
  }, new Set());
  assert.ok(errors.some((error) => error.includes("no pertenecen")));
});
