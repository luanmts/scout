import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");

test("contact persistence reconciles one primary and synchronizes the lead email", () => {
  assert.match(server, /UPDATE lead_contacts SET is_primary = 0 WHERE lead_id/);
  assert.match(server, /UPDATE lead_contacts SET is_primary = 1 WHERE id = \? AND lead_id = \?/);
  assert.match(server, /UPDATE leads SET business_email = \?, contact_status = \?, contact_source_url = \?, contact_confidence = \?/);
});

test("Outreach requires a persisted eligible primary contact", () => {
  assert.match(server, /function requireOutreachRecipient\(leadId: string\)/);
  assert.match(server, /No eligible commercial email is available/);
  assert.match(server, /cp\.kind = 'email'/);
  assert.match(server, /lc\.is_primary = 1/);
});

test("only verified primary contacts are eligible for Outreach", () => {
  assert.match(server, /type OutreachRecipient = \{ email: string; status: 'verified';/);
  assert.match(server, /if \(status !== 'verified'\) return null;/);
  assert.match(server, /rows\.filter\(\(row\) => Boolean\(outreachRecipient\(String\(row\.id\)\)\)\)/);
  assert.match(server, /filter\(\(leadId\) => Boolean\(outreachRecipient\(leadId\)\)\)/);
});

test("manual primary updates clear previous primary contacts", () => {
  assert.match(server, /if \(req\.body\?\.is_primary === true\) db\.prepare\("UPDATE lead_contacts SET is_primary = 0 WHERE lead_id = \?"\)/);
  assert.match(server, /synchronizePrimaryContact\(req\.params\.id\)/);
});
