import assert from "node:assert/strict";
import test from "node:test";
import { fallbackIntent } from "./intent-router.ts";
import { parseBuyXGetY, parseWindow, preservePromotionFlow, startsNewPromotion } from "./conversation.ts";
import { requiresExplicitConfirmation, validatePromotionDraft } from "./validation.ts";

const productId = "10000000-0000-4000-8000-000000000001";

test("crear una promo para mañana enruta a CREATE_PROMOTION", () => {
  assert.equal(fallbackIntent("Crear una promo para mañana" ).intent, "CREATE_PROMOTION");
});

test("listar promociones no se confunde con crear una promoción", () => {
  assert.equal(fallbackIntent("¿Qué promociones tengo activas?").intent, "LIST_PROMOTIONS");
});

test("pausar una promoción enruta al ciclo de actualización", () => {
  assert.equal(fallbackIntent("Pausa la promoción de Negroni").intent, "UPDATE_PROMOTION");
});

test("configurar mapping de sell-out enruta al motor transaccional", () => {
  assert.equal(fallbackIntent("Configura el mapping de sell-out de la promo Negroni").intent, "CONFIGURE_PROMOTION_ENGINE");
});

test("una respuesta de horario conserva el flujo de creación aunque el modelo diga UPDATE", () => {
  const routed = preservePromotionFlow(
    { intent: "CREATE_PROMOTION", promotionDraft: { productIds: [], products: [] } },
    { intent: "UPDATE_PROMOTION", confidence: 0.82, entities: {}, missingFields: [] },
  );
  assert.equal(routed.intent, "CREATE_PROMOTION");
});

test("un horario con una sola hora conserva el inicio para pedir únicamente el cierre", () => {
  const window = parseWindow("este viernes desde las 6:00 p. m.", {});
  assert.ok(window.startsAt);
  assert.equal(window.endsAt, undefined);
});

test("una hora aislada completa el cierre sobre un inicio existente", () => {
  const window = parseWindow("hasta las 2:00 a. m.", {}, "2026-08-21T23:00:00.000Z");
  assert.equal(window.endsAt, "2026-08-22T07:00:00.000Z");
});

test("pague 3 lleve 5 se interpreta como compra 3 y recibe 2 adicionales", () => {
  assert.deepEqual(parseBuyXGetY("pague 3 lleve 5"), { buyQuantity: 3, getQuantity: 2 });
});

test("una promoción nueva abandona el flujo pendiente", () => {
  assert.equal(startsNewPromotion("una promoción nueva"), true);
  assert.equal(startsNewPromotion("quiero otra promo"), true);
  assert.equal(startsNewPromotion("configura esta promoción"), false);
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
