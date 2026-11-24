import { createServer } from "node:net";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import lighthouse from "lighthouse";
import {
  detectHomepageSignals,
  type HomepageSignal,
} from "./lead-intelligence.js";
import { analyzeAutomatedUx, type AutomatedUxResult, type AutomatedUxSnapshot } from "./automated-ux.js";

export type AuditIssue = {
  category:
    "performance" | "seo" | "accessibility" | "mobile" | "content" | "links";
  severity: "high" | "medium" | "low";
  url: string;
  evidence: string;
  suggestion: string;
  verificationStatus?: "verified" | "possible" | "inconclusive";
};

type ActionLink = { href: string; text: string; kind: "contact" | "booking" | "cta" };

export type WebsiteAuditResult = {
  url: string;
  status: "completed" | "partial" | "access_restricted";
  score: number | null;
  performanceScore: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  pages: string[];
  desktopScreenshot: string;
  mobileScreenshot: string;
  metrics: Record<string, unknown>;
  issues: AuditIssue[];
  signals: HomepageSignal[];
  automatedUx: AutomatedUxResult;
};

export type AuditFailureKind =
  | "access_restricted"
  | "http_403"
  | "http_404"
  | "http_429"
  | "http_5xx"
  | "http_error"
  | "timeout"
  | "dns"
  | "browser_crash"
  | "lighthouse"
  | "cancelled"
  | "internal";

export type ClassifiedAuditFailure = {
  kind: AuditFailureKind;
  retryable: boolean;
  message: string;
};

/** Make diagnostics safe for the UI while retaining the raw error in local logs. */
export function cleanAuditError(value: unknown) {
  const raw = String(value instanceof Error ? value.message : value ?? "").trim();
  if (!raw) return "";
  const withoutAnsi = raw.replace(/[\u001b\u009b]\[[0-?]*[ -\/]*[@-~]/g, "").replace(/\[(?:\d{1,3};?)+m/g, "");
  if (/page\.screenshot: target page, context or browser has been closed/i.test(withoutAnsi))
    return "Browser screenshot failed: page or browser closed unexpectedly.";
  return withoutAnsi.replace(/\s+/g, " ").trim().slice(0, 1_000);
}

export type AuditRecoveryPlan = {
  mode: "selective" | "full_reaudit" | "none";
  stages: Array<"profile" | "browser" | "lighthouse">;
  reason: string;
};

/**
 * Historical records are eligible for automatic recovery only when their
 * durable stage ledger proves that we can omit already-completed work. Older
 * partial audits without a ledger are intentionally left for an explicit full
 * re-audit: guessing would repeat Lighthouse without knowing why.
 */
export function deriveAuditRecoveryPlan(metrics: Record<string, unknown>): AuditRecoveryPlan {
  const stages = metrics.stages as Record<string, { status?: string }> | undefined;
  if (!stages) return { mode: "full_reaudit", stages: ["profile", "browser", "lighthouse"], reason: "Historical partial audit has no persisted stage ledger." };
  const profile = stages.profile?.status;
  const browser = stages.browser?.status;
  const lighthouse = stages.lighthouse?.status;
  if (profile !== "completed") return { mode: "full_reaudit", stages: ["profile", "browser", "lighthouse"], reason: "Homepage profile was not durably completed." };
  if (["failed", "pending", "skipped"].includes(browser ?? ""))
    return { mode: "selective", stages: ["browser", "lighthouse"], reason: "Reuses the persisted homepage profile; browser stage is incomplete." };
  if (["failed", "pending", "skipped"].includes(lighthouse ?? ""))
    return { mode: "selective", stages: ["lighthouse"], reason: "Browser evidence is complete; only Lighthouse metrics are missing." };
  return { mode: "none", stages: [], reason: "All recorded stages are complete." };
}

/**
 * Keep retry policy deterministic and conservative. A retry is useful for a
 * transient transport/browser failure, never for an access restriction or an
 * ordinary client-side HTTP response.
 */
export function classifyAuditFailure(error: unknown): ClassifiedAuditFailure {
  const message = cleanAuditError(error);
  const lower = message.toLowerCase();
  if (/cancelled|aborted/.test(lower)) return { kind: "cancelled", retryable: false, message };
  if (/http 403/.test(lower)) return { kind: "http_403", retryable: false, message };
  if (/access restricted|robots/.test(lower)) return { kind: "access_restricted", retryable: false, message };
  if (/http 404/.test(lower)) return { kind: "http_404", retryable: false, message };
  // Rate limits and server errors are transport conditions, not a statement
  // about the lead's website quality. The durable queue applies its bounded
  // backoff before retrying them.
  if (/http 429/.test(lower)) return { kind: "http_429", retryable: true, message };
  if (/http (?:408|5\d\d)/.test(lower)) return { kind: "http_5xx", retryable: true, message };
  if (/http (?:400|401|402|404|405|410|451)/.test(lower)) return { kind: "http_error", retryable: false, message };
  if (/timed out|timeout|econnreset|eai_again|enotfound|dns|fetch failed/.test(lower))
    return { kind: /enotfound|dns/.test(lower) ? "dns" : "timeout", retryable: true, message };
  if (/chromium|browser has been closed|target page|crash/.test(lower)) return { kind: "browser_crash", retryable: true, message };
  if (/lighthouse/.test(lower)) return { kind: "lighthouse", retryable: true, message };
  return { kind: "internal", retryable: false, message };
}

/**
 * A partial result can still contain durable HTTP/browser evidence. Return a
 * recovery recommendation rather than throwing it away; the queue decides
 * whether another bounded attempt is allowed.
 */
export function recoverablePartialFailure(metrics: Record<string, unknown>) {
  const stages = metrics.stages as Record<string, { status?: string; reason?: string }> | undefined;
  const browser = stages?.browser;
  const lighthouse = stages?.lighthouse;
  if (browser?.status === "failed") {
    const failure = classifyAuditFailure(browser.reason ?? "Browser stage failed.");
    return failure.retryable ? { failure, stages: ["browser", "lighthouse"] } : null;
  }
  if (lighthouse?.status === "failed") {
    const failure = classifyAuditFailure(lighthouse.reason ?? "Lighthouse stage failed.");
    return failure.retryable ? { failure, stages: ["lighthouse"] } : null;
  }
  return null;
}

function configuredAuditProxy() {
  const value = process.env.WEBSITE_AUDIT_PROXY_URL?.trim();
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("WEBSITE_AUDIT_PROXY_URL must be a valid HTTP, HTTPS, or SOCKS5 proxy URL."); }
  if (!/^(http:|https:|socks5:)$/i.test(url.protocol) || !url.hostname)
    throw new Error("WEBSITE_AUDIT_PROXY_URL only supports HTTP, HTTPS, or SOCKS5 proxies.");
  return {
    server: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
  };
}

// Lighthouse keeps timing marks in a process-wide logger. Running two audits
// through the same Node process at once can make one run close the other's
// `lh:driver:navigate` mark, producing the misleading "performance mark has
// not been set" error. Browser/profile work remains concurrent; only this
// Lighthouse section is serialized.
let lighthouseQueue = Promise.resolve();
export async function runSerializedLighthouse<T>(work: () => Promise<T>): Promise<T> {
  const previous = lighthouseQueue;
  let release!: () => void;
  lighthouseQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

const desktop = { width: 1440, height: 960 };
const mobile = { width: 390, height: 844 };

function cleanUrl(value: string) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!/^https?:$/i.test(url.protocol))
    throw new Error("Only public HTTP(S) websites can be audited.");
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()))
    throw new Error("Local websites cannot be audited.");
  return url;
}

