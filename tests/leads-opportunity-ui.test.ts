import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "../src/i18n";

const source = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");

test("Leads Opportunity cell has one primary opportunity presentation and discreet secondary statuses", () => {
  const leadsWorkspace = source.slice(source.indexOf("function LeadsView("), source.indexOf("function GlobalEmailsView("));
  const campaignTable = source.slice(source.indexOf("function SharedLeadTable("), source.indexOf("function CampaignsView("));
  const leadsOpportunityCell = leadsWorkspace.slice(leadsWorkspace.indexOf('<div className="lead-evidence">'), leadsWorkspace.indexOf('<div className="lead-actions">'));
  assert.match(leadsOpportunityCell, /opportunity-primary/);
  assert.match(leadsOpportunityCell, /opportunity-meta/);
  assert.match(leadsWorkspace, /Audit complete/);
  assert.match(leadsWorkspace, /Contact verified/);
  assert.match(leadsWorkspace, /t\("inCrm"\)/);
  assert.equal(createTranslator("pt-BR")("inCrm"), "No CRM");
  assert.doesNotMatch(leadsOpportunityCell, /Contact discovery/);
  assert.doesNotMatch(leadsOpportunityCell, /<small>Audit status<\/small>/);
  assert.match(campaignTable, /const opportunity = \(lead: any\)/);
  assert.match(campaignTable, /\{opportunity\(lead\)\}/);
  assert.match(campaignTable, /className="crm-tag"/);
  assert.match(campaignTable, /Audit complete/);
});

test("Opportunity presentation preserves high, medium, low and insufficient-evidence states", () => {
  const leadsWorkspace = source.slice(source.indexOf("function LeadsView("), source.indexOf("function GlobalEmailsView("));
  const campaignTable = source.slice(source.indexOf("function SharedLeadTable("), source.indexOf("function CampaignsView("));
  for (const level of ["high", "medium", "low"]) {
    assert.match(leadsWorkspace, new RegExp(`opportunity_level === "${level}"`));
    assert.match(campaignTable, new RegExp(`opportunity_level === "${level}"`));
  }
  assert.match(leadsWorkspace, /localizeOpportunityLevel\(language, "insufficient_evidence"\)/);
  assert.match(campaignTable, /localizeOpportunityLevel\(language, "insufficient_evidence"\)/);
  assert.match(leadsWorkspace, /opportunity_score}\/100/);
  assert.match(campaignTable, /opportunity_score}/);
  assert.match(leadsWorkspace, /opportunity_issue_count/);
  assert.match(campaignTable, /opportunity_issue_count/);
  assert.match(leadsWorkspace, /website_audit_status === "completed"/);
  assert.match(leadsWorkspace, /Audit status/);
});
