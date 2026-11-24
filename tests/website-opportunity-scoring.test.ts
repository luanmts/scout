import assert from "node:assert/strict";
import test from "node:test";
import { calculateWebsiteOpportunity } from "../server/website-opportunity-scoring.js";

test("allows one verified, evidenced high-severity issue without inventing a Lighthouse opportunity", () => {
  const result = calculateWebsiteOpportunity([{ id: "1", category: "accessibility", severity: "high", verificationStatus: "verified", evidence: "Verified keyboard trap." }]);
  assert.equal(result.status, "completed");
  assert.equal(result.level, "low");
  assert.equal(result.score, 32);
});

test("requires sufficient evidence for multiple light findings", () => {
  const result = calculateWebsiteOpportunity([{ id: "1", category: "performance", severity: "low", verificationStatus: "verified", evidence: "Images lack dimensions." }]);
  assert.equal(result.level, "insufficient_evidence");
  assert.equal(result.score, null);
  assert.equal(calculateWebsiteOpportunity([
    { id: "1", category: "performance", severity: "low", verificationStatus: "verified", evidence: "Images lack dimensions." },
    { id: "2", category: "accessibility", severity: "low", verificationStatus: "verified", evidence: "Images lack alt text." },
  ]).level, "low");
});

test("does not use unverified or unevidenced issues", () => {
  const result = calculateWebsiteOpportunity([
    { id: "1", category: "accessibility", severity: "high", verificationStatus: "possible", evidence: "Possible issue." },
    { id: "2", category: "performance", severity: "high", verificationStatus: "verified", evidence: "" },
  ]);
  assert.equal(result.level, "insufficient_evidence");
});

test("deduplicates repeated audit rules and prevents saturation at 100", () => {
  const repeated = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    category: "accessibility",
    severity: "low",
    verificationStatus: "verified",
    evidence: `a:nth-of-type(${index + 1}) rendered at ${100 + index}x28px. Rule: Interactive targets should be at least 44x44px in the inspected viewport.`,
  }));
  const result = calculateWebsiteOpportunity([
    ...repeated,
    { id: "overflow", category: "mobile", severity: "medium", verificationStatus: "verified", evidence: "Document width exceeds viewport. Rule: Document must not overflow the viewport." },
  ]);
  assert.equal(result.score, 23);
  assert.equal(result.issueCount, 2);
  assert.equal(result.level, "low");
});

test("differentiates a small verified finding set from several distinct categories", () => {
  const result = calculateWebsiteOpportunity([
    { id: "seo", category: "seo", severity: "high", verificationStatus: "verified", evidence: "Missing canonical URL. Rule: Pages should declare a canonical URL." },
    { id: "mobile", category: "mobile", severity: "medium", verificationStatus: "verified", evidence: "Document overflows on mobile. Rule: Document must not overflow the viewport." },
  ]);
  assert.equal(result.score, 48);
  assert.equal(result.level, "medium");
});
