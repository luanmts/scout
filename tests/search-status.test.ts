import assert from "node:assert/strict";
import test from "node:test";
import { deriveSearchStage, deriveSearchStatus, isSearchActiveStatus } from "../server/search-status.ts";

test("derives active and terminal discovery states from jobs", () => {
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "running", hasExecution: true, jobs: [{ status: "running", stage: "collecting" }] }), "running");
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "completed", hasExecution: true, jobs: [{ status: "completed" }], collected: 100, target: 100 }), "completed");
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "running", hasExecution: true, jobs: [{ status: "completed" }], collected: 100, target: 100 }), "completed");
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "completed", hasExecution: true, jobs: [{ status: "completed" }], collected: 3, target: 100 }), "completed_with_shortfall");
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "cancelled", hasExecution: true, jobs: [{ status: "cancelled" }] }), "cancelled");
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "completed", hasExecution: true, jobs: [{ status: "failed" }] }), "failed");
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "completed", hasExecution: true, jobs: [{ status: "completed" }, { status: "failed" }] }), "completed_with_errors");
  assert.equal(deriveSearchStatus({ persistedStatus: "running", executionStatus: "waiting_for_service", hasExecution: true, jobs: [{ status: "queued" }] }), "waiting_for_service");
});

test("does not leave an interrupted campaign collecting after restart", () => {
  assert.equal(deriveSearchStatus({ persistedStatus: "running", hasExecution: false, jobs: [] }), "failed");
  assert.equal(isSearchActiveStatus("qualifying"), true);
  assert.equal(isSearchActiveStatus("waiting_for_service"), true);
  assert.equal(isSearchActiveStatus("completed"), false);
});

test("keeps qualification active after discovery completion", () => {
  assert.equal(deriveSearchStatus({ persistedStatus: "completed", executionStatus: "completed", hasExecution: true, jobs: [{ status: "completed" }], qualificationPending: 2, collected: 100, target: 100 }), "qualifying");
  assert.equal(deriveSearchStage([{ status: "running", stage: "collecting" }], "running"), "collecting");
  assert.equal(deriveSearchStage([{ status: "failed", stage: "failed" }], "failed"), "failed");
  assert.equal(deriveSearchStage([{ status: "queued", stage: "queued" }], "waiting_for_service"), "waiting_for_service");
});

test("keeps simultaneous campaigns independently active", () => {
  const statuses = [
    deriveSearchStatus({ persistedStatus: "running", executionStatus: "running", hasExecution: true, jobs: [{ status: "running" }] }),
    deriveSearchStatus({ persistedStatus: "completed", executionStatus: "completed", hasExecution: true, jobs: [{ status: "completed" }], collected: 100, target: 100 }),
  ];
  assert.deepEqual(statuses, ["running", "completed"]);
});
