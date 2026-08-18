import assert from "node:assert/strict";
import test from "node:test";
import { executeConfirmedWrite } from "./write-guard.ts";

test("sin confirmación no ejecuta ninguna mutación", async () => {
  let mutations = 0;
  const result = await executeConfirmedWrite(false, async () => ++mutations);
  assert.deepEqual(result, { ok: false, error: "CONFIRMATION_REQUIRED" });
  assert.equal(mutations, 0);
});

test("con confirmación ejecuta exactamente una vez", async () => {
  let mutations = 0;
  const result = await executeConfirmedWrite(true, async () => ++mutations);
  assert.deepEqual(result, { ok: true, data: 1 });
  assert.equal(mutations, 1);
});
