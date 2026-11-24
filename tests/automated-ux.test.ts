import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAutomatedUx, type AutomatedUxSnapshot } from "../server/automated-ux.js";

const clean = (width: number): AutomatedUxSnapshot => ({ viewportWidth: width, scrollWidth: width, clientWidth: width, viewportMeta: "width=device-width, initial-scale=1", headings: [{ tag: "h1", selector: "h1", text: "Home" }], controls: [{ selector: "button", tag: "button", name: "Contact", width: 48, height: 48, fontSize: 16 }], ctaCount: 1 });

test("automated UX reports objective overflow and unnamed controls", () => {
  const result = analyzeAutomatedUx({ ...clean(1440), scrollWidth: 1510 }, { ...clean(390), controls: [{ selector: "button:nth-of-type(1)", tag: "button", name: "", width: 24, height: 20, fontSize: 10 }] });
  assert.equal(result.status, "completed");
  assert.ok(result.findings.some((item) => item.property === "desktop.scrollWidth"));
  assert.ok(result.findings.some((item) => item.property === "accessible name"));
  assert.ok(result.findings.every((item) => item.verificationStatus === "verified" && item.selector && item.observedValue && item.rule));
});

test("automated UX completes cleanly without AI", () => {
  const result = analyzeAutomatedUx(clean(1440), clean(390));
  assert.equal(result.status, "completed");
  assert.equal(result.findings.length, 0);
  assert.equal(result.method, "automated");
});
