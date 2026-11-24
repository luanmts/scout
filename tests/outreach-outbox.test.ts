import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyOutboxDispatchError, dailyCapReached, distributeOutboxAccounts, outboxDispatchState, outboxGate, scheduledOutboxTime } from "../server/outreach-outbox.js";

const server = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");

test("outbox gate blocks invalid, unapproved, third-party and repeated recipients", () => {
  const result = outboxGate({ toEmail: "help@serviceagent.ai", subject: "Hello", body: "Message", recipientStatus: "possible", approvePossible: false, thirdParty: true, unsubscribed: false, alreadyContacted: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["possible contact requires explicit approval", "administrative third-party contact", "recipient was already contacted"]);
});

test("outbox gate accepts a verified commercial draft after deterministic checks", () => {
  assert.deepEqual(outboxGate({ toEmail: "owner@example.com", subject: "A useful idea", body: "A short, evidence-based message.", recipientStatus: "verified", approvePossible: false, thirdParty: false, unsubscribed: false, alreadyContacted: false }), { ok: true, reasons: [] });
});

test("outbox distributes staged messages across connected accounts", () => {
  assert.deepEqual(distributeOutboxAccounts(["a", "b"], 5), ["a", "b", "a", "b", "a"]);
  assert.deepEqual(distributeOutboxAccounts([], 2), []);
});

test("outbox schedules gradual delivery and enforces daily cap helper", () => {
  const start = new Date("2026-10-22T12:00:00.000Z");
  assert.equal(scheduledOutboxTime(start, 2, 15), "2026-10-22T12:30:00.000Z");
  assert.equal(dailyCapReached(10, 10), true);
  assert.equal(dailyCapReached(9, 10), false);
});

test("outbox treats provider rejection as terminal but unknown result as uncertain", () => {
  assert.deepEqual(classifyOutboxDispatchError(new Error("Gmail rejeitou o envio.")), { status: "failed", uncertain: false, error: "Gmail rejeitou o envio." });
  const uncertain = classifyOutboxDispatchError(new Error("Não foi possível confirmar o resultado do envio Gmail."));
  assert.equal(uncertain.status, "failed");
  assert.equal(uncertain.uncertain, true);
  assert.match(uncertain.error ?? "", /não confirmou/);
});

test("outbox exposes the real scheduling state without sending early", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  assert.equal(outboxDispatchState("approved", "2026-10-22T12:05:00.000Z", now, false, false), "waiting_for_activation");
  assert.equal(outboxDispatchState("approved", "2026-10-22T12:05:00.000Z", now, true, true), "paused");
  assert.equal(outboxDispatchState("approved", "2026-10-22T12:05:00.000Z", now, true, false), "waiting_for_schedule");
  assert.equal(outboxDispatchState("approved", "2026-10-22T11:59:00.000Z", now, true, false), "ready");
  assert.equal(outboxDispatchState("sent", "2026-10-22T11:59:00.000Z", now, true, false), "terminal");
});

test("controlled test messages preserve paragraphs and allow one test per sender account", () => {
  assert.match(server, /const body = normalizeEmailBody\(req\.body\?\.body\)/);
  assert.match(server, /campaign_id != '__outreach_test__' AND status IN \('pending_review','approved','sending'\)/);
  assert.match(server, /outreach_outbox_unique_active_test_recipient_account_idx/);
  assert.match(server, /campaign_id = '__outreach_test__' AND account_id = \?/);
});