function privateAddress(address: string) {
  if (isIP(address) === 4)
    return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      address,
    );
  const value = address.toLowerCase();
  return (
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80:")
  );
}

const hostnameSafety = new Map<string, Promise<void>>();
function assertPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (
    ["localhost", "localhost.localdomain"].includes(normalized) ||
    privateAddress(normalized)
  )
    return Promise.reject(
      new Error("Local or private network websites cannot be audited."),
    );
  if (!hostnameSafety.has(normalized))
    hostnameSafety.set(
      normalized,
      lookup(normalized, { all: true }).then((records) => {
        if (
          !records.length ||
          records.some((record) => privateAddress(record.address))
        )
          throw new Error(
            "Website resolves to a private or unavailable network address.",
          );
      }),
    );
  return hostnameSafety.get(normalized)!;
}

async function protectBrowserContext(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    try {
      const url = new URL(route.request().url());
      if (!/^https?:$/i.test(url.protocol)) return route.abort();
      await assertPublicHostname(url.hostname);
      return route.continue();
    } catch {
      return route.abort();
    }
  });
}

function screenshotPath(
  root: string,
  auditId: string,
  kind: "desktop" | "mobile",
) {
  return join(root, "data", "audits", `${auditId}-${kind}.png`);
}

function publicScreenshotPath(auditId: string, kind: "desktop" | "mobile") {
  return `/api/website-audits/${auditId}/screenshots/${kind}`;
}

function launchPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close();
      if (!address || typeof address === "string")
        reject(new Error("Could not allocate a browser port."));
      else resolve(address.port);
    });
  });
}

function browserPath(root: string) {
  const configured = process.env.WEBSITE_AUDIT_CHROMIUM_PATH;
  if (configured && existsSync(configured)) return configured;
  const bundled = join(
    root,
    ".cache",
    "playwright-browsers",
    "chromium-1228",
    "chrome-linux64",
    "chrome",
  );
  return existsSync(bundled) ? bundled : undefined;
}

