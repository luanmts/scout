import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLeadQualification } from "../server/lead-qualification.js";

const completeStages = { profile: { status: "completed" }, browser: { status: "completed" }, lighthouse: { status: "completed" }, automated_ux: { status: "completed" } };

test("a full audit with Low opportunity is qualified", () => {
  assert.deepEqual(evaluateLeadQualification({ website: "https://example.com", auditStatus: "completed", stages: completeStages, hasDesktopScreenshot: true, hasMobileScreenshot: true, automatedUxStatus: "completed", visualStatus: "completed", opportunityStatus: "completed" }), { status: "qualified", stage: "completed", reason: "All required qualification stages completed.", shouldQueueVisual: false });
});

test("insufficient commercial evidence does not prevent a complete qualification", () => {
  assert.equal(evaluateLeadQualification({ website: "https://example.com", auditStatus: "completed", stages: completeStages, hasDesktopScreenshot: true, hasMobileScreenshot: true, automatedUxStatus: "completed", visualStatus: "completed", opportunityStatus: "insufficient" }).status, "qualified");
});

test("does not promote a website with missing browser, Lighthouse, or screenshots", () => {
  assert.equal(evaluateLeadQualification({ website: "https://example.com", auditStatus: "completed", stages: { profile: { status: "completed" }, browser: { status: "failed" } }, hasDesktopScreenshot: true, hasMobileScreenshot: true }).status, "incomplete");
  assert.equal(evaluateLeadQualification({ website: "https://example.com", auditStatus: "completed", stages: completeStages, hasDesktopScreenshot: false, hasMobileScreenshot: true }).status, "incomplete");
});

test("does not require the optional AI review after Automated UX completes", () => {
  const result = evaluateLeadQualification({ website: "https://example.com", auditStatus: "completed", stages: completeStages, hasDesktopScreenshot: true, hasMobileScreenshot: true, visualStatus: null, automatedUxStatus: "completed", opportunityStatus: "completed" });
  assert.equal(result.status, "qualified");
  assert.equal(result.shouldQueueVisual, false);
});

test("blocks promotion when Automated UX fails", () => {
  const result = evaluateLeadQualification({ website: "https://example.com", auditStatus: "completed", stages: { ...completeStages, automated_ux: { status: "failed" } }, hasDesktopScreenshot: true, hasMobileScreenshot: true, automatedUxStatus: "failed", opportunityStatus: "completed" });
  assert.equal(result.status, "incomplete");
  assert.equal(result.stage, "visual_ux");
});

test("no website, restricted website, and partial audit are never promoted", () => {
  assert.equal(evaluateLeadQualification({ website: "", hasDesktopScreenshot: false, hasMobileScreenshot: false }).status, "failed");
  assert.equal(evaluateLeadQualification({ website: "https://example.com", auditStatus: "access_restricted", hasDesktopScreenshot: false, hasMobileScreenshot: false }).status, "access_restricted");
  assert.equal(evaluateLeadQualification({ website: "https://example.com", auditStatus: "partial", hasDesktopScreenshot: false, hasMobileScreenshot: false }).status, "incomplete");
});
