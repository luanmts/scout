import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAuditFailure,
  cleanAuditError,
  deriveAuditRecoveryPlan,
  profileHomepage,
  recoverablePartialFailure,
  runSerializedLighthouse,
} from "../server/website-intelligence.js";

test("cleans ANSI diagnostics and normalizes closed-browser screenshot failures", () => {
  assert.equal(
    cleanAuditError("\u001b[2mpage.screenshot: Target page, context or browser has been closed\u001b[22m"),
    "Browser screenshot failed: page or browser closed unexpectedly.",
  );
  assert.equal(cleanAuditError("\u001b[31mTimeout\u001b[0m while loading"), "Timeout while loading");
  assert.equal(cleanAuditError(""), "");
  assert.equal(cleanAuditError(undefined), "");
});

test("plans selective recovery only when persisted stages prove what is missing", () => {
  assert.deepEqual(
    deriveAuditRecoveryPlan({ stages: { profile: { status: "completed" }, browser: { status: "failed" }, lighthouse: { status: "skipped" } } }),
    { mode: "selective", stages: ["browser", "lighthouse"], reason: "Reuses the persisted homepage profile; browser stage is incomplete." },
  );
  assert.equal(deriveAuditRecoveryPlan({}).mode, "full_reaudit");
  assert.deepEqual(
    deriveAuditRecoveryPlan({ stages: { profile: { status: "completed" }, browser: { status: "completed" }, lighthouse: { status: "failed" } } }).stages,
    ["lighthouse"],
  );
});

test("classifies access restrictions and ordinary 404 responses as non-retryable", () => {
  assert.deepEqual(classifyAuditFailure(new Error("Homepage returned HTTP 403.")).kind, "http_403");
  assert.equal(classifyAuditFailure(new Error("Homepage returned HTTP 403.")).retryable, false);
  assert.equal(classifyAuditFailure(new Error("Homepage returned HTTP 404.")).kind, "http_404");
  assert.equal(classifyAuditFailure(new Error("Homepage returned HTTP 404.")).retryable, false);
});

test("classifies timeouts and browser crashes as bounded retry candidates", () => {
  assert.equal(classifyAuditFailure(new Error("Homepage navigation timed out after 30 seconds.")).retryable, true);
  assert.equal(classifyAuditFailure(new Error("Chromium browser has been closed.")).retryable, true);
  assert.equal(classifyAuditFailure(new Error("Audit cancelled.")).retryable, false);
});

test("keeps transient HTTP availability failures retryable but never retries access decisions", () => {
  assert.deepEqual(classifyAuditFailure(new Error("Homepage returned HTTP 429.")), { kind: "http_429", retryable: true, message: "Homepage returned HTTP 429." });
  assert.equal(classifyAuditFailure(new Error("Homepage returned HTTP 503.")).retryable, true);
  assert.equal(classifyAuditFailure(new Error("Homepage returned HTTP 401.")).retryable, false);
});

test("schedules only failed browser or Lighthouse stages after a partial audit", () => {
  assert.deepEqual(
    recoverablePartialFailure({ stages: { profile: { status: "completed" }, browser: { status: "failed", reason: "Chromium browser has been closed." }, lighthouse: { status: "skipped" } } }),
    { failure: { kind: "browser_crash", retryable: true, message: "Chromium browser has been closed." }, stages: ["browser", "lighthouse"] },
  );
  assert.deepEqual(
    recoverablePartialFailure({ stages: { profile: { status: "completed" }, browser: { status: "completed" }, lighthouse: { status: "failed", reason: "Lighthouse timed out after 55 seconds." } } })?.stages,
    ["lighthouse"],
  );
  assert.equal(recoverablePartialFailure({ stages: { browser: { status: "failed", reason: "The website returned HTTP 403." } } }), null);
});

test("persists lightweight profile evidence without Chromium or Lighthouse", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
    if (url.endsWith("/sitemap.xml")) return new Response("<urlset></urlset>", { status: 200 });
    return new Response(`<!doctype html><html><head><title>Example HVAC</title><meta name="description" content="Heating help"></head><body><form action="/contact"><input name="email"></form><a href="mailto:team@example.com">team@example.com</a></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    const profile = await profileHomepage(new URL("https://example.com/"));
    assert.equal(profile.accessRestricted, undefined);
    assert.equal(profile.pages.length, 1);
    assert.ok(profile.signals.some((signal) => signal.code === "CONTACT_FOUND"));
    assert.equal((profile.metrics.stages as { profile: { status: string } }).profile.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stops after an HTTP 403 without attempting browser-oriented work", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("restricted", { status: 403 })) as typeof fetch;
  try {
    const profile = await profileHomepage(new URL("https://example.com/"));
    assert.match(profile.accessRestricted ?? "", /HTTP 403/);
    assert.equal((profile.metrics.stages as { browser: { status: string } }).browser.status, "skipped");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("treats HTTP 429 as a bounded retry candidate instead of an access restriction", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("slow down", { status: 429 })) as typeof fetch;
  try {
    await assert.rejects(() => profileHomepage(new URL("https://example.com/")), /HTTP 429/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("serializes Lighthouse runs to protect process-wide navigation timing marks", async () => {
  const order: string[] = [];
  const first = runSerializedLighthouse(async () => {
    order.push("first:start");
    await new Promise((resolve) => setTimeout(resolve, 15));
    order.push("first:end");
    return "first";
  });
  const second = runSerializedLighthouse(async () => {
    order.push("second:start");
    order.push("second:end");
    return "second";
  });
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(order, ["first:start", "first:end", "second:start", "second:end"]);
});
