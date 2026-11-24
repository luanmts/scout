import test from "node:test";
import assert from "node:assert/strict";
import { calculateIcpScore, type IcpRule } from "../server/icp-scoring.ts";

const rules: IcpRule[] = [
  { code: "maps_no_website_recorded", label: "No website recorded", weight: 40, minConfidence: 0 },
  { code: "audit_issue_category", label: "SEO issue", weight: 35, minConfidence: 0.9, config: { categories: ["seo"], maxAgeDays: 90 } },
  { code: "observation_present", label: "Booking", weight: 25, minConfidence: 0.8, config: { codes: ["ONLINE_BOOKING"], maxAgeDays: 90 } },
];
const now = new Date("2026-10-15T00:00:00.000Z");

test("scores only positive persisted evidence and exposes coverage", () => {
  const result = calculateIcpScore(rules, {
    website: "", category: "Dental clinic", industry: "dental",
    audit: { status: "completed", updatedAt: "2026-10-10T00:00:00.000Z", issues: [{ category: "seo", severity: "high", url: "https://example.test", evidence: "Missing description" }] },
    observations: [{ signalCode: "ONLINE_BOOKING", confidence: 0.9, observedAt: "2026-10-10T00:00:00.000Z", evidenceUrl: "https://example.test", evidenceExcerpt: "Calendly link" }], now,
  });
  assert.equal(result.score, 100);
  assert.equal(result.commercialFit, 100);
  assert.equal(result.evidenceCoverage, 100);
  assert.equal(result.evidenceConfidence, 84);
});

test("missing observations are unsupported, never a negative inference", () => {
  const result = calculateIcpScore(rules, { website: "https://example.test", category: "", industry: "", observations: [], now });
  assert.equal(result.score, 0);
  assert.equal(result.rules.find((rule) => rule.code === "observation_present")?.status, "unsupported");
  assert.equal(result.rules.find((rule) => rule.code === "maps_no_website_recorded")?.status, "not_matched");
});

test("stale evidence cannot contribute", () => {
  const result = calculateIcpScore(rules, {
    website: "https://example.test", category: "", industry: "", observations: [{ signalCode: "ONLINE_BOOKING", confidence: 1, observedAt: "2025-01-01T00:00:00.000Z", evidenceUrl: "", evidenceExcerpt: "old" }], now,
  });
  assert.equal(result.rules.find((rule) => rule.code === "observation_present")?.status, "stale");
  assert.equal(result.score, 0);
});

test("latest observation wins when observations conflict in time", () => {
  const result = calculateIcpScore([rules[2]], {
    website: "", category: "", industry: "", now,
    observations: [
      { signalCode: "ONLINE_BOOKING", confidence: 0.95, observedAt: "2026-10-01T00:00:00.000Z", evidenceUrl: "", evidenceExcerpt: "latest" },
      { signalCode: "ONLINE_BOOKING", confidence: 0.1, observedAt: "2026-09-01T00:00:00.000Z", evidenceUrl: "", evidenceExcerpt: "older" },
    ],
  });
  assert.equal(result.score, 100);
  assert.equal(result.rules[0].evidence[0].detail, "latest");
});

test("normalizes custom profile weights and flags insufficient evidence", () => {
  const result = calculateIcpScore([
    { code: "maps_no_website_recorded", label: "Listing gap", weight: 20, minConfidence: 0 },
    { code: "observation_present", label: "Booking", weight: 80, minConfidence: 0.8, config: { codes: ["ONLINE_BOOKING"] } },
  ], { website: "", category: "", industry: "", observations: [], now });
  assert.equal(result.score, 0);
  assert.equal(result.evaluationStatus, "insufficient_evidence");
});

test("possible and inconclusive observations do not contribute to ICP", () => {
  const result = calculateIcpScore([rules[2]], {
    website: "https://example.test", category: "", industry: "", now,
    observations: [{ signalCode: "ONLINE_BOOKING", confidence: 1, observedAt: "2026-10-10T00:00:00.000Z", evidenceUrl: "", evidenceExcerpt: "not verified", verificationStatus: "possible" }],
  });
  assert.equal(result.score, 0);
  assert.equal(result.rules[0].status, "unsupported");
});
