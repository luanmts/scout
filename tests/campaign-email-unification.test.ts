import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "../src/i18n";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");

test("campaign outreach renders the shared Global Emails workspace with campaign scope", () => {
  assert.match(app, /<GlobalEmailsView campaignId=\{selected\.id\} campaignName=\{selected\.name\}/);
  assert.match(app, /const scopeQuery = campaignId/);
  assert.match(app, /\{ \.\.\.scopeBody, language:emailLanguage, tone/);
});

test("campaign-scoped email APIs authorize only campaign members and retain global drafts", () => {
  assert.match(server, /function emailScopeAllows\(leadId: string, campaignId = ""\)/);
  assert.match(server, /return campaignId \? campaignLeadExists\(campaignId, leadId\) : globalEmailLeadExists\(leadId\)/);
  assert.match(server, /ensureGlobalEmailLead\(leadId\)/);
  assert.match(server, /LEFT JOIN global_email_drafts d ON d\.lead_id = l\.id/);
  assert.match(server, /processGlobalEmailRun\(runId, pending, options, campaignId, regenerateExisting\)/);
});

test("an explicitly selected ready draft can be regenerated without selecting the whole campaign", () => {
  assert.match(server, /if \(!allReady && hasBody && !regenerateExisting\) \{ skipped\.push\(leadId\); return false; \}/);
});

test("audit focus informs the evidence without narrowing Luan's default service positioning", () => {
  assert.match(server, /const strategicOutreachService = "Strategic website development focused on user experience, conversion, commercial acquisition, and SEO when relevant\."/);
  assert.match(server, /service: options\.service \|\| strategicOutreachService/);
  assert.match(server, /const service = existing\.service_override && clean\(existing\.service\) \? clean\(existing\.service\) : strategicOutreachService/);
});

test("the primary campaign index uses the shared active/useful campaign selector", () => {
  assert.match(app, /campaigns\.filter\(campaignIsActive\)/);
  assert.match(app, /campaignShouldAppear/);
});

test("CRM appears beside a truncatable business name rather than Opportunity metadata", () => {
  assert.match(app, /<div className="lead-title-line"><strong data-no-translate title=\{lead\.title\}>\{lead\.title\}<\/strong>\{lead\.pipeline_status && <span className="crm-tag"/);
  assert.doesNotMatch(app, /lead\.pipeline_status \? "In CRM"/);
});

test("scoped email ordering uses real relationship states before persisted opportunity", () => {
  assert.match(server, /WHEN COALESCE\(p\.status, ''\) IN \('replied', 'interested', 'proposal_sent', 'won', 'lost'\) THEN 0/);
  assert.match(server, /WHEN COALESCE\(p\.status, ''\) = 'contacted' OR COALESCE\(d\.status, ''\) = 'sent' THEN 1/);
  assert.match(server, /WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3/);
  assert.match(server, /COALESCE\(os\.score, -1\) DESC/);
  assert.match(server, /COALESCE\(p\.status, ''\) NOT IN \('contacted', 'replied', 'interested', 'proposal_sent', 'won', 'lost'\)/);
  assert.match(server, /const priority = orderedEmailLeadIds\(campaignId, allPending && !allReady\)/);
});

test("campaign Outreach excludes companies without sufficient opportunity evidence", () => {
  assert.match(server, /COALESCE\(os\.level, 'insufficient_evidence'\) IN \('high', 'medium', 'low'\)/);
  assert.match(server, /function outreachEvidenceEligible\(leadId: string\)/);
  assert.match(server, /requireOutreachEvidence\(leadId\)/);
  assert.match(server, /campaignLeadExists\(req\.params\.id, id\) && outreachEvidenceEligible\(id\)/);
  assert.match(app, /uiNoCompaniesWithSufficientEvidenceForOutreach/);
  assert.equal(createTranslator("pt-BR")("uiNoCompaniesWithSufficientEvidenceForOutreach"), "Nenhuma empresa com evidência suficiente para Outreach.");
});

test("provider-confirmed Outbox sends synchronize the campaign and global draft views", () => {
  assert.match(server, /UPDATE campaign_drafts SET review_status = 'sent'/);
  assert.match(server, /UPDATE global_email_drafts SET status = 'sent', sent_at = \?, updated_at = \? WHERE lead_id = \? AND status IN \('draft', 'reviewed'\)/);
  assert.match(server, /UPDATE global_email_leads SET status = 'sent', updated_at = \? WHERE lead_id = \?/);
  assert.match(server, /Sent through Scout Outbox\./);
});

test("Outbox prevents duplicate recipient addresses even when separate leads share one email", () => {
  assert.match(server, /outreach_outbox_unique_active_recipient_idx/);
  assert.match(server, /lower\(trim\(to_email\)\) = lower\(trim\(\?\)\)/);
  assert.match(server, /Este destinatário já possui uma mensagem preparada ou enviada pela Outbox/);
  assert.match(app, /const seenRecipients = new Set<string>\(\)/);
});

test("campaign email workspace constrains list scrolling without displacing the editor", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.email-workspace \{[^}]*height:min\(720px, calc\(100vh - 190px\)\)/);
  assert.match(css, /\.email-list \{[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(css, /\.email-lead-scroll \{[^}]*overflow:auto/);
});