async function inspectPage(
  page: Page,
  url: string,
  issues: AuditIssue[],
  runFullHomepageChecks: boolean,
) {
  const response = await page.goto(url, {
    // Public sites often keep analytics connections open indefinitely. A
    // completed document is sufficient for deterministic homepage evidence.
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  if (!response)
    throw new Error("The website did not return a navigation response.");
  if (response.status() >= 400)
    throw new Error(`The website returned HTTP ${response.status()}.`);
  await page
    .waitForLoadState("networkidle", { timeout: 8_000 })
    .catch(() => undefined);

  const evidence = (await page.evaluate(`(() => {
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content")?.trim() ?? "";
    const internal = [...document.querySelectorAll('a[href]')]
      .map((link) => {
        const target = new URL(link.href);
        const samePageAnchor = target.origin === location.origin && target.pathname === location.pathname && Boolean(target.hash);
        const fragment = samePageAnchor ? decodeURIComponent(target.hash.slice(1)) : "";
        return {
          href: link.href,
          text: (link.textContent ?? "").trim(),
          samePageAnchor,
          fragmentExists: !samePageAnchor || Boolean(document.getElementById(fragment)),
        };
      })
      .filter((link) => link.href.startsWith(location.origin) && link.href !== location.href)
      .filter((link, index, all) => all.findIndex((item) => item.href === link.href) === index)
      .slice(0, 12);
    const images = [...document.images].map((image) => ({
      src: image.currentSrc || image.src, alt: image.getAttribute("alt"), naturalWidth: image.naturalWidth,
      renderedWidth: image.getBoundingClientRect().width, width: image.getAttribute("width"), height: image.getAttribute("height"),
    }));
    const ctaText = [...document.querySelectorAll('a, button')].map((element) => (element.textContent ?? "").trim()).filter(Boolean).slice(0, 80);
    const actionLinks = [...document.querySelectorAll('a[href], button')].map((element) => {
      const text = (element.textContent ?? "").trim();
      const href = element instanceof HTMLAnchorElement ? element.href : '';
      const haystack = text + ' ' + (element.getAttribute('href') ?? '');
      const kind = /book|booking|schedule|appointment|reserve/i.test(haystack) ? 'booking' : /contact|quote|estimate|call|email|message/i.test(haystack) ? 'contact' : /get started|learn more|request|start now|buy|shop/i.test(haystack) ? 'cta' : '';
      return kind ? { href, text, kind } : null;
    }).filter(Boolean).filter((link, index, all) => all.findIndex((item) => item?.href === link?.href) === index).slice(0, 8);
    const selectorFor = (element) => {
      if (element.id) return '#' + CSS.escape(element.id);
      const parent = element.parentElement;
      if (!parent) return element.tagName.toLowerCase();
      const siblings = [...parent.children].filter((item) => item.tagName === element.tagName);
      return element.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(element) + 1) + ')';
    };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((element) => ({ tag: element.tagName.toLowerCase(), selector: selectorFor(element), text: (element.textContent ?? '').trim().slice(0, 160) }));
    const controls = [...document.querySelectorAll('a,button,input,select,textarea')].map((element) => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder') || (element.id ? document.querySelector('label[for="' + CSS.escape(element.id) + '"]')?.textContent : '') || (element.textContent ?? '').trim();
      return { selector: selectorFor(element), tag: element.tagName.toLowerCase(), name: label.trim().slice(0, 160), width: rect.width, height: rect.height, fontSize: Number.parseFloat(style.fontSize) || 0 };
    });
    const ctaCount = [...document.querySelectorAll('a,button')].filter((element) => /contact|quote|book|call|start|get started|schedule|order|shop/i.test((element.textContent ?? '') + ' ' + (element.getAttribute('href') ?? '') + ' ' + (element.getAttribute('aria-label') ?? ''))).length;
    return { title: document.title.trim(), description, viewport, scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth, internal, images, ctaText, actionLinks, headings, controls, ctaCount };
  })()`)) as {
    title: string;
    description: string;
    viewport: string;
    scrollWidth: number;
    clientWidth: number;
    internal: Array<{
      href: string;
      text: string;
      samePageAnchor: boolean;
      fragmentExists: boolean;
    }>;
    images: Array<{
      src: string;
      alt: string | null;
      naturalWidth: number;
      renderedWidth: number;
      width: string | null;
      height: string | null;
    }>;
    ctaText: string[];
    actionLinks: ActionLink[];
    headings: Array<{ tag: string; selector: string; text: string }>;
    controls: Array<{ selector: string; tag: string; name: string; width: number; height: number; fontSize: number }>;
    ctaCount: number;
  };

  if (runFullHomepageChecks && !evidence.title)
    issues.push({
      category: "seo",
      severity: "high",
      url,
      evidence: "The page has no document title.",
      suggestion: "Add a concise, descriptive <title> for this page.",
    });
  if (runFullHomepageChecks && !evidence.description)
    issues.push({
      category: "seo",
      severity: "medium",
      url,
      evidence: "No meta description was found.",
      suggestion: "Add a unique meta description that summarizes this page.",
    });
  if (runFullHomepageChecks && !evidence.viewport)
    issues.push({
      category: "mobile",
      severity: "high",
      url,
      evidence: "The homepage has no viewport meta tag.",
      suggestion: "Add a responsive viewport meta tag.",
    });
  if (evidence.scrollWidth > evidence.clientWidth + 2)
    issues.push({
      category: "mobile",
      severity: "medium",
      url,
      evidence: `Document width (${evidence.scrollWidth}px) exceeds viewport width (${evidence.clientWidth}px).`,
      suggestion:
        "Fix the overflowing element and verify the page at narrow mobile widths.",
    });

  if (runFullHomepageChecks) {
    const missingAlt = evidence.images.filter(
      (image) => image.alt === null || image.alt === "",
    );
    if (missingAlt.length)
      issues.push({
        category: "accessibility",
        severity: "medium",
        url,
        evidence: `${missingAlt.length} image(s) have no alt text.`,
        suggestion:
          "Provide meaningful alt text for informative images and empty alt text only for decorative images.",
      });
    const oversized = evidence.images.filter(
      (image) =>
        image.naturalWidth > 1200 &&
        image.renderedWidth > 0 &&
        image.naturalWidth / image.renderedWidth > 2.5,
    );
    if (oversized.length)
      issues.push({
        category: "performance",
        severity: "low",
        url,
        evidence: `${oversized.length} image(s) are delivered at more than 2.5× their rendered width.`,
        suggestion:
          "Serve responsive image sizes and modern compressed formats.",
      });
    const noDimensions = evidence.images.filter(
      (image) => !image.width || !image.height,
    );
    if (noDimensions.length)
      issues.push({
        category: "performance",
        severity: "low",
        url,
        evidence: `${noDimensions.length} image(s) lack explicit width and height attributes.`,
        suggestion:
          "Declare image dimensions or aspect ratios to reduce layout shifts.",
      });
    const hasAction = evidence.ctaText.some((text) =>
      /contact|quote|book|call|start|get started|schedule|order|shop/i.test(
        text,
      ),
    );
    if (!hasAction)
      issues.push({
        category: "content",
        severity: "low",
        url,
        evidence:
          "No visible action label matching contact, quote, booking, call, start, schedule, order, or shop was detected.",
        suggestion:
          "Add a clear primary call to action with an action-oriented label.",
      });
  }
  return {
    ...evidence,
    html: runFullHomepageChecks ? await page.content() : "",
  };
}

async function validateHomepageInternalLinks(
  links: Array<{
    href: string;
    text: string;
    samePageAnchor: boolean;
    fragmentExists: boolean;
  }>,
  issues: AuditIssue[],
) {
  let failures = 0;
  // Homepage-only audits must not fetch or navigate to linked pages. We can
  // still validate fragment links against IDs present in the homepage DOM.
  for (const link of links.filter(
    (item) => item.samePageAnchor && !item.fragmentExists,
  )) {
    issues.push({
      category: "links",
      severity: "low",
      url: link.href,
      evidence: `Homepage link${link.text ? ` “${link.text}”` : ""} points to a fragment that is not present on the homepage.`,
      suggestion:
        "Add the matching element ID or update the homepage link target.",
    });
    failures += 1;
  }
  return failures;
}

async function validateActionLinks(links: ActionLink[], baseUrl: string, issues: AuditIssue[], maxChecks = 8, signal?: AbortSignal) {
  const signals: HomepageSignal[] = [];
  for (const link of links.slice(0, maxChecks)) {
    let target: URL;
    try { target = new URL(link.href, baseUrl); } catch { continue; }
    const label = link.text || target.pathname || link.kind;
    if (!link.href || target.protocol === "javascript:" || target.href === "#") {
      issues.push({ category: "links", severity: "medium", url: baseUrl, evidence: `${link.kind} action “${label}” has no navigable destination.`, suggestion: "Connect the action to a safe, working destination.", verificationStatus: "verified" });
      signals.push({ code: "NONFUNCTIONAL_CTA", label: "Nonfunctional CTA", group: "contact", value: label, confidence: 0.95, evidenceExcerpt: `CTA “${label}” has no navigable destination.`, verificationStatus: "verified" });
      continue;
    }
    if (!/^https?:$/i.test(target.protocol)) continue;
    try {
      await assertPublicHostname(target.hostname);
      const response = await safeFetchText(target, signal, 32_000);
      if (response.status >= 400) {
        const code = link.kind === "booking" ? "BROKEN_BOOKING_LINK" : "BROKEN_CONTACT_LINK";
        const group = link.kind === "booking" ? "booking" : "contact";
        const evidence = `${link.kind} link “${label}” returned HTTP ${response.status}.`;
        issues.push({ category: "links", severity: "high", url: target.toString(), evidence, suggestion: "Repair the link and verify it without submitting a form.", verificationStatus: "verified" });
        signals.push({ code, label: code === "BROKEN_BOOKING_LINK" ? "Broken booking link" : "Broken contact link", group, value: target.toString(), confidence: 0.98, evidenceExcerpt: evidence, verificationStatus: "verified" });
      } else if (response.redirects.length > 2) issues.push({ category: "links", severity: "medium", url: target.toString(), evidence: `Action link used ${response.redirects.length} redirects before reaching ${response.url}.`, suggestion: "Reduce redirect chains and verify the final destination.", verificationStatus: "verified" });
    } catch (error) {
      const evidence = `${link.kind} link “${label}” could not be verified safely${error instanceof Error ? `: ${error.message}` : "."}`;
      signals.push({ code: "NONFUNCTIONAL_CTA", label: "CTA verification inconclusive", group: "contact", value: target.toString(), confidence: 0.35, evidenceExcerpt: evidence, verificationStatus: "inconclusive" });
    }
  }
  return signals;
}

type SafeFetchResult = { url: string; status: number; text: string; redirects: string[]; retryAfterMs?: number };

function retryAfterMs(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.round(seconds * 1_000));
  const when = Date.parse(value);
  return Number.isFinite(when) ? Math.max(0, Math.min(60_000, when - Date.now())) : undefined;
}

const profileMaxPages = () => Math.max(1, Math.min(12, Number(process.env.WEBSITE_AUDIT_MAX_PAGES ?? 6) || 6));
const profileMaxRequests = () => Math.max(4, Math.min(40, Number(process.env.WEBSITE_AUDIT_MAX_REQUESTS ?? 18) || 18));

async function safeFetchText(start: URL, signal?: AbortSignal, maxBytes = 1_000_000): Promise<SafeFetchResult> {
  let current = new URL(start.toString());
  const redirects: string[] = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assertPublicHostname(current.hostname);
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000);
    const response = await fetch(current, { redirect: "manual", signal: requestSignal, headers: { "user-agent": "GoogleCaptureWebsiteProfiler/1.0" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { url: current.toString(), status: response.status, text: "", redirects };
      const next = new URL(location, current);
      redirects.push(`${current.toString()} -> ${next.toString()}`);
      await assertPublicHostname(next.hostname);
      current = next;
      continue;
    }
    const body = await response.text();
    return { url: current.toString(), status: response.status, text: body.slice(0, maxBytes), redirects, retryAfterMs: retryAfterMs(response.headers.get("retry-after")) };
  }
  throw new Error("Redirect limit exceeded.");
}

function robotsRules(text: string) {
  const disallowed: string[] = [];
  let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [key, value] = line.split(":", 2).map((part) => part.trim());
    if (key?.toLowerCase() === "user-agent") applies = value === "*" || /googlecapture|gptbot|chatgpt-user/i.test(value);
    if (applies && key?.toLowerCase() === "disallow" && value) disallowed.push(value);
  }
  return { disallowed };
}

