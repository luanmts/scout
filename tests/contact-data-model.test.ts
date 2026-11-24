import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("contact associations preserve provenance and support manual verification", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE leads(id TEXT PRIMARY KEY); CREATE TABLE contact_points(id TEXT PRIMARY KEY, kind TEXT, normalized_value TEXT, display_value TEXT); CREATE TABLE lead_contacts(id TEXT PRIMARY KEY, lead_id TEXT, contact_point_id TEXT, role TEXT, source_url TEXT, evidence TEXT, confidence REAL, verification_status TEXT, verification_method TEXT, discovered_at TEXT, last_seen_at TEXT);`);
  db.prepare("INSERT INTO leads VALUES ('lead-1')").run();
  db.prepare("INSERT INTO contact_points VALUES ('point-1', 'email', 'owner@example.com', 'owner@example.com')").run();
  db.prepare("INSERT INTO lead_contacts VALUES ('contact-1', 'lead-1', 'point-1', 'Founder', 'https://example.com/about', 'Listed on About page', .9, 'possible', 'public_page', '2026-10-15', '2026-10-15')").run();
  db.prepare("UPDATE lead_contacts SET verification_status = 'verified', verification_method = 'manual' WHERE id = 'contact-1'").run();
  const row = db.prepare("SELECT * FROM lead_contacts WHERE id = 'contact-1'").get() as Record<string, unknown>;
  assert.equal(row.verification_status, "verified");
  assert.equal(row.verification_method, "manual");
  assert.equal(row.source_url, "https://example.com/about");
  assert.equal(row.evidence, "Listed on About page");
});

test("organization-level contact points can use the explicit unassigned owner", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON; CREATE TABLE people(id TEXT PRIMARY KEY, normalized_name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL); CREATE TABLE contact_points(id TEXT PRIMARY KEY, person_id TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id));");
  db.prepare("INSERT INTO people VALUES ('', '', '')").run();
  assert.doesNotThrow(() => db.prepare("INSERT INTO contact_points VALUES ('point-1', '')").run());
});
