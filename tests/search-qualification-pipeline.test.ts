import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateLeadQualification } from "../server/lead-qualification.ts";

const source = readFileSync(join(process.cwd(), "server", "index.ts"), "utf8");
const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");

test("new discoveries have durable qualification and hybrid UX state", () => {
  assert.match(source, /qualification_status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS visual_ux_tasks/);
  assert.match(source, /visualUxConcurrency = 1/);
  assert.match(source, /VISUAL_UX_TIMEOUT_MS/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS automated_ux_assessments/);
  assert.match(source, /automated_ux/);
  assert.match(source, /qualification_provenance TEXT NOT NULL DEFAULT 'candidate'/);
  assert.match(source, /qualification_provenance === "legacy"/);
  assert.match(source, /pipeline_verified/);
});

test("complete technical evidence promotes a candidate, while partial evidence does not", () => {
  const complete = evaluateLeadQualification({
    website: "https://example.com",
    auditStatus: "completed",
    stages: { profile: { status: "completed" }, browser: { status: "completed" }, lighthouse: { status: "completed" } },
    hasDesktopScreenshot: true,
    hasMobileScreenshot: true,
    automatedUxStatus: "completed",
    opportunityStatus: "insufficient",
  });
  assert.equal(complete.status, "qualified");
  assert.equal(complete.stage, "completed");

  const partial = evaluateLeadQualification({
    website: "https://example.com",
    auditStatus: "partial",
    stages: { profile: { status: "completed" }, browser: { status: "completed" }, lighthouse: { status: "failed" } },
    hasDesktopScreenshot: true,
    hasMobileScreenshot: true,
    automatedUxStatus: "completed",
    opportunityStatus: "insufficient",
  });
  assert.equal(partial.status, "incomplete");
  assert.notEqual(partial.status, "qualified");
});

test("qualification is refreshed after a successful audit task is persisted", () => {
  assert.match(source, /UPDATE website_audit_tasks SET status = \?, stage = \?, error = \?, failure_kind = \?, finished_at/);
  assert.match(source, /refreshLeadQualification\(lead\.id\);\n        emitWebsiteAuditEvent\(lead\.id, result\.status\)/);
});

test("service outage recovery is explicit and does not turn queued work into failures", () => {
  assert.match(source, /function gosomIsAvailable\(\)/);
  assert.match(source, /markSearchWaitingForService/);
  assert.match(source, /setInterval\(\(\) => \{ void reconcileActiveSearches\(\); \}/);
  assert.match(source, /status IN \('starting', 'running', 'waiting_for_service'\)/);
});

test("main Leads API excludes candidates while CRM remains visible", () => {
  assert.match(source, /qualification_status = 'qualified' OR EXISTS \(SELECT 1 FROM outreach_pipeline qualification_crm/);
  assert.match(source, /app\.get\("\/api\/qualification\/candidates"/);
});

test("import keeps new candidates out of the main workspace until qualification refresh", () => {
  assert.match(source, /insertedLeadIds\.forEach\(\(leadId\) => refreshLeadQualification\(leadId\)\)/);
  assert.match(source, /refreshLeadQualification\(leadId\);/);
  assert.match(source, /automatedUxStatus: automated\?\.status/);
});

test("candidate collection uses a finite budget distinct from the qualified target", () => {
  assert.match(source, /function qualificationCandidateBudget\(requestedQualified: number\)/);
  assert.match(source, /Math\.min\(1000, Math\.max\(20, requestedQualified \* 2\)\)/);
  assert.match(source, /requestedQualified: target/);
});

test("Campaign view exposes processing candidates separately from qualified leads", () => {
  assert.match(appSource, /\/api\/qualification\/candidates\?searchId=\$\{selectedId\}/);
  assert.match(appSource, /campaign-candidate-preview/);
});
