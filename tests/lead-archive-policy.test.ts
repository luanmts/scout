import assert from "node:assert/strict";
import test from "node:test";
import { decideLeadArchive } from "../server/lead-archive-policy.js";

test("keeps a completed technical audit even when opportunity evidence is insufficient", () => {
  assert.deepEqual(decideLeadArchive({ auditStatus: "completed", inCrm: false, archived: false }), { action: "retain", reason: "completed" });
});

test("archives incomplete technical states when the lead is outside CRM", () => {
  for (const auditStatus of ["partial", "failed", "access_restricted", "not_analyzed"])
    assert.equal(decideLeadArchive({ auditStatus, inCrm: false, archived: false }).action, "archive");
});

test("CRM membership always protects a lead regardless of its audit state", () => {
  for (const auditStatus of ["partial", "failed", "access_restricted", "not_analyzed"])
    assert.deepEqual(decideLeadArchive({ auditStatus, inCrm: true, archived: false }), { action: "protected", reason: "in_crm" });
});

test("never archives an audit while its persisted task is active", () => {
  assert.deepEqual(decideLeadArchive({ auditStatus: "failed", taskStatus: "running", inCrm: false, archived: false }), { action: "defer", reason: "audit_active" });
});

test("does not reprocess a record already logically archived", () => {
  assert.deepEqual(decideLeadArchive({ auditStatus: "failed", inCrm: false, archived: true }), { action: "retain", reason: "already_archived" });
});
