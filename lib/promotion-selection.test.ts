import assert from "node:assert/strict";
import test from "node:test";
import { mejorPromocionElegible } from "./promotion-selection.ts";

test("elige el mayor beneficio elegible sin mutar el orden", () => {
  const promociones = [
    { id: "menor", eligible: true, discount_amount_cop: 8_000 },
    { id: "no-elegible", eligible: false, discount_amount_cop: 50_000 },
    { id: "mayor", eligible: true, discount_amount_cop: 15_000 },
  ] as const;
  assert.equal(mejorPromocionElegible(promociones)?.id, "mayor");
  assert.deepEqual(promociones.map((item) => item.id), ["menor", "no-elegible", "mayor"]);
});

test("ignora descuentos inválidos, cero y negativos", () => {
  assert.equal(mejorPromocionElegible([
    { eligible: true, discount_amount_cop: Number.NaN },
    { eligible: true, discount_amount_cop: 0 },
    { eligible: true, discount_amount_cop: -1 },
  ]), undefined);
});

test("conserva la primera promoción cuando hay empate", () => {
  const primera = { id: "prioridad-servidor", eligible: true, discount_amount_cop: 10_000 };
  const segunda = { id: "segunda", eligible: true, discount_amount_cop: 10_000 };
  assert.equal(mejorPromocionElegible([primera, segunda]), primera);
});
