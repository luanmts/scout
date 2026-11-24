import test from "node:test";
import assert from "node:assert/strict";
import { assessOutreachSubject, commercialBuyerLens, commercialEvidenceContext, hasConcreteCommercialEvidence, isPoorOutreachSubject, outreachModeGuidance, outreachSubjectPolicy, outreachVariationDirection, outreachWritingStandards, safeOutreachGuidance, selectCommercialFocus, selectOutreachEvidence, shouldSkipBatchDraft } from "../server/outreach-policy.js";
import { assessOutreachNarrative, ensureEnglishGreeting, parseOutreachDraft, parseOutreachSubject, removeStylisticDashes, trustedFirstName } from "../server/outreach-format.js";
import { outboxGate } from "../server/outreach-outbox.js";

test("outbox allows the two fixed signature links but still limits authored links", () => {
  const body = "Hi,\n\nA verified observation.\n\nBest,\nLuan Oliveira\nWeb Developer & SEO Specialist\nInstagram: https://www.instagram.com/iamluancreative/ | My Portfolio: https://www.luancreative.work/";
  assert.equal(outboxGate({ toEmail: "owner@example.com", subject: "A practical opportunity", body, recipientStatus: "verified", approvePossible: false, thirdParty: false, unsubscribed: false, alreadyContacted: false }).ok, true);
  assert.match(outboxGate({ toEmail: "owner@example.com", subject: "A practical opportunity", body: body.replace("A verified observation.", "See https://example.com/a and https://example.com/b for details.") , recipientStatus: "verified", approvePossible: false, thirdParty: false, unsubscribed: false, alreadyContacted: false }).reasons.join("; "), /too many links/);
});

test("only selected evidence is passed to grounded outreach", () => {
  const evidence = [
    { id: "signal:seo", label: "SEO issue", verificationStatus: "verified" },
    { id: "signal:possible", label: "Possible issue", verificationStatus: "possible" },
  ];
  assert.deepEqual(selectOutreachEvidence(evidence, ["signal:seo"]), [evidence[0]]);
  assert.deepEqual(selectOutreachEvidence(evidence, []), [evidence[0]]);
});

test("prefers verified evidence and keeps at most two grounded points", () => {
  const chosen = selectOutreachEvidence([
    { id: "visual", verificationStatus: "subjective", subjective: true, priority: 10 },
    { id: "technical", verificationStatus: "verified", priority: 100 },
    { id: "seo", verificationStatus: "verified", priority: 80 },
    { id: "extra", verificationStatus: "verified", priority: 60 },
  ], []);
  assert.deepEqual(chosen.map((item) => item.id), ["technical", "seo"]);
});

test("Smart and General Outreach have distinct safe grounding rules", () => {
  assert.match(outreachModeGuidance("smart"), /selected evidence/);
  assert.match(outreachModeGuidance("general"), /without requiring/);
});

test("writing standards require natural varied subjects and evidence-grounded bodies", () => {
  assert.match(outreachSubjectPolicy, /commercial curiosity/i);
  assert.match(outreachSubjectPolicy, /An opportunity for your business/);
  assert.match(outreachWritingStandards.subject, /commercial curiosity/i);
  assert.match(outreachWritingStandards.subject, /repeating them mechanically/);
  assert.match(outreachWritingStandards.body, /Swokei-style examples/);
  assert.match(outreachWritingStandards.evidence, /Possible/);
  assert.match(outreachWritingStandards.evidence, /customer loss/);
  assert.match(outreachWritingStandards.cta, /conversational question/);
  assert.match(outreachWritingStandards.body, /natural American English/);
  assert.match(outreachWritingStandards.body, /buyer scenario/i);
  assert.match(outreachWritingStandards.evidence, /conditional/i);
});

test("variation direction is deterministic but distributed across recipients", () => {
  assert.equal(outreachVariationDirection("lead-a"), outreachVariationDirection("lead-a"));
  const directions = new Set(Array.from({ length: 15 }, (_, index) => outreachVariationDirection(`campaign-lead-${index}`)));
  assert.ok(directions.size >= 5);
});

test("batch generation skips existing drafts or prior outreach unless explicitly overridden", () => {
  assert.equal(shouldSkipBatchDraft(true, false), true);
  assert.equal(shouldSkipBatchDraft(false, true), true);
  assert.equal(shouldSkipBatchDraft(true, true, true), false);
  assert.equal(shouldSkipBatchDraft(false, false), false);
});

test("additional direction is compact prompt guidance, not unlimited business evidence", () => {
  assert.equal(safeOutreachGuidance("  visual   presentation\n needs a gentler direction  "), "visual presentation needs a gentler direction");
  assert.equal(safeOutreachGuidance("x".repeat(700)).length, 500);
});

