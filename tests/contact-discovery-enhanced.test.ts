import assert from "node:assert/strict";
import test from "node:test";
import { classifyEmailOwnership, isLikelyThirdPartyAdministrativeContact, isThirdPartyAdministrativeContact, mergeWebsiteContactPages, parsePublicSearchResults, publicSearchQueries, searchResultPagePriority, selectBestContactEmail, type PublicContact, type PublicLead } from "../server/contact-discovery.ts";

const lead: PublicLead = { title: "Acme Heating", city: "Austin", region: "Texas", country_code: "US", website: "acmeheating.com", website_empty: 0 };

test("public discovery creates bounded, identity-aware query variants", () => {
  const queries = publicSearchQueries(lead);
  assert.equal(queries.length, 4);
  assert.ok(queries.some((query) => query.includes('"Acme Heating" email')));
  assert.ok(queries.some((query) => query.includes("Austin")));
  assert.ok(queries.some((query) => query.includes("acmeheating.com")));
});

test("search snippets preserve source URLs and do not become verified contacts", () => {
  const results = parsePublicSearchResults(`<div class="result"><a class="result__a" href="https://directory.example/acme">Acme Heating Austin</a><a class="result__snippet">Contact sales@acmeheating.com in Austin</a></div>`);
  assert.equal(results[0]?.url, "https://directory.example/acme");
  assert.match(results[0]?.snippet ?? "", /sales@acmeheating\.com/);
  const selected = selectBestContactEmail([{ name: "", role: "", email: "sales@acmeheating.com", phone: "", socialUrl: "", socialNetwork: "", status: "possible", sourceUrl: results[0].url, evidence: "Snippet only", confidence: 0.6 }]);
  assert.equal(selected?.status, "possible");
});

test("verified contacts win over possible duplicates and weaker candidates", () => {
  const selected = selectBestContactEmail([
    { name: "", role: "", email: "sales@acmeheating.com", phone: "", socialUrl: "", socialNetwork: "", status: "possible", sourceUrl: "https://search.example", evidence: "Snippet", confidence: 0.75 },
    { name: "", role: "", email: "sales@acmeheating.com", phone: "", socialUrl: "", socialNetwork: "", status: "verified", sourceUrl: "https://directory.example/acme", evidence: "Public page", confidence: 0.7 },
  ]);
  assert.equal(selected?.status, "verified");
});

test("prefers Harvey's published general inbox when official evidence is equivalent", () => {
  const selected = selectBestContactEmail([
    { name: "", role: "", email: "owner@business.example", phone: "", socialUrl: "", socialNetwork: "", status: "verified", sourceType: "official_website", sourceUrl: "https://business.example/about", evidence: "Official page", confidence: 0.9 },
    { name: "", role: "", email: "info@business.example", phone: "", socialUrl: "", socialNetwork: "", status: "verified", sourceType: "official_website", sourceUrl: "https://business.example/contact", evidence: "Official page", confidence: 0.9 },
  ]);
  assert.equal(selected?.email, "owner@business.example");
});

test("prefers the official company domain over a registrar address", () => {
  const make = (email: string, sourceUrl: string): PublicContact => ({ name: "", role: "", email, phone: "", socialUrl: "", socialNetwork: "", status: "verified", sourceType: "official_website", sourceUrl, evidence: "Visible official page content", extractionMethod: "visible_html", confidence: 0.9 });
  const selected = selectBestContactEmail([
    make("customercare@coronationregistrars.com", "https://theaccesscorporation.com/"),
    make("info@theaccesscorporation.com", "https://theaccesscorporation.com/contact/"),
  ], "theaccesscorporation.com");
  assert.equal(selected?.email, "info@theaccesscorporation.com");
});

test("keeps a legitimate alternate domain eligible when no official-domain address exists", () => {
  const selected = selectBestContactEmail([{
    name: "", role: "", email: "hello@brand-services.com", phone: "", socialUrl: "", socialNetwork: "", status: "verified", sourceType: "official_website", sourceUrl: "https://brand.com/contact", evidence: "Published on the official contact page", extractionMethod: "mailto", confidence: 0.9,
  }], "brand.com");
  assert.equal(selected?.email, "hello@brand-services.com");
});

