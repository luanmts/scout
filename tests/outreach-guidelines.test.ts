import test from "node:test";
import assert from "node:assert/strict";
import { officialOutreachGuidelinesPrompt, officialOutreachWritingGuidelines } from "../server/outreach-guidelines.js";
import { applyFixedOutreachSignature, fixedOutreachSignaturePlain, stripFixedOutreachSignature } from "../server/outreach-signature.js";
import { emailDraftHtml } from "../src/email-signature.js";
import { outreachVariationDirection } from "../server/outreach-policy.js";

test("the official document is loaded into the active generation guidance", () => {
  const prompt = officialOutreachGuidelinesPrompt();
  assert.match(officialOutreachWritingGuidelines, /A genuine thought about your work/);
  assert.match(officialOutreachWritingGuidelines, /Opportunity framing/);
  assert.match(prompt, /Official Outreach Writing Guidelines/);
  assert.match(prompt, /Generate only subject and body; never include a signature/);
  assert.match(prompt, /Performance: the website could feel more responsive/);
  assert.match(prompt, /commercial curiosity/i);
  assert.match(prompt, /An opportunity for your business/);
  assert.match(prompt, /Never copy their sentences/);
  assert.match(officialOutreachWritingGuidelines, /first substantive\s+sentence must not read like an audit finding/i);
  assert.match(officialOutreachWritingGuidelines, /approachable, truthful reason for writing/i);
  assert.match(officialOutreachWritingGuidelines, /Commercial buyer lens/);
  assert.match(officialOutreachWritingGuidelines, /someone may decide to\s+look elsewhere/i);
  assert.match(officialOutreachWritingGuidelines, /Web Developer & SEO Specialist/);
  assert.match(officialOutreachWritingGuidelines, /must never turn the introduction/i);
});

test("variation directions are personal-first and never mandate a technical explanation", () => {
  for (let index = 0; index < 30; index += 1) {
    const direction = outreachVariationDirection(`lead-${index}`);
    assert.doesNotMatch(direction, /Open with the specific verified observation|explain the relevant evidence|name the verified detail/i);
    assert.doesNotMatch(direction, /helping people find their way|next step clearer|customer journey|navigation easier|mobile layout/i);
    assert.match(direction, /personal|human|warm|business-relevant|thoughtful|conversational|approachable/i);
  }
});

test("fixed signature is added once without links for plain text", () => {
  const generated = applyFixedOutreachSignature("Hi there,\n\nA grounded idea.");
  assert.equal(generated.split("Luan Oliveira").length - 1, 1);
  assert.doesNotMatch(generated, /https?:\/\//);
  assert.equal(applyFixedOutreachSignature(generated), generated);
  assert.equal(stripFixedOutreachSignature(generated), "Hi there,\n\nA grounded idea.");
  assert.match(fixedOutreachSignaturePlain, /Web Developer & SEO Specialist/);
});

test("rich email preview escapes generated content, preserves paragraphs, and uses the link-free signature", () => {
  const html = emailDraftHtml(applyFixedOutreachSignature("Hello <owner>"));
  assert.match(html, /Hello &lt;owner&gt;/);
  assert.match(html, /<p style="margin: 0 0 16px 0; line-height: 1.5;/);
  assert.doesNotMatch(html, /font-size: 10pt/);
  assert.doesNotMatch(html, /<a href=/);
  assert.doesNotMatch(html, /Hello <owner>/);
});