test("commercial focus prioritizes verified SEO over generic redesign", () => {
  const focus = selectCommercialFocus([
    { id: "seo-1", category: "seo", severity: "high", verificationStatus: "verified", evidence: "Missing canonical" },
    { id: "performance-1", category: "performance", severity: "low", verificationStatus: "verified", evidence: "Slow render" },
  ]);
  assert.equal(focus.key, "seo");
  assert.equal(focus.label, "SEO optimization");
  assert.deepEqual(focus.evidenceIds, ["seo-1"]);
});

test("redesign needs an approved visual assessment and missing evidence stays neutral", () => {
  assert.equal(selectCommercialFocus([{ id: "mobile", category: "mobile", severity: "medium", verificationStatus: "possible" }]).key, "neutral");
  assert.equal(selectCommercialFocus([{ id: "visual", category: "visual", subjective: true, redesignPotential: "high", evidence: "Visual hierarchy needs review" }]).key, "redesign");
});

test("email parser accepts safe JSON and heading variations without inventing content", () => {
  assert.deepEqual(parseOutreachDraft("```json\n{\"email_subject\":\"Quick question\",\"message\":\"Hi there,\\n\\nCould we talk?\"}\n```"), { subject: "Quick question", body: "Hi there,\n\nCould we talk?" });
  assert.deepEqual(parseOutreachDraft("Subject: One idea\nBody: Hello\n\nWould a short chat help?"), { subject: "One idea", body: "Hello\n\nWould a short chat help?" });
  assert.equal(parseOutreachDraft("Only a subject"), null);
});

test("new English drafts always have one natural Hi greeting", () => {
  assert.equal(ensureEnglishGreeting("Hello Texas Discount Air team,\n\nA concrete observation."), "Hi,\n\nA concrete observation.");
  assert.equal(ensureEnglishGreeting("Dear John Smith,\n\nA concrete observation.", "John Smith"), "Hi John,\n\nA concrete observation.");
  assert.equal(ensureEnglishGreeting("Hi John,\n\nA concrete observation.", "John"), "Hi John,\n\nA concrete observation.");
  assert.equal(ensureEnglishGreeting("A concrete observation."), "Hi,\n\nA concrete observation.");
});

test("editorial guard rejects audit-first openings without changing factual evidence", () => {
  assert.deepEqual(assessOutreachNarrative("Hi,\n\nAn automated review of the homepage found a broken booking link.").reasons.sort(), ["audit_language", "technical_opening"]);
  assert.equal(assessOutreachNarrative("Hi,\n\nI am reaching out with one thought about how potential customers get in touch. The booking path on the website does not currently lead to a working destination.").acceptable, true);
  assert.equal(assessOutreachNarrative("Hi,\n\nI wanted to share one website-related thought. A confirmed mobile layout issue may make key information harder to follow on a phone.").acceptable, true);
  assert.match(assessOutreachNarrative("Hi,\n\nI wanted to share a commercial thought. Would you be open to hearing a couple of ideas for that path?").reasons.join(","), /formulaic_sales_copy/);
  assert.match(assessOutreachNarrative("Hi,\n\nA commercial thought. Would it be useful to discuss whether the booking option can be made dependable?").reasons.join(","), /formulaic_sales_copy/);
  assert.match(assessOutreachNarrative("Hi,\n\nMy work focuses on mobile website improvements.").reasons.join(","), /narrow_professional_positioning/);
  assert.equal(assessOutreachNarrative("Hi,\n\nI design and develop strategic websites around user experience and conversion, helping interested visitors reach the right next action.").acceptable, true);
});

test("only a verified personal name can supply the first-name greeting", () => {
  assert.equal(trustedFirstName("John Smith", "Texas Discount Air"), "John");
  assert.equal(trustedFirstName("At Texas Discount Air", "Texas Discount Air"), "");
  assert.equal(trustedFirstName("Texas Discount Air", "Texas Discount Air"), "");
  assert.equal(trustedFirstName("Customer Support", "Texas Discount Air"), "");
});

test("removes stylistic em and en dashes while preserving ordinary hyphens", () => {
  assert.equal(removeStylisticDashes("A focused pass — without a redesign. Texas Same-Day Air."), "A focused pass, without a redesign. Texas Same-Day Air.");
  assert.equal(removeStylisticDashes("https://example.com/contact-us"), "https://example.com/contact-us");
});

test("rejects company plus service keyword subjects while keeping natural personal subjects", () => {
  assert.equal(isPoorOutreachSubject("North Alabama Heating SEO", "North Alabama Heating and Cooling"), true);
  assert.equal(isPoorOutreachSubject("A quick thought about your website", "North Alabama Heating and Cooling"), false);
});

