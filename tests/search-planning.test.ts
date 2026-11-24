import test from "node:test";
import assert from "node:assert/strict";
import { regionalizedSearchQuery, unitedStatesRegions } from "../server/search-planning.js";

test("nationwide planning covers all US states and regionalizes queries", () => {
  assert.equal(unitedStatesRegions.length, 50);
  assert.equal(new Set(unitedStatesRegions).size, 50);
  assert.equal(regionalizedSearchQuery("HVAC Contractor", "United States", "Texas"), "HVAC Contractor in Texas, United States");
  assert.notEqual(regionalizedSearchQuery("HVAC Contractor", "United States", "Texas"), regionalizedSearchQuery("HVAC Contractor", "United States", "Florida"));
});
