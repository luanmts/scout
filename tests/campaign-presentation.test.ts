import test from "node:test";
import assert from "node:assert/strict";
import { campaignHasUsefulResults, campaignShouldAppear, compareCampaignsForIndex } from "../src/campaign-presentation";

const campaign = (overrides: Record<string, unknown> = {}) => ({ status: "completed", ...overrides });

test("keeps an active campaign visible even without results", () => {
  assert.equal(campaignShouldAppear(campaign({ status: "running" })), true);
  assert.equal(campaignShouldAppear(campaign({ status: "waiting_for_service" })), true);
  assert.equal(campaignShouldAppear(campaign({ status: "qualifying" })), true);
});

test("keeps completed and coverage-exhausted campaigns with useful results", () => {
  assert.equal(campaignShouldAppear(campaign({ metrics: { lead_count: 3 } })), true);
  assert.equal(campaignShouldAppear(campaign({ status: "completed_with_shortfall", progress: { collected: 2 } })), true);
});

test("hides failed or empty technical runs from the main list", () => {
  assert.equal(campaignShouldAppear(campaign({ status: "failed" })), false);
  assert.equal(campaignShouldAppear(campaign({ status: "saved" })), false);
  assert.equal(campaignShouldAppear(campaign({ status: "completed", progress: { collected: 0 } })), false);
});

test("keeps useful interrupted or failed runs available", () => {
  assert.equal(campaignShouldAppear(campaign({ status: "cancelled", metrics: { contact_count: 1 } })), true);
  assert.equal(campaignShouldAppear(campaign({ status: "failed", qualification_progress: { extracted: 4 } })), true);
  assert.equal(campaignHasUsefulResults(campaign({ metrics: { audit_count: 2 } })), false);
});

test("orders active campaigns before history, newest first within each group", () => {
  const active = campaign({ status: "running", created_at: "2025-01-01" });
  const newer = campaign({ created_at: "2026-01-01", metrics: { lead_count: 1 } });
  assert.equal(compareCampaignsForIndex(active, newer) < 0, true);
  assert.equal(compareCampaignsForIndex(newer, campaign({ created_at: "2025-02-01", metrics: { lead_count: 1 } })) < 0, true);
});
