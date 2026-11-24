import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { compileCohortDefinition } from "../server/cohort-engine.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE leads(id TEXT PRIMARY KEY, industry_normalized TEXT, category TEXT, country_code TEXT, region TEXT, city TEXT, website TEXT, business_email TEXT, phone TEXT, instagram TEXT, facebook TEXT);
    CREATE TABLE lead_observations(lead_id TEXT, signal_code TEXT, confidence REAL, observed_at TEXT, verification_status TEXT);
    CREATE TABLE lead_contacts(lead_id TEXT, role TEXT, verification_status TEXT);
    CREATE TABLE icp_scores(lead_id TEXT, profile_key TEXT, score INTEGER, calculated_at TEXT);
    INSERT INTO leads VALUES ('a','dental','Dental','CA','Ontario','Toronto','https://a.test','','','',''),('b','dental','Dental','CA','Ontario','Toronto','','','','',''),('c','plumbing','Plumbing','US','Texas','Austin','https://c.test','','','','');
    INSERT INTO lead_observations VALUES ('a','TECH_STACK',.95,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),'verified'),('b','TECH_STACK',.4,strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days'),'possible');
    INSERT INTO icp_scores VALUES ('a','website_redesign',85,'2026-10-10T00:00:00Z');`);
  return db;
}
function rows(definition: unknown) {
  const db = fixture(); const compiled = compileCohortDefinition(definition); return db.prepare(`SELECT l.id FROM leads l WHERE ${compiled.sql} ORDER BY l.id`).all(...compiled.args) as Array<{ id: string }>;
}

test("supports nested AND, OR and NOT groups", () => {
  const result = rows({ type: "group", operator: "AND", children: [
    { type: "condition", field: "industry", operator: "eq", value: "dental" },
    { type: "group", operator: "OR", children: [{ type: "condition", field: "website", operator: "eq", value: "present" }, { type: "condition", field: "contact", operator: "eq", value: "present" }] },
    { type: "group", operator: "NOT", children: [{ type: "condition", field: "signal", operator: "missing", value: "TECH_STACK" }] },
  ] });
  assert.deepEqual(result.map((row) => row.id), ["a"]);
});

test("distinguishes missing evidence from a confirmed negative", () => {
  const result = rows({ type: "condition", field: "website", operator: "eq", value: "missing" });
  assert.deepEqual(result.map((row) => row.id), ["b"]);
  const missingSignal = rows({ type: "condition", field: "signal", operator: "missing", value: "ONLINE_BOOKING" });
  assert.deepEqual(missingSignal.map((row) => row.id), ["a", "b", "c"]);
});

test("applies signal confidence and freshness without using stale possible evidence", () => {
  const result = rows({ type: "group", operator: "AND", children: [
    { type: "condition", field: "signal_confidence", operator: "gte", value: { signal: "TECH_STACK", min: .8 } },
    { type: "condition", field: "signal_freshness", operator: "within_days", value: { signal: "TECH_STACK", days: 30 } },
    { type: "condition", field: "signal_status", operator: "eq", value: { signal: "TECH_STACK", status: "verified" } },
  ] });
  assert.deepEqual(result.map((row) => row.id), ["a"]);
  const freshnessOnly = rows({ type: "condition", field: "signal_freshness", operator: "within_days", value: { signal: "TECH_STACK", days: 30 } });
  assert.deepEqual(freshnessOnly.map((row) => row.id), ["a"]);
});

test("supports ICP profile thresholds and returns explainable condition metadata", () => {
  const compiled = compileCohortDefinition({ type: "condition", field: "icp_score", operator: "gte", value: { profile: "website_redesign", score: 80 }, label: "High redesign fit" });
  const db = fixture(); const result = db.prepare(`SELECT l.id FROM leads l WHERE ${compiled.sql}`).all(...compiled.args);
  assert.deepEqual((result as Array<{ id: string }>).map((row) => row.id), ["a"]);
  assert.equal(compiled.reasons[0].label, "High redesign fit");
});

test("cohort application keeps global leads and campaign membership distinct", () => {
  const db = fixture();
  db.exec("CREATE TABLE campaign_memberships(campaign_id TEXT, lead_id TEXT, first_seen_at TEXT, last_seen_at TEXT, source_count INTEGER, PRIMARY KEY(campaign_id, lead_id))");
  const compiled = compileCohortDefinition({ type: "condition", field: "industry", operator: "eq", value: "dental" });
  const leads = db.prepare(`SELECT l.id FROM leads l WHERE ${compiled.sql}`).all(...compiled.args) as Array<{ id: string }>;
  const insert = db.prepare("INSERT INTO campaign_memberships VALUES (?, ?, ?, ?, 1)");
  for (const lead of leads) insert.run("campaign-1", lead.id, "2026-10-15", "2026-10-15");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM leads").get()?.count, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM campaign_memberships").get()?.count, 2);
});

test("compiled cohort query remains bounded for a paginated preview", () => {
  const db = fixture();
  db.exec("CREATE INDEX leads_cohort_idx ON leads(industry_normalized, country_code, region, city)");
  const compiled = compileCohortDefinition({ type: "group", operator: "AND", children: [{ type: "condition", field: "industry", operator: "eq", value: "dental" }, { type: "condition", field: "website", operator: "eq", value: "present" }] });
  const started = performance.now();
  const result = db.prepare(`SELECT l.id FROM leads l WHERE ${compiled.sql} LIMIT 20 OFFSET 0`).all(...compiled.args);
  assert.ok(performance.now() - started < 250, "preview query should remain responsive");
  assert.equal(result.length, 1);
});