test("merges all pages and selects the official-domain email while preserving evidence", () => {
  const merged = mergeWebsiteContactPages([
    { url: "https://theaccesscorporation.com/", html: "<footer>customercare@coronationregistrars.com</footer>" },
    { url: "https://theaccesscorporation.com/contact/", html: "<main>Contact info@theaccesscorporation.com</main>" },
  ], "theaccesscorporation.com");
  assert.equal(merged.email, "info@theaccesscorporation.com");
  assert.equal(merged.sourceUrl, "https://theaccesscorporation.com/contact/");
  assert.deepEqual(merged.contacts.map((contact) => contact.email).sort(), ["customercare@coronationregistrars.com", "info@theaccesscorporation.com"]);
  assert.equal(merged.contacts.find((contact) => contact.email === "customercare@coronationregistrars.com")?.status, "possible");
  assert.equal(merged.contacts.find((contact) => contact.email === "info@theaccesscorporation.com")?.status, "verified");
});

test("does not verify a directory's administrative mailbox as the business contact", () => {
  const diamond: PublicLead = { title: "Diamond Heating & AirTemp Alaska", city: "Anchorage", region: "Alaska", country_code: "US", website: "diamondheatingalaska.com", website_empty: 0 };
  assert.equal(classifyEmailOwnership("help@serviceagent.ai", diamond, "https://serviceagent.ai/directory/alaska/anchorage/hvac/diamond-heating-airtemp-alaska/", "directory"), "possible");
  assert.equal(classifyEmailOwnership("info@diamondheatingalaska.com", diamond, "https://www.facebook.com/diamondheatingalaska", "public_profile"), "verified");
});

test("does not select a directory-owned administrative mailbox as the primary contact", () => {
  const thirdParty: PublicContact = { name: "", role: "", email: "help@serviceagent.ai", phone: "", socialUrl: "", socialNetwork: "", status: "possible", sourceType: "directory", sourceUrl: "https://serviceagent.ai/directory/alaska/anchorage/hvac/diamond-heating-airtemp-alaska/", evidence: "Directory page", confidence: 0.58 };
  assert.equal(isThirdPartyAdministrativeContact(thirdParty, "diamondheatingalaska.com"), true);
  assert.equal(selectBestContactEmail([thirdParty], "diamondheatingalaska.com"), undefined);
});

test("recovers persisted directory evidence without treating it as an eligible recipient", () => {
  assert.equal(isLikelyThirdPartyAdministrativeContact("help@serviceagent.ai", "https://serviceagent.ai/directory/alaska/diamond-heating", "diamondcomfort.com"), true);
  assert.equal(isLikelyThirdPartyAdministrativeContact("info@brand-services.com", "https://brand-services.com/contact", "brand.com"), false);
});

test("downgrades external mailboxes found on the official website without deleting them", () => {
  const merged = mergeWebsiteContactPages([
    { url: "https://diamondheatingalaska.com/contact", html: "<main>Diamond Heating help@serviceagent.ai info@diamondheatingalaska.com</main>" },
  ], "diamondheatingalaska.com");
  const external = merged.contacts.find((contact) => contact.email === "help@serviceagent.ai");
  const official = merged.contacts.find((contact) => contact.email === "info@diamondheatingalaska.com");
  assert.equal(external?.status, "possible");
  assert.equal(official?.status, "verified");
  assert.equal(merged.email, "info@diamondheatingalaska.com");
});

test("prioritizes a contact page over a generic page on the same hostname", () => {
  assert.ok(searchResultPagePriority({ url: "https://example.com/contact-us", title: "Contact us" }) > searchResultPagePriority({ url: "https://example.com/", title: "Home" }));
  assert.ok(searchResultPagePriority({ url: "https://example.com/about/employment", title: "Careers" }) < searchResultPagePriority({ url: "https://example.com/contact", title: "Contact" }));
});

test("keeps a legitimate alternate domain eligible and preserves verified candidates", () => {
  const alternate: PublicContact = { name: "", role: "", email: "info@brand-services.com", phone: "", socialUrl: "", socialNetwork: "", status: "possible", sourceType: "directory", sourceUrl: "https://www.bbb.org/us/brand", evidence: "Business profile", confidence: 0.7 };
  const verified: PublicContact = { name: "", role: "", email: "info@diamondheatingalaska.com", phone: "", socialUrl: "", socialNetwork: "", status: "verified", sourceType: "official_website", sourceUrl: "https://diamondheatingalaska.com/contact", evidence: "Official page", confidence: 0.9 };
  assert.equal(isThirdPartyAdministrativeContact(alternate, "diamondheatingalaska.com"), false);
  assert.equal(selectBestContactEmail([alternate, verified], "diamondheatingalaska.com")?.email, "info@diamondheatingalaska.com");
  assert.equal(selectBestContactEmail([alternate], "diamondheatingalaska.com")?.email, "info@brand-services.com");
});
