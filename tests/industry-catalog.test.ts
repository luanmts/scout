import assert from "node:assert/strict";
import { expandIndustryTerms, industryCatalog, isIndustryRelevant } from "../server/industry-catalog";

const terms = expandIndustryTerms(["air_conditioning_heating", "plumbing"]);
assert.equal(terms[0], "HVAC Contractor");
assert.ok(terms.includes("Plumber"));
assert.equal(new Set(terms.map((term) => term.toLowerCase())).size, terms.length);
assert.deepEqual(expandIndustryTerms(["dental"], ["Dentist", "Dental SEO"]), ["Dentist", "Dental Clinic", "Cosmetic Dentist", "Pediatric Dentist", "Orthodontist", "Dental SEO"]);
assert.equal(isIndustryRelevant(["roofing"], "Roofing contractor", "ABC Roof Repair"), true);
assert.equal(isIndustryRelevant(["roofing"], "Real estate agency", "ABC Homes"), false);
assert.equal(isIndustryRelevant([], "Any category"), true);
assert.equal(industryCatalog.length, 4);
console.log("industry catalog tests passed");
