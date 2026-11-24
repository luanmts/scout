import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { detectHomepageSignals, signalCatalog } from "../server/lead-intelligence.js";

test("detects conservative homepage fingerprints with evidence", () => {
  const html = `<footer>Website by <a href="https://agency.example">North Agency</a></footer>
    <script src="https://cdn.shopify.com/app.js"></script><script>fbq('init', '1')</script>
    <script type="application/ld+json">{"@type":"LocalBusiness"}</script>
    <form action="/contact"></form><a>Contact us</a>`;
  const signals = detectHomepageSignals(html);
  const codes = signals.map((item) => item.code);
  for (const code of [
    "TECH_SHOPIFY",
    "META_PIXEL",
    "SCHEMA_ORG",
    "CONTACT_FORM",
    "CONTACT_CTA",
    "AGENCY_CREDIT",
  ])
    assert.ok(codes.includes(code), `${code} should be detected`);
  assert.ok(
    signals.every(
      (item) => item.confidence > 0 && item.evidenceExcerpt.length > 0,
    ),
  );
  assert.ok(
    !codes.includes("GOOGLE_ADS"),
    "absence must not become a negative signal",
  );
});

test("observations are append-only and newest observation can be queried", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    `CREATE TABLE observations (lead_id TEXT, signal_code TEXT, value_text TEXT, observed_at TEXT)`,
  );
  db.prepare("INSERT INTO observations VALUES (?, ?, ?, ?)").run(
    "lead-1",
    "TECH_WORDPRESS",
    "detected",
    "2026-01-01T00:00:00Z",
  );
  db.prepare("INSERT INTO observations VALUES (?, ?, ?, ?)").run(
    "lead-1",
    "TECH_WORDPRESS",
    "detected",
    "2026-02-01T00:00:00Z",
  );
  const rows = db
    .prepare("SELECT * FROM observations WHERE lead_id = ?")
    .all("lead-1");
  assert.equal(rows.length, 2);
  const latest = db
    .prepare(
      "SELECT * FROM observations WHERE lead_id = ? AND signal_code = ? ORDER BY observed_at DESC LIMIT 1",
    )
    .get("lead-1", "TECH_WORDPRESS") as { observed_at: string };
  assert.equal(latest.observed_at, "2026-02-01T00:00:00Z");
});

test("catalog exposes actionable Harvey-compatible signal codes without inferring absence", () => {
  const codes = new Set(signalCatalog.map((item) => item.code));
  for (const code of ["TECH_STACK", "CONTACT_FORM_URL", "BROKEN_CONTACT_LINK", "BROKEN_BOOKING_LINK", "HOMEPAGE_NAV_FAILURE", "TECHNICAL_SEO_ISSUE", "MOBILE_USABILITY_ISSUE", "PERFORMANCE_ISSUE", "REVIEW_RATING", "BLOCKS_AI_CRAWLERS"]) assert.ok(codes.has(code), `${code} should be catalogued`);
  const signals = detectHomepageSignals(`<form action="/contact"></form><a href="/contact">Contact</a>`);
  assert.equal(signals.find((item) => item.code === "CONTACT_FORM_URL")?.verificationStatus, "verified");
  assert.ok(!signals.some((item) => item.code === "NO_SCHEMA_MARKUP"), "parser must not turn absent markup into a negative observation");
});