function robotsAllows(pathname: string, disallowed: string[]) {
  return !disallowed.some((rule) => rule === "/" || (rule && pathname.startsWith(rule.replace(/\*$/, ""))));
}

function sitemapUrls(text: string, base: URL) {
  return [...text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => {
    try { return new URL(match[1].trim(), base); } catch { return null; }
  }).filter((url): url is URL => url !== null && url.origin === base.origin && /^https?:$/i.test(url.protocol));
}

function profileSignal(code: string, label: string, group: HomepageSignal["group"], value: string, evidenceExcerpt: string, verificationStatus: HomepageSignal["verificationStatus"] = "verified", confidence = 0.9): HomepageSignal {
  return { code, label, group, value, confidence, evidenceExcerpt: evidenceExcerpt.slice(0, 500), verificationStatus };
}

function addFormFindings(url: string, html: string, issues: AuditIssue[], signals: HomepageSignal[]) {
  const forms = [...html.matchAll(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/gi)];
  for (const form of forms.slice(0, 4)) {
    const markup = form[0];
    const action = markup.match(/\baction=["']([^"']*)["']/i)?.[1] ?? "";
    const method = (markup.match(/\bmethod=["']([^"']*)["']/i)?.[1] ?? "get").toLowerCase();
    const controls = [...markup.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)];
    if (!controls.length) {
      issues.push({ category: "links", severity: "medium", url, evidence: "A contact-like page contains a form with no input controls.", suggestion: "Provide accessible fields for the requested contact information.", verificationStatus: "verified" });
    }
    if (method === "post") {
      issues.push({ category: "links", severity: "low", url, evidence: `A form posts to ${action || "its current URL"}; validation was inspected without submission.`, suggestion: "Verify server-side validation and error handling separately in a controlled test environment.", verificationStatus: "possible" });
    }
    const required = controls.filter((control) => /\brequired\b/i.test(control[0])).length;
    if (controls.length && !required) issues.push({ category: "accessibility", severity: "low", url, evidence: "A contact form has no required-field markers in its inspected markup.", suggestion: "Mark essential fields and provide clear validation messages.", verificationStatus: "possible" });
    signals.push(profileSignal("CONTACT_FORM_URL", "Contact form URL", "contact", action || url, `Form inspected at ${url}; no values were submitted.`));
  }
}

