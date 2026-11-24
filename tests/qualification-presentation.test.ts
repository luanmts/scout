import assert from "node:assert/strict";
import test from "node:test";
import { qualificationProcessingState, qualificationStateLabel, qualificationStateTone } from "../src/qualification-presentation";

test("only an active persisted task is presented as being checked now", () => {
  assert.equal(qualificationProcessingState({ qualification_status: "running", audit_status: "partial", website_audit_task_status: "queued" }), "queued");
  assert.equal(qualificationProcessingState({ qualification_status: "running", audit_status: "partial", website_audit_task_status: "analyzing" }), "active");
  assert.equal(qualificationProcessingState({ qualification_status: "access_restricted", audit_status: "access_restricted", website_audit_task_status: "access_restricted" }), "restricted");
});

test("candidate state labels distinguish pending work from access failures", () => {
  assert.equal(qualificationStateLabel("pt-BR", "active"), "Sendo verificado agora");
  assert.equal(qualificationStateLabel("pt-BR", "restricted"), "Acesso restrito");
  assert.equal(qualificationStateTone("partial"), "pending");
  assert.equal(qualificationStateTone("failed"), "blocked");
});
