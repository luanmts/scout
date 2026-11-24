import test from "node:test";
import assert from "node:assert/strict";
import { boundedTimeout, terminalCodeFromAbort } from "../server/outreach-runtime.js";

test("outreach timeouts are bounded to safe configured ranges", () => {
  assert.equal(boundedTimeout(undefined, 20_000, 1_000, 120_000), 20_000);
  assert.equal(boundedTimeout("10", 20_000, 1_000, 120_000), 1_000);
  assert.equal(boundedTimeout("999999", 20_000, 1_000, 120_000), 120_000);
  assert.equal(boundedTimeout("bad", 20_000, 1_000, 120_000), 20_000);
});

test("outreach abort reasons always resolve to an explicit terminal state", () => {
  assert.equal(terminalCodeFromAbort("connection_timeout"), "connection_timeout");
  assert.equal(terminalCodeFromAbort("stream_timeout"), "stream_timeout");
  assert.equal(terminalCodeFromAbort("total_timeout"), "total_timeout");
  assert.equal(terminalCodeFromAbort("browser_cancel"), "cancelled");
});