function addPeopleFindings(url: string, html: string, signals: HomepageSignal[]) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) signals.push(profileSignal("CONTACT_FOUND", "Public contact found", "people", email, `A public email address was listed on ${url}.`, "verified", 0.9));
  const role = text.match(/\b(owner|founder|co-founder|president|director|manager|partner|principal|ceo|chief executive officer)\b[^.]{0,100}/i)?.[0];
  if (role) {
    signals.push(profileSignal("DECISION_MAKER_TITLE", "Decision-maker title", "people", role, `A decision-maker role was found on ${url}.`, "possible", 0.72));
    signals.push(profileSignal("LIKELY_OWNER", "Likely owner", "people", role, `Ownership-related language was found on ${url}; identity was not independently verified.`, "possible", 0.65));
  }
}

function selectProfileUrls(homepage: { internal: Array<{ href: string; text: string }>; }, sitemap: URL[], base: URL, limit: number) {
  const candidates = [...homepage.internal.map((item) => ({ url: item.href, text: item.text })), ...sitemap.map((url) => ({ url: url.toString(), text: "" }))];
  const priority = /contact|about|service|solution|book|appointment|schedule|team|staff|career|job|work-with-us/i;
  return candidates.filter((candidate, index, all) => {
    try { const url = new URL(candidate.url, base); return url.origin === base.origin && url.pathname !== base.pathname && all.findIndex((other) => other.url === candidate.url) === index; } catch { return false; }
  }).sort((a, b) => Number(priority.test(b.url + b.text)) - Number(priority.test(a.url + a.text))).slice(0, limit).map((candidate) => new URL(candidate.url, base));
}

type LightweightProfile = {
  url: string;
  html: string;
  pages: string[];
  issues: AuditIssue[];
  signals: HomepageSignal[];
  metrics: Record<string, unknown>;
  accessRestricted?: string;
};

function htmlMeta(html: string, name: string) {
  const quoted = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i");
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i");
  return html.match(quoted)?.[1]?.trim() ?? html.match(reversed)?.[1]?.trim() ?? "";
}

async function fetchPublicHomepage(target: URL, signal?: AbortSignal) {
  const candidates = [target];
  const hostname = target.hostname.replace(/^www\./i, "");
  if (target.pathname === "/" || target.pathname === "") {
    for (const protocol of ["https:", "http:"])
      for (const host of [hostname, `www.${hostname}`]) {
        const candidate = new URL(`${protocol}//${host}/`);
        if (!candidates.some((item) => item.toString() === candidate.toString())) candidates.push(candidate);
      }
  }
  let lastStatus = 0;
  for (const candidate of candidates) {
    try {
      const response = await safeFetchText(candidate, signal);
      lastStatus = response.status;
      if (response.status >= 200 && response.status < 300) return response;
      // Do not try alternate hostnames to evade an access decision.
      if (response.status === 403 || response.status === 401) return response;
      if (response.status === 429) throw new Error(`Homepage returned HTTP 429.${response.retryAfterMs ? ` Retry-After ${Math.ceil(response.retryAfterMs / 1_000)}s.` : ""}`);
      if (response.status >= 500 || response.status === 408) throw new Error(`Homepage returned HTTP ${response.status}.`);
    } catch (error) {
      if (candidates.indexOf(candidate) === candidates.length - 1) throw error;
    }
  }
  throw new Error(`Homepage returned HTTP ${lastStatus || 404}.`);
}

/**
 * A deliberately small, safe first stage inspired by Harvey's HTTP profiler:
 * only the public homepage plus robots/sitemap metadata. It creates durable
 * evidence without paying the Chromium/Lighthouse cost and it never follows
 * internal content pages.
 */