test("editorial subject review rejects audit-like wording without rejecting natural commercial framing", () => {
  const prohibited = [
    "A thought about helping people find their way",
    "A small idea for making the next step clearer",
    "A thought on improving the customer journey",
    "A note about making navigation easier",
    "A small mobile layout note",
  ];
  for (const subject of prohibited) assert.equal(assessOutreachSubject(subject).acceptable, false, subject);
  assert.equal(assessOutreachSubject("A quick SEO observation").acceptable, false);
  assert.equal(assessOutreachSubject("A note about your meta description").acceptable, false);
  assert.equal(assessOutreachSubject("a thought about your website").acceptable, false);
  assert.equal(assessOutreachSubject("A genuine thought about your work").acceptable, true);
  assert.equal(assessOutreachSubject("An idea for your business").acceptable, true);
  assert.equal(assessOutreachSubject("One idea for your website").acceptable, true);
  assert.equal(assessOutreachSubject("An opportunity for your business").acceptable, true);
  assert.equal(assessOutreachSubject("Something worth sharing").acceptable, true);
  assert.equal(assessOutreachSubject("An opportunity worth exploring").acceptable, true);
  assert.equal(assessOutreachSubject("Something I wanted to share with you").acceptable, true);
  assert.equal(assessOutreachSubject("A thought about your online presence").acceptable, true);
});

test("subject-only editorial parser never changes a generated email body", () => {
  assert.equal(parseOutreachSubject('{"subject":"A thought about your online presence"}'), "A thought about your online presence");
  assert.equal(parseOutreachSubject('{"body":"No subject is present"}'), null);
});

test("technical evidence is grounded through commercial language rather than audit terminology", () => {
  const [mobile] = commercialEvidenceContext([{ id: "mobile", category: "mobile", label: "mobile finding", detail: "Document width (2560px) exceeds viewport width (390px).", verificationStatus: "verified" }]);
  const [seo] = commercialEvidenceContext([{ id: "seo", category: "metadata", label: "metadata finding", detail: "No meta description is present.", verificationStatus: "verified" }]);
  assert.match(String(mobile.commercialContext), /checking services from a phone/i);
  assert.doesNotMatch(String(mobile.commercialContext), /390px|viewport|2560/i);
  assert.match(String(seo.commercialContext), /comparing local options/i);
  assert.doesNotMatch(String(seo.commercialContext), /meta description/i);
});

test("conversion language is tied to the kind of verified journey evidence", () => {
  const [contact] = commercialEvidenceContext([{ id: "contact", category: "contact", label: "contact finding", detail: "Verified contact form submission failed.", verificationStatus: "verified" }]);
  const [booking] = commercialEvidenceContext([{ id: "booking", category: "links", label: "booking finding", detail: "Appointment scheduling action failed.", verificationStatus: "verified" }]);
  assert.match(String(contact.commercialContext), /request a quote or reach the team/i);
  assert.match(String(contact.commercialContext), /never as a recorded lost lead/i);
  assert.match(String(booking.commercialContext), /ready to arrange service/i);
  assert.match(String(booking.commercialContext), /never as a recorded lost booking/i);
});

test("commercial framing gives a concrete but conditional buyer scenario", () => {
  const hvacLens = commercialBuyerLens("HVAC contractor");
  assert.match(hvacLens, /comparing local providers/i);
  assert.match(hvacLens, /not evidence/i);
  const [booking] = commercialEvidenceContext([
    { id: "booking", category: "links", label: "booking finding", detail: "Appointment scheduling action failed.", verificationStatus: "verified" },
  ], hvacLens);
  assert.match(String(booking.commercialContext), /decide to contact another provider/i);
  assert.match(String(booking.commercialContext), /possibility/i);
  assert.match(String(booking.commercialContext), /never as a recorded lost booking/i);
});

test("selected evidence keeps concrete details and rejects generic-only grounding", () => {
  const evidence = [{ id: "audit:performance", source: "homepage_audit", category: "performance", detail: "7 image(s) are delivered at more than 2.5× their rendered width. Selector: img.hero; property: width; rule: image sizing", verificationStatus: "verified" }];
  const [context] = commercialEvidenceContext(evidence);
  assert.match(String(context.specificObservation), /7 image/);
  assert.doesNotMatch(String(context.specificObservation), /Selector|property:|rule:/i);
  assert.equal(hasConcreteCommercialEvidence(evidence), true);
  assert.equal(hasConcreteCommercialEvidence([{ id: "accessibility", category: "accessibility", detail: "A generic accessibility observation", verificationStatus: "verified" }]), false);
});

test("commercial focus selects the offer that matches each simulated opportunity", () => {
  const scenarios = [
    { category: "metadata", evidence: "Search presentation could be clearer", expected: "seo" },
    { category: "performance", evidence: "Slow first render on mobile", expected: "performance" },
    { category: "links", evidence: "Verified contact form submission failed", expected: "conversion" },
    { category: "visual", evidence: "The visual hierarchy needs a cohesive refresh", subjective: true, redesignPotential: "high", expected: "redesign" },
  ] as const;
  for (const scenario of scenarios) {
    const focus = selectCommercialFocus([{ id: scenario.category, category: scenario.category, severity: "high", verificationStatus: scenario.subjective ? "subjective" : "verified", evidence: scenario.evidence, subjective: scenario.subjective, redesignPotential: scenario.redesignPotential }]);
    assert.equal(focus.key, scenario.expected, scenario.category);
  }
});
