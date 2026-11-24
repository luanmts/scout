import test from "node:test";
import assert from "node:assert/strict";
import { isTerminalGenerationRun } from "../src/email-generation.js";

test("generation run is terminal only after every item reaches a terminal state", () => {
  assert.equal(isTerminalGenerationRun({ status: "running", total: 2, items: [{ status: "completed" }, { status: "failed" }] }), true);
  assert.equal(isTerminalGenerationRun({ status: "running", total: 2, items: [{ status: "completed" }, { status: "running" }] }), false);
  assert.equal(isTerminalGenerationRun({ status: "queued", total: 2, items: [{ status: "failed" }] }), false);
  assert.equal(isTerminalGenerationRun({ status: "cancelled", total: 2, items: [{ status: "cancelled" }] }), true);
  assert.equal(isTerminalGenerationRun({ status: "completed", total: 2, items: [] }), true);
});