export async function profileHomepage(target: URL, signal?: AbortSignal): Promise<LightweightProfile> {
  const homepage = await fetchPublicHomepage(target, signal);
  const metrics: Record<string, unknown> = {
    stages: { profile: { status: "completed" }, browser: { status: "pending" }, lighthouse: { status: "pending" }, screenshot: { status: "pending" } },
    homepageHttpStatus: homepage.status,
    homepageRedirects: homepage.redirects,
  };
  if (homepage.status === 401 || homepage.status === 403) {
    const reason = homepage.status === 403
      ? "The public homepage returned HTTP 403; access was not bypassed."
      : `The public homepage returned HTTP ${homepage.status}; authentication is required.`;
    metrics.stages = { profile: { status: "access_restricted", reason }, browser: { status: "skipped" }, lighthouse: { status: "skipped" }, screenshot: { status: "skipped" } };
    return { url: homepage.url, html: "", pages: [], issues: [], signals: [], metrics, accessRestricted: reason };
  }
  if (homepage.status >= 400) throw new Error(`Homepage returned HTTP ${homepage.status}.`);

  const base = new URL(homepage.url);
  let robots = "";
  try { robots = (await safeFetchText(new URL("/robots.txt", base), signal, 256_000)).text; } catch { /* robots unavailable is not a website failure */ }
  const rules = robotsRules(robots);
  if (!robotsAllows(base.pathname || "/", rules.disallowed)) {
    const reason = "robots.txt disallows this homepage for the audit user agent; no browser or Lighthouse request was made.";
    metrics.stages = { profile: { status: "access_restricted", reason }, browser: { status: "skipped" }, lighthouse: { status: "skipped" }, screenshot: { status: "skipped" } };
    return { url: homepage.url, html: "", pages: [], issues: [], signals: [], metrics, accessRestricted: reason };
  }
  let sitemapCount = 0;
  try { sitemapCount = sitemapUrls((await safeFetchText(new URL("/sitemap.xml", base), signal, 512_000)).text, base).length; } catch { /* sitemap is optional */ }
  const html = homepage.text;
  const signals = detectHomepageSignals(html);
  const issues: AuditIssue[] = [];
  addFormFindings(homepage.url, html, issues, signals);
  addPeopleFindings(homepage.url, html, signals);
  if (!/<script[^>]+type=["']application\/ld\+json["']/i.test(html))
    signals.push(profileSignal("NO_SCHEMA_MARKUP", "Missing structured data on inspected homepage", "website_opportunities", "No JSON-LD detected in fetched homepage HTML", "The inspected homepage did not contain a JSON-LD script block; this is not proof that structured data is absent elsewhere.", "possible", 0.78));
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/<[^>]+>/g, "").trim() ?? "";
  metrics.profile = { title: title || null, description: htmlMeta(html, "description") || null, sitemapUrlCount: sitemapCount, staticIssueCount: issues.length };
  metrics.stages = { profile: { status: "completed", evidence: "homepage, robots.txt, sitemap.xml" }, browser: { status: "pending" }, lighthouse: { status: "pending" }, screenshot: { status: "pending" } };
  return { url: homepage.url, html, pages: [homepage.url], issues, signals, metrics };
}

export async function auditWebsite(options: {
  root: string;
  auditId: string;
  website: string;
  /** A completed profile may be reused by a selective recovery task. */
  preloadedProfile?: Pick<LightweightProfile, "url" | "pages" | "issues" | "signals" | "metrics">;
  signal?: AbortSignal;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
}) {
  const operationTimeout = Math.max(30_000, Number(process.env.WEBSITE_AUDIT_TOTAL_TIMEOUT_MS ?? 120_000));
  const navigationTimeout = Math.max(5_000, Number(process.env.WEBSITE_AUDIT_NAVIGATION_TIMEOUT_MS ?? 30_000));
  const lighthouseTimeout = Math.max(10_000, Number(process.env.WEBSITE_AUDIT_LIGHTHOUSE_TIMEOUT_MS ?? 55_000));
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(new Error("Website audit exceeded its total time limit.")), operationTimeout);
  const forwardAbort = () => controller.abort(options.signal?.reason ?? new Error("Audit cancelled."));
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const cleanupTimeoutMs = 1_500;
  const settleBeforeCleanup = async (workPromise: Promise<unknown>) => {
    await Promise.race([
      workPromise.then(() => undefined, () => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, cleanupTimeoutMs)),
    ]);
  };
  const bounded = async <T>(label: string, work: Promise<T>, timeout: number) => {
    const timeoutError = new Error(`${label} timed out after ${Math.round(timeout / 1000)} seconds.`);
    const workPromise = Promise.resolve(work);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let abortListener: (() => void) | undefined;
    try {
      return await Promise.race([
        workPromise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            controller.abort(timeoutError);
            reject(timeoutError);
          }, timeout);
        }),
        new Promise<T>((_, reject) => {
          if (controller.signal.aborted) return reject(controller.signal.reason ?? new Error("Audit cancelled."));
          abortListener = () => reject(controller.signal.reason ?? new Error("Audit cancelled."));
          controller.signal.addEventListener("abort", abortListener, { once: true });
        }),
      ]);
    } catch (error) {
      if (timedOut || controller.signal.aborted) await settleBeforeCleanup(workPromise);
      throw timedOut ? timeoutError : error;
    } finally {
      if (timer) clearTimeout(timer);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
    }
  };
  const target = cleanUrl(options.website);
  await assertPublicHostname(target.hostname);
  const progress = (stage: string, completed: number, total = 3) => options.onProgress?.({ stage, completed, total });
  progress("profile_started", options.preloadedProfile ? 1 : 0);
  const profile: LightweightProfile = options.preloadedProfile
    ? { ...options.preloadedProfile, html: "" }
    : await bounded("Lightweight homepage profile", profileHomepage(target, controller.signal), navigationTimeout + 8_000);
  if (!options.preloadedProfile) progress("profile_completed", 1);
  if (profile.accessRestricted) {
    return {
      url: profile.url,
      status: "access_restricted",
      score: null,
      performanceScore: null,
      seoScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      pages: profile.pages,
      desktopScreenshot: "",
      mobileScreenshot: "",
      metrics: profile.metrics,
      issues: profile.issues,
      signals: profile.signals,
      automatedUx: { method: "automated", status: "not_run", findings: [], checks: { total: 0, passed: 0, failed: 0 } },
    } satisfies WebsiteAuditResult;
  }
  const executablePath = browserPath(options.root);
  const port = await launchPort();
  const issues: AuditIssue[] = [...profile.issues];
  const pages: string[] = [...profile.pages];
  const desktopFile = screenshotPath(options.root, options.auditId, "desktop");
  const mobileFile = screenshotPath(options.root, options.auditId, "mobile");
  await mkdir(join(options.root, "data", "audits"), { recursive: true });
  let browser: Browser | undefined;
  const closeWithTimeout = async (resource: { close: () => Promise<void> } | undefined) => {
    if (!resource) return;
    await Promise.race([
      resource.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, cleanupTimeoutMs)),
    ]);
  };
  let metrics: Record<string, unknown> = { ...profile.metrics };
  let automatedUx: AutomatedUxResult = { method: "automated", status: "not_run", findings: [], checks: { total: 0, passed: 0, failed: 0 } };
  const proxy = configuredAuditProxy();
  metrics.network = {
    httpProfiler: "direct",
    browser: proxy ? "explicitly configured proxy" : "direct",
    proxyConfigured: Boolean(proxy),
    // A regional observation is only recorded when a dedicated, authorized
    // regional relay exists. This runtime has one explicit proxy setting, so
    // it must not claim a geographic comparison it did not perform.
    regionalCheck: { status: "regional_check_unavailable", reason: "No authorized region-specific audit relay is configured." },
  };
  if (controller.signal.aborted) throw controller.signal.reason ?? new Error("Audit cancelled.");
  try {
    browser = await bounded("Chromium launch", chromium.launch({
      headless: true,
      executablePath,
      ...(proxy ? { proxy } : {}),
      args: [
        `--remote-debugging-port=${port}`,
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    }), navigationTimeout);
    progress("browser_launched", 1);
    const desktopContext = await bounded("Desktop browser context", browser.newContext({
      viewport: desktop,
      deviceScaleFactor: 1,
    }), navigationTimeout);
    try {
    await bounded("Desktop route protection", protectBrowserContext(desktopContext), navigationTimeout);
    const desktopPage = await bounded("Desktop page", desktopContext.newPage(), navigationTimeout);
    const homepage = await bounded("Homepage navigation", inspectPage(
      desktopPage,
      target.toString(),
      issues,
      true,
    ), navigationTimeout + 8_000);
    let mobileHomepage: typeof homepage;
    const browserHomepageUrl = desktopPage.url() || profile.url;
    if (!pages.includes(browserHomepageUrl)) pages.push(browserHomepageUrl);
    const signals = [...profile.signals, ...detectHomepageSignals(homepage.html)];
    progress("desktop_navigation_completed", 2);
    progress("desktop_screenshot_started", 2);
    await bounded("Desktop screenshot", desktopPage.screenshot({ path: desktopFile, fullPage: true, timeout: navigationTimeout }), navigationTimeout);
    progress("desktop_screenshot_completed", 2);
    metrics = {
      ...metrics,
      stages: {
        ...(metrics.stages as Record<string, unknown> ?? {}),
        desktop_screenshot: { status: "completed", evidence: "desktop homepage screenshot" },
      },
    };
    const navigationFailures = await validateHomepageInternalLinks(homepage.internal, issues);
    if (navigationFailures) signals.push({ code: "HOMEPAGE_NAV_FAILURE", label: "Homepage navigation failure", group: "website_opportunities", value: `${navigationFailures} missing homepage fragment target(s)`, confidence: 0.98, evidenceExcerpt: `${navigationFailures} homepage navigation target(s) did not resolve to an element on the page.`, verificationStatus: "verified" });
    signals.push(...await validateActionLinks(homepage.actionLinks, target.toString(), issues, 8, controller.signal));
    addFormFindings(target.toString(), homepage.html, issues, signals);
    addPeopleFindings(target.toString(), homepage.html, signals);
    if (!/<script[^>]+type=["']application\/ld\+json["']/i.test(homepage.html)) signals.push({ code: "NO_SCHEMA_MARKUP", label: "Missing structured data on inspected homepage", group: "website_opportunities", value: "No JSON-LD detected in fetched homepage HTML", confidence: 0.78, evidenceExcerpt: "The inspected homepage did not contain a JSON-LD script block; this is not proof that structured data is absent elsewhere.", verificationStatus: "possible" });
    const seoIssues = issues.filter((issue) => issue.category === "seo");
    if (seoIssues.length) signals.push({ code: "TECHNICAL_SEO_ISSUE", label: "Technical SEO issue", group: "website_opportunities", value: `${seoIssues.length} homepage SEO issue(s)`, confidence: 0.95, evidenceExcerpt: seoIssues.map((issue) => issue.evidence).join(" ").slice(0, 500), verificationStatus: "verified" });

    // Audits deliberately inspect only the homepage. We validate its fragment and
    // action targets without crawling linked pages.
    await closeWithTimeout(desktopContext);

    progress("mobile_started", 2);
    const mobileContext = await bounded("Mobile browser context", browser.newContext({
      viewport: mobile,
      isMobile: true,
      deviceScaleFactor: 1,
    }), navigationTimeout);
    try {
      await bounded("Mobile route protection", protectBrowserContext(mobileContext), navigationTimeout);
      const mobilePage = await bounded("Mobile page", mobileContext.newPage(), navigationTimeout);
      mobileHomepage = await bounded("Mobile homepage navigation", inspectPage(mobilePage, target.toString(), issues, false), navigationTimeout + 8_000);
      progress("mobile_screenshot_started", 2);
      await bounded("Mobile screenshot", mobilePage.screenshot({ path: mobileFile, fullPage: true, timeout: navigationTimeout }), navigationTimeout);
      progress("mobile_screenshot_completed", 2);
      metrics = {
        ...metrics,
        stages: {
          ...(metrics.stages as Record<string, unknown> ?? {}),
          mobile_screenshot: { status: "completed", evidence: "mobile homepage screenshot" },
          screenshot: { status: "completed", evidence: "desktop and mobile homepage screenshots" },
        },
      };
    } finally { await closeWithTimeout(mobileContext); }

    try {
      const desktopSnapshot: AutomatedUxSnapshot = { viewportWidth: desktop.width, scrollWidth: homepage.scrollWidth, clientWidth: homepage.clientWidth, viewportMeta: homepage.viewport, headings: homepage.headings, controls: homepage.controls, ctaCount: homepage.ctaCount };
      const mobileSnapshot: AutomatedUxSnapshot = { viewportWidth: mobile.width, scrollWidth: mobileHomepage.scrollWidth, clientWidth: mobileHomepage.clientWidth, viewportMeta: mobileHomepage.viewport, headings: mobileHomepage.headings, controls: mobileHomepage.controls, ctaCount: mobileHomepage.ctaCount };
      automatedUx = analyzeAutomatedUx(desktopSnapshot, mobileSnapshot);
      issues.push(...automatedUx.findings.map((item) => ({ category: item.category, severity: item.severity, url: target.toString(), evidence: `${item.evidence} Selector: ${item.selector}; property: ${item.property}; observed: ${item.observedValue}; rule: ${item.rule}`, suggestion: item.suggestion, verificationStatus: "verified" as const })));
      metrics = { ...metrics, automatedUx: { method: "automated", status: automatedUx.status, checks: automatedUx.checks }, stages: { ...(metrics.stages as Record<string, unknown> ?? {}), automated_ux: { status: "completed", method: "automated", evidence: "deterministic DOM, CSS and viewport checks" } } };
    } catch (error) {
      automatedUx = { method: "automated", status: "failed", error: cleanAuditError(error), findings: [], checks: { total: 0, passed: 0, failed: 1 } };
      metrics = { ...metrics, automatedUx, stages: { ...(metrics.stages as Record<string, unknown> ?? {}), automated_ux: { status: "failed", reason: automatedUx.error } } };
    }

    try {
      progress("lighthouse_started", 2);
      const lighthouseOptions = {
        port,
        output: "json" as const,
        logLevel: "error" as const,
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      };
      const result = await runSerializedLighthouse(() => bounded("Lighthouse", lighthouse(browserHomepageUrl, lighthouseOptions), lighthouseTimeout));
      const categories = result?.lhr.categories;
      const score = (id: string) => {
        const value = categories?.[id]?.score;
        return typeof value === "number" ? Math.round(value * 100) : null;
      };
      const audits = result?.lhr.audits ?? {};
      const { browserError: _staleBrowserError, lighthouseError: _staleLighthouseError, ...currentMetrics } = metrics;
      metrics = {
        firstContentfulPaint:
          audits["first-contentful-paint"]?.displayValue ?? null,
        largestContentfulPaint:
          audits["largest-contentful-paint"]?.displayValue ?? null,
        cumulativeLayoutShift:
          audits["cumulative-layout-shift"]?.displayValue ?? null,
        totalBlockingTime: audits["total-blocking-time"]?.displayValue ?? null,
        ...currentMetrics,
        stages: { ...(metrics.stages as Record<string, unknown> ?? {}), browser: { status: "completed" }, lighthouse: { status: "completed" } },
      };
      const performanceScore = score("performance");
      const accessibilityScore = score("accessibility");
      const bestPracticesScore = score("best-practices");
      const seoScore = score("seo");
      progress("lighthouse_completed", 3);
      const scores = [
        performanceScore,
        accessibilityScore,
        bestPracticesScore,
        seoScore,
      ].filter((value): value is number => value !== null);
      if (issues.some((issue) => issue.category === "mobile")) signals.push({ code: "MOBILE_USABILITY_ISSUE", label: "Mobile usability issue", group: "website_opportunities", value: "Mobile audit found layout or viewport issues", confidence: 0.95, evidenceExcerpt: issues.filter((issue) => issue.category === "mobile").map((issue) => issue.evidence).join(" ").slice(0, 500), verificationStatus: "verified" });
      if (issues.some((issue) => issue.category === "performance") || (performanceScore !== null && performanceScore < 80)) signals.push({ code: "PERFORMANCE_ISSUE", label: "Performance issue", group: "website_opportunities", value: performanceScore !== null ? `Lighthouse performance ${performanceScore}/100` : "Homepage performance findings", confidence: 0.9, evidenceExcerpt: issues.filter((issue) => issue.category === "performance").map((issue) => issue.evidence).join(" ") || `Lighthouse performance score was ${performanceScore}/100.`, verificationStatus: "verified" });
      return {
        url: target.toString(),
        status: scores.length === 4 && automatedUx.status === "completed" ? "completed" : "partial",
        score:
          scores.length === 4
            ? Math.round(
                scores.reduce((sum, value) => sum + value, 0) / scores.length,
              )
            : null,
        performanceScore,
        accessibilityScore,
        bestPracticesScore,
        seoScore,
        pages,
        desktopScreenshot: publicScreenshotPath(options.auditId, "desktop"),
        mobileScreenshot: publicScreenshotPath(options.auditId, "mobile"),
        metrics,
        issues,
        signals,
        automatedUx,
      } satisfies WebsiteAuditResult;
    } catch (error) {
      progress("lighthouse_failed", 2);
      metrics = {
        ...metrics,
        lighthouse: "Not Analyzed",
        lighthouseError:
          cleanAuditError(error),
        stages: { ...(metrics.stages as Record<string, unknown> ?? {}), browser: { status: "completed" }, lighthouse: { status: "failed", reason: cleanAuditError(error) } },
      };
      return {
        url: target.toString(),
        status: "partial",
        score: null,
        performanceScore: null,
        accessibilityScore: null,
        bestPracticesScore: null,
        seoScore: null,
        pages,
        desktopScreenshot: publicScreenshotPath(options.auditId, "desktop"),
        mobileScreenshot: publicScreenshotPath(options.auditId, "mobile"),
        metrics,
        issues,
        signals,
        automatedUx,
      } satisfies WebsiteAuditResult;
    }
    } finally { await closeWithTimeout(desktopContext); }
  } catch (error) {
    const failure = classifyAuditFailure(error);
    // A completed HTTP profile is already durable evidence. Browser instability
    // must degrade to a partial audit rather than erase it or block the queue.
    if (profile.pages.length) {
      metrics = {
        ...metrics,
        browserError: failure.message,
        stages: { ...(metrics.stages as Record<string, unknown> ?? {}), browser: { status: "failed", reason: failure.message }, lighthouse: { status: "skipped" }, screenshot: { status: "failed", reason: failure.message } },
      };
      return {
        url: profile.url,
        status: failure.kind === "access_restricted" ? "access_restricted" : "partial",
        score: null,
        performanceScore: null,
        seoScore: null,
        accessibilityScore: null,
        bestPracticesScore: null,
        pages: profile.pages,
        desktopScreenshot: "",
        mobileScreenshot: "",
        metrics,
        issues,
        signals: profile.signals,
        automatedUx,
      } satisfies WebsiteAuditResult;
    }
    throw error;
  } finally {
    clearTimeout(totalTimer);
    options.signal?.removeEventListener("abort", forwardAbort);
    await closeWithTimeout(browser);
  }
}

export function storedScreenshotPath(
  root: string,
  auditId: string,
  kind: "desktop" | "mobile",
) {
  return screenshotPath(root, auditId, kind);
}
