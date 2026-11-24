import assert from "node:assert/strict";
import test from "node:test";
import { classifyContactFetchFailure, dedupePublicContacts, discoverWebsiteLinks, extractPublicContacts, mergeWebsiteContactPages, normalizeEmail, normalizeSocial } from "../server/contact-discovery.ts";

test("extracts public emails, phones, social profiles and role evidence", () => {
  const result = extractPublicContacts(`<section><h2>Maria Silva - Founder</h2><p>Contact: MARIA@Example.test</p><p>+1 (416) 555-0199</p><a href="https://www.linkedin.com/in/maria-silva">LinkedIn</a><a href="https://www.instagram.com/example-business">Instagram</a></section>`);
  assert.equal(result.email, "maria@example.test");
  assert.equal(result.instagram, "https://www.instagram.com/example-business");
  assert.ok(result.contacts.some((contact) => contact.role.toLowerCase().includes("founder")));
  assert.ok(result.contacts.some((contact) => contact.socialNetwork === "linkedin"));
  assert.equal(result.contacts.find((contact) => contact.email)?.status, "verified");
});

test("normalizes contact identity without treating deliverability as verified", () => {
  assert.equal(normalizeEmail(" MAILTO:Owner@Example.com?subject=hello "), "owner@example.com");
  assert.equal(normalizeSocial("instagram.com/example-business/", "instagram"), "https://www.instagram.com/example-business");
  const result = extractPublicContacts("<p>Email: someone@example.org</p>");
  assert.equal(result.contacts.length, 0, "placeholder domains are excluded");
});

test("does not infer a person or authority from generic page copy", () => {
  const result = extractPublicContacts("<p>Contact our team through the form.</p><p>We manage projects for local businesses.</p>");
  assert.equal(result.contacts.length, 0);
});

test("deduplicates globally by normalized contact identity and keeps stronger evidence", () => {
  const unique = dedupePublicContacts([
    { name: "", role: "", email: "Owner@Example.com", phone: "", socialUrl: "", socialNetwork: "", status: "possible", sourceUrl: "https://search.example", evidence: "Search result", confidence: 0.55 },
    { name: "", role: "", email: "owner@example.com", phone: "", socialUrl: "", socialNetwork: "", status: "verified", sourceUrl: "https://business.example/contact", evidence: "Official page", confidence: 0.9 },
  ]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].status, "verified");
  assert.equal(unique[0].sourceUrl, "https://business.example/contact");
});

test("extracts mailto links, accessible attributes and conventional obfuscation", () => {
  const result = extractPublicContacts(`
    <footer><a href="mailto:Sales%40Acme.test?subject=hello">Email sales</a>
    <span aria-label="support@acme.test">Support</span>
    <p>billing [at] acme [dot] net</p></footer>
  `);
  assert.deepEqual(result.contacts.filter((contact) => contact.email).map((contact) => [contact.email, contact.extractionMethod]), [
    ["sales@acme.test", "mailto"],
    ["support@acme.test", "accessible_attribute"],
    ["billing@acme.net", "obfuscated_text"],
  ]);
});

test("ignores executable markup and decodes obfuscated accessible contact attributes", () => {
  const result = extractPublicContacts(`
    <script>const fake = "fake@example.test";</script>
    <span aria-label="office [at] acme [dot] test">Office</span>
    <footer>info@acme.test</footer>
  `);
  assert.deepEqual(result.contacts.filter((contact) => contact.email).map((contact) => contact.email).sort(), [
    "office@acme.test",
    "info@acme.test",
  ].sort());
});

test("does not turn ordinary prose containing at and dot into an email", () => {
  const result = extractPublicContacts("Keep your mind at ease your service is ready. We use dot navigation.");
  assert.equal(result.contacts.filter((contact) => contact.email).length, 0);
});

test("prioritizes real internal contact links without expanding into an unbounded crawl", () => {
  const links = discoverWebsiteLinks(`
    <nav><a href="/products">Products</a><a href="/about-us">About</a><a href="/contact-us">Contact</a></nav>
    <footer><a href="/locations">Locations</a><a href="/privacy">Privacy</a><a href="https://external.example/contact">External</a></footer>
  `, "https://business.example/", 4);
  assert.equal(links.length, 4);
  assert.equal(links[0]?.url, "https://business.example/contact");
  assert.ok(links.some((link) => link.url === "https://business.example/about-us"));
  assert.ok(links.every((link) => new URL(link.url).origin === "https://business.example"));
});

test("preserves contacts from valid pages when another internal page fails", () => {
  const merged = mergeWebsiteContactPages([
    { url: "https://business.example/", html: "<p>Call us</p>" },
    { url: "https://business.example/contact-us", html: "<a href=\"mailto:info@business.example\">info@business.example</a>" },
  ]);
  assert.equal(merged.email, "info@business.example");
  assert.equal(merged.contacts[0]?.sourceUrl, "https://business.example/contact-us");
  assert.equal(merged.contacts[0]?.sourceType, "official_website");
});

test("classifies access restrictions separately from transient failures", () => {
  assert.equal(classifyContactFetchFailure(new Error("Public page unavailable (403).")), "access_restricted");
  assert.equal(classifyContactFetchFailure(new Error("getaddrinfo EAI_AGAIN host.example")), "temporary_failure");
  assert.equal(classifyContactFetchFailure(new Error("The operation timed out")), "timeout");
  assert.equal(classifyContactFetchFailure(undefined, 404), "unavailable");
});
