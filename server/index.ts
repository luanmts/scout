import { createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import express, { type Response } from "express";
import { dedupePublicContacts, discoverContacts, isLikelyThirdPartyAdministrativeContact, isThirdPartyAdministrativeContact, normalizeEmail, normalizeSocial, normalizeText, selectBestContactEmail, type PublicContact, type PublicLead } from "./contact-discovery.js";
import {
  auditWebsite,
  cleanAuditError,
  classifyAuditFailure,
  deriveAuditRecoveryPlan,
  recoverablePartialFailure,
  storedScreenshotPath,
  type WebsiteAuditResult,
} from "./website-intelligence.js";
import { signalCatalog } from "./lead-intelligence.js";
import { calculateIcpScore, type IcpRule } from "./icp-scoring.js";
import { compileCohortDefinition, type CompiledCohort } from "./cohort-engine.js";
import { assessOutreachSubject, commercialBuyerLens, commercialEvidenceContext, hasConcreteCommercialEvidence, isPoorOutreachSubject, outreachModeGuidance, outreachSubjectPolicy, outreachVariationDirection, outreachWritingStandards, safeOutreachGuidance, selectCommercialFocus, selectOutreachEvidence, shouldSkipBatchDraft } from "./outreach-policy.js";

function cleanAuditDiagnostics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanAuditDiagnostics);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    typeof item === "string" && /error|reason|message/i.test(key) ? cleanAuditError(item) : cleanAuditDiagnostics(item),
  ]));
}
import { assessOutreachNarrative, ensureEnglishGreeting, parseOutreachDraft, parseOutreachSubject, removeStylisticDashes, trustedFirstName } from "./outreach-format.js";
import { officialOutreachGuidelinesPrompt } from "./outreach-guidelines.js";
import { applyFixedOutreachSignature, stripFixedOutreachSignature } from "./outreach-signature.js";
import { boundedTimeout, terminalCodeFromAbort } from "./outreach-runtime.js";
import { regionalizedSearchQuery, unitedStatesRegions } from "./search-planning.js";
import { catalogEntry, expandIndustryTerms, industryCatalog, INDUSTRY_CATALOG_VERSION, isIndustryRelevant } from "./industry-catalog.js";
import { decideLeadArchive, type LeadArchiveDecision } from "./lead-archive-policy.js";
import { evaluateLeadQualification } from "./lead-qualification.js";
import { calculateWebsiteOpportunity } from "./website-opportunity-scoring.js";
import { AI_VISUAL_MODEL, visualUxModelAllowed } from "./visual-ux-policy.js";
import { deriveSearchStage, deriveSearchStatus } from "./search-status.js";
import { EncryptedMailAccountStore, type MailSecret } from "./mail-account-store.js";
import { PendingOAuthState, zohoCallbackFailure } from "./mail-oauth-state.js";
import { exchangeGmailCode, exchangeZohoCode, formatOutreachEmailHtml, GMAIL_SEND_SCOPE, gmailAuthorizationUrl, GmailProviderError, sendGmailMessage, sendZohoMessage, testGmail, testZoho, testZohoOAuth, validateZohoConfig, ZOHO_MAIL_SEND_SCOPE, zohoAuthorizationUrl, type GmailConfig, type MailSendResult, type ZohoOAuthConfig } from "./mail-providers.js";
import { classifyOutboxDispatchError, dailyCapReached, distributeOutboxAccounts, outboxDispatchState, outboxGate, scheduledOutboxTime, type OutboxStatus } from "./outreach-outbox.js";

const root = process.cwd();
await mkdir(join(root, "storage"), { recursive: true });
function loadLocalEnv() {
  try {
    for (const line of readFileSync(join(root, ".env"), "utf8").split(
      /\r?\n/,
    )) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined)
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    /* Local .env is optional. */
  }
}
loadLocalEnv();
const execute = promisify(execFile);
const gosomUrl = process.env.GOSOM_URL ?? "http://127.0.0.1:8080";
const port = Number(process.env.PORT ?? 8787);
const credentialPath = join(root, "storage", "chatgpt-credentials.json");
const mailAccountSecretPath = join(root, "storage", "mail-accounts.enc");
const mailAccountStore = new EncryptedMailAccountStore(mailAccountSecretPath);
const oauthCallback = `http://127.0.0.1:${port}/auth/callback`;
const extractionTargets = [20, 50, 100, 250, 500, 1000] as const;
type ExtractionTarget = (typeof extractionTargets)[number];
const requestedImportLimit = Number.parseInt(process.env.IMPORT_LEAD_LIMIT ?? "100", 10);
const configuredSearchJobBudget = Number.parseInt(process.env.SEARCH_JOB_BUDGET ?? "300", 10);
const searchJobBudget = Number.isFinite(configuredSearchJobBudget) ? Math.min(1000, Math.max(1, configuredSearchJobBudget)) : 300;
const defaultExtractionTarget: ExtractionTarget = extractionTargets.includes(requestedImportLimit as ExtractionTarget)
  ? requestedImportLimit as ExtractionTarget
  : 100;
const searchConcurrency = Math.min(Math.max(Number(process.env.SEARCH_CONCURRENCY ?? 3), 1), 6);
const searchReconciliationIntervalMs = Math.max(5_000, Math.min(60_000, Number(process.env.SEARCH_RECONCILIATION_INTERVAL_MS ?? 10_000) || 10_000));
const cancelledSearchExecutions = new Set<string>();
function normalizeExtractionTarget(value: unknown, fallback: ExtractionTarget = defaultExtractionTarget): ExtractionTarget {
  const target = Number(value);
  return extractionTargets.includes(target as ExtractionTarget) ? target as ExtractionTarget : fallback;
}
const db = new DatabaseSync(join(root, "storage", "capture.db"));
const app = express();
const searchActivityStreams = new Set<Response>();
const icpScoreStreams = new Set<Response>();

function emitSearchActivity() {
  const data = JSON.stringify(searchActivity());
  for (const stream of searchActivityStreams)
    stream.write(`event: search-activity\ndata: ${data}\n\n`);
}

app.use(express.json({ limit: "64kb" }));

type ChatGptCredential = { hostId: string; clientId?: string; email?: string; subject?: string; idToken?: string; accessToken?: string; refreshToken?: string; tokenType?: string; expiresAt?: number; scopes: string[]; savedAt?: string };
type PendingChatGptAuth = { state: string; nonce: string; verifier: string; redirectUri: string; clientId: string; hostId: string; createdAt: number };
let pendingChatGptAuth: PendingChatGptAuth | null = null;
type PendingGmailAuth = { state: string; accountId: string; redirectUri: string; createdAt: number };
let pendingGmailAuth: PendingGmailAuth | null = null;
type PendingZohoAuth = { state: string; accountId: string; redirectUri: string; createdAt: number; accountsDomain: string };
const pendingZohoAuth = new PendingOAuthState<PendingZohoAuth>();
let refreshPromise: Promise<ChatGptCredential | null> | null = null;
const authConfigPromise = fetch("https://auth.openai.com/.well-known/openid-configuration").then(async (response) => { if (!response.ok) throw new Error("Could not load OpenAI OAuth configuration."); return await response.json() as Record<string, string>; }).catch(() => null);
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const decodeJwtPart = (value: string) => JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
async function readChatGptCredential(): Promise<ChatGptCredential> {
  try { return JSON.parse(await readFile(credentialPath, "utf8")) as ChatGptCredential; } catch { return { hostId: `urn:uuid:${randomUUID()}`, scopes: [] }; }
}
async function writeChatGptCredential(record: ChatGptCredential) {
  await mkdir(dirname(credentialPath), { recursive: true }); const temp = `${credentialPath}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(record, null, 2), { mode: 0o600 }); await chmod(temp, 0o600); await rename(temp, credentialPath);
}
async function validateIdToken(idToken: string, expectedClientId: string, nonce: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split("."); if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("OpenAI returned an invalid ID token.");
  const header = decodeJwtPart(encodedHeader); const payload = decodeJwtPart(encodedPayload); const config = await authConfigPromise; if (!config?.jwks_uri) throw new Error("OpenAI OAuth signing keys are unavailable.");
  const jwks = await fetch(config.jwks_uri).then((response) => response.json()) as { keys: Array<Record<string, unknown>> }; const jwk = jwks.keys.find((key) => key.kid === header.kid); if (!jwk) throw new Error("OpenAI ID token signing key was not found.");
  const key = createPublicKey({ key: jwk as any, format: "jwk" }); const valid = verifySignature("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), key, Buffer.from(encodedSignature, "base64url"));
  const now = Math.floor(Date.now() / 1000); const issuer = String(payload.iss ?? ""); const audience = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud ?? "")];
  if (!valid || issuer !== "https://auth.openai.com" || !audience.includes(expectedClientId) || Number(payload.exp ?? 0) <= now || String(payload.nonce ?? "") !== nonce) throw new Error("OpenAI ID token validation failed.");
  return payload;
}
async function refreshChatGptCredential(signal?: AbortSignal) {
  if (refreshPromise) return refreshPromise; refreshPromise = (async () => {
    const current = await readChatGptCredential(); if (!current.refreshToken || !current.clientId) return null;
    const body = new URLSearchParams({ grant_type: "refresh_token", client_id: current.clientId, refresh_token: current.refreshToken, resource: "https://api.openai.com/v1" });
    const response = await fetch("https://auth.openai.com/api/accounts/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal });
    if (!response.ok) { current.accessToken = undefined; current.refreshToken = undefined; await writeChatGptCredential(current); return null; }
    const token = await response.json() as Record<string, unknown>; const next = { ...current, accessToken: String(token.access_token), refreshToken: String(token.refresh_token ?? current.refreshToken), idToken: String(token.id_token ?? current.idToken), tokenType: String(token.token_type ?? "Bearer"), expiresAt: Math.floor(Date.now() / 1000) + Number(token.expires_in ?? 3600), scopes: String(token.scope ?? current.scopes.join(" ")).split(/\s+/).filter(Boolean), savedAt: new Date().toISOString() }; await writeChatGptCredential(next); return next;
  })().finally(() => { refreshPromise = null; }); return refreshPromise;
}
async function activeChatGptCredential(signal?: AbortSignal) { const current = await readChatGptCredential(); if (current.accessToken && Number(current.expiresAt ?? 0) > Math.floor(Date.now() / 1000) + 60 && current.scopes.includes("chatgpt.tokens.use.direct")) return current; if (current.refreshToken) return refreshChatGptCredential(signal); return null; }

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS saved_searches (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL,
    country_name TEXT NOT NULL, region TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL, query TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'saved',
    gosom_job_id TEXT, last_run_at TEXT,
    qualification_website TEXT NOT NULL DEFAULT 'all',
    qualification_contacts_json TEXT NOT NULL DEFAULT '[]',
    qualification_contact_match TEXT NOT NULL DEFAULT 'any',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, search_id TEXT NOT NULL, place_id TEXT, cid TEXT,
    title TEXT NOT NULL, category TEXT, address TEXT, city TEXT, region TEXT,
    country_code TEXT, phone TEXT, website TEXT, website_empty INTEGER NOT NULL DEFAULT 0,
    review_count INTEGER, review_rating REAL, maps_url TEXT, latitude REAL, longitude REAL,
    lead_status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '', dedup_key TEXT,
    archived_at TEXT NOT NULL DEFAULT '', archive_reason TEXT NOT NULL DEFAULT '',
    qualification_status TEXT NOT NULL DEFAULT 'pending', qualification_stage TEXT NOT NULL DEFAULT 'discovered', qualification_provenance TEXT NOT NULL DEFAULT 'candidate',
    qualification_error TEXT NOT NULL DEFAULT '', qualified_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(place_id), UNIQUE(cid)
  );
  CREATE TABLE IF NOT EXISTS regions (
    country_code TEXT NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL,
    PRIMARY KEY(country_code, normalized_name)
  );
  CREATE TABLE IF NOT EXISTS search_jobs (
    id TEXT PRIMARY KEY, search_id TEXT NOT NULL, city TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', query TEXT NOT NULL,
    gosom_job_id TEXT, status TEXT NOT NULL DEFAULT 'queued', imported INTEGER NOT NULL DEFAULT 0,
    result_count INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', preexisting_duplicate_count INTEGER NOT NULL DEFAULT 0, execution_duplicate_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS search_executions (
    id TEXT PRIMARY KEY, search_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'starting',
    started_at TEXT NOT NULL, completed_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
    extraction_target INTEGER NOT NULL DEFAULT 100, total_jobs INTEGER NOT NULL DEFAULT 0,
    collected_count INTEGER NOT NULL DEFAULT 0, duplicate_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS enrichment_tasks (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', refresh INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'local', attribution TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '', service_scope TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1, editable INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS skills_enabled_idx ON skills(enabled, slug);
  CREATE TABLE IF NOT EXISTS lead_sources (
    lead_id TEXT NOT NULL, search_id TEXT NOT NULL, search_job_id TEXT NOT NULL,
    discovered_at TEXT NOT NULL, PRIMARY KEY (lead_id, search_job_id)
  );
  CREATE TABLE IF NOT EXISTS campaign_memberships (
    campaign_id TEXT NOT NULL, lead_id TEXT NOT NULL, first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL, source_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (campaign_id, lead_id)
  );
  CREATE INDEX IF NOT EXISTS campaign_memberships_lead_idx ON campaign_memberships(lead_id);
  CREATE INDEX IF NOT EXISTS campaign_memberships_campaign_idx ON campaign_memberships(campaign_id, last_seen_at DESC);
  CREATE TABLE IF NOT EXISTS campaign_drafts (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, lead_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT 'en',
    tone TEXT NOT NULL DEFAULT 'professional', service TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
    usage_json TEXT NOT NULL DEFAULT '{}', evidence_json TEXT NOT NULL DEFAULT '[]',
    generation_history_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(campaign_id, lead_id)
  );
  CREATE TABLE IF NOT EXISTS outreach_generation_runs (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
    total INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS outreach_generation_items (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, campaign_id TEXT NOT NULL, lead_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', error TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT '', completed_at TEXT NOT NULL DEFAULT '',
    UNIQUE(run_id, lead_id)
  );
  CREATE INDEX IF NOT EXISTS outreach_generation_items_run_idx ON outreach_generation_items(run_id, status);
  CREATE TABLE IF NOT EXISTS outreach_pipeline (
    lead_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'not_contacted', channel TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '', last_contact_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS outreach_activities (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, activity_type TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '', happened_at TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS website_audits (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL UNIQUE, website TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_analyzed', score INTEGER,
    performance_score INTEGER, seo_score INTEGER, accessibility_score INTEGER, best_practices_score INTEGER,
    pages_json TEXT NOT NULL DEFAULT '[]', metrics_json TEXT NOT NULL DEFAULT '{}',
    desktop_screenshot TEXT NOT NULL DEFAULT '', mobile_screenshot TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS website_audit_issues (
    id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
    url TEXT NOT NULL, evidence TEXT NOT NULL, suggestion TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS website_audit_tasks (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', refresh INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS website_audit_events (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, lead_id TEXT NOT NULL, event TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', duration_ms INTEGER,
    error TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS website_audit_events_task_idx ON website_audit_events(task_id, created_at);
  CREATE TABLE IF NOT EXISTS visual_ux_tasks (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', error TEXT NOT NULL DEFAULT '',
    attempt_count INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 2,
    next_run_at TEXT NOT NULL DEFAULT '', heartbeat_at TEXT NOT NULL DEFAULT '', duration_ms INTEGER,
    failure_kind TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL DEFAULT '', finished_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS visual_ux_tasks_queue_idx ON visual_ux_tasks(status, created_at);
  CREATE TABLE IF NOT EXISTS website_opportunity_profiles (
    profile_key TEXT PRIMARY KEY, version INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    thresholds_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS website_opportunity_scores (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, profile_key TEXT NOT NULL, profile_version INTEGER NOT NULL,
    status TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'not_analyzed', score INTEGER,
    issue_count INTEGER NOT NULL DEFAULT 0, evidence_coverage INTEGER NOT NULL DEFAULT 0,
    evaluated_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', UNIQUE(lead_id, profile_key)
  );
  CREATE TABLE IF NOT EXISTS website_opportunity_evidence (
    id TEXT PRIMARY KEY, score_id TEXT NOT NULL, issue_id TEXT NOT NULL, weight INTEGER NOT NULL,
    FOREIGN KEY(score_id) REFERENCES website_opportunity_scores(id)
  );
  CREATE TABLE IF NOT EXISTS website_opportunity_score_history (
    id TEXT PRIMARY KEY, score_id TEXT NOT NULL, lead_id TEXT NOT NULL, profile_version INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(score_id, profile_version)
  );
  CREATE INDEX IF NOT EXISTS website_opportunity_scores_lead_idx ON website_opportunity_scores(lead_id, profile_key, evaluated_at DESC);
  CREATE TABLE IF NOT EXISTS lead_signal_definitions (
    code TEXT PRIMARY KEY, label TEXT NOT NULL, signal_group TEXT NOT NULL,
    value_type TEXT NOT NULL DEFAULT 'text', default_confidence REAL NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lead_intelligence_runs (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, collector TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running', started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS lead_observations (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, signal_code TEXT NOT NULL,
    collector TEXT NOT NULL, value_text TEXT NOT NULL DEFAULT '', confidence REAL NOT NULL,
    evidence_url TEXT NOT NULL DEFAULT '', evidence_excerpt TEXT NOT NULL DEFAULT '',
    observed_at TEXT NOT NULL, run_id TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(signal_code) REFERENCES lead_signal_definitions(code)
  );
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY, normalized_name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contact_points (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, normalized_value TEXT NOT NULL,
    display_value TEXT NOT NULL DEFAULT '', person_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(kind, normalized_value), FOREIGN KEY(person_id) REFERENCES people(id)
  );
  CREATE TABLE IF NOT EXISTS lead_contacts (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, contact_point_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0, verification_status TEXT NOT NULL DEFAULT 'unverified',
    verification_method TEXT NOT NULL DEFAULT 'public_page', discovered_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', is_primary INTEGER NOT NULL DEFAULT 0,
    UNIQUE(lead_id, contact_point_id), FOREIGN KEY(lead_id) REFERENCES leads(id), FOREIGN KEY(contact_point_id) REFERENCES contact_points(id)
  );
  CREATE INDEX IF NOT EXISTS lead_contacts_lead_idx ON lead_contacts(lead_id, confidence DESC, last_seen_at DESC);
  CREATE INDEX IF NOT EXISTS contact_points_value_idx ON contact_points(kind, normalized_value);
  CREATE TABLE IF NOT EXISTS cohorts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    definition_json TEXT NOT NULL, dynamic INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS cohorts_updated_idx ON cohorts(updated_at DESC);
  CREATE INDEX IF NOT EXISTS lead_observations_lead_signal_idx ON lead_observations(lead_id, signal_code, observed_at DESC);
  CREATE INDEX IF NOT EXISTS lead_observations_signal_idx ON lead_observations(signal_code, observed_at DESC);
  CREATE INDEX IF NOT EXISTS lead_observations_run_idx ON lead_observations(run_id);
  CREATE TABLE IF NOT EXISTS icp_profiles (
    id TEXT PRIMARY KEY, profile_key TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(profile_key, version)
  );
  CREATE TABLE IF NOT EXISTS icp_profile_rules (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, rule_code TEXT NOT NULL, label TEXT NOT NULL,
    weight REAL NOT NULL, min_confidence REAL NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(profile_id) REFERENCES icp_profiles(id)
  );
  CREATE TABLE IF NOT EXISTS icp_score_runs (
    id TEXT PRIMARY KEY, profile_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed',
    total_count INTEGER NOT NULL DEFAULT 0, processed_count INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, completed_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS icp_scores (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, profile_id TEXT NOT NULL, profile_key TEXT NOT NULL,
    profile_version INTEGER NOT NULL, score INTEGER NOT NULL, commercial_fit INTEGER NOT NULL,
    evidence_coverage INTEGER NOT NULL, evidence_confidence INTEGER NOT NULL,
    explanation_json TEXT NOT NULL, calculated_at TEXT NOT NULL, run_id TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(profile_id) REFERENCES icp_profiles(id)
  );
  CREATE TABLE IF NOT EXISTS icp_score_evidence (
    id TEXT PRIMARY KEY, score_id TEXT NOT NULL, rule_code TEXT NOT NULL,
    source_type TEXT NOT NULL, evidence_id TEXT NOT NULL DEFAULT '', evidence_url TEXT NOT NULL DEFAULT '',
    evidence_detail TEXT NOT NULL DEFAULT '', confidence REAL NOT NULL DEFAULT 0,
    observed_at TEXT NOT NULL DEFAULT '', FOREIGN KEY(score_id) REFERENCES icp_scores(id)
  );
  CREATE INDEX IF NOT EXISTS icp_profiles_key_version_idx ON icp_profiles(profile_key, version DESC);
  CREATE INDEX IF NOT EXISTS icp_scores_lead_profile_idx ON icp_scores(lead_id, profile_key, calculated_at DESC);
  CREATE INDEX IF NOT EXISTS icp_scores_profile_score_idx ON icp_scores(profile_key, score DESC, calculated_at DESC);
  CREATE INDEX IF NOT EXISTS icp_score_evidence_score_idx ON icp_score_evidence(score_id, rule_code);
`);
const signalCatalogNow = new Date().toISOString();
const upsertSignalDefinition = db.prepare(
  `INSERT INTO lead_signal_definitions (code, label, signal_group, value_type, default_confidence, version, active, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
   ON CONFLICT(code) DO UPDATE SET label = excluded.label, signal_group = excluded.signal_group,
   value_type = excluded.value_type, default_confidence = excluded.default_confidence, version = excluded.version, active = 1, updated_at = excluded.updated_at`,
);
for (const signal of signalCatalog)
  upsertSignalDefinition.run(
    signal.code,
    signal.label,
    signal.group,
    signal.valueType,
    signal.confidence,
    signalCatalogNow,
    signalCatalogNow,
  );

const defaultIcpProfiles = [
  { key: "custom_website_development", name: "Custom Website Development", description: "Prioritize listings that have no website URL recorded, without claiming the business has no website.", rules: [
    ["maps_no_website_recorded", "No website URL recorded in Google Maps", 60, 0, {}],
    ["industry_match", "Service business category", 20, 1, { keywords: ["plumb", "dental", "salon", "gym", "restaurant", "clinic", "repair", "contractor"] }],
    ["audit_issue_category", "Verified contact-flow issue", 20, 0.9, { categories: ["content", "mobile"], maxAgeDays: 90 }],
  ] },
  { key: "website_redesign", name: "Website Redesign", description: "Prioritize verified usability, performance, and content issues from homepage audits.", rules: [
    ["audit_issue_category", "Verified performance or mobile issue", 35, 0.9, { categories: ["performance", "mobile"], maxAgeDays: 90 }],
    ["audit_issue_category", "Verified content or CTA issue", 30, 0.9, { categories: ["content"], maxAgeDays: 90 }],
    ["audit_issue_category", "Verified accessibility or best-practice issue", 20, 0.9, { categories: ["accessibility", "best_practices"], maxAgeDays: 90 }],
    ["industry_match", "Service business category", 15, 1, { keywords: ["salon", "dental", "clinic", "gym", "restaurant", "repair", "contractor"] }],
  ] },
  { key: "seo_optimization", name: "SEO Optimization", description: "Prioritize verified SEO or performance issues, never missing metadata by inference.", rules: [
    ["audit_issue_category", "Verified SEO or metadata issue", 60, 0.9, { categories: ["seo", "metadata"], maxAgeDays: 90 }],
    ["audit_issue_category", "Verified performance issue", 25, 0.9, { categories: ["performance"], maxAgeDays: 90 }],
    ["industry_match", "Local service category", 15, 1, { keywords: ["dental", "salon", "clinic", "plumb", "restaurant", "repair"] }],
  ] },
  { key: "booking_management_software", name: "Booking / Management Software", description: "Prioritize documented booking or contact-flow technology signals; it does not infer purchase intent.", rules: [
    ["observation_present", "Online booking technology detected", 40, 0.8, { codes: ["ONLINE_BOOKING"], maxAgeDays: 90 }],
    ["observation_present", "Visible contact flow detected", 20, 0.8, { codes: ["CONTACT_FORM", "CONTACT_CTA"], maxAgeDays: 90 }],
    ["audit_issue_category", "Verified contact-flow issue", 25, 0.9, { categories: ["content", "mobile"], maxAgeDays: 90 }],
    ["industry_match", "Appointment-oriented category", 15, 1, { keywords: ["salon", "dental", "clinic", "gym", "spa", "barber"] }],
  ] },
] as const;

function seedIcpProfiles() {
  const now = new Date().toISOString();
  const insertProfile = db.prepare("INSERT INTO icp_profiles (id, profile_key, name, description, version, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)");
  const insertRule = db.prepare("INSERT INTO icp_profile_rules (id, profile_id, rule_code, label, weight, min_confidence, enabled, config_json, position) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)");
  for (const profile of defaultIcpProfiles) {
    if (db.prepare("SELECT id FROM icp_profiles WHERE profile_key = ? LIMIT 1").get(profile.key)) continue;
    const id = randomUUID();
    insertProfile.run(id, profile.key, profile.name, profile.description, now, now);
    profile.rules.forEach(([code, label, weight, confidence, config], position) => insertRule.run(randomUUID(), id, code, label, weight, confidence, JSON.stringify(config), position));
  }
}
seedIcpProfiles();
db.prepare(
  `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
).run("automatic_contact_discovery", "true", new Date().toISOString());
db.prepare(
  `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
).run("automatic_website_audits", "true", new Date().toISOString());
db.prepare(`INSERT OR IGNORE INTO website_opportunity_profiles (profile_key, version, enabled, thresholds_json, created_at, updated_at)
  VALUES ('website_opportunity', 2, 1, '{"medium":35,"high":65,"minimumEvidence":2,"deduplicateRules":true}', ?, ?)`).run(new Date().toISOString(), new Date().toISOString());
db.prepare(`UPDATE website_opportunity_profiles SET version = 2, thresholds_json = '{"medium":35,"high":65,"minimumEvidence":2,"deduplicateRules":true}', updated_at = ? WHERE profile_key = 'website_opportunity' AND version < 2`).run(new Date().toISOString());
db.prepare(
  `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
).run("chatgpt_selected_model", "", new Date().toISOString());
db.prepare(
  `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
).run("interface_language", "en", new Date().toISOString());
db.prepare(
  `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
).run("outreach_preferences", JSON.stringify({
  tone: "professional",
  structure: "context, specific value, low-pressure question",
  subjectGuidelines: "Short, natural and understated; reference the business or domain when relevant, vary the wording, and stay grounded in verified evidence.",
  subjectTemplate: "",
  defaultLanguage: "en",
  signatureEnabled: false,
  signature: { name: "", role: "", company: "", website: "", contact: "" },
}), new Date().toISOString());

const skillSeeds = [
  ["account_navigation", "Account navigation", "harvey", "website development, SEO, redesign, management software"],
  ["email_frameworks", "Email frameworks", "harvey", "website development, SEO, redesign, management software"],
  ["lead_qualification", "Lead qualification", "harvey", "website development, SEO, redesign, management software"],
  ["linkedin_outreach", "LinkedIn outreach", "harvey", "website development, SEO, redesign, management software"],
  ["objection_handling", "Objection handling", "harvey", "website development, SEO, redesign, management software"],
  ["offer_strategy", "Offer strategy", "harvey", "website development, SEO, redesign, management software"],
  ["prospecting_tactics", "Prospecting tactics", "harvey", "website development, SEO, redesign, management software"],
  ["sales_methodology", "Sales methodology", "harvey", "website development, SEO, redesign, management software"],
  ["signal_playbook", "Signal playbook", "harvey", "website development, SEO, redesign, management software"],
  ["product_knowledge", "Product knowledge", "local_overlay", "website development, SEO, redesign, management software"],
  ["competitive_intel", "Competitive intelligence", "local_overlay", "website development, SEO, redesign, management software"],
] as const;
function seedSkills() {
  const now = new Date().toISOString();
  const insert = db.prepare("INSERT OR IGNORE INTO skills (id, slug, name, source, attribution, content, service_scope, enabled, editable, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)");
  for (const [slug, name, source, serviceScope] of skillSeeds) {
    const path = join(root, "skills", "harvey", `${slug}.md`);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    insert.run(randomUUID(), slug, name, source, source === "harvey" ? "Imported from ethanplusai/harvey under the MIT License." : "Scout local overlay.", content, serviceScope, now, now);
  }
}
seedSkills();

for (const statement of [
  "ALTER TABLE saved_searches ADD COLUMN scope_mode TEXT NOT NULL DEFAULT 'selected_cities'",
  "ALTER TABLE saved_searches ADD COLUMN cities_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE saved_searches ADD COLUMN regions_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE saved_searches ADD COLUMN qualification_website TEXT NOT NULL DEFAULT 'all'",
  "ALTER TABLE saved_searches ADD COLUMN qualification_contacts_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE saved_searches ADD COLUMN qualification_contact_match TEXT NOT NULL DEFAULT 'any'",
  "ALTER TABLE saved_searches ADD COLUMN description TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE saved_searches ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE saved_searches ADD COLUMN search_config_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE saved_searches ADD COLUMN extraction_target INTEGER NOT NULL DEFAULT 100",
  "ALTER TABLE saved_searches ADD COLUMN industry_ids_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE saved_searches ADD COLUMN industry_terms_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE saved_searches ADD COLUMN custom_terms_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE saved_searches ADD COLUMN industry_catalog_version INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE saved_searches ADD COLUMN outreach_mode TEXT NOT NULL DEFAULT 'smart'",
  "ALTER TABLE saved_searches ADD COLUMN outreach_service TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE saved_searches ADD COLUMN outreach_evidence_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE campaign_drafts ADD COLUMN language TEXT NOT NULL DEFAULT 'en'",
  "ALTER TABLE campaign_drafts ADD COLUMN tone TEXT NOT NULL DEFAULT 'professional'",
  "ALTER TABLE campaign_drafts ADD COLUMN service TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN provider TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN model TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN usage_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE campaign_drafts ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE campaign_drafts ADD COLUMN generation_history_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE campaign_drafts ADD COLUMN review_status TEXT NOT NULL DEFAULT 'not_generated'",
  "ALTER TABLE campaign_drafts ADD COLUMN contacted_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN review_notes TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN translated_subject TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN translated_body TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN translation_language TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN translation_provider TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaign_drafts ADD COLUMN translation_model TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE search_jobs ADD COLUMN region TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE search_jobs ADD COLUMN execution_id TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE search_jobs ADD COLUMN stage TEXT NOT NULL DEFAULT 'starting'",
  "ALTER TABLE search_jobs ADD COLUMN discovered_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_jobs ADD COLUMN processed_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_jobs ADD COLUMN inserted_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_jobs ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_jobs ADD COLUMN extraction_target INTEGER NOT NULL DEFAULT 100",
  "ALTER TABLE search_jobs ADD COLUMN preexisting_duplicate_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_jobs ADD COLUMN execution_duplicate_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_jobs ADD COLUMN search_term TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE search_jobs ADD COLUMN relevance_skipped_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_executions ADD COLUMN extraction_target INTEGER NOT NULL DEFAULT 100",
  "ALTER TABLE search_executions ADD COLUMN total_jobs INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_executions ADD COLUMN collected_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE search_executions ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE lead_sources ADD COLUMN search_execution_id TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE lead_sources ADD COLUMN was_inserted INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE lead_sources ADD COLUMN discovery_term TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN instagram TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN business_email TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN facebook TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN contact_status TEXT NOT NULL DEFAULT 'not_found'",
  "ALTER TABLE leads ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'idle'",
  "ALTER TABLE leads ADD COLUMN contact_source_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN contact_confidence INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN contacts_updated_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN enrichment_error TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN contact_origin TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN contact_diagnostic TEXT NOT NULL DEFAULT 'not_found'",
  "ALTER TABLE leads ADD COLUMN industry_normalized TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN archive_reason TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN qualification_status TEXT NOT NULL DEFAULT 'qualified'",
  "ALTER TABLE leads ADD COLUMN qualification_stage TEXT NOT NULL DEFAULT 'completed'",
  "ALTER TABLE leads ADD COLUMN qualification_provenance TEXT NOT NULL DEFAULT 'legacy'",
  "ALTER TABLE leads ADD COLUMN qualification_error TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE leads ADD COLUMN qualified_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE outreach_pipeline ADD COLUMN website_opportunity TEXT NOT NULL DEFAULT 'needs_review'",
  "ALTER TABLE outreach_pipeline ADD COLUMN follow_up_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE lead_observations ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'verified'",
  "ALTER TABLE website_audit_issues ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'verified'",
  "ALTER TABLE website_audit_tasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE website_audit_tasks ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3",
  "ALTER TABLE website_audit_tasks ADD COLUMN started_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE website_audit_tasks ADD COLUMN finished_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE website_audit_tasks ADD COLUMN next_run_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE website_audit_tasks ADD COLUMN heartbeat_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE website_audit_tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'queued'",
  "ALTER TABLE website_audit_tasks ADD COLUMN failure_kind TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE website_audit_tasks ADD COLUMN recovery_stages TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE visual_ux_tasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE visual_ux_tasks ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 2",
  "ALTER TABLE visual_ux_tasks ADD COLUMN next_run_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE visual_ux_tasks ADD COLUMN heartbeat_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE visual_ux_tasks ADD COLUMN duration_ms INTEGER",
  "ALTER TABLE visual_ux_tasks ADD COLUMN failure_kind TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE visual_ux_assessments ADD COLUMN usage_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE visual_ux_assessments ADD COLUMN method TEXT NOT NULL DEFAULT 'ai_visual'",
  "ALTER TABLE visual_ux_assessments ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '{}'",
]) {
  try {
    db.exec(statement);
  } catch {
    /* Existing local databases already have the column. */
  }
}
// These indexes depend on columns introduced by migrations above. Keep their
// creation after migrations so fresh and older databases share one safe order.
db.exec(`CREATE INDEX IF NOT EXISTS leads_cohort_location_idx
  ON leads(country_code, region, city, industry_normalized);
CREATE INDEX IF NOT EXISTS lead_observations_cohort_idx
  ON lead_observations(lead_id, signal_code, verification_status, observed_at DESC, confidence);`);
// Audit rows are a current projection. Preserve the preceding projection before
// any explicit recovery/full re-audit so evidence remains inspectable.
db.exec(`CREATE TABLE IF NOT EXISTS website_audit_history (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, audit_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);`);
db.exec(`CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('gmail','zoho')), email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', display_name TEXT NOT NULL DEFAULT '',
  last_test_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
  limits_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`);
db.exec(`CREATE TABLE IF NOT EXISTS outreach_outbox (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, lead_id TEXT NOT NULL, account_id TEXT NOT NULL,
  to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_review',
  send_at TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT NOT NULL DEFAULT '', uncertain INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(campaign_id, lead_id)
); CREATE INDEX IF NOT EXISTS outreach_outbox_due_idx ON outreach_outbox(status, send_at);
CREATE INDEX IF NOT EXISTS outreach_outbox_account_idx ON outreach_outbox(account_id, status, sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS outreach_outbox_unique_active_recipient_idx
  ON outreach_outbox(lower(trim(to_email)))
  WHERE campaign_id != '__outreach_test__' AND status IN ('pending_review','approved','sending');
CREATE UNIQUE INDEX IF NOT EXISTS outreach_outbox_unique_active_test_recipient_account_idx
  ON outreach_outbox(lower(trim(to_email)), account_id)
  WHERE campaign_id = '__outreach_test__' AND status IN ('pending_review','approved','sending');`);
// Earlier versions applied the recipient uniqueness rule to test messages as
// well. Keep the commercial rule intact, but allow one controlled test per
// sender account for the same authorized recipient.
db.exec(`DROP INDEX IF EXISTS outreach_outbox_unique_active_recipient_idx;
CREATE UNIQUE INDEX outreach_outbox_unique_active_recipient_idx
  ON outreach_outbox(lower(trim(to_email)))
  WHERE campaign_id != '__outreach_test__' AND status IN ('pending_review','approved','sending');
CREATE UNIQUE INDEX IF NOT EXISTS outreach_outbox_unique_active_test_recipient_account_idx
  ON outreach_outbox(lower(trim(to_email)), account_id)
  WHERE campaign_id = '__outreach_test__' AND status IN ('pending_review','approved','sending');`);
db.exec(`CREATE TABLE IF NOT EXISTS visual_ux_assessments (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, audit_id TEXT NOT NULL, version INTEGER NOT NULL,
  status TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', rubric_json TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '', redesign_potential TEXT NOT NULL DEFAULT 'not_analyzed',
  approved INTEGER NOT NULL DEFAULT 0, reviewer_note TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
  usage_json TEXT NOT NULL DEFAULT '{}', method TEXT NOT NULL DEFAULT 'ai_visual', evidence_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
); CREATE INDEX IF NOT EXISTS visual_ux_assessments_lead_idx ON visual_ux_assessments(lead_id, created_at DESC);`);
db.exec(`CREATE TABLE IF NOT EXISTS automated_ux_assessments (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, audit_id TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL DEFAULT 'automated', status TEXT NOT NULL,
  checks_json TEXT NOT NULL DEFAULT '{}', findings_json TEXT NOT NULL DEFAULT '[]',
  error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
); CREATE INDEX IF NOT EXISTS automated_ux_assessments_lead_idx ON automated_ux_assessments(lead_id, updated_at DESC);`);
db.exec(`CREATE TABLE IF NOT EXISTS global_email_leads (
  lead_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'ready', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`);
db.exec(`CREATE TABLE IF NOT EXISTS global_email_drafts (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL UNIQUE, subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en', tone TEXT NOT NULL DEFAULT 'professional', service TEXT NOT NULL DEFAULT '', service_override INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_generated', provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', usage_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '[]', guidance TEXT NOT NULL DEFAULT '', history_json TEXT NOT NULL DEFAULT '[]',
  sent_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`);
for (const statement of [
  "ALTER TABLE global_email_drafts ADD COLUMN provider TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE global_email_drafts ADD COLUMN model TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE global_email_drafts ADD COLUMN usage_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE global_email_drafts ADD COLUMN guidance TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE global_email_drafts ADD COLUMN service_override INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE global_email_drafts ADD COLUMN sent_at TEXT NOT NULL DEFAULT ''",
]) { try { db.exec(statement); } catch { /* Existing local databases already have the column. */ } }
// A signature alone is not a usable email draft. Older saves could persist the
// fixed signature while the subject and message were still empty.
db.exec("UPDATE global_email_drafts SET body = '', status = 'not_generated' WHERE status != 'sent' AND COALESCE(TRIM(subject), '') = '' AND COALESCE(TRIM(body), '') != ''");
db.exec(`CREATE TABLE IF NOT EXISTS global_email_generation_runs (
  id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued', total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL, tone TEXT NOT NULL, service TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT NOT NULL DEFAULT ''
); CREATE TABLE IF NOT EXISTS global_email_generation_items (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, lead_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
  error TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL DEFAULT '', completed_at TEXT NOT NULL DEFAULT '', UNIQUE(run_id, lead_id)
); CREATE INDEX IF NOT EXISTS global_email_generation_items_run_idx ON global_email_generation_items(run_id, status);`);
// A process restart cannot safely resume an in-flight provider stream. Mark it
// terminal so the UI never restores a perpetual loading state; completed drafts
// remain intact and failed/cancelled items can be retried explicitly.
db.prepare("UPDATE global_email_generation_items SET status = 'cancelled', error = 'Generation interrupted by application restart.', completed_at = ? WHERE status IN ('queued', 'running') AND run_id IN (SELECT id FROM global_email_generation_runs WHERE status IN ('queued', 'running', 'cancelling'))").run(new Date().toISOString());
db.prepare("UPDATE global_email_generation_runs SET status = 'cancelled', cancelled = CASE WHEN total - completed - failed > 0 THEN total - completed - failed ELSE cancelled END, error = 'Generation interrupted by application restart.', updated_at = ? WHERE status IN ('queued', 'running', 'cancelling')").run(new Date().toISOString());
db.exec("UPDATE campaign_drafts SET review_status = 'draft' WHERE review_status = 'not_generated' AND COALESCE(TRIM(body), '') != ''");
// Campaign drafts predate the global workspace. Preserve them append-only in
// their original table, while seeding the global single-source projection only
// when a lead does not already have a global draft. A lead in several campaigns
// therefore still receives exactly one editable draft.
const legacyCampaignDrafts = db.prepare(`SELECT * FROM campaign_drafts
  WHERE COALESCE(TRIM(subject), '') != '' OR COALESCE(TRIM(body), '') != ''
  ORDER BY updated_at DESC`).all() as Array<Record<string, unknown>>;
const seedGlobalEmailLead = db.prepare("INSERT OR IGNORE INTO global_email_leads (lead_id,status,created_at,updated_at) VALUES (?, ?, ?, ?)");
const seedGlobalDraft = db.prepare(`INSERT OR IGNORE INTO global_email_drafts
  (id,lead_id,subject,body,language,tone,service,status,provider,model,usage_json,evidence_json,history_json,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const legacy of legacyCampaignDrafts) {
  const leadId = String(legacy.lead_id ?? ""); if (!leadId) continue;
  const createdAt = String(legacy.created_at ?? new Date().toISOString()); const updatedAt = String(legacy.updated_at ?? createdAt);
  seedGlobalEmailLead.run(leadId, String(legacy.review_status ?? "draft") === "contacted" ? "sent" : "draft_ready", createdAt, updatedAt);
  seedGlobalDraft.run(randomUUID(), leadId, String(legacy.subject ?? ""), String(legacy.body ?? ""), String(legacy.language ?? "en"), String(legacy.tone ?? "professional"), String(legacy.service ?? ""), String(legacy.review_status ?? "draft"), String(legacy.provider ?? ""), String(legacy.model ?? ""), String(legacy.usage_json ?? "{}"), String(legacy.evidence_json ?? "[]"), String(legacy.generation_history_json ?? "[]"), createdAt, updatedAt);
}
db.exec("UPDATE saved_searches SET extraction_target = 100 WHERE extraction_target NOT IN (20, 50, 100, 250, 500, 1000)");
db.exec(`UPDATE saved_searches
  SET cities_json = '["' || replace(city, '"', '') || '"]'
  WHERE cities_json = '[]' AND city != '' AND scope_mode = 'selected_cities'`);
db.exec(`UPDATE saved_searches
  SET regions_json = '["' || replace(region, '"', '') || '"]'
  WHERE regions_json = '[]' AND region != '' AND scope_mode = 'selected_regions'`);
db.exec(
  "UPDATE outreach_pipeline SET website_opportunity = 'review_later' WHERE website_opportunity = 'good_website'",
);
db.exec(
  "CREATE INDEX IF NOT EXISTS lead_sources_search_lead_idx ON lead_sources(search_id, lead_id)",
);
db.exec(`INSERT OR IGNORE INTO campaign_memberships (campaign_id, lead_id, first_seen_at, last_seen_at, source_count)
  SELECT search_id, lead_id, MIN(discovered_at), MAX(discovered_at), COUNT(*)
  FROM lead_sources GROUP BY search_id, lead_id`);
// A process cannot survive a Node restart. Return interrupted work to the durable
// queue so a lead never stays displayed as "Searching" indefinitely.
db.exec(
  "UPDATE enrichment_tasks SET status = 'queued', updated_at = datetime('now') WHERE status IN ('processing', 'searching')",
);
db.exec(
  "UPDATE leads SET enrichment_status = 'queued' WHERE enrichment_status IN ('processing', 'searching')",
);
db.exec(
  "UPDATE enrichment_tasks SET status = 'cancelled' WHERE status = 'stopped'",
);
db.exec(
  "UPDATE leads SET enrichment_status = 'completed' WHERE enrichment_status = 'completed_no_contacts'",
);
db.exec(
  "UPDATE website_audit_tasks SET status = 'queued', started_at = '', heartbeat_at = '', next_run_at = '', updated_at = datetime('now') WHERE status IN ('processing', 'analyzing')",
);
// Repair legacy flags once on startup. Future filtering is URL-first as well,
// so a populated website can never appear in a strict no-website result.
db.exec(`UPDATE leads
  SET website_empty = CASE WHEN COALESCE(TRIM(website), '') = '' THEN 1 ELSE 0 END
  WHERE website_empty != CASE WHEN COALESCE(TRIM(website), '') = '' THEN 1 ELSE 0 END`);

function automaticContactDiscoveryEnabled() {
  return (
    (
      db
        .prepare(`SELECT value FROM app_settings WHERE key = ?`)
        .get("automatic_contact_discovery") as { value?: string } | undefined
    )?.value !== "false"
  );
}
function automaticWebsiteAuditsEnabled() {
  return appSetting("automatic_website_audits", "true") !== "false";
}

type OutreachPreferences = {
  tone: string;
  structure: string;
  subjectGuidelines: string;
  subjectTemplate: string;
  defaultLanguage: "en" | "pt-BR";
  signatureEnabled: boolean;
  signature: { name: string; role: string; company: string; website: string; contact: string };
  senderProfile: { name: string; title: string; introduction: string; services: string; portfolioUrl: string; instagramUrl: string; emailSignature: string };
};
const defaultOutreachPreferences: OutreachPreferences = {
  tone: "professional",
  structure: "context, specific value, low-pressure question",
  subjectGuidelines: "Short, natural and understated; reference the business or domain when relevant, vary the wording, and stay grounded in verified evidence.",
  subjectTemplate: "",
  defaultLanguage: "en",
  signatureEnabled: false,
  signature: { name: "", role: "", company: "", website: "", contact: "" },
  senderProfile: { name: "", title: "", introduction: "", services: "", portfolioUrl: "", instagramUrl: "", emailSignature: "" },
};
function appSetting(key: string, fallback = "") {
  return String((db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value ?? fallback);
}
function outreachPreferences(): OutreachPreferences {
  const parsed = jsonValue(appSetting("outreach_preferences"), {}) as Record<string, unknown>;
  const signature = (parsed.signature && typeof parsed.signature === "object" ? parsed.signature : {}) as Record<string, unknown>;
  const sender = (parsed.senderProfile && typeof parsed.senderProfile === "object" ? parsed.senderProfile : {}) as Record<string, unknown>;
  return {
    tone: clean(parsed.tone) || defaultOutreachPreferences.tone,
    structure: clean(parsed.structure) || defaultOutreachPreferences.structure,
    subjectGuidelines: clean(parsed.subjectGuidelines) || defaultOutreachPreferences.subjectGuidelines,
    subjectTemplate: clean(parsed.subjectTemplate),
    defaultLanguage: parsed.defaultLanguage === "pt-BR" ? "pt-BR" : "en",
    signatureEnabled: parsed.signatureEnabled === true,
    signature: {
      name: clean(signature.name), role: clean(signature.role), company: clean(signature.company),
      website: clean(signature.website), contact: clean(signature.contact),
    },
    senderProfile: {
      name: clean(sender.name) || clean(signature.name),
      title: clean(sender.title) || clean(signature.role),
      introduction: clean(sender.introduction), services: clean(sender.services),
      portfolioUrl: clean(sender.portfolioUrl) || clean(signature.website),
      instagramUrl: clean(sender.instagramUrl), emailSignature: clean(sender.emailSignature),
    },
  };
}
function saveAppSetting(key: string, value: string) {
  db.prepare("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?").run(value, new Date().toISOString(), key);
}

function selectedChatGptModel() {
  return clean(
    (
      db
        .prepare("SELECT value FROM app_settings WHERE key = ?")
        .get("chatgpt_selected_model") as { value?: string } | undefined
    )?.value,
  );
}

function saveSelectedChatGptModel(model: string) {
  db.prepare(
    "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?",
  ).run(model, new Date().toISOString(), "chatgpt_selected_model");
}

function normalizeIndustry(value: unknown) {
  return (
    clean(value)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase()
      .replace(
        /\b(shops|shop|services|service|companies|company|providers|provider)\b/g,
        "",
      )
      .replace(/\s+/g, " ")
      .trim() || "uncategorized"
  );
}
for (const row of db
  .prepare(`SELECT id, category FROM leads WHERE industry_normalized = ''`)
  .all() as Array<{ id: string; category: string }>) {
  db.prepare(`UPDATE leads SET industry_normalized = ? WHERE id = ?`).run(
    normalizeIndustry(row.category),
    row.id,
  );
}

const isoCodes =
  `AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW XK`.split(
    " ",
  );
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = isoCodes.map((code) => ({
  code,
  name: displayNames.of(code) ?? code,
}));
type GeographicRegion = { name: string; code?: string };
type GeographicCity = { name: string; region?: string; regionCode?: string };
type GeographicSeed = {
  regions: Array<string | GeographicRegion>;
  cities: GeographicCity[];
};

// The starter catalogue is intentionally small for most territories. Brazil is
// different: state is essential to disambiguate cities in a country-sized
// search, so every federative unit is available from the first use.
const brazilRegions: GeographicRegion[] = [
  { name: "Acre", code: "AC" },
  { name: "Alagoas", code: "AL" },
  { name: "Amapá", code: "AP" },
  { name: "Amazonas", code: "AM" },
  { name: "Bahia", code: "BA" },
  { name: "Ceará", code: "CE" },
  { name: "Distrito Federal", code: "DF" },
  { name: "Espírito Santo", code: "ES" },
  { name: "Goiás", code: "GO" },
  { name: "Maranhão", code: "MA" },
  { name: "Mato Grosso", code: "MT" },
  { name: "Mato Grosso do Sul", code: "MS" },
  { name: "Minas Gerais", code: "MG" },
  { name: "Pará", code: "PA" },
  { name: "Paraíba", code: "PB" },
  { name: "Paraná", code: "PR" },
  { name: "Pernambuco", code: "PE" },
  { name: "Piauí", code: "PI" },
  { name: "Rio de Janeiro", code: "RJ" },
  { name: "Rio Grande do Norte", code: "RN" },
  { name: "Rio Grande do Sul", code: "RS" },
  { name: "Rondônia", code: "RO" },
  { name: "Roraima", code: "RR" },
  { name: "Santa Catarina", code: "SC" },
  { name: "São Paulo", code: "SP" },
  { name: "Sergipe", code: "SE" },
  { name: "Tocantins", code: "TO" },
];
const brazilCities: GeographicCity[] = [
  { name: "Rio Branco", region: "Acre", regionCode: "AC" },
  { name: "Maceió", region: "Alagoas", regionCode: "AL" },
  { name: "Macapá", region: "Amapá", regionCode: "AP" },
  { name: "Manaus", region: "Amazonas", regionCode: "AM" },
  { name: "Salvador", region: "Bahia", regionCode: "BA" },
  { name: "Fortaleza", region: "Ceará", regionCode: "CE" },
  { name: "Brasília", region: "Distrito Federal", regionCode: "DF" },
  { name: "Vitória", region: "Espírito Santo", regionCode: "ES" },
  { name: "Goiânia", region: "Goiás", regionCode: "GO" },
  { name: "São Luís", region: "Maranhão", regionCode: "MA" },
  { name: "Cuiabá", region: "Mato Grosso", regionCode: "MT" },
  { name: "Campo Grande", region: "Mato Grosso do Sul", regionCode: "MS" },
  { name: "Belo Horizonte", region: "Minas Gerais", regionCode: "MG" },
  { name: "Uberlândia", region: "Minas Gerais", regionCode: "MG" },
  { name: "Belém", region: "Pará", regionCode: "PA" },
  { name: "João Pessoa", region: "Paraíba", regionCode: "PB" },
  { name: "Curitiba", region: "Paraná", regionCode: "PR" },
  { name: "Londrina", region: "Paraná", regionCode: "PR" },
  { name: "Maringá", region: "Paraná", regionCode: "PR" },
  { name: "Recife", region: "Pernambuco", regionCode: "PE" },
  { name: "Olinda", region: "Pernambuco", regionCode: "PE" },
  { name: "Teresina", region: "Piauí", regionCode: "PI" },
  { name: "Rio de Janeiro", region: "Rio de Janeiro", regionCode: "RJ" },
  { name: "Natal", region: "Rio Grande do Norte", regionCode: "RN" },
  { name: "Porto Alegre", region: "Rio Grande do Sul", regionCode: "RS" },
  { name: "Porto Velho", region: "Rondônia", regionCode: "RO" },
  { name: "Boa Vista", region: "Roraima", regionCode: "RR" },
  { name: "Florianópolis", region: "Santa Catarina", regionCode: "SC" },
  { name: "São Paulo", region: "São Paulo", regionCode: "SP" },
  { name: "Campinas", region: "São Paulo", regionCode: "SP" },
  { name: "Santos", region: "São Paulo", regionCode: "SP" },
  { name: "Aracaju", region: "Sergipe", regionCode: "SE" },
  { name: "Palmas", region: "Tocantins", regionCode: "TO" },
];
const geographicSeeds: Record<string, GeographicSeed> = {
  CA: {
    regions: [
      "Alberta",
      "British Columbia",
      "Manitoba",
      "New Brunswick",
      "Newfoundland and Labrador",
      "Nova Scotia",
      "Ontario",
      "Québec",
      "Saskatchewan",
    ],
    cities: [
      { name: "Toronto", region: "Ontario" },
      { name: "Montréal", region: "Québec" },
      { name: "Vancouver", region: "British Columbia" },
      { name: "Calgary", region: "Alberta" },
    ],
  },
  US: {
    regions: [...unitedStatesRegions],
    cities: [
      { name: "Miami", region: "Florida" },
      { name: "New York", region: "New York" },
      { name: "Los Angeles", region: "California" },
      { name: "Seattle", region: "Washington" },
    ],
  },
  GB: {
    regions: ["England", "Northern Ireland", "Scotland", "Wales"],
    cities: [
      { name: "London", region: "England" },
      { name: "Edinburgh", region: "Scotland" },
      { name: "Cardiff", region: "Wales" },
    ],
  },
  FR: {
    regions: [
      "Auvergne-Rhône-Alpes",
      "Île-de-France",
      "Nouvelle-Aquitaine",
      "Provence-Alpes-Côte d’Azur",
    ],
    cities: [
      { name: "Paris", region: "Île-de-France" },
      { name: "Lyon", region: "Auvergne-Rhône-Alpes" },
      { name: "Marseille", region: "Provence-Alpes-Côte d’Azur" },
    ],
  },
  DE: {
    regions: ["Bayern", "Berlin", "Hamburg", "Nordrhein-Westfalen"],
    cities: [
      { name: "Berlin", region: "Berlin" },
      { name: "München", region: "Bayern" },
      { name: "Köln", region: "Nordrhein-Westfalen" },
    ],
  },
  BR: {
    regions: brazilRegions,
    cities: brazilCities,
  },
  AU: {
    regions: ["New South Wales", "Queensland", "Victoria", "Western Australia"],
    cities: [
      { name: "Sydney", region: "New South Wales" },
      { name: "Melbourne", region: "Victoria" },
      { name: "Perth", region: "Western Australia" },
    ],
  },
  MX: {
    regions: ["Ciudad de México", "Jalisco", "Nuevo León"],
    cities: [
      { name: "Ciudad de México", region: "Ciudad de México" },
      { name: "Guadalajara", region: "Jalisco" },
      { name: "Monterrey", region: "Nuevo León" },
    ],
  },
  ES: {
    regions: ["Andalucía", "Cataluña", "Comunidad de Madrid"],
    cities: [
      { name: "Madrid", region: "Comunidad de Madrid" },
      { name: "Barcelona", region: "Cataluña" },
      { name: "Sevilla", region: "Andalucía" },
    ],
  },
  IT: {
    regions: ["Lazio", "Lombardia", "Toscana"],
    cities: [
      { name: "Roma", region: "Lazio" },
      { name: "Milano", region: "Lombardia" },
      { name: "Firenze", region: "Toscana" },
    ],
  },
  JP: {
    regions: ["大阪府", "東京都", "北海道"],
    cities: [
      { name: "東京", region: "東京都" },
      { name: "大阪", region: "大阪府" },
      { name: "札幌", region: "北海道" },
    ],
  },
};

type SearchInput = {
  name?: string;
  description?: string;
  countryCode?: string;
  region?: string;
  regions?: string[];
  city?: string;
  cities?: string[];
  category?: string;
  industryIds?: string[];
  customTerms?: string[];
  extractionTarget?: number;
  scopeMode?: "entire_country" | "selected_regions" | "selected_cities";
  runNow?: boolean;
  qualificationWebsite?: "all" | "missing" | "present";
  qualificationContacts?: string[];
  qualificationContactMatch?: "any" | "all";
};

type Qualification = {
  website: "all" | "missing" | "present";
  contacts: Array<"instagram" | "email" | "facebook">;
  contactMatch: "any" | "all";
};

function qualificationFromInput(
  input: Pick<
    SearchInput,
    | "qualificationWebsite"
    | "qualificationContacts"
    | "qualificationContactMatch"
  >,
): Qualification {
  const website =
    input.qualificationWebsite === "missing" ||
    input.qualificationWebsite === "present"
      ? input.qualificationWebsite
      : "all";
  const contacts = [
    ...new Set(
      (input.qualificationContacts ?? []).filter(
        (item): item is "instagram" | "email" | "facebook" =>
          ["instagram", "email", "facebook"].includes(item),
      ),
    ),
  ];
  return {
    website,
    contacts,
    contactMatch: input.qualificationContactMatch === "all" ? "all" : "any",
  };
}

function qualificationFromSearch(
  search: Record<string, unknown>,
): Qualification {
  let contacts: string[] = [];
  try {
    contacts = JSON.parse(String(search.qualification_contacts_json ?? "[]"));
  } catch {
    /* Legacy saved searches retain an unrestricted qualification. */
  }
  return qualificationFromInput({
    qualificationWebsite: String(
      search.qualification_website ?? "all",
    ) as Qualification["website"],
    qualificationContacts: contacts,
    qualificationContactMatch: String(
      search.qualification_contact_match ?? "any",
    ) as Qualification["contactMatch"],
  });
}

function qualificationWhere(qualification: Qualification, alias = "leads") {
  const where: string[] = [];
  // `website` is the source-of-truth for a strict qualification. The legacy
  // boolean remains useful for exports and indexing, but must never make a
  // lead with a populated URL qualify as "No Website Listed".
  const noWebsite = `COALESCE(TRIM(${alias}.website), '') = ''`;
  const hasWebsite = `COALESCE(TRIM(${alias}.website), '') != ''`;
  if (qualification.website === "missing") where.push(noWebsite);
  if (qualification.website === "present") where.push(hasWebsite);
  if (qualification.contacts.length) {
    const column = {
      instagram: "instagram",
      email: "business_email",
      facebook: "facebook",
    } as const;
    const clauses = qualification.contacts.map(
      (contact) => `${alias}.${column[contact]} != ''`,
    );
    where.push(`${alias}.enrichment_status = 'completed'`);
    where.push(
      `(${clauses.join(qualification.contactMatch === "all" ? " AND " : " OR ")})`,
    );
  }
  return where;
}

function qualificationCounts(search: Record<string, unknown>) {
  const source =
    "EXISTS (SELECT 1 FROM lead_sources qualification_source WHERE qualification_source.lead_id = leads.id AND qualification_source.search_id = ?)";
  const count = (conditions: string[]) =>
    Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM leads WHERE ${[source, ...conditions].join(" AND ")}`,
          )
          .get(String(search.id)) as { count: number }
      ).count,
    );
  const extracted = count([]);
  const enriched = count(["leads.enrichment_status = 'completed'"]);
  const websiteValidated = count(["COALESCE((SELECT status FROM website_audits wa WHERE wa.lead_id = leads.id), 'not_analyzed') NOT IN ('not_analyzed', 'failed', 'access_restricted', 'cancelled')"]);
  const auditsCompleted = count(["EXISTS (SELECT 1 FROM website_audits wa WHERE wa.lead_id = leads.id AND wa.status = 'completed')"]);
  const visualCompleted = count(["EXISTS (SELECT 1 FROM visual_ux_assessments vu WHERE vu.lead_id = leads.id AND vu.status = 'completed')"]);
  const qualified = count(["leads.qualification_status = 'qualified'"]);
  const incomplete = count(["leads.qualification_status = 'incomplete'"]);
  const failed = count(["leads.qualification_status IN ('failed', 'access_restricted')"]);
  const pending = count(["leads.qualification_status IN ('pending', 'running')"]);
  return { extracted, enriched, websiteValidated, auditsCompleted, visualCompleted, qualified, incomplete, failed, pending, remainingTarget: Math.max(0, normalizeExtractionTarget(search.extraction_target) - qualified) };
}

function refreshSearchQualificationState(searchId: string) {
  const search = db.prepare("SELECT * FROM saved_searches WHERE id = ?").get(searchId) as Record<string, unknown> | undefined;
  if (!search || !["completed", "completed_with_shortfall", "qualifying"].includes(String(search.status))) return;
  const progress = qualificationCounts(search);
  const status = progress.pending > 0
    ? "qualifying"
    : progress.qualified >= normalizeExtractionTarget(search.extraction_target)
      ? "completed"
      : "completed_with_shortfall";
  db.prepare("UPDATE saved_searches SET status = ? WHERE id = ?").run(status, searchId);
}

function reconcileSearchStatus(searchId: string) {
  const search = db.prepare("SELECT * FROM saved_searches WHERE id = ?").get(searchId) as Record<string, unknown> | undefined;
  if (!search) return null;
  const execution = db.prepare("SELECT * FROM search_executions WHERE search_id = ? ORDER BY started_at DESC LIMIT 1").get(searchId) as Record<string, unknown> | undefined;
  const jobs = execution
    ? db.prepare("SELECT status, stage FROM search_jobs WHERE execution_id = ? ORDER BY created_at").all(String(execution.id)) as Array<{ status?: string; stage?: string }>
    : [];
  const needsQualificationState = ["completed", "completed_with_shortfall", "qualifying"].includes(String(search.status)) || ["completed", "completed_with_shortfall", "completed_with_errors"].includes(String(execution?.status ?? ""));
  const qualification = needsQualificationState
    ? Number((db.prepare("SELECT COUNT(*) AS count FROM leads WHERE EXISTS (SELECT 1 FROM lead_sources WHERE lead_sources.lead_id = leads.id AND lead_sources.search_id = ?) AND leads.qualification_status IN ('pending', 'running')").get(searchId) as { count: number }).count)
    : 0;
  const collected = execution ? executionCollected(String(execution.id)) : 0;
  const status = deriveSearchStatus({
    persistedStatus: String(search.status ?? "saved"),
    executionStatus: execution?.status ? String(execution.status) : undefined,
    hasExecution: Boolean(execution),
    jobs,
    qualificationPending: qualification,
    collected,
    target: normalizeExtractionTarget(search.extraction_target),
  });
  if (status !== String(search.status ?? "")) {
    db.prepare("UPDATE saved_searches SET status = ? WHERE id = ?").run(status, searchId);
    search.status = status;
  }
  return { search, execution, jobs, status, stage: deriveSearchStage(jobs, status) };
}

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

type OutreachMode = "smart" | "general";
type OutreachOptions = { language: "en" | "pt-BR"; tone: "professional" | "warm" | "direct" | "consultative"; service: string; guidance: string; mode: OutreachMode; evidenceIds: string[]; previousSubjects?: string[] };
type OutreachResult = { subject: string; body: string; provider: string; model: string; usage: Record<string, unknown> };
const outreachStreams = new Map<string, Set<Response>>();
const cancelledOutreachRuns = new Set<string>();
const outreachConcurrency = Math.min(Math.max(Number(process.env.OUTREACH_CONCURRENCY ?? 2), 1), 6);
const outreachProvider = process.env.OUTREACH_PROVIDER ?? "chatgpt";
const outreachConnectionTimeoutMs = boundedTimeout(process.env.OUTREACH_CONNECTION_TIMEOUT_MS, 20_000, 1_000, 120_000);
const outreachStreamIdleTimeoutMs = boundedTimeout(process.env.OUTREACH_STREAM_IDLE_TIMEOUT_MS, 30_000, 1_000, 180_000);
const outreachTotalTimeoutMs = boundedTimeout(process.env.OUTREACH_TOTAL_TIMEOUT_MS, 90_000, 5_000, 300_000);

function jsonValue(value: unknown, fallback: unknown) { try { return JSON.parse(String(value ?? "")); } catch { return fallback; } }
const skillTaskMap: Record<string, string[]> = {
  writer: ["email_frameworks", "signal_playbook", "sales_methodology", "offer_strategy", "lead_qualification", "product_knowledge", "competitive_intel"],
  scout: ["prospecting_tactics", "lead_qualification", "account_navigation", "signal_playbook", "product_knowledge"],
  handler: ["sales_methodology", "offer_strategy", "objection_handling", "product_knowledge", "competitive_intel"],
};
function validOutreachMode(value: unknown, fallback: OutreachMode = "smart"): OutreachMode { return value === "general" || value === "smart" ? value : fallback; }
function loadSkillsForTask(task: string, service = "") {
  const allowed = skillTaskMap[task] ?? [];
  if (!allowed.length) return [] as Array<Record<string, unknown>>;
  const rows = db.prepare(`SELECT slug, name, source, attribution, content, service_scope FROM skills WHERE enabled = 1 AND slug IN (${allowed.map(() => "?").join(",")}) ORDER BY CASE slug ${allowed.map((slug, index) => `WHEN '${slug}' THEN ${index}`).join(" ")} ELSE ${allowed.length} END`).all(...allowed) as Array<Record<string, unknown>>;
  return rows.filter((row) => !service || !clean(row.service_scope) || clean(row.service_scope).toLocaleLowerCase().split(",").some((item) => service.toLocaleLowerCase().includes(item.trim()) || item.trim().includes(service.toLocaleLowerCase())));
}
function skillsPrompt(task: string, service = "") {
  return loadSkillsForTask(task, service).map((skill) => `## ${skill.name}\n${skill.content}`).join("\n\n");
}
function campaignLeadExists(campaignId: string, leadId: string) { return Boolean(db.prepare("SELECT 1 FROM campaign_memberships WHERE campaign_id = ? AND lead_id = ?").get(campaignId, leadId)); }
function campaignOutreachSettings(campaignId: string) {
  const row = db.prepare("SELECT outreach_mode, outreach_service, outreach_evidence_json FROM saved_searches WHERE id = ?").get(campaignId) as Record<string, unknown> | undefined;
  return { mode: validOutreachMode(row?.outreach_mode), service: clean(row?.outreach_service), evidenceIds: Array.isArray(jsonValue(row?.outreach_evidence_json, [])) ? (jsonValue(row?.outreach_evidence_json, []) as unknown[]).map(clean).filter(Boolean) : [] };
}
type OutreachContext = {
  lead: Record<string, unknown>;
  observations: unknown[];
  contacts: unknown[];
  websiteIssues: unknown[];
  visual: Record<string, unknown> | null;
  icp: Record<string, unknown> | null;
};
function baseOutreachContext(leadId: string): OutreachContext | null {
  const lead = db.prepare(`SELECT id, title, category, address, city, region, country_code, phone, website, business_email, instagram, facebook, review_count, review_rating FROM leads WHERE id = ?`).get(leadId) as Record<string, unknown> | undefined;
  if (!lead) return null;
  const observations = db.prepare(`SELECT lo.signal_code, d.label, lo.value_text, lo.confidence, lo.evidence_url, lo.evidence_excerpt, lo.observed_at, lo.verification_status FROM lead_observations lo LEFT JOIN lead_signal_definitions d ON d.code = lo.signal_code WHERE lo.lead_id = ? ORDER BY lo.observed_at DESC`).all(leadId);
  const contacts = db.prepare(`SELECT lc.role, lc.source_url, lc.evidence, lc.confidence, lc.verification_status, cp.kind, cp.display_value, p.display_name FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id LEFT JOIN people p ON p.id = cp.person_id WHERE lc.lead_id = ? ORDER BY lc.confidence DESC`).all(leadId);
  const websiteIssues = db.prepare(`SELECT i.id, i.category, i.severity, i.evidence, i.suggestion, i.verification_status
    FROM website_audit_issues i JOIN website_audits a ON a.id = i.audit_id
    WHERE a.lead_id = ? ORDER BY CASE i.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.created_at DESC`).all(leadId);
  const score = db.prepare(`SELECT id, profile_key, profile_version, score, evidence_coverage, evidence_confidence, explanation_json, calculated_at FROM icp_scores WHERE lead_id = ? ORDER BY calculated_at DESC LIMIT 1`).get(leadId) as Record<string, unknown> | undefined;
  const scoreEvidence = score ? db.prepare(`SELECT rule_code, source_type, evidence_url, evidence_detail, confidence, observed_at FROM icp_score_evidence WHERE score_id = ? ORDER BY rule_code`).all(String(score.id)) : [];
  const visual = db.prepare("SELECT * FROM visual_ux_assessments WHERE lead_id = ? AND approved = 1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1").get(leadId) as Record<string, unknown> | undefined;
  return { lead, observations, contacts, websiteIssues, visual: visual ? { ...visual, rubric: jsonValue(visual.rubric_json, {}) } : null, icp: score ? { ...score, explanation: jsonValue(score.explanation_json, {}), evidence: scoreEvidence } : null };
}

// Outreach is an execution surface, not a contact-research queue. A lead only
// becomes eligible after Contact Discovery persisted a verified primary email.
// Possible contacts remain visible in the lead record for review, but never
// appear as a campaign recipient or enter the Outbox automatically.
type OutreachRecipient = { email: string; status: 'verified'; sourceUrl: string; confidence: number };
function outreachRecipient(leadId: string): OutreachRecipient | null {
  const lead = db.prepare("SELECT business_email, contact_status, contact_source_url, contact_confidence, website FROM leads WHERE id = ?").get(leadId) as Record<string, unknown> | undefined;
  if (!lead) return null;
  const officialDomain = leadOfficialDomain(lead.website);
  const primary = db.prepare(`SELECT lc.source_url, lc.confidence, lc.verification_status, cp.display_value
    FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id
    WHERE lc.lead_id = ? AND lc.is_primary = 1 AND cp.kind = 'email' LIMIT 1`).get(leadId) as Record<string, unknown> | undefined;
  const email = normalizeEmail(String(primary?.display_value ?? lead.business_email ?? ''));
  const sourceUrl = String(primary?.source_url ?? lead.contact_source_url ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!primary || persistedContactIsDirectoryAdmin({ email, source_url: sourceUrl }, officialDomain)) return null;
  const status = String(primary.verification_status ?? lead.contact_status ?? 'unverified');
  if (status !== 'verified') return null;
  return { email, status: 'verified', sourceUrl, confidence: Number(primary.confidence ?? lead.contact_confidence ?? 0) };
}

function requireOutreachRecipient(leadId: string) {
  const recipient = outreachRecipient(leadId);
  if (!recipient) throw new Error('Esta empresa não possui um e-mail comercial principal verificado para Outreach.');
  return recipient;
}

function outreachEvidenceEligible(leadId: string) {
  const row = db.prepare(`SELECT COALESCE(os.level, 'insufficient_evidence') AS level
    FROM leads l LEFT JOIN website_opportunity_scores os ON os.lead_id = l.id AND os.profile_key = 'website_opportunity'
    WHERE l.id = ?`).get(leadId) as { level?: string } | undefined;
  return ["high", "medium", "low"].includes(String(row?.level ?? "insufficient_evidence"));
}

function requireOutreachEvidence(leadId: string) {
  if (!outreachEvidenceEligible(leadId)) throw new Error("This company does not have sufficient commercial evidence for Outreach.");
}

function outreachContext(campaignId: string, leadId: string) {
  if (!campaignLeadExists(campaignId, leadId)) return null;
  return baseOutreachContext(leadId);
}
function safeEvidence(context: OutreachContext) {
  const evidence: Array<Record<string, unknown>> = [];
  for (const item of context.observations as Array<Record<string, unknown>>) if (item.verification_status === "verified") evidence.push({ id: `signal:${item.signal_code}:${item.evidence_url ?? ""}:${item.observed_at ?? ""}`, source: "lead_intelligence", label: item.label ?? item.signal_code, detail: item.value_text, confidence: item.confidence, url: item.evidence_url, excerpt: item.evidence_excerpt, verificationStatus: item.verification_status, signalCode: item.signal_code });
  for (const item of context.contacts as Array<Record<string, unknown>>) if (item.verification_status === "verified") evidence.push({ id: `contact:${item.kind}:${item.display_value}`, source: "public_contact", label: [item.display_name, item.role, item.kind].filter(Boolean).join(" · "), detail: item.display_value, confidence: item.confidence, url: item.source_url, excerpt: item.evidence, verificationStatus: item.verification_status });
  for (const item of context.websiteIssues as Array<Record<string, unknown>>) if (item.verification_status === "verified") evidence.push({ id: `audit:${item.id}`, source: "homepage_audit", category: item.category, label: `${item.category} finding`, detail: item.evidence, confidence: 0.9, excerpt: item.suggestion, verificationStatus: "verified", priority: item.severity === "high" ? 120 : item.severity === "medium" ? 100 : 80 });
  for (const item of (context.icp?.evidence ?? []) as Array<Record<string, unknown>>) evidence.push({ id: `icp:${item.rule_code}:${item.evidence_url ?? ""}`, source: "icp", label: item.rule_code, detail: item.evidence_detail, confidence: item.confidence, url: item.evidence_url, observedAt: item.observed_at, verificationStatus: "verified" });
  if (context.visual) { const visual = context.visual as Record<string, unknown>; evidence.push({ id: `visual:${visual.id}`, source: "visual_ux", label: "Approved Visual & UX assessment", detail: visual.summary, confidence: 0.5, verificationStatus: "subjective", subjective: true, priority: 10, excerpt: "Subjective presentation assessment; not a verified technical defect." }); }
  return evidence.filter((item) => clean(item.detail) || clean(item.excerpt));
}
function evidenceForOutreach(context: OutreachContext, options: OutreachOptions) {
  const evidence = safeEvidence(context);
  return selectOutreachEvidence(evidence, options.evidenceIds);
}
function requireConcreteOutreachEvidence(context: OutreachContext, options: OutreachOptions) {
  if (!hasConcreteCommercialEvidence(evidenceForOutreach(context, options))) {
    throw new Error("Não há evidência comercial concreta suficiente para personalizar este e-mail. A geração foi interrompida para evitar uma mensagem genérica.");
  }
}
function validTone(value: unknown, fallback = "professional") {
  return ["professional", "warm", "direct", "consultative"].includes(String(value)) ? String(value) as OutreachOptions["tone"] : fallback as OutreachOptions["tone"];
}
const strategicOutreachService = "Strategic website development focused on user experience, conversion, commercial acquisition, and SEO when relevant.";
function outreachOptions(input: Record<string, unknown> | undefined, campaignId = ""): OutreachOptions {
  const preferences = outreachPreferences();
  const campaignSettings = campaignId ? campaignOutreachSettings(campaignId) : { mode: "smart" as OutreachMode, service: "", evidenceIds: [] as string[] };
  const mode = validOutreachMode(input && Object.prototype.hasOwnProperty.call(input, "mode") ? input.mode : undefined, campaignSettings.mode);
  const evidenceIds = input && Object.prototype.hasOwnProperty.call(input, "evidenceIds") && Array.isArray(input.evidenceIds)
    ? [...new Set((input.evidenceIds as unknown[]).map(clean).filter(Boolean))]
    : campaignSettings.evidenceIds;
  return {
    language: input?.language === "pt-BR" ? "pt-BR" : input?.language === "en" ? "en" : preferences.defaultLanguage,
    tone: validTone(input?.tone, validTone(preferences.tone)),
    service: clean(input?.service) || campaignSettings.service,
    guidance: safeOutreachGuidance(input?.guidance),
    mode,
    evidenceIds,
  };
}
function outreachPrompt(context: OutreachContext, options: OutreachOptions) {
  const preferences = outreachPreferences();
  const facts = Object.fromEntries(Object.entries(context.lead).filter(([, value]) => value !== null && value !== ""));
  const selectedEvidence = evidenceForOutreach(context, options);
  const skillsTask = options.mode === "smart" ? "writer" : "scout";
  const variation = outreachVariationDirection(String(context.lead.id));
  const modeGuidance = options.mode === "smart" ? `${outreachModeGuidance(options.mode)} Focus especially on functional website, SEO, performance, usability, booking or contact-flow findings.` : outreachModeGuidance(options.mode);
  const sender = preferences.senderProfile;
  return `You write one developed, natural B2B prospecting email. It should be focused, but not superficial: explain the verified observation with enough concrete detail for the recipient to understand what was noticed, why it may matter commercially, and what kind of improvement fits it. Return JSON only with keys subject and body.

${officialOutreachGuidelinesPrompt()}

## Sender identity
Name: ${sender.name || "not configured"}
Professional title: ${sender.title || "not configured"}
Introduction: ${sender.introduction || "not configured"}
Services: ${sender.services || "not configured"}
Portfolio: ${sender.portfolioUrl || "not configured"}
Instagram: ${sender.instagramUrl || "not configured"}
Use only relevant configured identity details naturally. Do not invent identity details, links, credentials, or a signature. The app adds the signature separately. Regardless of the technical evidence, position Luan consistently as a Web Developer & SEO Specialist who designs and develops strategic websites around user experience, conversion, and commercial acquisition. The finding supports the argument, but never redefines Luan as a mobile, speed, button, booking, form, navigation, or SEO-only specialist.

## Global writing preferences
Outreach mode: ${options.mode}. Language: ${options.language}. Tone: ${options.tone}. Service focus: ${options.service || "not specified"}.
Preferred structure: ${preferences.structure}. User subject guidelines: ${preferences.subjectGuidelines}.
${preferences.subjectTemplate ? `Use this user-defined subject template exactly, replacing {{company}}, {{category}}, and {{city}}: ${preferences.subjectTemplate}.` : "Create a specific subject and vary it naturally from other leads; never reuse an identical title when a different truthful phrasing is possible."}
${options.previousSubjects?.length ? `Previously used subjects for this same lead: ${JSON.stringify(options.previousSubjects)}. Create a clearly different, equally natural subject; never repeat or make a trivial word swap.` : ""}
${outreachSubjectPolicy}
${outreachWritingStandards.subject}
${outreachWritingStandards.body}
${outreachWritingStandards.evidence}
${outreachWritingStandards.cta}

## Commercial intelligence
${modeGuidance}
Buyer context (a conditional sales lens, not a lead fact): ${commercialBuyerLens(context.lead.category)}
Selected evidence (internal grounding): ${JSON.stringify(commercialEvidenceContext(selectedEvidence, commercialBuyerLens(context.lead.category)))}

## Lead-specific direction
Additional user direction (not evidence): ${options.guidance || "None"}. Treat this only as tone and framing guidance. Do not state it as a verified fact, diagnosis, measured conversion impact, customer loss, or outcome. When it suggests visual weakness, use conditional, professional language such as “the presentation may be making the next step less clear,” only if it fits the selected evidence.
Choose one main commercial opportunity, or at most two directly related points. Structural variation direction: ${variation}. Do not copy openings, closings, or sentence rhythm from other drafts.
Use only the facts and evidence below. Entries with "subjective": true are approved Visual & UX opinions: present them only as a gentle impression, never as a verified defect or objective fact. Entries marked verified may be stated neutrally. Use the supplied specificObservation after a natural introductory transition, not as the first substantive sentence. Think from the prospective customer’s point of view: explain a specific, conditional moment where an interested person may be trying to call, request a quote, schedule, compare providers, or find help. Connect the verified obstacle to the risk that this person could stop short or choose another provider, but never assert that this business has already lost a customer, booking, revenue, conversion, traffic, or ranking. Translate technical language into ordinary business and buyer language, but do not replace a real observation with vague phrases such as "one modest improvement", "relevant ideas", "online presence", or "the next step feel clearer". Show why the matching web, UX, SEO, or conversion work could help the business capture more of the interest it already earns. Never say an automated check or review found something, and never name selectors, audit rules, Lighthouse, or raw diagnostic identifiers.
Use a recipient first name only when a verified public contact record clearly provides it. Never invent metrics, technologies, services, names, authority, customer losses, conversion outcomes, or website problems. Do not claim to have looked at Instagram, Facebook, a portfolio, photos, reviews, or the recipient's work unless a selected evidence item explicitly records that observation. Avoid generic introductions such as "I hope this finds you well" or "I came across your business". When evidence is insufficient, do not manufacture a neutral personalized email; the application should report the insufficient-evidence state. For Portuguese, write natural Brazilian Portuguese. Do not add a signature, sender identity, or unsubscribe language; the application adds the saved signature.

## Sales guidance
The enabled sales skills below are guidance only; verified evidence and user preferences override them:
${skillsPrompt(skillsTask, options.service)}

## Verified lead facts
Verified listing facts: ${JSON.stringify(facts)}

## Enforced factual boundary
This draft is grounded in automated and persisted lead intelligence. No human website, social-profile, portfolio, photograph, or customer-work review is recorded for this lead unless it appears explicitly in the verified facts above. Do not write “I was looking at,” “I took a look,” “I reviewed,” “I came across,” or similar first-person browsing claims. Use the supplied specificObservation as the concrete opening or supporting detail; do not replace it with a generic online-presence statement. The commercialContext is the permitted reader-friendly framing of selected audit evidence; never surface raw diagnostic identifiers.
`;
}
function parseGeneratedEmail(text: string) {
  const parsed = parseOutreachDraft(text);
  if (!parsed) throw new OutreachGenerationError("invalid_response", "ChatGPT returned a response without both a subject and message. No draft was saved; try generating again.");
  return parsed;
}
function normalizeEmailBody(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
class OutreachGenerationError extends Error {
  constructor(readonly code: "provider_connection" | "authentication" | "invalid_response" | "empty_response" | "provider_error" | "connection_timeout" | "stream_timeout" | "total_timeout" | "cancelled", message: string) { super(message); this.name = "OutreachGenerationError"; }
}
function sendOutreachError(res: Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (error instanceof OutreachGenerationError) {
    const status = error.code === "authentication" ? 401 : error.code === "invalid_response" || error.code === "empty_response" ? 422 : error.code === "cancelled" ? 499 : error.code.endsWith("timeout") ? 504 : 502;
    return res.status(status).json({ error: message, code: error.code });
  }
  return res.status(502).json({ error: message, code: "internal" });
}
function outreachAbortError(reason: unknown) {
  const code = terminalCodeFromAbort(reason);
  if (code === "connection_timeout") return new OutreachGenerationError("connection_timeout", "ChatGPT did not establish a response in time.");
  if (code === "stream_timeout") return new OutreachGenerationError("stream_timeout", "ChatGPT stopped sending email content before the draft was complete.");
  if (code === "total_timeout") return new OutreachGenerationError("total_timeout", "Email generation exceeded the maximum allowed time.");
  return new OutreachGenerationError("cancelled", "Email generation was cancelled.");
}
function responseOutputText(value: unknown): string {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const content = Array.isArray(record.content) ? record.content : [];
    return content.map((part) => {
      const partRecord = part && typeof part === "object" ? part as Record<string, unknown> : {};
      return typeof partRecord.text === "string" ? partRecord.text : "";
    });
  }).filter(Boolean).join("");
}
async function readOutreachStream(response: globalThis.Response, controller: AbortController) {
  const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buffer = ""; let output = ""; let usage: Record<string, unknown> = {}; const eventTypes = new Set<string>();
  const consume = (line: string) => {
    if (!line.startsWith("data: ")) return;
    const raw = line.slice(6); if (raw === "[DONE]") return;
    const event = jsonValue(raw, {}) as Record<string, unknown>;
    const type = String(event.type ?? "unknown"); eventTypes.add(type);
    if (type === "response.output_text.delta") output += typeof event.delta === "string" ? event.delta : responseOutputText(event.delta);
    if (type === "response.output_text.done" && !output) output = typeof event.text === "string" ? event.text : responseOutputText(event);
    if (type === "response.completed") { const completed = event.response as Record<string, unknown> | undefined; if (!output) output = responseOutputText(completed); usage = (completed?.usage as Record<string, unknown> | undefined) ?? {}; }
    if (event.type === "response.failed" || event.type === "error") throw new OutreachGenerationError("provider_error", String((event.error as Record<string, unknown> | undefined)?.message ?? "ChatGPT generation failed."));
  };
  while (true) {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { idleTimer = setTimeout(() => { controller.abort("stream_timeout"); reject(outreachAbortError("stream_timeout")); }, outreachStreamIdleTimeoutMs); }),
      ]);
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ""; lines.forEach(consume);
    } catch (error) {
      if (controller.signal.aborted) throw outreachAbortError(controller.signal.reason);
      throw error;
    } finally { if (idleTimer) clearTimeout(idleTimer); }
  }
  if (buffer.trim()) consume(buffer);
  console.info(`[outreach] stream_complete events=${[...eventTypes].join(",") || "none"} output_chars=${output.trim().length}`);
  return { output: output.trim(), usage };
}
async function providerError(response: globalThis.Response) {
  const raw = await response.text().catch(() => "");
  const parsed = jsonValue(raw, {}) as Record<string, unknown>;
  const nested = parsed.error && typeof parsed.error === "object" ? parsed.error as Record<string, unknown> : {};
  const message = clean(nested.message ?? parsed.message ?? parsed.detail ?? "");
  const code = clean(nested.code ?? parsed.code ?? "");
  // Provider messages are useful to the operator, but cap them so a malformed
  // upstream response cannot turn a toast into a wall of text.
  return { code, message: message.slice(0, 360) };
}
function stripSignature(body: string) {
  const normalized = stripFixedOutreachSignature(body);
  const marker = normalized.lastIndexOf("\n--\n");
  return marker >= 0 ? normalized.slice(0, marker).trim() : normalized;
}
function applySignature(body: string) {
  const cleanBody = stripSignature(body);
  return applyFixedOutreachSignature(cleanBody);
}
function applySubjectPreference(subject: string, context: OutreachContext, campaignId: string, leadId: string, preferences = outreachPreferences()) {
  const template = preferences.subjectTemplate;
  return template
    ? template.replaceAll("{{company}}", clean(context.lead.title) || "your business").replaceAll("{{category}}", clean(context.lead.category)).replaceAll("{{city}}", clean(context.lead.city))
    : clean(subject);
}
function campaignPreviousSubjects(campaignId: string, leadId: string) {
  return (db.prepare("SELECT subject FROM campaign_drafts WHERE campaign_id = ? AND lead_id != ? AND trim(subject) != '' ORDER BY updated_at DESC LIMIT 24").all(campaignId, leadId) as Array<{ subject: string }>).map((item) => clean(item.subject)).filter(Boolean);
}
function trustedOutreachContactName(context: OutreachContext) {
  for (const item of context.contacts as Array<Record<string, unknown>>) {
    if (item.kind !== "person" || item.verification_status !== "verified") continue;
    const name = trustedFirstName(clean(item.display_name), clean(context.lead.title));
    if (name) return name;
  }
  return "";
}
function finalizeOutreach(result: OutreachResult, context: OutreachContext, campaignId: string, leadId: string, language: OutreachOptions["language"]) {
  const preferences = outreachPreferences();
  const body = language === "en" ? ensureEnglishGreeting(result.body, trustedOutreachContactName(context)) : result.body;
  return { ...result, subject: removeStylisticDashes(applySubjectPreference(result.subject, context, campaignId, leadId, preferences)), body: applySignature(body) };
}
function finalizeGlobalOutreach(result: OutreachResult, context: OutreachContext, leadId: string, language: OutreachOptions["language"]) {
  const body = language === "en" ? ensureEnglishGreeting(result.body, trustedOutreachContactName(context)) : result.body;
  return { ...result, subject: removeStylisticDashes(clean(result.subject)), body: applySignature(body) };
}
async function generateOutreach(context: OutreachContext, options: OutreachOptions, externalSignal?: AbortSignal): Promise<OutreachResult> {
  const operationId = randomUUID();
  const controller = new AbortController();
  const cancel = () => controller.abort(externalSignal?.reason || "cancelled");
  externalSignal?.addEventListener("abort", cancel, { once: true });
  const totalTimer = setTimeout(() => controller.abort("total_timeout"), outreachTotalTimeoutMs);
  const providerFetch = async (url: string, init: RequestInit) => {
    let connectionTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      connectionTimer = setTimeout(() => controller.abort("connection_timeout"), outreachConnectionTimeoutMs);
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw outreachAbortError(controller.signal.reason);
      throw error;
    } finally { if (connectionTimer) clearTimeout(connectionTimer); }
  };
  console.info(`[outreach] start operation=${operationId}`);
  try {
  if (outreachProvider === "mock") {
    const name = clean(context.lead.title) || "your business";
    return { subject: `A quick idea for ${name}`, body: options.language === "pt-BR" ? `Olá,\n\nEstou pesquisando empresas como a ${name} e queria compartilhar algumas ideias sobre ${options.service || "presença digital"}. Posso enviar um resumo curto para você avaliar?\n\nAbraços` : `Hi,\n\nI’m researching businesses like ${name} and wanted to share a few ideas around ${options.service || "digital presence"}. Would it be useful if I sent a short overview for you to consider?\n\nBest,`, provider: "mock", model: "mock", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  }
  if (outreachProvider !== "chatgpt") throw new Error("Paid API providers are disabled. Connect ChatGPT or use OUTREACH_PROVIDER=mock for tests.");
  let credential = await activeChatGptCredential(controller.signal); if (!credential) throw new Error("Connect ChatGPT in Settings to use your plan allowance.");
  if (!credential.scopes.includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan usage permission was not granted.");
  let modelTimer: ReturnType<typeof setTimeout> | undefined;
  const models = await (async () => { try { modelTimer = setTimeout(() => controller.abort("connection_timeout"), outreachConnectionTimeoutMs); return await listChatGptModels(credential, controller.signal); } finally { if (modelTimer) clearTimeout(modelTimer); } })();
  const model = selectedChatGptModel();
  if (!model) throw new Error("Select an available ChatGPT model in Settings before generating.");
  if (!models.includes(model)) throw new Error("The selected ChatGPT model is no longer available. Choose another model in Settings.");
  const request = async (token: string, repair: "format" | "narrative" | false = false, structured = true) => providerFetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model, instructions: "Return only a JSON object with non-empty string keys subject and body. Do not use Markdown. The subject must follow commercial curiosity: present an idea, opportunity, or natural reason to talk; do not explain a problem, solution, technical detail, metric, device, diagnostic, or benefit.", input: [{ role: "user", content: [{ type: "input_text", text: `${outreachPrompt(context, options)}${repair === "format" ? "\n\nReissue the same grounded email as JSON with non-empty subject and body only. The previous response was missing required content or used a keyword-style subject. Apply the commercial curiosity subject policy: use an idea, opportunity, or natural reason to talk; do not explain the problem, solution, technical detail, metric, device, diagnostic, or benefit. Never use company name plus service and do not add facts." : repair === "narrative" ? "\n\nRewrite the same email using exactly the supplied evidence. The prior version opened like a technical audit, used formulaic sales copy, or reduced Luan to a narrow technical fix. Start after the greeting with an approachable, business-relevant reason for writing, then transition naturally to the concrete observation, its cautious buyer scenario, the matching commercial value, and one low-pressure question. Position Luan as a Web Developer & SEO Specialist who designs and develops strategic websites around user experience, conversion, and commercial acquisition. The finding may guide the argument, but do not describe Luan as a mobile, speed, booking, button, form, navigation, or SEO-only specialist. Do not add facts, praise, metrics, or claims. Do not mention an automated check, audit, review, Lighthouse, or raw diagnostics. Do not use ‘a couple of ideas,’ ‘a focused improvement,’ or a formulaic CTA. Return JSON only." : ""}` }] }], ...(structured ? { text: { format: { type: "json_schema", name: "outreach_email", strict: true, schema: { type: "object", additionalProperties: false, required: ["subject", "body"], properties: { subject: { type: "string" }, body: { type: "string" } } } } } } : {}), store: false, stream: true }),
  });
  const subjectRevisionRequest = async (token: string, subject: string) => providerFetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model,
      instructions: "Return only a JSON object with one non-empty string key: subject. Do not use Markdown. Apply the commercial curiosity subject policy.",
      input: [{ role: "user", content: [{ type: "input_text", text: `You are the final editorial reviewer for one cold-email subject line. Revise only the subject; the email body is already approved and must not be regenerated.\n\nCurrent subject: ${subject}\n${options.previousSubjects?.length ? `Previously used subjects that must not be repeated: ${JSON.stringify(options.previousSubjects)}\n` : ""}\n${outreachSubjectPolicy}\n${outreachWritingStandards.subject}\n\nThe subject must sound human, personal, natural, and commercially elegant. It must present an idea, opportunity, or natural reason to talk without explaining the problem, solution, technical detail, metric, device, diagnostic, or benefit. It must not name an audit issue, service, rule, ticket, or report. Keep it concise and truthful. Return only JSON.` }] }],
      text: { format: { type: "json_schema", name: "outreach_subject", strict: true, schema: { type: "object", additionalProperties: false, required: ["subject"], properties: { subject: { type: "string" } } } } },
      store: false,
      stream: true,
    }),
  });
  const reviseSubject = async (subject: string) => {
    const token = credential?.accessToken;
    if (!token) return null;
    const response = await subjectRevisionRequest(token, subject);
    if (!response.ok || !response.body) {
      const rejected = await providerError(response);
      console.warn(`[outreach] subject_revision_failed operation=${operationId} status=${response.status} code=${rejected.code || "unknown"}`);
      return null;
    }
    const revised = parseOutreachSubject((await readOutreachStream(response, controller)).output);
    return revised && !isPoorOutreachSubject(revised, clean(context.lead.title)) ? revised : null;
  };
  let response = await request(credential.accessToken!); if (response.status === 401) { credential = await refreshChatGptCredential(controller.signal); if (!credential?.accessToken) throw new Error("ChatGPT authorization expired. Reconnect ChatGPT in Settings."); response = await request(credential.accessToken); }
  if (response.status === 400) {
    const rejected = await providerError(response);
    console.warn(`[outreach] structured_response_rejected operation=${operationId} code=${rejected.code || "unknown"}; retrying without schema`);
    response = await request(credential.accessToken!, false, false);
  }
  if (!response.ok || !response.body) { if (response.status === 401 || response.status === 403) throw new OutreachGenerationError("authentication", "ChatGPT authorization was not accepted. Reconnect your account in Settings."); if (response.status === 429) throw new OutreachGenerationError("provider_connection", "ChatGPT plan usage limit reached. Try again after the limit resets."); const rejected = await providerError(response); console.warn(`[outreach] provider_rejected operation=${operationId} status=${response.status} code=${rejected.code || "unknown"}`); throw new OutreachGenerationError("provider_connection", rejected.message ? `ChatGPT rejected the generation request: ${rejected.message}` : `ChatGPT request failed (${response.status}).`); }
  console.info(`[outreach] provider_connected operation=${operationId}`);
  let streamed = await readOutreachStream(response, controller); let draft = parseOutreachDraft(streamed.output);
  if (!draft) {
    console.warn(`[outreach] invalid provider draft; model=${model} output_chars=${streamed.output.length}; retrying once with the response schema.`);
    response = await request(credential.accessToken!, "format");
    if (!response.ok || !response.body) throw new OutreachGenerationError("invalid_response", "ChatGPT returned an invalid email format twice. No draft was saved; try again later.");
    streamed = await readOutreachStream(response, controller); draft = parseOutreachDraft(streamed.output);
  }
  if (!draft) throw new OutreachGenerationError(streamed.output ? "invalid_response" : "empty_response", streamed.output ? "ChatGPT returned an invalid email format twice. No draft was saved; try again later." : "ChatGPT returned no email content. No draft was saved; try again later.");
  const narrative = assessOutreachNarrative(draft.body);
  if (!narrative.acceptable) {
    console.warn(`[outreach] editorial_narrative_revision operation=${operationId} reasons=${narrative.reasons.join(",")}`);
    response = await request(credential.accessToken!, "narrative");
    if (!response.ok || !response.body) throw new OutreachGenerationError("invalid_response", "ChatGPT could not repair the email opening without changing its factual basis. No draft was saved.");
    streamed = await readOutreachStream(response, controller);
    const revised = parseOutreachDraft(streamed.output);
    if (!revised || !assessOutreachNarrative(revised.body).acceptable) throw new OutreachGenerationError("invalid_response", "ChatGPT returned an email that still reads like an audit. No draft was saved.");
    draft = revised;
  }
  const assessment = assessOutreachSubject(draft.subject, clean(context.lead.title));
  const duplicateSubject = options.previousSubjects?.some((prior) => prior.toLocaleLowerCase() === draft!.subject.toLocaleLowerCase()) ?? false;
  if (!assessment.acceptable || duplicateSubject) {
    const reasons = [...assessment.reasons, ...(duplicateSubject ? ["duplicate_subject"] : [])];
    console.warn(`[outreach] editorial_subject_revision operation=${operationId} reasons=${reasons.join(",")}`);
    const revisedSubject = await reviseSubject(draft.subject);
    if (!revisedSubject || options.previousSubjects?.some((prior) => prior.toLocaleLowerCase() === revisedSubject.toLocaleLowerCase())) throw new OutreachGenerationError("invalid_response", "ChatGPT returned a subject that does not meet the commercial writing standard. No draft was saved; try again later.");
    draft = { ...draft, subject: revisedSubject };
  }
  console.info(`[outreach] parsed operation=${operationId}`);
  return { ...draft, provider: "chatgpt", model, usage: streamed.usage };
  } catch (error) {
    const normalized = controller.signal.aborted ? outreachAbortError(controller.signal.reason) : error;
    console.warn(`[outreach] failed operation=${operationId} reason=${normalized instanceof OutreachGenerationError ? normalized.code : "provider_error"}`);
    throw normalized;
  } finally {
    clearTimeout(totalTimer);
    externalSignal?.removeEventListener("abort", cancel);
  }
}
async function translateOutreach(subject: string, body: string): Promise<OutreachResult> {
  if (outreachProvider === "mock") return { subject: `[PT] ${subject}`, body: `[Tradução de teste]\n\n${body}`, provider: "mock", model: "mock", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  if (outreachProvider !== "chatgpt") throw new Error("Paid API providers are disabled. Connect ChatGPT or use OUTREACH_PROVIDER=mock for tests.");
  let credential = await activeChatGptCredential(); if (!credential) throw new Error("Connect ChatGPT in Settings to use your plan allowance.");
  if (!credential.scopes.includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan usage permission was not granted.");
  const models = await listChatGptModels(credential); const model = selectedChatGptModel();
  if (!model || !models.includes(model)) throw new Error("Select an available ChatGPT model in Settings before translating.");
  const prompt = `Translate this manually reviewed prospecting email into natural Brazilian Portuguese. Preserve meaning, facts, tone, placeholders, and the low-pressure CTA. Do not add claims or details. Return JSON only with subject and body. Subject: ${subject}\nBody: ${body}`;
  const request = async (token: string) => fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ model, instructions: "Return JSON only with keys subject and body.", input: [{ role: "user", content: prompt }], store: false, stream: true }) });
  let response = await request(credential.accessToken!); if (response.status === 401) { credential = await refreshChatGptCredential(); if (!credential?.accessToken) throw new Error("ChatGPT authorization expired. Reconnect ChatGPT in Settings."); response = await request(credential.accessToken); }
  if (!response.ok || !response.body) throw new Error(response.status === 429 ? "ChatGPT plan usage limit reached. Try again after the limit resets." : `ChatGPT translation failed (${response.status}).`);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let output = ""; let usage: Record<string, unknown> = {};
  while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; const raw = line.slice(6); if (raw === "[DONE]") continue; const event = jsonValue(raw, {}) as Record<string, unknown>; if (event.type === "response.output_text.delta") output += String(event.delta ?? ""); if (event.type === "response.completed") usage = ((event.response as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined) ?? {}; if (event.type === "response.failed" || event.type === "error") throw new Error(String((event.error as Record<string, unknown> | undefined)?.message ?? "ChatGPT translation failed.")); } }
  return { ...parseGeneratedEmail(output), provider: "chatgpt", model, usage };
}
class ChatGptModelDiscoveryError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "") {
    super(message);
    this.name = "ChatGptModelDiscoveryError";
    this.status = status;
    this.code = code;
  }
}
async function listChatGptModels(credential = undefined as ChatGptCredential | undefined, signal?: AbortSignal) {
  const active = credential ?? await activeChatGptCredential();
  if (!active?.accessToken) throw new ChatGptModelDiscoveryError(401, "Connect ChatGPT first.", "not_authenticated");
  let response: globalThis.Response;
  try { response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${active.accessToken}` }, signal }); }
  catch (error) { if (signal?.aborted) throw outreachAbortError(signal.reason); throw error; }
  const payload = await response.json().catch(() => ({})) as { models?: Array<{ slug?: string; display_name?: string; visibility?: string }>; data?: Array<{ id?: string }> ; error?: { code?: string; message?: string } };
  const entries = Array.isArray(payload.models) ? payload.models : [];
  const ids = entries.map((item) => clean(item.slug)).filter(Boolean);
  console.info(`[chatgpt-model-discovery] status=${response.status} count=${ids.length} ids=${JSON.stringify(ids)}${payload.error?.code ? ` error_code=${clean(payload.error.code)}` : ""}`);
  if (!response.ok) throw new ChatGptModelDiscoveryError(response.status, payload.error?.message || `ChatGPT model discovery failed (${response.status}).`, clean(payload.error?.code));
  return ids;
}
const outreachReviewStatuses = new Set(["not_generated", "draft", "reviewed", "sent", "contacted", "replied", "interested"]);
const repeatContactStatuses = new Set(["contacted", "replied", "interested"]);
function outreachRepeatConflict(campaignId: string, leadId: string) {
  const rows = db.prepare(`SELECT d.campaign_id, d.review_status, d.contacted_at, s.name AS campaign_name
    FROM campaign_drafts d JOIN saved_searches s ON s.id = d.campaign_id
    WHERE d.lead_id = ? AND d.campaign_id != ? AND (d.review_status IN ('contacted', 'replied', 'interested') OR COALESCE(TRIM(d.contacted_at), '') != '')`).all(leadId, campaignId) as Array<Record<string, unknown>>;
  const pipeline = db.prepare("SELECT status, last_contact_at FROM outreach_pipeline WHERE lead_id = ?").get(leadId) as { status?: string; last_contact_at?: string } | undefined;
  if (pipeline && (repeatContactStatuses.has(String(pipeline.status)) || clean(pipeline.last_contact_at))) return { source: "pipeline", status: pipeline.status, contactedAt: pipeline.last_contact_at };
  const campaign = rows[0];
  return campaign ? { source: "campaign", campaignId: campaign.campaign_id, campaignName: campaign.campaign_name, status: campaign.review_status, contactedAt: campaign.contacted_at } : null;
}
function draftRow(campaignId: string, leadId: string): Record<string, any> | null {
  const row = db.prepare("SELECT * FROM campaign_drafts WHERE campaign_id = ? AND lead_id = ?").get(campaignId, leadId) as Record<string, unknown> | undefined;
  if (!row || !clean(row.body)) {
    const global = globalDraftRow(leadId);
    if (clean(global.body)) return { ...global, campaign_id: campaignId, review_status: global.status === "sent" ? "sent" : "draft", reviewStatus: global.status === "sent" ? "sent" : "draft", contactedAt: "", reviewNotes: "", translatedSubject: "", translatedBody: "", translationLanguage: "", translationProvider: "", translationModel: "", repeatConflict: outreachRepeatConflict(campaignId, leadId), generationHistory: global.history ?? [] };
  }
  if (!row) return null;
  return { ...row, reviewStatus: clean(row.review_status) || (clean(row.body) ? "draft" : "not_generated"), contactedAt: clean(row.contacted_at), reviewNotes: String(row.review_notes ?? ""), translatedSubject: String(row.translated_subject ?? ""), translatedBody: String(row.translated_body ?? ""), translationLanguage: String(row.translation_language ?? ""), translationProvider: String(row.translation_provider ?? ""), translationModel: String(row.translation_model ?? ""), repeatConflict: outreachRepeatConflict(campaignId, leadId), usage: jsonValue(row.usage_json, {}), evidence: jsonValue(row.evidence_json, []), generationHistory: jsonValue(row.generation_history_json, []) };
}
function saveDraft(campaignId: string, leadId: string, input: { subject?: string; body?: string; language?: string; tone?: string; service?: string; provider?: string; model?: string; usage?: Record<string, unknown>; evidence?: unknown[]; generation?: Record<string, unknown>; reviewStatus?: string; contactedAt?: string; reviewNotes?: string; translatedSubject?: string; translatedBody?: string; translationLanguage?: string; translationProvider?: string; translationModel?: string }) {
  const now = new Date().toISOString(); const existing = draftRow(campaignId, leadId); const history = [...((existing?.generationHistory as unknown[]) ?? [])]; if (input.generation) history.unshift(input.generation);
  const reviewStatus = outreachReviewStatuses.has(input.reviewStatus ?? "") ? input.reviewStatus : String(existing?.reviewStatus ?? (clean(input.body ?? existing?.body) ? "draft" : "not_generated"));
  const body = applySignature(input.body ?? String(existing?.body ?? ""));
  const values = [
    randomUUID(), campaignId, leadId,
    input.subject ?? String(existing?.subject ?? ""), body,
    input.language ?? String(existing?.language ?? "en"), input.tone ?? String(existing?.tone ?? "professional"),
    input.service ?? String(existing?.service ?? ""), input.provider ?? String(existing?.provider ?? ""),
    input.model ?? String(existing?.model ?? ""), JSON.stringify(input.usage ?? existing?.usage ?? {}),
    JSON.stringify(input.evidence ?? existing?.evidence ?? []), JSON.stringify(history), String(reviewStatus),
    input.contactedAt ?? String(existing?.contactedAt ?? ""), input.reviewNotes ?? String(existing?.reviewNotes ?? ""),
    input.translatedSubject ?? String(existing?.translatedSubject ?? ""), input.translatedBody ?? String(existing?.translatedBody ?? ""),
    input.translationLanguage ?? String(existing?.translationLanguage ?? ""), input.translationProvider ?? String(existing?.translationProvider ?? ""),
    input.translationModel ?? String(existing?.translationModel ?? ""), String(existing?.created_at ?? now), now,
  ];
  db.prepare(`INSERT INTO campaign_drafts (id, campaign_id, lead_id, status, subject, body, language, tone, service, provider, model, usage_json, evidence_json, generation_history_json, review_status, contacted_at, review_notes, translated_subject, translated_body, translation_language, translation_provider, translation_model, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(campaign_id, lead_id) DO UPDATE SET subject = excluded.subject, body = excluded.body, language = excluded.language, tone = excluded.tone, service = excluded.service, provider = excluded.provider, model = excluded.model, usage_json = excluded.usage_json, evidence_json = excluded.evidence_json, generation_history_json = excluded.generation_history_json, review_status = excluded.review_status, contacted_at = excluded.contacted_at, review_notes = excluded.review_notes, translated_subject = excluded.translated_subject, translated_body = excluded.translated_body, translation_language = excluded.translation_language, translation_provider = excluded.translation_provider, translation_model = excluded.translation_model, updated_at = excluded.updated_at`).run(...values);
  return draftRow(campaignId, leadId);
}
function emitOutreachRun(runId: string) { const run = db.prepare("SELECT * FROM outreach_generation_runs WHERE id = ?").get(runId); const items = db.prepare("SELECT lead_id, status, error FROM outreach_generation_items WHERE run_id = ? ORDER BY id").all(runId); const payload = JSON.stringify({ run, items }); for (const stream of outreachStreams.get(runId) ?? []) stream.write(`event: outreach-progress\ndata: ${payload}\n\n`); }

function emitIcpScoreEvent(leadId: string, profileKey: string, status = "completed", extra: Record<string, unknown> = {}) {
  const data = JSON.stringify({ leadId, profileKey, status, at: new Date().toISOString(), ...extra });
  for (const stream of icpScoreStreams) stream.write(`event: icp-score\ndata: ${data}\n\n`);
}

function currentIcpProfile(key: string) {
  return db.prepare("SELECT * FROM icp_profiles WHERE profile_key = ? ORDER BY version DESC LIMIT 1").get(key) as Record<string, unknown> | undefined;
}

function profileRules(profileId: string): IcpRule[] {
  return db.prepare("SELECT * FROM icp_profile_rules WHERE profile_id = ? ORDER BY position, id").all(profileId).map((row: any) => {
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(String(row.config_json)); } catch { /* safe default */ }
    return { code: String(row.rule_code), label: String(row.label), weight: Number(row.weight), minConfidence: Number(row.min_confidence), enabled: Boolean(row.enabled), config };
  });
}

function scoreLead(leadId: string, profileKey: string, runId = "") {
  const profile = currentIcpProfile(profileKey);
  if (!profile || !Number(profile.enabled)) return undefined;
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as Record<string, unknown> | undefined;
  if (!lead) return undefined;
  const audit = db.prepare("SELECT * FROM website_audits WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
  const issues = audit ? db.prepare("SELECT * FROM website_audit_issues WHERE audit_id = ?").all(String(audit.id)) as Array<Record<string, unknown>> : [];
  const observations = db.prepare(`SELECT * FROM (SELECT lo.*, ROW_NUMBER() OVER (PARTITION BY signal_code ORDER BY observed_at DESC) AS rn FROM lead_observations lo WHERE lead_id = ?) WHERE rn = 1`).all(leadId) as Array<Record<string, unknown>>;
  const calculated = calculateIcpScore(profileRules(String(profile.id)), {
    website: String(lead.website ?? ""), category: String(lead.category ?? ""), industry: String(lead.industry_normalized ?? ""),
    audit: audit ? { status: String(audit.status), updatedAt: String(audit.updated_at), issues: issues.map((issue) => ({ id: String(issue.id), category: String(issue.category), severity: String(issue.severity), url: String(issue.url), evidence: String(issue.evidence) })) } : undefined,
    observations: observations.map((item) => ({ id: String(item.id), signalCode: String(item.signal_code), confidence: Number(item.confidence), observedAt: String(item.observed_at), evidenceUrl: String(item.evidence_url), evidenceExcerpt: String(item.evidence_excerpt), verificationStatus: String(item.verification_status ?? "verified") as "verified" | "possible" | "inconclusive" })),
  });
  const now = new Date().toISOString();
  const scoreId = randomUUID();
  const matched = calculated.rules.filter((rule) => rule.status === "matched");
  const outreachBrief = {
    verifiedFacts: [
      lead.category ? { label: "Listed category", value: String(lead.category), source: "Google Maps listing" } : null,
      lead.city || lead.region ? { label: "Listed location", value: [lead.city, lead.region, lead.country_code].filter(Boolean).join(", "), source: "Google Maps listing" } : null,
    ].filter(Boolean),
    opportunities: matched.map((rule) => ({ rule: rule.label, contribution: rule.contribution, evidence: rule.evidence.map((item) => ({ detail: item.detail, url: item.url ?? "", confidence: item.confidence, observedAt: item.observedAt ?? "" })) })),
    talkingPoints: matched.filter((rule) => rule.evidence.length).map((rule) => `Verified: ${rule.label} (${rule.contribution} points).`),
    confidence: calculated.evidenceConfidence,
    coverage: calculated.evidenceCoverage,
    freshness: matched.flatMap((rule) => rule.evidence.map((item) => item.observedAt)).filter(Boolean),
    safeToGenerateOutreach: calculated.evaluationStatus === "evaluated" && matched.length > 0,
  };
  const explanation = { ...calculated, outreachBrief };
  db.prepare(`INSERT INTO icp_scores (id, lead_id, profile_id, profile_key, profile_version, score, commercial_fit, evidence_coverage, evidence_confidence, explanation_json, calculated_at, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(scoreId, leadId, String(profile.id), profileKey, Number(profile.version), calculated.score, calculated.commercialFit, calculated.evidenceCoverage, calculated.evidenceConfidence, JSON.stringify(explanation), now, runId);
  const addEvidence = db.prepare(`INSERT INTO icp_score_evidence (id, score_id, rule_code, source_type, evidence_id, evidence_url, evidence_detail, confidence, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const rule of matched) for (const evidence of rule.evidence)
    addEvidence.run(randomUUID(), scoreId, rule.code, evidence.source, evidence.id ?? "", evidence.url ?? "", evidence.detail, evidence.confidence, evidence.observedAt ?? "");
  emitIcpScoreEvent(leadId, profileKey);
  return { ...explanation, profileKey, profileVersion: Number(profile.version), calculatedAt: now, scoreId };
}

function scoreEnabledProfiles(leadId: string) {
  const profiles = db.prepare(`SELECT p.profile_key FROM icp_profiles p
    WHERE p.enabled = 1 AND p.version = (SELECT MAX(current.version) FROM icp_profiles current WHERE current.profile_key = p.profile_key)`).all() as Array<{ profile_key: string }>;
  for (const profile of profiles) scoreLead(leadId, profile.profile_key);
}
function searchKey(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

function brazilRegion(value: unknown) {
  const key = searchKey(value).replace(/[^a-z0-9]/g, "");
  return brazilRegions.find((region) => {
    const name = searchKey(region.name).replace(/[^a-z0-9]/g, "");
    const code = (region.code ?? "").toLocaleLowerCase();
    return key === name || key === code || key === `${name}${code}`;
  });
}

function mapsRegion(countryCode: string, value: unknown) {
  if (countryCode !== "BR") return clean(value);
  const region = brazilRegion(value);
  return region ? `${region.name}, ${region.code}` : clean(value);
}

function mapsCity(countryCode: string, value: unknown) {
  const city = clean(value);
  if (countryCode !== "BR") return city;
  // New city selections are persisted as "City, ST". Legacy saved searches
  // with a city-only label are upgraded when the starter directory is able to
  // identify the state unambiguously.
  if (/,[ ]?[A-Z]{2}$/u.test(city)) return city;
  const matches = brazilCities.filter(
    (item) => searchKey(item.name) === searchKey(city),
  );
  return matches.length === 1 && matches[0].regionCode
    ? `${matches[0].name}, ${matches[0].regionCode}`
    : city;
}

function normalizeCountryCode(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  const match = countries.find(
    (country) =>
      country.code === raw.toUpperCase() ||
      searchKey(country.name) === searchKey(raw),
  );
  if (match) return match.code;
  return ["brasil", "brazil"].includes(searchKey(raw)) ? "BR" : raw;
}

function makeQuery(
  input: Required<Pick<SearchInput, "countryCode" | "region" | "category">> & {
    city?: string;
    scopeMode: string;
  },
) {
  const country = countries.find(
    (item) => item.code === input.countryCode,
  )?.name;
  if (!country || input.countryCode === "WW")
    throw new Error("Choose a specific country before starting a search.");
  if (!input.category)
    throw new Error("Add a business category before starting a search.");
  if (input.scopeMode === "entire_country") {
    const region = input.region ? mapsRegion(input.countryCode, input.region) : "";
    return { country, query: regionalizedSearchQuery(input.category, country, region) };
  }
  if (input.scopeMode === "selected_regions") {
    if (!input.region)
      throw new Error(
        "Add at least one selected region before starting a search.",
      );
    return {
      country,
      query: `${input.category} in ${mapsRegion(input.countryCode, input.region)}, ${country}`,
    };
  }
  if (!input.city)
    throw new Error("Add at least one selected city before starting a search.");
  return {
    country,
    query: `${input.category} in ${[mapsCity(input.countryCode, input.city), input.region && mapsRegion(input.countryCode, input.region), country].filter(Boolean).join(", ")}`,
  };
}

function normalizeGosomJob(payload: Record<string, unknown>) {
  return {
    id: String(payload.ID ?? payload.id ?? ""),
    status: String(payload.Status ?? payload.status ?? "unknown").toLowerCase(),
    name: String(payload.Name ?? payload.name ?? ""),
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  const quote = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((key) => quote(row[key])).join(",")),
  ].join("\n");
}

function normalizePlaceId(value: unknown) {
  const text = clean(value);
  return text && !["null", "undefined", "n/a", "na", "0"].includes(text.toLocaleLowerCase()) && /^[A-Za-z0-9_-]{5,}$/.test(text) ? text : "";
}

function normalizeCid(value: unknown) {
  const text = clean(value);
  return /^\d{5,}$/.test(text) ? text : "";
}

async function importResults(
  searchId: string,
  jobId: string,
  jobRecordId: string,
  extractionTarget: number,
) {
  const rawPath = join(root, "data", "raw", `${jobId}.csv`);
  const normalizedPath = join(
    root,
    "data",
    "processed",
    `${jobId}.normalized.csv`,
  );
  const summaryPath = join(root, "data", "processed", `${jobId}.summary.json`);
  await mkdir(dirname(rawPath), { recursive: true });
  const result = await fetch(`${gosomUrl}/api/v1/jobs/${jobId}/download`);
  if (!result.ok)
    throw new Error(`Scout Engine result download failed (${result.status}).`);
  await writeFile(rawPath, await result.text(), "utf8");
  db.prepare(
    "UPDATE search_jobs SET stage = ?, updated_at = ? WHERE id = ?",
  ).run("processing", new Date().toISOString(), jobRecordId);
  emitSearchActivity();
  // The extraction target is global to the execution, not a per-job raw-row
  // limit. Allow each regional CSV a bounded safety window so duplicates at
  // the front of one result set do not hide later unique businesses.
  const processingLimit = Math.min(1000, Math.max(100, extractionTarget * 2));
  await execute(process.execPath, [
    join(root, "scripts", "prepare-leads.mjs"),
    rawPath,
    normalizedPath,
    summaryPath,
    String(processingLimit),
  ]);
  db.prepare(
    "UPDATE search_jobs SET stage = ?, updated_at = ? WHERE id = ?",
  ).run("deduplicating", new Date().toISOString(), jobRecordId);
  emitSearchActivity();
  const [headers, ...rows] = parseCsv(await readFile(normalizedPath, "utf8"));
  let summary: Record<string, number> = {};
  try {
    summary = JSON.parse(await readFile(summaryPath, "utf8")) as Record<
      string,
      number
    >;
  } catch {
    // The normalized CSV remains the source of truth if the diagnostic file is unavailable.
  }
  const index = new Map(headers.map((header, position) => [header, position]));
  const get = (row: string[], key: string) => row[index.get(key) ?? -1] ?? "";
  const now = new Date().toISOString();
  const insert = db.prepare(`INSERT OR IGNORE INTO leads (
    id, search_id, place_id, cid, title, category, address, city, region, country_code, phone, website,
    website_empty, review_count, review_rating, maps_url, latitude, longitude, dedup_key, industry_normalized,
    qualification_provenance, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertedLeadIds: string[] = [];
  const qualificationLeadIds: string[] = [];
  const search = db
    .prepare("SELECT * FROM saved_searches WHERE id = ?")
    .get(searchId) as Record<string, unknown> | undefined;
  const qualification = search
    ? qualificationFromSearch(search)
    : qualificationFromInput({});
  const sourceJob = db
    .prepare(
      `SELECT id, execution_id, search_term FROM search_jobs WHERE search_id = ? AND gosom_job_id = ?`,
    )
    .get(searchId, jobId) as { id: string; execution_id: string; search_term?: string } | undefined;
  const executionId = String(sourceJob?.execution_id ?? "");
  const collectedBefore = executionId
    ? Number((db.prepare("SELECT COUNT(DISTINCT lead_id) AS count FROM lead_sources WHERE search_execution_id = ? AND was_inserted = 1").get(executionId) as { count: number }).count)
    : 0;
  let collected = collectedBefore;
  let duplicates = 0;
  let preexistingDuplicates = 0;
  let executionDuplicates = 0;
  let relevanceSkipped = 0;
  let skippedAtTarget = 0;
  const lookupLead = db.prepare(
    `SELECT id FROM leads WHERE (place_id != '' AND place_id = ?) OR (cid != '' AND cid = ?) LIMIT 1`,
  );
  const executionLead = db.prepare("SELECT 1 FROM lead_sources WHERE search_execution_id = ? AND lead_id = ? LIMIT 1");
  const addSource = db.prepare(
    `INSERT OR IGNORE INTO lead_sources (lead_id, search_id, search_job_id, discovered_at, search_execution_id, was_inserted, discovery_term) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const addMembership = db.prepare(
    `INSERT INTO campaign_memberships (campaign_id, lead_id, first_seen_at, last_seen_at, source_count)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(campaign_id, lead_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, source_count = campaign_memberships.source_count + 1`,
  );
  // Archiving only hides incomplete leads from the main list. A later capture
  // is an explicit signal that the business is relevant again, so reactivate
  // the existing record rather than creating a duplicate or losing its history.
  const reactivateArchivedLead = db.prepare(
    "UPDATE leads SET archived_at = '', archive_reason = '', updated_at = ? WHERE id = ? AND archived_at != ''",
  );
  for (const row of rows) {
    if (cancelledSearchExecutions.has(executionId)) break;
    if (collected >= extractionTarget) {
      skippedAtTarget += 1;
      continue;
    }
    const country = normalizeCountryCode(get(row, "country"));
    const placeId = normalizePlaceId(get(row, "place_id"));
    const cid = normalizeCid(get(row, "cid"));
    const industryIds = search ? JSON.parse(String(search.industry_ids_json ?? "[]")) as string[] : [];
    if (!isIndustryRelevant(industryIds, get(row, "category"), get(row, "title"))) {
      relevanceSkipped += 1;
      continue;
    }
    const leadId = randomUUID();
    const inserted = insert.run(
      leadId,
      searchId,
      placeId || null,
      cid || null,
      get(row, "title"),
      get(row, "category"),
      get(row, "address"),
      get(row, "city"),
      get(row, "province"),
      country,
      get(row, "phone_normalized"),
      get(row, "website_normalized"),
      get(row, "website_empty") === "true" ? 1 : 0,
      Number(get(row, "review_count")) || 0,
      Number(get(row, "review_rating")) || 0,
      get(row, "google_maps_url"),
      Number(get(row, "latitude")) || null,
      Number(get(row, "longitude")) || null,
      get(row, "dedup_key"),
      normalizeIndustry(get(row, "category")),
      "candidate",
      now,
      now,
    );
    if (inserted.changes) {
      insertedLeadIds.push(leadId);
      collected += 1;
    } else {
      duplicates += 1;
      const resolved = lookupLead.get(placeId, cid) as { id: string } | undefined;
      if (resolved && executionId && executionLead.get(executionId, resolved.id)) executionDuplicates += 1;
      else preexistingDuplicates += 1;
    }
    const resolvedLeadId = inserted.changes
      ? leadId
      : (
          lookupLead.get(placeId, cid) as
            { id: string } | undefined
        )?.id;
    if (resolvedLeadId && sourceJob)
      addSource.run(
        resolvedLeadId,
        searchId,
        sourceJob.id,
        now,
        sourceJob.execution_id,
        inserted.changes ? 1 : 0,
        String(sourceJob.search_term ?? ""),
      );
    if (resolvedLeadId) addMembership.run(searchId, resolvedLeadId, now, now);
    if (resolvedLeadId) reactivateArchivedLead.run(now, resolvedLeadId);
    if (resolvedLeadId) qualificationLeadIds.push(resolvedLeadId);
    if (country && get(row, "province")) {
      db.prepare(
        "INSERT OR IGNORE INTO regions (country_code, name, normalized_name) VALUES (?, ?, ?)",
      ).run(
        country,
        get(row, "province"),
        get(row, "province").toLocaleLowerCase(),
      );
    }
  }
  // Newly discovered businesses remain candidates until the explicit
  // qualification contract is met. Existing records are never reclassified
  // merely because they appear in a later campaign.
  insertedLeadIds.forEach((leadId) => refreshLeadQualification(leadId));
  if (insertedLeadIds.length && automaticContactDiscoveryEnabled())
    enqueueEnrichment(insertedLeadIds, false);
  // Website qualification is decoupled from extraction. Only genuinely new
  // records are considered here; enqueueWebsiteAudit applies freshness and
  // active-job checks before writing any durable task.
  // A campaign's qualified target is an explicit request for full website
  // qualification; it must not be silently bypassed by the optional legacy
  // background-audit setting.
  if (insertedLeadIds.length)
    insertedLeadIds.forEach((leadId) => enqueueWebsiteAudit(leadId, false));
  // Qualification with a contact requirement cannot be decided from a Maps CSV.
  // Queue the persisted discovery flow for all leads linked by this import, even
  // when automatic enrichment for ordinary imports is disabled.
  if (qualification.contacts.length)
    enqueueEnrichment(qualificationLeadIds, false);
  db.prepare(
    `UPDATE search_jobs SET stage = ?, discovered_count = ?, processed_count = ?, inserted_count = ?, duplicate_count = ?, preexisting_duplicate_count = ?, execution_duplicate_count = ?, relevance_skipped_count = ?, updated_at = ? WHERE id = ?`,
  ).run(
    "saving",
    Number(summary.input_rows ?? rows.length),
    rows.length,
    insertedLeadIds.length,
    duplicates,
    preexistingDuplicates,
    executionDuplicates,
    relevanceSkipped,
    new Date().toISOString(),
    jobRecordId,
  );
  if (executionId) {
    db.prepare("UPDATE search_executions SET collected_count = ?, duplicate_count = (SELECT COALESCE(SUM(duplicate_count), 0) FROM search_jobs WHERE execution_id = ?), updated_at = ? WHERE id = ?").run(executionCollected(executionId), executionId, new Date().toISOString(), executionId);
  }
  emitSearchActivity();
  return {
    processed: rows.length,
    discovered: Number(summary.input_rows ?? rows.length),
    inserted: insertedLeadIds.length,
    duplicates,
    skippedAtTarget,
    collected,
  };
}

async function launchSearchJob(
  search: Record<string, unknown>,
  record: Record<string, unknown>,
) {
  const jobRecordId = String(record.id);
  try {
    const request = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `${search.name}${record.city || record.region ? ` — ${record.city || record.region}` : ""}`,
        keywords: [String(record.query)],
        lang: "en",
        zoom: 12,
        depth: 1,
        max_time: 180,
      }),
    };
    let response: Awaited<ReturnType<typeof fetch>> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(`${gosomUrl}/api/v1/jobs`, request);
      if (![429, 502, 503, 504].includes(response.status) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    if (!response) throw new Error("Scout Engine did not return a response.");
    if (!response.ok)
      throw new Error(`Scout Engine rejected the search (${response.status}).`);
    const payload = (await response.json()) as Record<string, unknown>;
    const jobId = String(payload.id ?? payload.ID ?? "");
    if (!jobId) throw new Error("Scout Engine did not return a job id.");
    db.prepare(
      "UPDATE search_jobs SET status = ?, stage = ?, gosom_job_id = ?, updated_at = ? WHERE id = ?",
    ).run(
      "running",
      "collecting",
      jobId,
      new Date().toISOString(),
      jobRecordId,
    );
    emitSearchActivity();
    return jobId;
  } catch (error) {
    db.prepare(
      "UPDATE search_jobs SET status = ?, stage = ?, error = ?, updated_at = ? WHERE id = ?",
    ).run(
      "failed",
      "failed",
      error instanceof Error ? error.message : "Could not create Scout Engine job.",
      new Date().toISOString(),
      jobRecordId,
    );
    throw error;
  }
}

type SearchPlanLocation = { city?: string; region?: string };

function searchTermsFor(search: Record<string, unknown>) {
  let industryIds: string[] = [];
  let customTerms: string[] = [];
  try { industryIds = JSON.parse(String(search.industry_ids_json ?? "[]")) as string[]; } catch { /* legacy row */ }
  try { customTerms = JSON.parse(String(search.custom_terms_json ?? "[]")) as string[]; } catch { /* legacy row */ }
  const terms = expandIndustryTerms(industryIds, customTerms);
  return terms.length ? terms : [String(search.category ?? "").trim()].filter(Boolean);
}

function qualificationCandidateBudget(requestedQualified: number) {
  return Math.min(1000, Math.max(20, requestedQualified * 2));
}

function executionCandidateTarget(executionId: string, fallback: number) {
  const row = db.prepare("SELECT extraction_target FROM search_executions WHERE id = ?").get(executionId) as { extraction_target?: number } | undefined;
  return Math.max(1, Number(row?.extraction_target ?? fallback));
}

async function launchQueuedSearchJobs(search: Record<string, unknown>, executionId: string, extractionTarget: number) {
  if (executionCollected(executionId) >= extractionTarget) {
    db.prepare("UPDATE search_jobs SET status = 'cancelled', stage = 'cancelled', error = 'Unique target reached before this job was launched.', updated_at = ? WHERE execution_id = ? AND status = 'queued'").run(new Date().toISOString(), executionId);
    return;
  }
  const active = Number((db.prepare("SELECT COUNT(*) AS count FROM search_jobs WHERE execution_id = ? AND status IN ('starting', 'running')").get(executionId) as { count: number }).count);
  const slots = Math.max(0, searchConcurrency - active);
  if (!slots) return;
  const records = db.prepare("SELECT * FROM search_jobs WHERE execution_id = ? AND status = 'queued' ORDER BY created_at LIMIT ?").all(executionId, slots) as Array<Record<string, unknown>>;
  await Promise.all(records.map(async (record) => {
    db.prepare("UPDATE search_jobs SET status = 'starting', stage = 'starting', updated_at = ? WHERE id = ? AND status = 'queued'").run(new Date().toISOString(), String(record.id));
    try { await launchSearchJob(search, record); }
    catch { /* launchSearchJob records the durable failure */ }
  }));
}

async function gosomIsAvailable() {
  try {
    const response = await fetch(`${gosomUrl}/api/v1/jobs`, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function markSearchWaitingForService(searchId: string, executionId: string) {
  const now = new Date().toISOString();
  db.prepare("UPDATE search_executions SET status = 'waiting_for_service', updated_at = ? WHERE id = ? AND status IN ('starting', 'running', 'waiting_for_service')").run(now, executionId);
  db.prepare("UPDATE saved_searches SET status = 'waiting_for_service' WHERE id = ? AND status IN ('starting', 'running', 'waiting_for_service')").run(searchId);
  emitSearchActivity();
}

function resumeSearchAfterService(searchId: string, executionId: string) {
  const now = new Date().toISOString();
  db.prepare("UPDATE search_executions SET status = 'running', updated_at = ? WHERE id = ? AND status = 'waiting_for_service'").run(now, executionId);
  db.prepare("UPDATE saved_searches SET status = 'running' WHERE id = ? AND status = 'waiting_for_service'").run(searchId);
}

async function startSearch(search: Record<string, unknown>) {
  const active = db
    .prepare(
      `SELECT COUNT(*) AS count FROM search_jobs WHERE search_id = ? AND status IN ('starting', 'running')`,
    )
    .get(String(search.id)) as { count: number };
  if (active.count)
    throw new Error(
      "This saved search is already running. Wait for its current jobs to finish before running it again.",
    );
  const scopeMode = String(search.scope_mode ?? "selected_cities");
  const requestedQualified = normalizeExtractionTarget(search.extraction_target);
  const extractionTarget = qualificationCandidateBudget(requestedQualified);
  const countryRegions = geographicSeeds[String(search.country_code)]?.regions ?? [];
  const locations: SearchPlanLocation[] =
    scopeMode === "entire_country"
      ? (countryRegions.length
        ? countryRegions.map((region) => ({ region: typeof region === "string" ? region : region.name }))
        : [{}])
      : scopeMode === "selected_regions"
        ? (JSON.parse(String(search.regions_json ?? "[]")) as string[]).map(
            (region) => ({ region }),
          )
        : (JSON.parse(String(search.cities_json ?? "[]")) as string[]).map(
            (city) => ({ city }),
          );
  if (!locations.length)
    throw new Error(
      `Add at least one selected ${scopeMode === "selected_regions" ? "region" : "city"} before starting a search.`,
    );
  const terms = searchTermsFor(search);
  const coverage = locations.flatMap((location) => terms.map((term) => ({ location, term })));
  const planned = coverage.slice(0, searchJobBudget);
  const now = new Date().toISOString();
  const executionId = randomUUID();
  db.prepare(
    "INSERT INTO search_executions (id, search_id, status, started_at, updated_at, extraction_target, total_jobs) VALUES (?, ?, 'starting', ?, ?, ?, ?)",
  ).run(executionId, String(search.id), now, now, extractionTarget, planned.length);
  const insert = db.prepare("INSERT INTO search_jobs (id, search_id, execution_id, city, region, query, search_term, status, stage, extraction_target, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', ?, ?, ?)");
  for (const item of planned) {
    const city = item.location.city ?? "";
    const region = item.location.region ?? "";
    const { query } = makeQuery({ countryCode: String(search.country_code), region, category: item.term, city, scopeMode: String(search.scope_mode) });
    insert.run(randomUUID(), String(search.id), executionId, city, region, query, item.term, extractionTarget, now, now);
  }
  if (!(await gosomIsAvailable())) {
    markSearchWaitingForService(String(search.id), executionId);
    return;
  }
  await launchQueuedSearchJobs(search, executionId, extractionTarget);
  const launchedJobs = db.prepare("SELECT status FROM search_jobs WHERE execution_id = ?").all(executionId) as Array<{ status?: string }>;
  const launchStillActive = launchedJobs.some((job) => ["queued", "starting", "running"].includes(String(job.status)));
  const launchFailed = launchedJobs.some((job) => job.status === "failed");
  const launchStatus = launchStillActive ? "running" : launchFailed ? "completed_with_errors" : "completed";
  db.prepare(
    "UPDATE saved_searches SET status = ?, gosom_job_id = ?, last_run_at = ? WHERE id = ?",
  ).run(
    cancelledSearchExecutions.has(executionId) ? "cancelled" : launchStatus,
    null,
    new Date().toISOString(),
    String(search.id),
  );
  db.prepare(
    "UPDATE search_executions SET status = ?, updated_at = ? WHERE id = ?",
  ).run(
    cancelledSearchExecutions.has(executionId) ? "cancelled" : launchStatus,
    new Date().toISOString(),
    executionId,
  );
  reconcileSearchStatus(String(search.id));
  emitSearchActivity();
}

function executionCollected(executionId: string) {
  return Number((db.prepare("SELECT COUNT(DISTINCT lead_id) AS count FROM lead_sources WHERE search_execution_id = ? AND was_inserted = 1").get(executionId) as { count: number }).count);
}

function markExecutionRemainingCancelled(executionId: string) {
  db.prepare("UPDATE search_jobs SET status = 'cancelled', stage = 'cancelled', updated_at = ? WHERE execution_id = ? AND status IN ('queued', 'starting', 'running')").run(new Date().toISOString(), executionId);
}

let enrichmentActive = 0;
const enrichmentConcurrency = 2;
const enrichmentDelayMs = 600;
type LeadRecord = PublicLead & {
  id: string;
  instagram: string;
  business_email: string;
  facebook: string;
  contact_status: string;
  contact_confidence: number;
  contact_source_url: string;
};
const enrichmentStreams = new Set<Response>();

function leadOfficialDomain(website: unknown) {
  try { return new URL(String(website ?? '').startsWith('http') ? String(website) : `https://${String(website ?? '')}`).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
}

function persistedContactIsDirectoryAdmin(contact: { email: string; source_url: string }, officialDomain: string) {
  const sourceType: PublicContact['sourceType'] = /(?:directory|listing|profile|business|companies|vendors?)/i.test(String(contact.source_url)) ? 'directory' : undefined;
  const candidate: PublicContact = { name: '', role: '', email: contact.email, phone: '', socialUrl: '', socialNetwork: '', status: 'possible', sourceUrl: contact.source_url, sourceType, evidence: '', confidence: 0 };
  return isThirdPartyAdministrativeContact(candidate, officialDomain) || isLikelyThirdPartyAdministrativeContact(contact.email, contact.source_url, officialDomain);
}

/** Reconcile the durable primary contact without deleting any evidence rows. */
function synchronizePrimaryContact(leadId: string) {
  const lead = db.prepare("SELECT website, business_email, contact_status, contact_source_url, contact_confidence FROM leads WHERE id = ?").get(leadId) as Record<string, unknown> | undefined;
  if (!lead) return;
  const officialDomain = leadOfficialDomain(lead.website);
  const rows = db.prepare(`SELECT lc.id, lc.role, lc.source_url, lc.evidence, lc.confidence, lc.verification_status, cp.kind, cp.display_value
    FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id
    WHERE lc.lead_id = ? AND cp.kind = 'email'`).all(leadId) as Array<Record<string, unknown>>;
  const candidates = rows.map((row) => ({
    id: String(row.id), role: String(row.role ?? ''), email: normalizeEmail(String(row.display_value ?? '')), sourceUrl: String(row.source_url ?? ''), evidence: String(row.evidence ?? ''), confidence: Number(row.confidence ?? 0), status: String(row.verification_status ?? 'possible') as PublicContact['status'],
  })).filter((row) => row.email && !persistedContactIsDirectoryAdmin({ email: row.email, source_url: row.sourceUrl }, officialDomain));
  const selected = selectBestContactEmail(candidates.map((row) => ({ name: '', role: row.role, email: row.email, phone: '', socialUrl: '', socialNetwork: '', status: row.status, sourceUrl: row.sourceUrl, evidence: row.evidence, confidence: row.confidence, sourceType: /(?:directory|listing|profile|business|companies|vendors?)/i.test(row.sourceUrl) ? 'directory' : undefined })), officialDomain);
  const selectedRow = selected ? candidates.find((row) => row.email === normalizeEmail(selected.email) && row.sourceUrl === selected.sourceUrl) : undefined;
  const now = new Date().toISOString();
  db.prepare("UPDATE lead_contacts SET is_primary = 0 WHERE lead_id = ?").run(leadId);
  if (!selectedRow) return;
  db.prepare("UPDATE lead_contacts SET is_primary = 1 WHERE id = ? AND lead_id = ?").run(selectedRow.id, leadId);
  db.prepare("UPDATE leads SET business_email = ?, contact_status = ?, contact_source_url = ?, contact_confidence = ?, contacts_updated_at = ?, updated_at = ? WHERE id = ?")
    .run(selectedRow.email, selectedRow.status === 'verified' ? 'verified' : 'possible', selectedRow.sourceUrl, selectedRow.confidence, now, now, leadId);
}

function persistDiscoveredContacts(leadId: string, contacts: PublicContact[]) {
  const now = new Date().toISOString();
  // `contact_points.person_id` predates anonymous organization-level contact
  // points and is NOT NULL with a foreign key. Keep a single empty identity as
  // the explicit unassigned owner rather than writing an invalid empty FK.
  // The UI renders its blank display name as a business contact, never a person.
  db.prepare("INSERT OR IGNORE INTO people (id, normalized_name, display_name, created_at, updated_at) VALUES ('', '', '', ?, ?)").run(now, now);
  const unique = new Map<string, PublicContact>();
  for (const contact of dedupePublicContacts(contacts)) {
    const candidates: Array<{ kind: string; value: string; display: string }> = [];
    if (contact.email) candidates.push({ kind: "email", value: normalizeEmail(contact.email), display: contact.email });
    if (contact.phone) candidates.push({ kind: "phone", value: contact.phone.replace(/[^+\d]/g, ""), display: contact.phone });
    if (contact.socialUrl && contact.socialNetwork) candidates.push({ kind: contact.socialNetwork, value: normalizeSocial(contact.socialUrl, contact.socialNetwork), display: contact.socialUrl });
    if (!candidates.length && contact.name) candidates.push({ kind: "person", value: normalizeText(contact.name), display: contact.name });
    for (const candidate of candidates) if (candidate.value) unique.set(`${candidate.kind}:${candidate.value}`, { ...contact, email: candidate.kind === "email" ? candidate.value : "", phone: candidate.kind === "phone" ? candidate.value : "", socialUrl: candidate.kind !== "email" && candidate.kind !== "phone" ? candidate.value : "", socialNetwork: candidate.kind === "instagram" || candidate.kind === "facebook" || candidate.kind === "linkedin" ? candidate.kind : "", sourceUrl: contact.sourceUrl, evidence: contact.evidence, confidence: contact.confidence, status: contact.status });
  }
  const findPerson = db.prepare("SELECT id FROM people WHERE normalized_name = ?");
  const insertPerson = db.prepare("INSERT INTO people (id, normalized_name, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  const updatePerson = db.prepare("UPDATE people SET display_name = ?, updated_at = ? WHERE id = ?");
  const findPoint = db.prepare("SELECT id FROM contact_points WHERE kind = ? AND normalized_value = ?");
  const insertPoint = db.prepare("INSERT INTO contact_points (id, kind, normalized_value, display_value, person_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const updatePoint = db.prepare("UPDATE contact_points SET display_value = ?, person_id = CASE WHEN person_id = '' THEN ? ELSE person_id END, updated_at = ? WHERE id = ?");
  const findAssociation = db.prepare("SELECT id FROM lead_contacts WHERE lead_id = ? AND contact_point_id = ?");
  const insertAssociation = db.prepare("INSERT INTO lead_contacts (id, lead_id, contact_point_id, role, source_url, evidence, confidence, verification_status, verification_method, discovered_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'public_page', ?, ?)");
  const updateAssociation = db.prepare("UPDATE lead_contacts SET role = ?, source_url = ?, evidence = ?, confidence = MAX(confidence, ?), verification_status = CASE WHEN verification_status = 'verified' THEN verification_status ELSE ? END, last_seen_at = ? WHERE id = ?");
  for (const contact of unique.values()) {
    const kind = contact.email ? "email" : contact.phone ? "phone" : contact.socialNetwork || (contact.name ? "person" : "");
    const normalizedValue = contact.email || contact.phone || contact.socialUrl || (contact.name ? normalizeText(contact.name) : "");
    if (!kind || !normalizedValue) continue;
    const normalizedName = normalizeText(contact.name);
    let personId = "";
    if (normalizedName) {
      const existing = findPerson.get(normalizedName) as { id: string } | undefined;
      personId = existing?.id ?? randomUUID();
      if (existing) updatePerson.run(contact.name, now, personId); else insertPerson.run(personId, normalizedName, contact.name, now, now);
    }
    const point = findPoint.get(kind, normalizedValue) as { id: string } | undefined;
    const pointId = point?.id ?? randomUUID();
    if (point) updatePoint.run(contact.email || contact.phone || contact.socialUrl || contact.name, personId, now, pointId); else insertPoint.run(pointId, kind, normalizedValue, contact.email || contact.phone || contact.socialUrl || contact.name, personId, now, now);
    const association = findAssociation.get(leadId, pointId) as { id: string } | undefined;
    if (association) updateAssociation.run(contact.role, contact.sourceUrl, contact.evidence, contact.confidence, contact.status, now, association.id);
    else insertAssociation.run(randomUUID(), leadId, pointId, contact.role, contact.sourceUrl, contact.evidence, contact.confidence, contact.status, now, now);
  }
  synchronizePrimaryContact(leadId);
}
function persistContactObservations(leadId: string, contacts: PublicContact[]) {
  const now = new Date().toISOString();
  const runId = randomUUID();
  db.prepare("INSERT INTO lead_intelligence_runs (id, lead_id, collector, status, started_at, completed_at) VALUES (?, ?, 'contact_discovery', 'completed', ?, ?)").run(runId, leadId, now, now);
  const insert = db.prepare(`INSERT INTO lead_observations (id, lead_id, signal_code, collector, value_text, confidence, evidence_url, evidence_excerpt, observed_at, run_id, verification_status) VALUES (?, ?, ?, 'contact_discovery', ?, ?, ?, ?, ?, ?, ?)`);
  for (const contact of contacts) {
    if (contact.email) insert.run(randomUUID(), leadId, "EMAIL_PATTERN", contact.email, contact.confidence, contact.sourceUrl, contact.evidence, now, runId, contact.status);
    if (contact.name) insert.run(randomUUID(), leadId, "CONTACT_FOUND", contact.name, contact.confidence, contact.sourceUrl, contact.evidence, now, runId, contact.status);
    if (contact.role) insert.run(randomUUID(), leadId, "DECISION_MAKER_TITLE", contact.role, contact.confidence, contact.sourceUrl, contact.evidence, now, runId, contact.status);
  }
}

function emitEnrichmentEvent(
  leadId: string,
  executionStatus:
    "queued" | "searching" | "completed" | "failed" | "cancelled",
) {
  const data = JSON.stringify({
    leadId,
    executionStatus,
    at: new Date().toISOString(),
  });
  for (const stream of enrichmentStreams)
    stream.write(`event: enrichment\ndata: ${data}\n\n`);
}

async function processEnrichmentQueue() {
  while (enrichmentActive < enrichmentConcurrency) {
    const task = db
      .prepare(
        `SELECT * FROM enrichment_tasks WHERE status = 'queued' ORDER BY created_at LIMIT 1`,
      )
      .get() as Record<string, unknown> | undefined;
    if (!task) return;
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE enrichment_tasks SET status = ?, updated_at = ? WHERE id = ?",
    ).run("searching", now, String(task.id));
    db.prepare(
      "UPDATE leads SET enrichment_status = ?, enrichment_error = ? WHERE id = ?",
    ).run("searching", "", String(task.lead_id));
    emitEnrichmentEvent(String(task.lead_id), "searching");
    enrichmentActive += 1;
    void (async () => {
      try {
        const lead = db
          .prepare("SELECT * FROM leads WHERE id = ?")
          .get(String(task.lead_id)) as LeadRecord | undefined;
        if (!lead) throw new Error("Lead was not found.");
        const found = await discoverContacts(lead);
        const refresh = Number(task.refresh) === 1;
        const statusRank = (status: string) => status === "verified" ? 3 : status === "possible" ? 2 : 1;
        const keepExistingEmail = Boolean(lead.business_email) && (!found.email || statusRank(String(lead.contact_status)) > statusRank(found.status) || (String(lead.contact_status) === found.status && Number(lead.contact_confidence ?? 0) > found.confidence));
        const selectedEmail = keepExistingEmail ? lead.business_email : (found.email || lead.business_email);
        const selectedStatus = keepExistingEmail ? String(lead.contact_status || found.status) : (selectedEmail ? found.status : "not_found");
        const selectedSource = keepExistingEmail ? String(lead.contact_source_url || found.sourceUrl) : (found.sourceUrl || lead.contact_source_url);
        const selectedConfidence = keepExistingEmail ? Number(lead.contact_confidence ?? found.confidence) : Math.max(Number(lead.contact_confidence ?? 0), found.confidence);
        db.prepare(
          `UPDATE leads SET instagram = ?, business_email = ?, facebook = ?, contact_status = ?, enrichment_status = ?, contact_source_url = ?, contact_confidence = ?, contacts_updated_at = ?, enrichment_error = ?, contact_origin = ?, contact_diagnostic = ?, updated_at = ? WHERE id = ?`,
        ).run(
          refresh || !lead.instagram ? found.instagram : lead.instagram,
          selectedEmail,
          refresh || !lead.facebook ? found.facebook : lead.facebook,
          selectedStatus,
          "completed",
          selectedSource,
          selectedConfidence,
          new Date().toISOString(),
          found.error,
          found.origin,
          found.diagnostic,
          new Date().toISOString(),
          lead.id,
        );
        persistDiscoveredContacts(lead.id, found.contacts);
        persistContactObservations(lead.id, found.contacts);
        // Keep score history current when persisted lead facts change. This is
        // data-only scoring; it never reruns contact discovery or audits.
        scoreEnabledProfiles(lead.id);
        db.prepare(
          "UPDATE enrichment_tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?",
        ).run(
          "completed",
          found.error,
          new Date().toISOString(),
          String(task.id),
        );
        emitEnrichmentEvent(lead.id, "completed");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Contact discovery failed.";
        db.prepare(
          "UPDATE leads SET enrichment_status = ?, enrichment_error = ?, updated_at = ? WHERE id = ?",
        ).run(
          "failed",
          message,
          new Date().toISOString(),
          String(task.lead_id),
        );
        db.prepare(
          "UPDATE enrichment_tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?",
        ).run("failed", message, new Date().toISOString(), String(task.id));
        emitEnrichmentEvent(String(task.lead_id), "failed");
      } finally {
        enrichmentActive -= 1;
        setTimeout(() => {
          void processEnrichmentQueue();
        }, enrichmentDelayMs);
      }
    })();
  }
}

function enqueueEnrichment(ids: string[], refresh: boolean) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO enrichment_tasks (id, lead_id, status, refresh, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const leadExists = db.prepare("SELECT id FROM leads WHERE id = ?");
  const alreadyQueued = db.prepare(
    `SELECT id FROM enrichment_tasks WHERE lead_id = ? AND status IN ('queued', 'searching', 'processing')`,
  );
  const alreadyCompleted = db.prepare(
    `SELECT id FROM enrichment_tasks WHERE lead_id = ? AND status = 'completed' ORDER BY updated_at DESC LIMIT 1`,
  );
  let queued = 0;
  let active = 0;
  let completed = 0;
  for (const id of [...new Set(ids)]) {
    if (!leadExists.get(id)) continue;
    if (alreadyQueued.get(id)) {
      active += 1;
      continue;
    }
    if (!refresh && alreadyCompleted.get(id)) {
      completed += 1;
      continue;
    }
    insert.run(randomUUID(), id, "queued", refresh ? 1 : 0, now, now);
    db.prepare(
      "UPDATE leads SET enrichment_status = ?, enrichment_error = ? WHERE id = ?",
    ).run("queued", "", id);
    emitEnrichmentEvent(id, "queued");
    queued += 1;
  }
  void processEnrichmentQueue();
  return { queued, active, completed };
}

const websiteAuditConcurrency = Math.max(1, Math.min(3, Number(process.env.WEBSITE_AUDIT_CONCURRENCY ?? 2) || 2));
const websiteAuditMaxAttempts = Math.max(1, Math.min(5, Number(process.env.WEBSITE_AUDIT_MAX_ATTEMPTS ?? 3) || 3));
const websiteAuditStaleMs = Math.max(60_000, Number(process.env.WEBSITE_AUDIT_STALE_MS ?? 180_000));
let websiteAuditsActive = 0;
const websiteAuditStreams = new Set<Response>();
const activeWebsiteAuditControllers = new Map<string, AbortController>();
let websiteAuditWakeTimer: ReturnType<typeof setTimeout> | undefined;
let websiteAuditSchedulerPromise: Promise<void> | undefined;
let websiteAuditSchedulerRequested = false;

function recordWebsiteAuditEvent(input: {
  taskId: string;
  leadId: string;
  event: string;
  stage?: string;
  status?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  db.prepare(`INSERT INTO website_audit_events
    (id, task_id, lead_id, event, stage, status, duration_ms, error, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      randomUUID(), input.taskId, input.leadId, input.event, input.stage ?? "", input.status ?? "",
      input.durationMs ?? null, input.error ? cleanAuditError(input.error) : "", JSON.stringify(input.metadata ?? {}), new Date().toISOString(),
    );
}

function scheduleWebsiteAuditWake() {
  if (websiteAuditWakeTimer) clearTimeout(websiteAuditWakeTimer);
  const next = db.prepare(`SELECT MIN(next_run_at) AS next_run_at FROM website_audit_tasks
    WHERE status = 'queued' AND next_run_at != ''`).get() as { next_run_at?: string | null } | undefined;
  const at = Date.parse(String(next?.next_run_at ?? ""));
  if (!Number.isFinite(at)) return;
  const delay = Math.max(25, Math.min(60_000, at - Date.now()));
  websiteAuditWakeTimer = setTimeout(() => {
    websiteAuditWakeTimer = undefined;
    requestWebsiteAuditQueue();
  }, delay);
}

function emitWebsiteAuditEvent(leadId: string, status: string, progress?: { stage: string; completed: number; total: number }) {
  const payload = JSON.stringify({
    leadId,
    status,
    at: new Date().toISOString(),
    ...(progress ? { progress } : {}),
  });
  for (const stream of websiteAuditStreams) {
    try { stream.write(`event: website-audit\ndata: ${payload}\n\n`); }
    catch { websiteAuditStreams.delete(stream); }
  }
}

/** A separate, evidence-gated score: it is not an ICP or Lighthouse score. */
function scoreWebsiteOpportunity(leadId: string, auditId: string, auditStatus: string) {
  const now = new Date().toISOString();
  const profile = db.prepare("SELECT * FROM website_opportunity_profiles WHERE profile_key = 'website_opportunity'").get() as Record<string, unknown> | undefined;
  if (!profile || !Number(profile.enabled)) return;
  const previous = db.prepare("SELECT id FROM website_opportunity_scores WHERE lead_id = ? AND profile_key = 'website_opportunity'").get(leadId) as { id: string } | undefined;
  if (previous) {
    const prior = db.prepare("SELECT * FROM website_opportunity_scores WHERE id = ?").get(previous.id) as Record<string, unknown> | undefined;
    if (prior && Number(prior.profile_version) !== Number(profile.version)) {
      const evidence = db.prepare("SELECT issue_id, weight FROM website_opportunity_evidence WHERE score_id = ? ORDER BY id").all(previous.id);
      db.prepare(`INSERT OR IGNORE INTO website_opportunity_score_history (id, score_id, lead_id, profile_version, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), previous.id, leadId, Number(prior.profile_version), JSON.stringify({ ...prior, evidence }), now);
    }
  }
  const save = (status: string, level: string, score: number | null, issueCount: number, coverage: number, reason: string, evidence: Array<{ id: string; weight: number }> = []) => {
    const id = previous?.id ?? randomUUID();
    db.prepare(`INSERT INTO website_opportunity_scores (id, lead_id, profile_key, profile_version, status, level, score, issue_count, evidence_coverage, evaluated_at, reason)
      VALUES (?, ?, 'website_opportunity', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lead_id, profile_key) DO UPDATE SET profile_version = excluded.profile_version, status = excluded.status, level = excluded.level, score = excluded.score, issue_count = excluded.issue_count, evidence_coverage = excluded.evidence_coverage, evaluated_at = excluded.evaluated_at, reason = excluded.reason`).run(id, leadId, Number(profile.version), status, level, score, issueCount, coverage, now, reason);
    db.prepare("DELETE FROM website_opportunity_evidence WHERE score_id = ?").run(id);
    const add = db.prepare("INSERT INTO website_opportunity_evidence (id, score_id, issue_id, weight) VALUES (?, ?, ?, ?)");
    evidence.forEach((item) => add.run(randomUUID(), id, item.id, item.weight));
  };
  if (auditStatus !== "completed") return save(auditStatus === "failed" ? "failed" : "insufficient", auditStatus === "failed" ? "audit_failed" : "insufficient_evidence", null, 0, 0, auditStatus === "partial" ? "The homepage audit is incomplete; commercial opportunity is not classified from partial evidence." : auditStatus === "access_restricted" ? "Access was restricted; commercial opportunity is not classified without complete evidence." : "No completed homepage audit is available.");
  const issues = db.prepare("SELECT id, category, severity, verification_status, evidence FROM website_audit_issues WHERE audit_id = ?").all(auditId) as Array<{ id: string; category: string; severity: string; verification_status: string; evidence: string }>;
  const result = calculateWebsiteOpportunity(issues.map((issue) => ({ ...issue, verificationStatus: issue.verification_status })));
  save(result.status, result.level, result.score, result.issueCount, result.evidenceCoverage, result.reason, result.evidence);
}

function refreshLeadQualification(leadId: string) {
  const lead = db.prepare("SELECT qualification_status, qualification_provenance, website FROM leads WHERE id = ?").get(leadId) as { qualification_status?: string; qualification_provenance?: string; website?: string } | undefined;
  // Historical records remain intact, but every new candidate must pass the
  // evidence gate. Provenance makes that distinction explicit instead of
  // inferring it from the current status.
  if (!lead || lead.qualification_provenance === "legacy" || lead.qualification_provenance === "historical") return;
  const audit = db.prepare("SELECT * FROM website_audits WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
  const auditTask = db.prepare("SELECT status FROM website_audit_tasks WHERE lead_id = ? ORDER BY updated_at DESC LIMIT 1").get(leadId) as { status?: string } | undefined;
  const visual = db.prepare("SELECT status FROM visual_ux_assessments WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1").get(leadId) as { status?: string } | undefined;
  const automated = db.prepare("SELECT status FROM automated_ux_assessments WHERE lead_id = ? ORDER BY updated_at DESC LIMIT 1").get(leadId) as { status?: string } | undefined;
  const opportunity = db.prepare("SELECT status FROM website_opportunity_scores WHERE lead_id = ? AND profile_key = 'website_opportunity'").get(leadId) as { status?: string } | undefined;
  let metrics: Record<string, unknown> = {};
  try { metrics = JSON.parse(String(audit?.metrics_json ?? "{}")); } catch { /* handled as incomplete evidence */ }
  const result = evaluateLeadQualification({
    website: lead.website,
    auditStatus: ["queued", "analyzing"].includes(String(auditTask?.status ?? "")) ? "analyzing" : String(audit?.status ?? "not_analyzed"),
    stages: (metrics.stages as Record<string, { status?: string }> | undefined) ?? {},
    hasDesktopScreenshot: Boolean(audit?.desktop_screenshot) && existsSync(storedScreenshotPath(root, String(audit?.id ?? ""), "desktop")),
    hasMobileScreenshot: Boolean(audit?.mobile_screenshot) && existsSync(storedScreenshotPath(root, String(audit?.id ?? ""), "mobile")),
    automatedUxStatus: automated?.status,
    visualStatus: visual?.status,
    opportunityStatus: opportunity?.status,
  });
  const status = result.status;
  const stage = result.stage;
  const reason = result.reason;
  const now = new Date().toISOString();
  db.prepare("UPDATE leads SET qualification_status = ?, qualification_stage = ?, qualification_provenance = ?, qualification_error = ?, qualified_at = CASE WHEN ? = 'qualified' THEN ? ELSE qualified_at END, updated_at = ? WHERE id = ?")
    .run(status, stage, status === "qualified" ? "pipeline_verified" : "candidate", status === "qualified" ? "" : reason, status, now, now, leadId);
  for (const source of db.prepare("SELECT DISTINCT search_id FROM lead_sources WHERE lead_id = ?").all(leadId) as Array<{ search_id: string }>)
    refreshSearchQualificationState(source.search_id);
}

function persistWebsiteAudit(
  leadId: string,
  auditId: string,
  result: WebsiteAuditResult,
) {
  const now = new Date().toISOString();
  const previous = db.prepare("SELECT * FROM website_audits WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
  if (previous?.id) {
    const previousIssues = db.prepare("SELECT * FROM website_audit_issues WHERE audit_id = ?").all(String(previous.id));
    db.prepare("INSERT INTO website_audit_history (id, lead_id, audit_id, snapshot_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), leadId, String(previous.id), JSON.stringify({ audit: previous, issues: previousIssues }), "audit recovery or refresh", now);
  }
  db.prepare(
    "DELETE FROM website_audit_issues WHERE audit_id IN (SELECT id FROM website_audits WHERE lead_id = ?)",
  ).run(leadId);
  db.prepare(
    `INSERT INTO website_audits (
      id, lead_id, website, status, score, performance_score, seo_score, accessibility_score, best_practices_score,
      pages_json, metrics_json, desktop_screenshot, mobile_screenshot, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
    ON CONFLICT(lead_id) DO UPDATE SET
      id = excluded.id, website = excluded.website, status = excluded.status, score = excluded.score,
      performance_score = excluded.performance_score, seo_score = excluded.seo_score,
      accessibility_score = excluded.accessibility_score, best_practices_score = excluded.best_practices_score,
      pages_json = excluded.pages_json, metrics_json = excluded.metrics_json,
      desktop_screenshot = excluded.desktop_screenshot, mobile_screenshot = excluded.mobile_screenshot,
      error = '', updated_at = excluded.updated_at`,
  ).run(
    auditId,
    leadId,
    result.url,
    result.status,
    result.score,
    result.performanceScore,
    result.seoScore,
    result.accessibilityScore,
    result.bestPracticesScore,
    JSON.stringify(result.pages),
    JSON.stringify(result.metrics),
    result.desktopScreenshot,
    result.mobileScreenshot,
    now,
    now,
  );
  const addIssue = db.prepare(
    `INSERT INTO website_audit_issues (id, audit_id, category, severity, url, evidence, suggestion, verification_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const unique = new Set<string>();
  for (const issue of result.issues) {
    const key = `${issue.category}|${issue.severity}|${issue.url}|${issue.evidence}`;
    if (unique.has(key)) continue;
    unique.add(key);
    addIssue.run(
      randomUUID(),
      auditId,
      issue.category,
      issue.severity,
      issue.url,
      issue.evidence,
      issue.suggestion,
      issue.verificationStatus ?? "verified",
      now,
    );
  }
  const automated = result.automatedUx;
  db.prepare(`INSERT INTO automated_ux_assessments (id, lead_id, audit_id, method, status, checks_json, findings_json, error, created_at, updated_at)
    VALUES (?, ?, ?, 'automated', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(audit_id) DO UPDATE SET status = excluded.status, checks_json = excluded.checks_json, findings_json = excluded.findings_json, error = excluded.error, updated_at = excluded.updated_at`).run(
    randomUUID(), leadId, auditId, automated.status, JSON.stringify(automated.checks), JSON.stringify(automated.findings), automated.error ?? "", now, now,
  );
  const runId = randomUUID();
  db.prepare(
    "INSERT INTO lead_intelligence_runs (id, lead_id, collector, status, started_at, completed_at) VALUES (?, ?, ?, 'completed', ?, ?)",
  ).run(runId, leadId, "homepage_profile", now, now);
  const addObservation = db.prepare(
    `INSERT INTO lead_observations (id, lead_id, signal_code, collector, value_text, confidence, evidence_url, evidence_excerpt, observed_at, run_id, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const observationExists = db.prepare(
    "SELECT 1 FROM lead_observations WHERE lead_id = ? AND signal_code = ? AND value_text = ? AND evidence_url = ? AND evidence_excerpt = ? LIMIT 1",
  );
  for (const signal of result.signals)
    if (!observationExists.get(leadId, signal.code, signal.value, signal.evidenceUrl ?? result.url, signal.evidenceExcerpt)) addObservation.run(
      randomUUID(),
      leadId,
      signal.code,
      "homepage_profile",
      signal.value,
      signal.confidence,
      signal.evidenceUrl ?? result.url,
      signal.evidenceExcerpt,
      now,
      runId,
      signal.verificationStatus ?? "verified",
    );
  // Recalculate from this persisted audit/observation set only. No browser or
  // Lighthouse process is started by ICP scoring.
  scoreEnabledProfiles(leadId);
  scoreWebsiteOpportunity(leadId, auditId, result.status);
  refreshLeadQualification(leadId);
}

function requestWebsiteAuditQueue() {
  websiteAuditSchedulerRequested = true;
  if (websiteAuditSchedulerPromise) return;
  websiteAuditSchedulerRequested = false;
  websiteAuditSchedulerPromise = processWebsiteAuditQueue()
    .catch((error) => {
      // Scheduler errors must be observable without taking down the API.
      recordWebsiteAuditEvent({ taskId: "scheduler", leadId: "scheduler", event: "scheduler_failed", error: cleanAuditError(error) });
    })
    .finally(() => {
      websiteAuditSchedulerPromise = undefined;
      if (websiteAuditSchedulerRequested) requestWebsiteAuditQueue();
    });
}

async function processWebsiteAuditQueue() {
  // A previous process or an unexpectedly wedged browser must never retain a
  // worker slot forever. Expired work is safely retried by the durable queue.
  const staleBefore = new Date(Date.now() - websiteAuditStaleMs).toISOString();
  const staleTasks = db.prepare(`SELECT id, lead_id, attempt_count, max_attempts FROM website_audit_tasks
    WHERE status = 'analyzing' AND COALESCE(NULLIF(heartbeat_at, ''), updated_at) < ?`).all(staleBefore) as Array<{ id: string; lead_id: string; attempt_count: number; max_attempts: number }>;
  for (const staleTask of staleTasks) {
    // A slow in-process worker still owns its slot. Never requeue it while its
    // controller is alive; after a restart the map is empty and recovery is safe.
    if (activeWebsiteAuditControllers.has(staleTask.lead_id)) continue;
    const recovered = db.prepare(`UPDATE website_audit_tasks SET status = CASE WHEN attempt_count >= max_attempts THEN 'exhausted' ELSE 'queued' END,
      error = CASE WHEN error = '' THEN 'Worker heartbeat expired.' ELSE error END, next_run_at = ?, updated_at = ?
      WHERE id = ? AND status = 'analyzing'`).run(new Date().toISOString(), new Date().toISOString(), staleTask.id);
    if (Number(recovered.changes ?? 0) === 1)
      recordWebsiteAuditEvent({ taskId: staleTask.id, leadId: staleTask.lead_id, event: "stale_task_recovered", status: staleTask.attempt_count >= staleTask.max_attempts ? "exhausted" : "queued" });
  }
  while (websiteAuditsActive < websiteAuditConcurrency) {
    const task = db
      .prepare(
        `SELECT t.* FROM website_audit_tasks t
         JOIN leads l ON l.id = t.lead_id
         LEFT JOIN saved_searches s ON s.id = l.search_id
         WHERE t.status = 'queued' AND (t.next_run_at = '' OR t.next_run_at <= ?)
         ORDER BY CASE WHEN t.refresh = 1 THEN 0 ELSE 1 END,
                  CASE WHEN s.status IN ('starting', 'running', 'qualifying') THEN 0 ELSE 1 END,
                  CASE WHEN s.status = 'cancelled' THEN 1 ELSE 0 END,
                  t.created_at LIMIT 1`,
      )
      .get(new Date().toISOString()) as Record<string, unknown> | undefined;
    if (!task) {
      scheduleWebsiteAuditWake();
      return;
    }
    const lead = db
      .prepare("SELECT id, website FROM leads WHERE id = ?")
      .get(String(task.lead_id)) as { id: string; website: string } | undefined;
    if (!lead || !clean(lead.website)) {
      db.prepare(
        "UPDATE website_audit_tasks SET status = ?, error = ?, finished_at = ?, updated_at = ? WHERE id = ?",
      ).run(
        "failed",
        "No public website is listed for this lead.",
        new Date().toISOString(), new Date().toISOString(),
        String(task.id),
      );
      emitWebsiteAuditEvent(String(task.lead_id), "failed");
      recordWebsiteAuditEvent({ taskId: String(task.id), leadId: String(task.lead_id), event: "audit_failed", status: "failed", error: "No public website is listed for this lead." });
      continue;
    }
    const auditId = randomUUID();
    const now = new Date().toISOString();
    let recoveryStages: string[] = [];
    try { recoveryStages = JSON.parse(String(task.recovery_stages ?? "")); } catch { /* normal audit */ }
    let preloadedProfile: Parameters<typeof auditWebsite>[0]["preloadedProfile"] | undefined;
    if (recoveryStages.length && !recoveryStages.includes("profile")) {
      const prior = db.prepare("SELECT * FROM website_audits WHERE lead_id = ?").get(lead.id) as Record<string, unknown> | undefined;
      if (prior?.id) {
        let metrics: Record<string, unknown> = {};
        let pages: string[] = [];
        try { metrics = JSON.parse(String(prior.metrics_json ?? "{}")); } catch { /* rejected below */ }
        try { pages = JSON.parse(String(prior.pages_json ?? "[]")); } catch { /* rejected below */ }
        const stageStatus = (metrics.stages as Record<string, { status?: string }> | undefined)?.profile?.status;
        if (stageStatus === "completed" && pages.length) {
          const issues = db.prepare("SELECT category, severity, url, evidence, suggestion, verification_status FROM website_audit_issues WHERE audit_id = ?").all(String(prior.id));
          const signals = db.prepare(`SELECT o.signal_code AS code, d.label, d.signal_group AS \"group\", o.value_text AS value, o.confidence, o.evidence_url AS evidenceUrl, o.evidence_excerpt AS evidenceExcerpt, o.verification_status AS verificationStatus
            FROM lead_observations o JOIN lead_signal_definitions d ON d.code = o.signal_code WHERE o.lead_id = ?`).all(lead.id);
          preloadedProfile = { url: String(prior.website), pages, metrics, issues: issues as never[], signals: signals as never[] };
        } else recoveryStages = [];
      }
    }
    const claimed = db.prepare(
      "UPDATE website_audit_tasks SET status = ?, stage = ?, attempt_count = attempt_count + 1, started_at = ?, heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'",
    ).run("analyzing", "starting", now, now, now, String(task.id));
    if (Number(claimed.changes ?? 0) !== 1) continue;
    db.prepare(
      `INSERT INTO website_audits (id, lead_id, website, status, created_at, updated_at)
       VALUES (?, ?, ?, 'analyzing', ?, ?)
       ON CONFLICT(lead_id) DO UPDATE SET website = excluded.website, status = 'analyzing', error = '', updated_at = excluded.updated_at`,
    ).run(auditId, lead.id, lead.website, now, now);
    websiteAuditsActive += 1;
    const controller = new AbortController();
    activeWebsiteAuditControllers.set(lead.id, controller);
    recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: "worker_acquired", stage: "starting", status: "analyzing" });
    emitWebsiteAuditEvent(lead.id, "analyzing");
    void (async () => {
      const startedAt = Date.now();
      recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: "audit_started", stage: "starting", status: "analyzing" });
      try {
        const result = await auditWebsite({
          root,
          auditId,
          website: lead.website,
          preloadedProfile,
          signal: controller.signal,
          onProgress: (progress) => {
            const now = new Date().toISOString();
            db.prepare("UPDATE website_audit_tasks SET stage = ?, heartbeat_at = ?, updated_at = ? WHERE id = ?").run(progress.stage, now, now, String(task.id));
            recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: progress.stage, stage: progress.stage, status: "analyzing" });
            emitWebsiteAuditEvent(lead.id, "analyzing", progress);
          },
        });
        if (controller.signal.aborted) throw new Error("Audit cancelled.");
        persistWebsiteAudit(lead.id, auditId, result);
        recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: "audit_persisted", status: result.status, durationMs: Date.now() - startedAt });
        // Browser/Lighthouse failures produce a useful partial audit. Keep it
        // visible and schedule only the missing stage with the same bounded
        // retry budget; never throw away profile evidence or hold a worker.
        const partialRecovery = result.status === "partial" ? recoverablePartialFailure(result.metrics) : null;
        const attempts = Number(task.attempt_count ?? 0) + 1;
        const recoveryExhausted = Boolean(partialRecovery) && attempts >= Number(task.max_attempts ?? websiteAuditMaxAttempts);
        if (partialRecovery && !recoveryExhausted) {
          const retryAt = new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** attempts)).toISOString();
          db.prepare("UPDATE website_audit_tasks SET status = 'queued', stage = ?, error = ?, failure_kind = ?, recovery_stages = ?, next_run_at = ?, finished_at = '', heartbeat_at = ?, updated_at = ? WHERE id = ?")
            .run(partialRecovery.failure.kind, partialRecovery.failure.message, partialRecovery.failure.kind, JSON.stringify(partialRecovery.stages), retryAt, new Date().toISOString(), new Date().toISOString(), String(task.id));
          refreshLeadQualification(lead.id);
          recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: "partial_recovery_scheduled", stage: partialRecovery.failure.kind, status: "queued", error: partialRecovery.failure.message, durationMs: Date.now() - startedAt, metadata: { recoveryStages: partialRecovery.stages, retryAt } });
          emitWebsiteAuditEvent(lead.id, "retry_scheduled");
          return;
        }
        const restrictedReason = result.status === "access_restricted"
          ? String(((result.metrics.stages as Record<string, { reason?: string }> | undefined)?.profile?.reason) ?? "Public access was restricted.")
          : "";
        if (restrictedReason)
          db.prepare("UPDATE website_audits SET error = ? WHERE lead_id = ?").run(restrictedReason, lead.id);
        db.prepare(
          "UPDATE website_audit_tasks SET status = ?, stage = ?, error = ?, failure_kind = ?, finished_at = ?, heartbeat_at = ?, updated_at = ? WHERE id = ?",
        ).run(recoveryExhausted ? "exhausted" : result.status, recoveryExhausted ? "exhausted" : result.status === "completed" ? "completed" : result.status === "partial" ? "partial" : "access_restricted", recoveryExhausted ? partialRecovery?.failure.message ?? "Retry limit reached while recovering a partial audit." : restrictedReason, recoveryExhausted ? partialRecovery?.failure.kind ?? "internal" : restrictedReason ? "access_restricted" : "", new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), String(task.id));
        // Re-evaluate after the task reaches its terminal state. The audit
        // evidence may already be persisted, but qualification must not see
        // the previous `analyzing` task status.
        refreshLeadQualification(lead.id);
        emitWebsiteAuditEvent(lead.id, result.status);
        recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: "audit_finished", status: result.status, durationMs: Date.now() - startedAt });
      } catch (error) {
        const message = cleanAuditError(error);
        const failure = classifyAuditFailure(error);
        const cancelled = controller.signal.aborted || failure.kind === "cancelled";
        const attempts = Number(task.attempt_count ?? 0) + 1;
        const exhausted = !cancelled && failure.retryable && attempts >= Number(task.max_attempts ?? websiteAuditMaxAttempts);
        const accessRestricted = failure.kind === "access_restricted" || failure.kind === "http_403";
        const status = cancelled ? "cancelled" : !failure.retryable ? (accessRestricted ? "access_restricted" : "failed") : exhausted ? "exhausted" : "queued";
        const advertisedRetryMs = Number(message.match(/retry-after\s+(\d+)s/i)?.[1] ?? 0) * 1_000;
        const retryDelayMs = Math.max(Math.min(60_000, 1_000 * 2 ** attempts), Math.min(60_000, advertisedRetryMs || 0));
        const retryAt = !cancelled && failure.retryable && !exhausted ? new Date(Date.now() + retryDelayMs).toISOString() : "";
        const currentAudit = db.prepare("SELECT metrics_json FROM website_audits WHERE lead_id = ?").get(lead.id) as { metrics_json?: string } | undefined;
        let previousMetrics: Record<string, unknown> = {};
        try { previousMetrics = JSON.parse(String(currentAudit?.metrics_json ?? "{}")); } catch { /* keep diagnostic-only metrics */ }
        const previousStages = (previousMetrics.stages as Record<string, unknown> | undefined) ?? {};
        const failedStage = failure.kind === "lighthouse" ? "lighthouse" : previousStages.profile && (previousStages.profile as { status?: string }).status === "completed" ? "browser" : "profile";
        const diagnosticMetrics = {
          ...previousMetrics,
          diagnostic: { kind: failure.kind, message, occurredAt: new Date().toISOString() },
          stages: {
            ...previousStages,
            [failedStage]: { status: "failed", reason: message },
            ...(failedStage === "profile" ? { browser: { status: "skipped", reason: "No browser stage was started after the profile failure." }, lighthouse: { status: "skipped", reason: "No Lighthouse run was started after the profile failure." } } : {}),
            ...(failedStage === "browser" ? { lighthouse: { status: "skipped", reason: "Lighthouse was not run because the browser stage failed." } } : {}),
          },
        };
        db.prepare(
          "UPDATE website_audits SET status = ?, error = ?, metrics_json = ?, updated_at = ? WHERE lead_id = ?",
        ).run(cancelled ? "cancelled" : accessRestricted ? "access_restricted" : "failed", message, JSON.stringify(diagnosticMetrics), new Date().toISOString(), lead.id);
        db.prepare(
          "UPDATE website_audit_tasks SET status = ?, stage = ?, error = ?, failure_kind = ?, next_run_at = ?, finished_at = CASE WHEN ? IN ('cancelled', 'exhausted', 'failed', 'access_restricted') THEN ? ELSE '' END, heartbeat_at = ?, updated_at = ? WHERE id = ?",
        ).run(status, failure.kind, message, failure.kind, retryAt, status, new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), String(task.id));
        scoreWebsiteOpportunity(lead.id, auditId, cancelled ? "cancelled" : accessRestricted ? "access_restricted" : "failed");
        refreshLeadQualification(lead.id);
        recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: failure.kind === "timeout" ? "audit_timeout" : "audit_failed", stage: failure.kind, status, error: message, durationMs: Date.now() - startedAt });
        emitWebsiteAuditEvent(lead.id, status === "queued" ? "retry_scheduled" : status);
      } finally {
        activeWebsiteAuditControllers.delete(lead.id);
        websiteAuditsActive -= 1;
        recordWebsiteAuditEvent({ taskId: String(task.id), leadId: lead.id, event: "worker_released", status: "idle", durationMs: Date.now() - startedAt });
        requestWebsiteAuditQueue();
      }
    })();
  }
}

function enqueueWebsiteAudit(leadId: string, refresh: boolean, recoveryStages: string[] = []) {
  const lead = db
    .prepare("SELECT id, website FROM leads WHERE id = ?")
    .get(leadId) as { id: string; website: string } | undefined;
  if (!lead) return { unavailable: true, queued: false, cached: false };
  if (!clean(lead.website))
    return { unavailable: true, queued: false, cached: false };
  const active = db
    .prepare(
      "SELECT id FROM website_audit_tasks WHERE lead_id = ? AND status IN ('queued', 'analyzing')",
    )
    .get(leadId);
  if (active)
    return { unavailable: false, queued: false, cached: false, active: true };
  const terminal = db.prepare(
    "SELECT status FROM website_audit_tasks WHERE lead_id = ? ORDER BY updated_at DESC LIMIT 1",
  ).get(leadId) as { status?: string } | undefined;
  if (!refresh && ["failed", "exhausted", "cancelled", "access_restricted"].includes(String(terminal?.status ?? "")))
    return { unavailable: false, queued: false, cached: false, terminal: true };
  const cached = db
    .prepare(
      "SELECT id FROM website_audits WHERE lead_id = ? AND status IN ('completed', 'partial', 'access_restricted') AND updated_at >= ?",
    )
    .get(leadId, new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
  if (cached && !refresh)
    return { unavailable: false, queued: false, cached: true };
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO website_audit_tasks (id, lead_id, status, refresh, max_attempts, recovery_stages, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)",
  ).run(randomUUID(), leadId, refresh ? 1 : 0, websiteAuditMaxAttempts, JSON.stringify(recoveryStages), now, now);
  emitWebsiteAuditEvent(leadId, "queued");
  requestWebsiteAuditQueue();
  return { unavailable: false, queued: true, cached: false };
}

/** Backfill only leads that have never reached a terminal useful audit state. */
function backfillEligibleWebsiteAudits() {
  if (!automaticWebsiteAuditsEnabled()) return { eligible: 0, queued: 0 };
  const rows = db.prepare(`SELECT l.id FROM leads l
    WHERE TRIM(COALESCE(l.website, '')) != ''
      AND COALESCE(l.archived_at, '') = ''
      AND NOT EXISTS (SELECT 1 FROM website_audits a WHERE a.lead_id = l.id AND a.status IN ('completed', 'partial', 'access_restricted'))
      AND NOT EXISTS (SELECT 1 FROM website_audit_tasks t WHERE t.lead_id = l.id AND t.status IN ('queued', 'analyzing', 'failed', 'exhausted', 'cancelled', 'access_restricted'))
    ORDER BY l.created_at`).all() as Array<{ id: string }>;
  const queued = rows.reduce((count, row) => count + Number(enqueueWebsiteAudit(row.id, false).queued), 0);
  return { eligible: rows.length, queued };
}

const visualUxConcurrency = 1;
const visualUxTimeoutMs = Math.max(30_000, Math.min(180_000, Number(process.env.VISUAL_UX_TIMEOUT_MS ?? 120_000) || 120_000));
const visualUxMaxAttempts = Math.max(1, Math.min(3, Number(process.env.VISUAL_UX_MAX_ATTEMPTS ?? 2) || 2));
const visualUxStaleMs = Math.max(60_000, Number(process.env.VISUAL_UX_STALE_MS ?? 180_000));
let visualUxActive = 0;
let visualUxQueueRunning = false;

function classifyVisualUxFailure(error: unknown) {
  const message = cleanAuditError(error);
  const transient = /timed out|timeout|fetch failed|econnreset|eai_again|http 429|usage limit|\b5\d\d\b/i.test(message);
  return { message, retryable: transient, kind: transient ? "provider_transient" : "provider_or_input" };
}

function enqueueVisualUxReview(leadId: string, refresh = false) {
  const active = db.prepare("SELECT id FROM visual_ux_tasks WHERE lead_id = ? AND status IN ('queued', 'running')").get(leadId);
  const completed = db.prepare("SELECT vu.id FROM visual_ux_assessments vu JOIN website_audits wa ON wa.id = vu.audit_id WHERE vu.lead_id = ? AND vu.status = 'completed' AND wa.lead_id = ? ORDER BY vu.created_at DESC LIMIT 1").get(leadId, leadId);
  if (active || (completed && !refresh)) return { queued: false, active: Boolean(active), cached: Boolean(completed) };
  const now = new Date().toISOString();
  db.prepare("INSERT INTO visual_ux_tasks (id, lead_id, status, max_attempts, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?)").run(randomUUID(), leadId, visualUxMaxAttempts, now, now);
  void processVisualUxQueue();
  return { queued: true, active: false, cached: false };
}

async function processVisualUxQueue() {
  if (visualUxQueueRunning) return;
  visualUxQueueRunning = true;
  try {
    const staleBefore = new Date(Date.now() - visualUxStaleMs).toISOString();
    db.prepare("UPDATE visual_ux_tasks SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END, error = CASE WHEN error = '' THEN 'Visual & UX worker heartbeat expired.' ELSE error END, next_run_at = ?, updated_at = ? WHERE status = 'running' AND COALESCE(NULLIF(heartbeat_at, ''), updated_at) < ?")
      .run(new Date().toISOString(), new Date().toISOString(), staleBefore);
    while (visualUxActive < visualUxConcurrency) {
      const task = db.prepare("SELECT * FROM visual_ux_tasks WHERE status = 'queued' AND (next_run_at = '' OR next_run_at <= ?) ORDER BY created_at LIMIT 1").get(new Date().toISOString()) as Record<string, unknown> | undefined;
      if (!task) return;
      const startedAt = Date.now(); const now = new Date().toISOString();
      const claimed = db.prepare("UPDATE visual_ux_tasks SET status = 'running', attempt_count = attempt_count + 1, started_at = ?, heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'").run(now, now, now, String(task.id));
      if (!claimed.changes) continue;
      visualUxActive += 1;
      try {
        await performVisualUxAssessment(String(task.lead_id));
        db.prepare("UPDATE visual_ux_tasks SET status = 'completed', finished_at = ?, heartbeat_at = ?, updated_at = ?, duration_ms = ?, error = '', failure_kind = '' WHERE id = ?").run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), Date.now() - startedAt, String(task.id));
      } catch (error) {
        const failure = classifyVisualUxFailure(error);
        const attempts = Number(task.attempt_count ?? 0) + 1;
        const retry = failure.retryable && attempts < Number(task.max_attempts ?? visualUxMaxAttempts);
        const retryAt = retry ? new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** attempts)).toISOString() : "";
        db.prepare("UPDATE visual_ux_tasks SET status = ?, error = ?, failure_kind = ?, next_run_at = ?, finished_at = ?, heartbeat_at = ?, updated_at = ?, duration_ms = ? WHERE id = ?")
          .run(retry ? "queued" : "failed", failure.message, failure.kind, retryAt, retry ? "" : new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), Date.now() - startedAt, String(task.id));
        if (retry) setTimeout(() => { void processVisualUxQueue(); }, Math.max(25, Date.parse(retryAt) - Date.now()));
      } finally {
        refreshLeadQualification(String(task.lead_id));
        visualUxActive -= 1;
      }
    }
  } finally {
    visualUxQueueRunning = false;
  }
}

// Resume any work recovered from a previous server process.
void processEnrichmentQueue();
backfillEligibleWebsiteAudits();
requestWebsiteAuditQueue();
db.prepare("UPDATE visual_ux_tasks SET status = 'queued', started_at = '', next_run_at = '', updated_at = ? WHERE status = 'running'").run(new Date().toISOString());
void processVisualUxQueue();

app.get("/api/health", async (_req, res) => {
  try {
    const response = await fetch(`${gosomUrl}/api/v1/jobs`);
    res.json({ app: "ok", gosom: response.ok ? "connected" : "unavailable" });
  } catch {
    res.json({ app: "ok", gosom: "unavailable" });
  }
});

app.get("/api/countries", (req, res) => {
  const query = searchKey(req.query.q);
  res.json(
    countries.filter(
      (item) =>
        !query ||
        searchKey(item.name).includes(query) ||
        item.code.toLowerCase().includes(query),
    ),
  );
});

app.get("/api/regions", (req, res) => {
  const countryCode = clean(req.query.countryCode);
  res.json(
    db
      .prepare("SELECT name FROM regions WHERE country_code = ? ORDER BY name")
      .all(countryCode),
  );
});

app.get("/api/locations", (req, res) => {
  const countryCode = clean(req.query.countryCode).toUpperCase();
  const kind = clean(req.query.kind);
  const query = searchKey(req.query.q);
  const requestedRegion = clean(req.query.region);
  if (
    !countries.some((country) => country.code === countryCode) ||
    !["region", "city"].includes(kind)
  )
    return res
      .status(422)
      .json({ error: "Choose a country and location type." });
  const seed: GeographicSeed = geographicSeeds[countryCode] ?? {
    regions: [],
    cities: [],
  };
  const observedRegions = (
    db
      .prepare("SELECT name FROM regions WHERE country_code = ?")
      .all(countryCode) as Array<{ name: string }>
  ).map((row) => row.name);
  const observedCities = db
    .prepare(
      `SELECT DISTINCT city AS name, region FROM leads WHERE country_code = ? AND city != ''`,
    )
    .all(countryCode) as Array<{ name: string; region: string }>;
  const seedRegions = seed.regions.map((region) =>
    typeof region === "string" ? { name: region } : region,
  );
  const entries =
    kind === "region"
      ? [...seedRegions, ...observedRegions.map((name) => ({ name }))].filter(
          (entry, index, all) =>
            all.findIndex(
              (item) => searchKey(item.name) === searchKey(entry.name),
            ) === index,
        )
      : [...seed.cities, ...observedCities]
          .filter((entry) => {
            if (!requestedRegion) return true;
            const selected =
              countryCode === "BR"
                ? brazilRegion(requestedRegion)?.name
                : requestedRegion;
            return searchKey(entry.region) === searchKey(selected);
          })
          .filter(
            (entry, index, all) =>
              all.findIndex(
                (item) =>
                  searchKey(item.name) === searchKey(entry.name) &&
                  searchKey(item.region) === searchKey(entry.region),
              ) === index,
          );
  res.json(
    entries
      .filter(
        (entry) =>
          !query ||
          searchKey(entry.name).includes(query) ||
          searchKey("code" in entry ? entry.code : "").includes(query) ||
          searchKey("regionCode" in entry ? entry.regionCode : "").includes(
            query,
          ),
      )
      .sort((left, right) => {
        const rank = (entry: (typeof entries)[number]) =>
          searchKey("code" in entry ? entry.code : "") === query ||
          searchKey("regionCode" in entry ? entry.regionCode : "") === query
            ? 0
            : searchKey(entry.name).startsWith(query)
              ? 1
              : 2;
        return rank(left) - rank(right);
      })
      // Regions are a compact directory (Brazil has 27) and are filtered in
      // the accessible client-side autocomplete. Cities remain capped.
      .slice(0, kind === "region" ? 100 : 8),
  );
});

app.get("/api/dashboard", (_req, res) => {
  const counts = db
    .prepare(
      `SELECT
    (SELECT COUNT(*) FROM leads) AS totalLeads,
    (SELECT COUNT(DISTINCT lead_id) FROM campaign_memberships) AS inCampaigns,
    (SELECT COUNT(*) FROM leads WHERE NOT EXISTS (SELECT 1 FROM campaign_memberships cm WHERE cm.lead_id = leads.id)) AS notInCampaigns,
    (SELECT COUNT(*) FROM leads WHERE lead_status = 'contacted' OR EXISTS (SELECT 1 FROM outreach_pipeline op WHERE op.lead_id = leads.id AND op.status IN ('contacted', 'replied', 'interested', 'proposal_sent', 'won', 'lost'))) AS contacted,
    (SELECT COUNT(*) FROM leads WHERE COALESCE(TRIM(business_email), '') != '' OR COALESCE(TRIM(phone), '') != '' OR COALESCE(TRIM(instagram), '') != '' OR COALESCE(TRIM(facebook), '') != '') AS contactsFound,
    (SELECT COUNT(*) FROM leads WHERE COALESCE(TRIM(website), '') = '') AS missingWebsite,
    (SELECT COUNT(*) FROM leads WHERE lead_status = 'qualified') AS qualified,
    (SELECT COUNT(*) FROM search_jobs WHERE status IN ('running', 'starting')) AS running,
    (SELECT COUNT(*) FROM website_opportunity_scores WHERE profile_key = 'website_opportunity' AND level = 'high') AS highOpportunity,
    (SELECT COUNT(*) FROM website_opportunity_scores WHERE profile_key = 'website_opportunity' AND level = 'medium') AS mediumOpportunity,
    (SELECT COUNT(*) FROM website_opportunity_scores WHERE profile_key = 'website_opportunity' AND level = 'low') AS lowOpportunity,
    (SELECT COUNT(DISTINCT lead_id) FROM website_audits WHERE status = 'completed') AS completedAudits,
    (SELECT COUNT(DISTINCT lead_id) FROM website_audits WHERE status IN ('queued', 'analyzing', 'partial', 'failed', 'access_restricted', 'not_analyzed')) AS pendingAudits`,
    )
    .get();
  res.json({ ...counts, activity: searchActivity() });
});

app.get("/api/industries", (_req, res) => {
  res.json({ version: INDUSTRY_CATALOG_VERSION, industries: industryCatalog });
});

function searchActivity() {
  const active = db
    .prepare(
      `SELECT sj.*, ss.name AS search_name, ss.category, ss.country_name
       FROM search_jobs sj JOIN saved_searches ss ON ss.id = sj.search_id
       WHERE sj.status IN ('starting', 'running')
       ORDER BY sj.updated_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  const current =
    active ??
    (db
      .prepare(
        `SELECT sj.*, ss.name AS search_name, ss.category, ss.country_name
         FROM search_jobs sj JOIN saved_searches ss ON ss.id = sj.search_id
         ORDER BY sj.updated_at DESC LIMIT 1`,
      )
      .get() as Record<string, unknown> | undefined);
  if (!current) return null;
  const executionId = String(current.execution_id ?? "");
  const execution = executionId
    ? db.prepare("SELECT * FROM search_executions WHERE id = ?").get(executionId) as Record<string, unknown> | undefined
    : undefined;
  const jobs = db
    .prepare(
      `SELECT * FROM search_jobs WHERE search_id = ? ${executionId ? "AND execution_id = ?" : ""} ORDER BY created_at`,
    )
    .all(
      ...(executionId
        ? [String(current.search_id), executionId]
        : [String(current.search_id)]),
    ) as Array<Record<string, unknown>>;
  const number = (key: string) =>
    jobs.reduce((total, job) => total + Number(job[key] ?? 0), 0);
  const processed = jobs.reduce(
    (total, job) =>
      total + Number(job.processed_count || job.result_count || 0),
    0,
  );
  const complete = jobs.filter((job) => job.status === "completed").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const running = jobs.some(
    (job) => job.status === "running" || job.status === "starting",
  );
  const stages = [
    "saving",
    "deduplicating",
    "processing",
    "collecting",
    "starting",
  ];
  const stage = running
    ? (stages.find((candidate) =>
        jobs.some((job) => job.stage === candidate),
      ) ?? "collecting")
    : failed && !complete
      ? "failed"
      : "completed";
  return {
    executionId,
    searchId: String(current.search_id),
    name: String(current.search_name),
    category: String(current.category),
    country: String(current.country_name),
    region:
      jobs
        .map((job) => String(job.region || job.city || ""))
        .filter(Boolean)
        .join(", ") || String(current.country_name),
    status: execution?.status === "cancelled"
      ? "cancelled"
      : running
      ? "running"
      : failed
        ? "completed_with_errors"
        : execution?.status === "completed_with_shortfall"
          ? "completed_with_shortfall"
        : "completed",
    stage,
    discovered: number("discovered_count") || processed,
    inserted: number("inserted_count"),
    duplicates: number("duplicate_count"),
    preexistingDuplicates: number("preexisting_duplicate_count"),
    executionDuplicates: number("execution_duplicate_count"),
    processed,
    jobs: { total: Number(execution?.total_jobs ?? jobs.length), completed: complete, cancelled: jobs.filter((job) => job.status === "cancelled").length, failed },
    target: normalizeExtractionTarget(execution?.extraction_target ?? current.extraction_target),
    collected: Number(execution?.collected_count ?? (current.execution_id ? executionCollected(executionId) : number("inserted_count"))),
    // Gosom does not expose a reliable record-level percentage. The UI must
    // use an indeterminate bar while collection itself is still active.
    progressMode: running ? "indeterminate" : "complete",
  };
}

app.get("/api/search-activity/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(
    `event: search-activity\ndata: ${JSON.stringify(searchActivity())}\n\n`,
  );
  searchActivityStreams.add(res);
  req.on("close", () => searchActivityStreams.delete(res));
});

function listSearches() {
  const searches = db
    .prepare("SELECT * FROM saved_searches ORDER BY created_at DESC")
    .all() as Array<Record<string, unknown>>;
  return searches.map((search) => {
    const reconciliation = reconcileSearchStatus(String(search.id));
    if (reconciliation?.search) search = reconciliation.search;
    let jobs = db
      .prepare(
      `SELECT id, city, region, query, search_term, status, gosom_job_id, imported, result_count, error, extraction_target, inserted_count, duplicate_count, preexisting_duplicate_count, execution_duplicate_count, relevance_skipped_count
      FROM search_jobs WHERE search_id = ? ORDER BY created_at DESC`,
      )
      .all(String(search.id));
    const coverage = jobs.map((job: any) => jobCoverage(job));
    const execution = db.prepare("SELECT * FROM search_executions WHERE search_id = ? ORDER BY started_at DESC LIMIT 1").get(String(search.id)) as Record<string, unknown> | undefined;
    const target = normalizeExtractionTarget(search.extraction_target);
    const collected = execution ? executionCollected(String(execution.id)) : jobs.reduce((total: number, job: any) => total + Number(job.inserted_count ?? 0), 0);
    const progress = {
      total: Number(execution?.total_jobs ?? jobs.length),
      completed: jobs.filter((job: any) => job.status === "completed").length,
      cancelled: jobs.filter((job: any) => job.status === "cancelled").length,
      failed: jobs.filter((job: any) => job.status === "failed").length,
      target,
      collected,
      requestedQualified: target,
      duplicates: jobs.reduce((total: number, job: any) => total + Number(job.duplicate_count ?? 0), 0),
      preexistingDuplicates: jobs.reduce((total: number, job: any) => total + Number(job.preexisting_duplicate_count ?? 0), 0),
      executionDuplicates: jobs.reduce((total: number, job: any) => total + Number(job.execution_duplicate_count ?? 0), 0),
    };
    const qualification = qualificationFromSearch(search);
    const qualificationProgress = qualificationCounts(search);
    Object.assign(progress, { qualified: qualificationProgress.qualified, remainingQualified: qualificationProgress.remainingTarget });
    const metrics = db.prepare(`SELECT
      COUNT(DISTINCT CASE WHEN l.qualification_status = 'qualified' OR EXISTS (SELECT 1 FROM outreach_pipeline p WHERE p.lead_id = l.id) THEN cm.lead_id END) AS lead_count,
      COUNT(DISTINCT CASE WHEN COALESCE(TRIM(l.business_email), '') != '' OR COALESCE(TRIM(l.instagram), '') != '' OR COALESCE(TRIM(l.facebook), '') != '' OR COALESCE(TRIM(l.phone), '') != '' THEN l.id END) AS contact_count,
      COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM website_audits wa WHERE wa.lead_id = l.id AND wa.status IN ('completed', 'partial')) THEN l.id END) AS audit_count,
      COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM icp_scores score WHERE score.lead_id = l.id AND score.score >= 70 AND score.evidence_coverage >= 50) THEN l.id END) AS high_icp_count
      FROM campaign_memberships cm JOIN leads l ON l.id = cm.lead_id WHERE cm.campaign_id = ?`).get(String(search.id));
    return {
      ...search,
      current_stage: reconciliation?.stage ?? "completed",
      cities: JSON.parse(String(search.cities_json ?? "[]")),
      regions: JSON.parse(String(search.regions_json ?? "[]")),
      industryIds: JSON.parse(String(search.industry_ids_json ?? "[]")),
      industryTerms: JSON.parse(String(search.industry_terms_json ?? "[]")),
      customTerms: JSON.parse(String(search.custom_terms_json ?? "[]")),
      qualification,
      qualification_progress: qualificationProgress,
      jobs,
      coverage,
      progress,
      metrics,
    };
  });
}

function jobCoverage(job: Record<string, unknown>) {
  const gosomJobId = String(job.gosom_job_id ?? "");
  const summaryPath = join(
    root,
    "data",
    "processed",
    `${gosomJobId}.summary.json`,
  );
  let summary: Record<string, number> | undefined;
  try {
    if (gosomJobId && existsSync(summaryPath))
      summary = JSON.parse(readFileSync(summaryPath, "utf8")) as Record<
        string,
        number
      >;
  } catch {
    /* Coverage remains unavailable when a local artifact is malformed. */
  }
  const links = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM lead_sources WHERE search_job_id = ?`,
        )
        .get(String(job.id)) as { count: number }
    ).count,
  );
  const uniqueLinks = Number(
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT lead_id) AS count FROM lead_sources WHERE search_job_id = ?`,
        )
        .get(String(job.id)) as { count: number }
    ).count,
  );
  const inputRows = summary?.input_rows ?? 0;
  const uniqueRows = summary?.unique_rows ?? 0;
  const outputRows = summary?.output_rows ?? 0;
  const reasons: string[] = [];
  if (!summary && String(job.status) === "completed")
    reasons.push("Processed summary is unavailable.");
  if (summary && uniqueRows > outputRows)
    reasons.push(
      `Local safety limit retained ${outputRows} of ${uniqueRows} unique CSV rows.`,
    );
  if (summary && Number(summary.duplicates_removed ?? 0) > 0)
    reasons.push(
      `${summary.duplicates_removed} duplicate CSV rows removed by the processor.`,
    );
  if (outputRows > uniqueLinks)
    reasons.push(
      `${outputRows - uniqueLinks} retained rows were not linked to SQLite.`,
    );
  return {
    jobId: String(job.id),
    gosomJobId,
    state: String(job.region || job.city || ""),
    status: String(job.status),
    rawRows: inputRows,
    processorUniqueRows: uniqueRows,
    processorDuplicatesRemoved: Number(summary?.duplicates_removed ?? 0),
    retainedRows: outputRows,
    limit: Number(summary?.limit ?? job.extraction_target ?? defaultExtractionTarget),
    target: Number(job.extraction_target ?? defaultExtractionTarget),
    limitedOut: Math.max(uniqueRows - outputRows, 0),
    sqliteLinks: links,
    sqliteUniqueLeads: uniqueLinks,
    preexistingDuplicates: Number(job.preexisting_duplicate_count ?? 0),
    executionDuplicates: Number(job.execution_duplicate_count ?? 0),
    reasons,
  };
}

app.get("/api/searches", (_req, res) => res.json(listSearches()));
app.get("/api/campaigns", (req, res) => {
  const term = clean(req.query.q).toLowerCase();
  const archived = req.query.archived === "true";
  const campaigns = listSearches().filter((campaign: any) => {
    if (Boolean(campaign.archived_at) !== archived) return false;
    return !term || `${campaign.name} ${campaign.category} ${campaign.country_name}`.toLowerCase().includes(term);
  });
  res.json(campaigns);
});
app.get("/api/campaigns/:id", (req, res) => {
  const campaign = listSearches().find((item: any) => item.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  const runs = db.prepare(`SELECT se.*, COUNT(sj.id) AS job_count,
    SUM(CASE WHEN sj.status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
    SUM(CASE WHEN sj.status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs
    FROM search_executions se LEFT JOIN search_jobs sj ON sj.execution_id = se.id
    WHERE se.search_id = ? GROUP BY se.id ORDER BY se.started_at DESC`).all(req.params.id);
  // Older imports predate search_executions and therefore retain an empty
  // execution_id. Keep their progress visible without rewriting history.
  if (runs.length === 0) {
    const legacyRun = db.prepare(`SELECT
      ? AS id, ? AS search_id,
      CASE
        WHEN SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) > 0 THEN 'running'
        WHEN SUM(CASE WHEN status = 'starting' THEN 1 ELSE 0 END) > 0 THEN 'starting'
        WHEN SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) = COUNT(*) THEN 'failed'
        ELSE 'completed'
      END AS status,
      MIN(created_at) AS started_at,
      MAX(CASE WHEN status IN ('completed', 'failed') THEN updated_at ELSE '' END) AS completed_at,
      MAX(updated_at) AS updated_at,
      COUNT(*) AS job_count,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs
      FROM search_jobs WHERE search_id = ? AND (execution_id IS NULL OR execution_id = '')`).get(`legacy-${req.params.id}`, req.params.id, req.params.id);
    if (legacyRun && Number(legacyRun.job_count ?? 0) > 0) runs.push(legacyRun);
  }
  const activity = db.prepare(`SELECT 'search_job' AS kind, status, error AS detail, updated_at AS occurred_at FROM search_jobs WHERE search_id = ?
    UNION ALL SELECT 'lead_import' AS kind, CASE WHEN was_inserted = 1 THEN 'inserted' ELSE 'duplicate' END AS status, '' AS detail, discovered_at AS occurred_at FROM lead_sources WHERE search_id = ?
    ORDER BY occurred_at DESC LIMIT 40`).all(req.params.id, req.params.id);
  res.json({ campaign, runs, activity });
});
app.get("/api/campaigns/:id/leads", (req, res) => {
  const campaign = db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const term = clean(req.query.q);
  const args: Array<string | number> = [req.params.id];
  const searchClause = term ? "AND (l.title LIKE ? OR l.city LIKE ? OR l.category LIKE ?)" : "";
  if (term) args.push(`%${term}%`, `%${term}%`, `%${term}%`);
  const rows = db.prepare(`SELECT l.id, l.title, l.category, l.city, l.region, l.website,
      l.business_email, l.phone, l.instagram, l.facebook, l.contact_status,
      a.status AS website_audit_status,
      COALESCE(os.level, 'insufficient_evidence') AS opportunity_level, os.score AS opportunity_score,
      COALESCE(os.issue_count, 0) AS opportunity_issue_count,
      cm.first_seen_at, cm.last_seen_at,
      COALESCE(p.status, 'not_contacted') AS pipeline_status,
      (SELECT score FROM icp_scores s WHERE s.lead_id = l.id ORDER BY calculated_at DESC LIMIT 1) AS icp_score,
      COALESCE(NULLIF(d.review_status, 'not_generated'), CASE WHEN COALESCE(TRIM(gd.body), '') != '' THEN CASE WHEN gd.status = 'sent' THEN 'sent' ELSE 'draft' END WHEN COALESCE(TRIM(d.body), '') != '' THEN 'draft' ELSE 'not_generated' END) AS draft_status,
      COALESCE(d.updated_at, gd.updated_at, '') AS draft_updated_at,
      COALESCE(d.contacted_at, '') AS contacted_at,
      COALESCE(d.review_notes, '') AS review_notes,
      CASE WHEN EXISTS (SELECT 1 FROM campaign_drafts other_d WHERE other_d.lead_id = l.id AND other_d.campaign_id != cm.campaign_id AND (other_d.review_status IN ('contacted', 'replied', 'interested') OR COALESCE(TRIM(other_d.contacted_at), '') != '')) OR EXISTS (SELECT 1 FROM outreach_pipeline other_p WHERE other_p.lead_id = l.id AND other_p.status IN ('contacted', 'replied', 'interested', 'proposal_sent', 'won', 'lost')) THEN 1 ELSE 0 END AS repeat_outreach_risk
    FROM campaign_memberships cm JOIN leads l ON l.id = cm.lead_id
    LEFT JOIN outreach_pipeline p ON p.lead_id = l.id
    LEFT JOIN campaign_drafts d ON d.campaign_id = cm.campaign_id AND d.lead_id = cm.lead_id
    LEFT JOIN website_audits a ON a.lead_id = l.id
    LEFT JOIN global_email_drafts gd ON gd.lead_id = l.id
    LEFT JOIN website_opportunity_scores os ON os.lead_id = l.id AND os.profile_key = 'website_opportunity'
    WHERE cm.campaign_id = ? AND (l.qualification_status = 'qualified' OR p.lead_id IS NOT NULL) ${searchClause}
    ORDER BY cm.last_seen_at DESC, l.title COLLATE NOCASE LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM campaign_memberships cm JOIN leads l ON l.id = cm.lead_id LEFT JOIN outreach_pipeline p ON p.lead_id = l.id WHERE cm.campaign_id = ? AND (l.qualification_status = 'qualified' OR p.lead_id IS NOT NULL) ${searchClause}`).get(...args) as { count: number };
  res.json({ rows, total: Number(total.count), limit, offset });
});
app.get("/api/campaigns/:id/drafts", (req, res) => {
  const exists = db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ error: "Campaign not found." });
  res.json((db.prepare(`SELECT d.*, l.title FROM campaign_drafts d JOIN leads l ON l.id = d.lead_id WHERE d.campaign_id = ? ORDER BY d.updated_at DESC`).all(req.params.id) as Array<Record<string, unknown>>).map((row) => ({ ...row, usage: jsonValue(row.usage_json, {}), evidence: jsonValue(row.evidence_json, []), generationHistory: jsonValue(row.generation_history_json, []) })));
});
app.get("/api/campaigns/:id/outreach/:leadId/context", (req, res) => {
  const context = outreachContext(req.params.id, req.params.leadId);
  if (!context) return res.status(404).json({ error: "Lead is not a member of this campaign." });
  return res.json({ ...context, evidence: safeEvidence(context) });
});
app.get("/api/campaigns/:id/outreach/:leadId/draft", (req, res) => {
  if (!campaignLeadExists(req.params.id, req.params.leadId)) return res.status(404).json({ error: "Lead is not a member of this campaign." });
  return res.json(draftRow(req.params.id, req.params.leadId));
});
app.patch("/api/campaigns/:id/outreach/:leadId/draft", (req, res) => {
  if (!campaignLeadExists(req.params.id, req.params.leadId)) return res.status(404).json({ error: "Lead is not a member of this campaign." });
  const requestedStatus = clean(req.body?.reviewStatus);
  const draft = saveDraft(req.params.id, req.params.leadId, { subject: clean(req.body?.subject), body: clean(req.body?.body), language: req.body?.language === "pt-BR" ? "pt-BR" : "en", tone: clean(req.body?.tone) || "professional", service: clean(req.body?.service), reviewStatus: requestedStatus, reviewNotes: String(req.body?.reviewNotes ?? "") });
  return res.json(draft);
});
app.post("/api/campaigns/:id/outreach/:leadId/contact", (req, res) => {
  if (!campaignLeadExists(req.params.id, req.params.leadId)) return res.status(404).json({ error: "Lead is not a member of this campaign." });
  try {
    requireOutreachRecipient(req.params.leadId);
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "No eligible commercial email is available." }); }
  const contactedAt = clean(req.body?.contactedAt) || new Date().toISOString();
  const draft = saveDraft(req.params.id, req.params.leadId, { reviewStatus: "contacted", contactedAt, reviewNotes: String(req.body?.reviewNotes ?? "") });
  if (req.body?.syncPipeline === true) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO outreach_pipeline (lead_id, status, channel, notes, last_contact_at, created_at, updated_at) VALUES (?, 'contacted', 'email', ?, ?, ?, ?) ON CONFLICT(lead_id) DO UPDATE SET status = 'contacted', channel = 'email', notes = excluded.notes, last_contact_at = excluded.last_contact_at, updated_at = excluded.updated_at`).run(req.params.leadId, String(req.body?.reviewNotes ?? ""), contactedAt, now, now);
    db.prepare("INSERT INTO outreach_activities (id, lead_id, activity_type, channel, note, happened_at, created_at) VALUES (?, ?, 'contacted', 'email', ?, ?, ?)").run(randomUUID(), req.params.leadId, String(req.body?.reviewNotes ?? ""), contactedAt, now);
  }
  return res.json(draft);
});
app.post("/api/campaigns/:id/outreach/:leadId/translate", async (req, res) => {
  if (!campaignLeadExists(req.params.id, req.params.leadId)) return res.status(404).json({ error: "Lead is not a member of this campaign." });
  const draft = draftRow(req.params.id, req.params.leadId); const subject = clean(req.body?.subject ?? draft?.subject); const body = clean(req.body?.body ?? draft?.body);
  if (!subject || !body) return res.status(422).json({ error: "Save or generate an English draft before translating." });
  try { const translated = await translateOutreach(subject, body); const translatedWithSignature = { ...translated, body: applySignature(translated.body) }; const saved = saveDraft(req.params.id, req.params.leadId, { translatedSubject: translatedWithSignature.subject, translatedBody: translatedWithSignature.body, translationLanguage: "pt-BR", translationProvider: translated.provider, translationModel: translated.model, generation: { at: new Date().toISOString(), action: "translation", provider: translated.provider, model: translated.model, usage: translated.usage } }); return res.json({ draft: saved, translation: translatedWithSignature }); } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "Could not translate draft." }); }
});
app.post("/api/campaigns/:id/outreach/:leadId/generate", async (req, res) => {
  const context = outreachContext(req.params.id, req.params.leadId);
  if (!context) return res.status(404).json({ error: "Lead is not a member of this campaign." });
  try { requireOutreachEvidence(req.params.leadId); requireOutreachRecipient(req.params.leadId); } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "No eligible commercial email is available." }); }
  if (req.body?.allowRepeat !== true) { const conflict = outreachRepeatConflict(req.params.id, req.params.leadId); if (conflict) return res.status(409).json({ error: "Outreach is already marked as contacted for this lead. Review the existing outreach before generating another draft.", conflict }); }
  const options = outreachOptions(req.body, req.params.id);
  try {
    const focus = commercialFocusForLead(req.params.leadId);
        const effectiveOptions = { ...options, service: options.service || strategicOutreachService, evidenceIds: options.evidenceIds.length ? options.evidenceIds : focus.evidenceIds, previousSubjects: campaignPreviousSubjects(req.params.id, req.params.leadId) };
    requireConcreteOutreachEvidence(context, effectiveOptions);
    const generated = finalizeOutreach(await generateOutreach(context, effectiveOptions), context, req.params.id, req.params.leadId, effectiveOptions.language);
    const draft = saveDraft(req.params.id, req.params.leadId, { ...effectiveOptions, ...generated, evidence: evidenceForOutreach(context, effectiveOptions), generation: { at: new Date().toISOString(), ...effectiveOptions, provider: generated.provider, model: generated.model, usage: generated.usage } });
    return res.json({ draft, evidence: evidenceForOutreach(context, effectiveOptions) });
  } catch (error) { return sendOutreachError(res, error, "Could not generate outreach draft."); }
});
app.get("/api/outreach/runs/:id", (req, res) => {
  const run = db.prepare("SELECT * FROM outreach_generation_runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Outreach run not found." });
  return res.json({ run, items: db.prepare("SELECT * FROM outreach_generation_items WHERE run_id = ? ORDER BY id").all(req.params.id) });
});
app.get("/api/outreach/runs/:id/events", (req, res) => {
  if (!db.prepare("SELECT id FROM outreach_generation_runs WHERE id = ?").get(req.params.id)) return res.status(404).end();
  res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
  const streams = outreachStreams.get(req.params.id) ?? new Set<Response>(); streams.add(res); outreachStreams.set(req.params.id, streams); emitOutreachRun(req.params.id); req.on("close", () => streams.delete(res));
});
app.post("/api/outreach/runs/:id/cancel", (req, res) => {
  const run = db.prepare("SELECT id FROM outreach_generation_runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Outreach run not found." });
  cancelledOutreachRuns.add(req.params.id); db.prepare("UPDATE outreach_generation_runs SET status = 'cancelling', updated_at = ? WHERE id = ? AND status IN ('queued', 'running')").run(new Date().toISOString(), req.params.id); emitOutreachRun(req.params.id); return res.json({ ok: true });
});
app.post("/api/campaigns/:id/outreach/batch", (req, res) => {
  const campaign = db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(req.params.id);
  const requestedLeadIds: string[] = Array.isArray(req.body?.leadIds) ? [...new Set((req.body.leadIds as unknown[]).map(clean).filter((id) => id && campaignLeadExists(req.params.id, id) && outreachEvidenceEligible(id) && Boolean(outreachRecipient(id))))] : [];
  const allowRepeat = req.body?.allowRepeat === true;
  const skipped = requestedLeadIds.filter((leadId) => shouldSkipBatchDraft(Boolean(draftRow(req.params.id, leadId)?.body), Boolean(outreachRepeatConflict(req.params.id, leadId)), allowRepeat));
  const leadIds = requestedLeadIds.filter((leadId) => !skipped.includes(leadId));
  if (!campaign || !leadIds.length) return res.status(422).json({ error: "Select at least one lead from this campaign." });
  const runId = randomUUID(); const now = new Date().toISOString();
  db.prepare("INSERT INTO outreach_generation_runs (id, campaign_id, status, total, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?)").run(runId, req.params.id, leadIds.length, now, now);
  const item = db.prepare("INSERT INTO outreach_generation_items (id, run_id, campaign_id, lead_id) VALUES (?, ?, ?, ?)"); for (const leadId of leadIds) item.run(randomUUID(), runId, req.params.id, leadId);
  void processOutreachRun(runId, req.params.id, leadIds, outreachOptions(req.body, req.params.id));
  return res.status(202).json({ runId, total: leadIds.length, skipped });
});

// Harvey-compatible durable outbox staging. Staging is intentionally separate
// from dispatch: no provider call can happen until the future send flag,
// provider scopes, and an explicit operational enablement are all present.
function outboxPaused() { return appSetting("outreach_sending_paused", "true") === "true"; }
function outboxPublicRow(row: Record<string, unknown>) {
  const sendingEnabled = process.env.OUTREACH_SEND_ENABLED === "true"; const paused = outboxPaused();
  return { ...row, uncertain: Boolean(row.uncertain), attempts: Number(row.attempts ?? 0), isTest: String(row.campaign_id ?? "") === "__outreach_test__", dispatchState: outboxDispatchState(String(row.status ?? ""), String(row.send_at ?? ""), new Date(), sendingEnabled, paused) };
}
function authorizedOutreachTestRecipients(): string[] { return [...new Set(String(process.env.OUTREACH_TEST_RECIPIENTS ?? "").split(",").map((value) => normalizeEmail(value)).filter(Boolean))]; }
app.get("/api/outreach/outbox", (req, res) => {
  const campaignId = clean(req.query.campaignId);
  const status = clean(req.query.status);
  const where: string[] = []; const args: string[] = [];
  if (campaignId) { where.push("campaign_id = ?"); args.push(campaignId); }
  if (status) { where.push("status = ?"); args.push(status); }
  const rows = db.prepare(`SELECT * FROM outreach_outbox ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY send_at, created_at`).all(...args) as Array<Record<string, unknown>>;
  return res.json({ items: rows.map(outboxPublicRow), sendingEnabled: process.env.OUTREACH_SEND_ENABLED === "true", paused: outboxPaused() });
});
app.get("/api/outreach/test-recipients", (_req, res) => res.json({ recipients: authorizedOutreachTestRecipients() }));
app.post("/api/outreach/test-message", (req, res) => {
  const toEmail = normalizeEmail(req.body?.toEmail); const subject = clean(req.body?.subject); const body = normalizeEmailBody(req.body?.body); const accountId = clean(req.body?.accountId); const authorized = authorizedOutreachTestRecipients();
  if (!authorized.includes(toEmail)) return res.status(422).json({ error: "Este destinatário não está autorizado para testes. Configure OUTREACH_TEST_RECIPIENTS no backend." });
  const account = db.prepare("SELECT id FROM email_accounts WHERE id = ? AND status = 'connected'").get(accountId); if (!account) return res.status(422).json({ error: "Selecione uma conta conectada." });
  const gate = outboxGate({ toEmail, subject, body, recipientStatus: "verified", approvePossible: false, thirdParty: false, unsubscribed: false, alreadyContacted: false }); if (!gate.ok) return res.status(422).json({ error: gate.reasons.join("; ") });
  const duplicate = db.prepare("SELECT id FROM outreach_outbox WHERE campaign_id = '__outreach_test__' AND account_id = ? AND lower(trim(to_email)) = lower(trim(?)) AND status IN ('pending_review','approved','sending') LIMIT 1").get(accountId, toEmail);
  if (duplicate) return res.status(409).json({ error: "Esta conta já possui uma mensagem de teste ativa para esse destinatário." });
  const now = new Date().toISOString(); const id = randomUUID(); db.prepare("INSERT INTO outreach_outbox (id,campaign_id,lead_id,account_id,to_email,subject,body,status,send_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending_review',?,?,?)").run(id, "__outreach_test__", `test-${id}`, accountId, toEmail, subject, body, now, now, now);
  return res.status(201).json(outboxPublicRow(db.prepare("SELECT * FROM outreach_outbox WHERE id = ?").get(id) as Record<string, unknown>));
});
app.delete("/api/outreach/outbox", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set((req.body.ids as unknown[]).map(clean).filter(Boolean))] : [];
  if (!ids.length) return res.status(422).json({ error: "Selecione ao menos uma mensagem terminal para remover." });
  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(`DELETE FROM outreach_outbox WHERE id IN (${placeholders}) AND status IN ('cancelled','rejected','failed')`).run(...ids);
  return res.json({ removed: Number(result.changes) });
});
app.post("/api/campaigns/:id/outbox", (req, res) => {
  if (!db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(req.params.id)) return res.status(404).json({ error: "Campaign not found." });
  const leadIds = Array.isArray(req.body?.leadIds) ? [...new Set((req.body.leadIds as unknown[]).map(clean).filter(Boolean))] : [];
  const requestedAccounts = Array.isArray(req.body?.accountIds) ? [...new Set((req.body.accountIds as unknown[]).map(clean).filter(Boolean))] : [];
  const accounts = (db.prepare(`SELECT id, provider, email, limits_json FROM email_accounts WHERE status = 'connected' AND id IN (${requestedAccounts.map(() => "?").join(",") || "NULL"})`).all(...requestedAccounts) as Array<Record<string, unknown>>);
  if (!leadIds.length) return res.status(422).json({ error: "Selecione ao menos um lead." });
  if (!accounts.length) return res.status(422).json({ error: "Selecione ao menos uma conta de e-mail conectada." });
  const approvePossible = req.body?.approvePossible === true;
  const spacingMinutes = Math.min(24 * 60, Math.max(1, Number(req.body?.spacingMinutes ?? 15) || 15));
  const requestedStartAt = typeof req.body?.startAt === "string" ? new Date(req.body.startAt) : new Date();
  const startAt = Number.isNaN(requestedStartAt.getTime()) ? new Date() : requestedStartAt;
  const assignedAccounts = distributeOutboxAccounts(accounts.map((account) => String(account.id)), leadIds.length);
  const staged: string[] = []; const skipped: Array<{ leadId: string; reasons: string[] }> = [];
  const insert = db.prepare(`INSERT OR IGNORE INTO outreach_outbox (id,campaign_id,lead_id,account_id,to_email,subject,body,status,send_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending_review',?,?,?)`);
  leadIds.forEach((leadId, index) => {
    try {
      if (!campaignLeadExists(req.params.id, leadId)) throw new Error("Lead não pertence a esta campanha.");
      requireOutreachEvidence(leadId);
      const recipient = requireOutreachRecipient(leadId);
      const draft = draftRow(req.params.id, leadId);
      const subject = clean(draft?.subject);
      // Drafts are plain text. Do not use `clean` here: it intentionally
      // collapses whitespace for fields such as titles, but would destroy
      // paragraph breaks before the message reaches the mail provider.
      const body = String(draft?.body ?? "").normalize("NFKC").trim();
      const gate = outboxGate({ toEmail: recipient.email, subject, body, recipientStatus: recipient.status, approvePossible: true, thirdParty: false, unsubscribed: false, alreadyContacted: Boolean(outreachRepeatConflict(req.params.id, leadId)) });
      if (!gate.ok) throw new Error(gate.reasons.join("; "));
      const previousRecipient = db.prepare("SELECT status FROM outreach_outbox WHERE lower(trim(to_email)) = lower(trim(?)) AND status IN ('pending_review','approved','sending','sent') LIMIT 1").get(recipient.email) as { status?: string } | undefined;
      if (previousRecipient) throw new Error("Este destinatário já possui uma mensagem preparada ou enviada pela Outbox.");
      const account = accounts.find((item) => String(item.id) === assignedAccounts[index]);
      const now = new Date().toISOString(); const result = insert.run(randomUUID(), req.params.id, leadId, String(account?.id), recipient.email, subject, body, scheduledOutboxTime(startAt, index, spacingMinutes), now, now);
      if (Number(result.changes) === 1) staged.push(leadId); else skipped.push({ leadId, reasons: ["Já existe uma mensagem deste lead nesta campanha na outbox."] });
    } catch (error) { skipped.push({ leadId, reasons: [error instanceof Error ? error.message : "Lead não elegível para a outbox."] }); }
  });
  return res.status(202).json({ staged, skipped, sendingEnabled: process.env.OUTREACH_SEND_ENABLED === "true", paused: outboxPaused() });
});
app.post("/api/outreach/outbox/:id/approve", (req, res) => {
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE outreach_outbox SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ? AND status = 'pending_review'").run(now, now, req.params.id);
  if (!result.changes) return res.status(409).json({ error: "A mensagem não está aguardando aprovação ou já foi processada." });
  return res.json(outboxPublicRow(db.prepare("SELECT * FROM outreach_outbox WHERE id = ?").get(req.params.id) as Record<string, unknown>));
});
app.post("/api/outreach/outbox/:id/reject", (req, res) => {
  const result = db.prepare("UPDATE outreach_outbox SET status = 'rejected', updated_at = ? WHERE id = ? AND status IN ('pending_review','approved')").run(new Date().toISOString(), req.params.id);
  if (!result.changes) return res.status(409).json({ error: "A mensagem não pode mais ser rejeitada." });
  return res.json({ rejected: true });
});
app.post("/api/outreach/outbox/:id/cancel", (req, res) => {
  const result = db.prepare("UPDATE outreach_outbox SET status = 'cancelled', error = ?, updated_at = ? WHERE id = ? AND status IN ('pending_review','approved')").run(clean(req.body?.reason) || "cancelled_by_user", new Date().toISOString(), req.params.id);
  if (!result.changes) return res.status(409).json({ error: "A mensagem já foi iniciada ou encerrada." });
  return res.json({ cancelled: true });
});
app.post("/api/outreach/sending/pause", (_req, res) => { saveAppSetting("outreach_sending_paused", "true"); return res.json({ paused: true }); });
app.post("/api/outreach/sending/resume", (_req, res) => {
  if (process.env.OUTREACH_SEND_ENABLED !== "true") return res.status(409).json({ error: "O envio permanece desativado no backend. Nenhum e-mail pode ser disparado." });
  saveAppSetting("outreach_sending_paused", "false"); return res.json({ paused: false });
});

async function dispatchOutreachOutbox(): Promise<void> {
  if (process.env.OUTREACH_SEND_ENABLED !== "true" || outboxPaused()) return;
  const now = new Date(); const nowIso = now.toISOString();
  const rows = db.prepare("SELECT * FROM outreach_outbox WHERE status = 'approved' AND send_at <= ? ORDER BY send_at, created_at LIMIT 16").all(nowIso) as Array<Record<string, unknown>>;
  for (const row of rows) {
    const id = String(row.id);
    const claim = db.prepare("UPDATE outreach_outbox SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'approved' AND send_at <= ?").run(nowIso, id, nowIso);
    if (!claim.changes) continue;
    try {
      const accountId = String(row.account_id);
      const account = db.prepare("SELECT id, provider, email, display_name, limits_json FROM email_accounts WHERE id = ? AND status = 'connected'").get(accountId) as Record<string, unknown> | undefined;
      if (!account) throw new Error("A conta de envio não está conectada.");
      let limit = 50;
      try { const limits = JSON.parse(String(account.limits_json ?? "{}")) as Record<string, unknown>; limit = Math.max(1, Number(limits.dailyLimit ?? limits.daily_limit ?? limits.daily ?? 50) || 50); } catch { /* use default */ }
      const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
      const sentToday = Number((db.prepare("SELECT COUNT(*) AS n FROM outreach_outbox WHERE account_id = ? AND status = 'sent' AND sent_at >= ?").get(accountId, dayStart.toISOString()) as { n: number }).n);
      if (dailyCapReached(sentToday, limit)) { db.prepare("UPDATE outreach_outbox SET status = 'approved', send_at = ?, error = ?, updated_at = ? WHERE id = ? AND status = 'sending'").run(new Date(dayStart.getTime() + 86_400_000 + 60_000).toISOString(), "Limite diário da conta atingido.", nowIso, id); continue; }
      const secret = await mailAccountStore.get(accountId); if (!secret) throw new Error("Credenciais da conta não estão disponíveis.");
      let result: MailSendResult;
      if (String(account.provider) === "gmail") {
        const config = mailConfig(); if (!config) throw new Error("Gmail OAuth não está configurado.");
        result = await sendGmailMessage({ accessToken: secret.accessToken ?? "", refreshToken: secret.refreshToken, expiresAt: secret.expiresAt ?? 0, email: secret.email, displayName: secret.displayName ?? String(account.display_name ?? ""), scopes: secret.scopes }, config, { toEmail: String(row.to_email), subject: String(row.subject), htmlBody: formatOutreachEmailHtml(String(row.body)) });
      } else {
        const config = zohoConfig(); if (!config) throw new Error("Zoho OAuth não está configurado.");
        result = await sendZohoMessage({ accessToken: secret.accessToken ?? "", refreshToken: secret.refreshToken, expiresAt: secret.expiresAt ?? 0, email: secret.email, apiDomain: secret.apiDomain ?? config.apiDomain ?? "https://mail.zoho.com", accountId: secret.accountId, scopes: secret.scopes }, config, { toEmail: String(row.to_email), subject: String(row.subject), htmlBody: formatOutreachEmailHtml(String(row.body)) });
        if (result.refreshedToken && "accountId" in result.refreshedToken) await mailAccountStore.upsert(accountId, { ...secret, accessToken: result.refreshedToken.accessToken, expiresAt: result.refreshedToken.expiresAt, email: result.refreshedToken.email, accountId: result.refreshedToken.accountId, apiDomain: result.refreshedToken.apiDomain, scopes: result.refreshedToken.scopes });
      }
      // `error` is NOT NULL in the SQLite schema. Persist an empty value after
      // a confirmed provider response so a successful send is not reclassified
      // as failed while recording the result.
      db.prepare("UPDATE outreach_outbox SET status = 'sent', sent_at = ?, provider_message_id = ?, uncertain = 0, error = '', updated_at = ? WHERE id = ? AND status = 'sending'").run(nowIso, result.messageId, nowIso, id);
      if (String(row.campaign_id) !== "__outreach_test__") {
        db.prepare("UPDATE campaign_drafts SET review_status = 'sent', contacted_at = COALESCE(NULLIF(contacted_at, ''), ?), updated_at = ? WHERE campaign_id = ? AND lead_id = ? AND review_status IN ('draft', 'reviewed')").run(nowIso, nowIso, String(row.campaign_id), String(row.lead_id));
        // Campaign Outreach can use either a legacy campaign draft or the
        // global draft fallback. Keep both projections and the commercial
        // history synchronized after a provider-confirmed send so this lead
        // can never return to the preparation list.
        db.prepare("UPDATE global_email_drafts SET status = 'sent', sent_at = ?, updated_at = ? WHERE lead_id = ? AND status IN ('draft', 'reviewed')").run(nowIso, nowIso, String(row.lead_id));
        db.prepare("UPDATE global_email_leads SET status = 'sent', updated_at = ? WHERE lead_id = ?").run(nowIso, String(row.lead_id));
        db.prepare(`INSERT INTO outreach_pipeline (lead_id, status, channel, notes, last_contact_at, created_at, updated_at)
          VALUES (?, 'contacted', 'email', ?, ?, ?, ?)
          ON CONFLICT(lead_id) DO UPDATE SET status = 'contacted', channel = 'email', notes = excluded.notes, last_contact_at = excluded.last_contact_at, updated_at = excluded.updated_at`)
          .run(String(row.lead_id), "Sent through Scout Outbox.", nowIso, nowIso, nowIso);
        db.prepare("INSERT INTO outreach_activities (id, lead_id, activity_type, channel, note, happened_at, created_at) VALUES (?, ?, 'contacted', 'email', ?, ?, ?)")
          .run(randomUUID(), String(row.lead_id), "Sent through Scout Outbox.", nowIso, nowIso);
      }
    } catch (error) {
      const failure = classifyOutboxDispatchError(error);
      db.prepare("UPDATE outreach_outbox SET status = 'failed', uncertain = ?, error = ?, updated_at = ? WHERE id = ? AND status = 'sending'").run(failure.uncertain ? 1 : 0, failure.error ?? "Falha no provedor.", nowIso, id);
    }
  }
}

function reconcileUncertainOutboxRows(): void {
  const now = new Date().toISOString();
  db.prepare("UPDATE outreach_outbox SET status = 'failed', uncertain = 1, error = ?, updated_at = ? WHERE status = 'sending'").run("O servidor reiniciou durante o envio; resultado incerto, verifique a pasta Enviados.", now);
}

async function processOutreachRun(runId: string, campaignId: string, leadIds: string[], options: OutreachOptions) {
  db.prepare("UPDATE outreach_generation_runs SET status = 'running', updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId); emitOutreachRun(runId);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (cancelledOutreachRuns.has(runId)) return;
      const leadId = leadIds[cursor++]; if (!leadId) return;
      const started = new Date().toISOString(); db.prepare("UPDATE outreach_generation_items SET status = 'running', started_at = ? WHERE run_id = ? AND lead_id = ?").run(started, runId, leadId); emitOutreachRun(runId);
      try {
        const context = outreachContext(campaignId, leadId); if (!context) throw new Error("Lead is no longer a member of this campaign.");
        requireOutreachEvidence(leadId);
        const conflict = outreachRepeatConflict(campaignId, leadId); if (conflict) throw new Error("Skipped: this lead is already marked as contacted in another campaign or the global pipeline.");
        const focus = commercialFocusForLead(leadId);
        const effectiveOptions = { ...options, service: options.service || strategicOutreachService, evidenceIds: options.evidenceIds.length ? options.evidenceIds : focus.evidenceIds, previousSubjects: campaignPreviousSubjects(campaignId, leadId) };
        requireConcreteOutreachEvidence(context, effectiveOptions);
        const generated = finalizeOutreach(await generateOutreach(context, effectiveOptions), context, campaignId, leadId, effectiveOptions.language);
        saveDraft(campaignId, leadId, { ...effectiveOptions, ...generated, evidence: evidenceForOutreach(context, effectiveOptions), generation: { at: new Date().toISOString(), ...effectiveOptions, provider: generated.provider, model: generated.model, usage: generated.usage } });
        db.prepare("UPDATE outreach_generation_items SET status = 'completed', completed_at = ? WHERE run_id = ? AND lead_id = ?").run(new Date().toISOString(), runId, leadId);
        db.prepare("UPDATE outreach_generation_runs SET completed = completed + 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
      } catch (error) {
        db.prepare("UPDATE outreach_generation_items SET status = 'failed', error = ?, completed_at = ? WHERE run_id = ? AND lead_id = ?").run(error instanceof Error ? error.message : "Generation failed.", new Date().toISOString(), runId, leadId);
        db.prepare("UPDATE outreach_generation_runs SET failed = failed + 1, updated_at = ?, error = ? WHERE id = ?").run(new Date().toISOString(), error instanceof Error ? error.message : "Generation failed.", runId);
      }
      emitOutreachRun(runId);
    }
  };
  await Promise.all(Array.from({ length: Math.min(outreachConcurrency, leadIds.length) }, worker));
  const status = cancelledOutreachRuns.has(runId) ? "cancelled" : (Number((db.prepare("SELECT failed FROM outreach_generation_runs WHERE id = ?").get(runId) as { failed: number }).failed) > 0 ? "completed_with_errors" : "completed");
  db.prepare("UPDATE outreach_generation_runs SET status = ?, cancelled = ?, updated_at = ? WHERE id = ?").run(status, cancelledOutreachRuns.has(runId) ? Math.max(leadIds.length - Number((db.prepare("SELECT completed + failed AS n FROM outreach_generation_runs WHERE id = ?").get(runId) as { n: number }).n), 0) : 0, new Date().toISOString(), runId); cancelledOutreachRuns.delete(runId); emitOutreachRun(runId);
}
app.patch("/api/campaigns/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Campaign not found." });
  const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, "name");
  const hasDescription = Object.prototype.hasOwnProperty.call(req.body ?? {}, "description");
  const name = clean(req.body?.name); const description = clean(req.body?.description);
  const archivedAt = typeof req.body?.archived === "boolean" ? (req.body.archived ? new Date().toISOString() : "") : undefined;
  const hasOutreachMode = Object.prototype.hasOwnProperty.call(req.body ?? {}, "outreachMode");
  const hasOutreachService = Object.prototype.hasOwnProperty.call(req.body ?? {}, "outreachService");
  const hasOutreachEvidence = Object.prototype.hasOwnProperty.call(req.body ?? {}, "outreachEvidenceIds");
  if (hasName && name) db.prepare("UPDATE saved_searches SET name = ? WHERE id = ?").run(name, req.params.id);
  if (hasDescription) db.prepare("UPDATE saved_searches SET description = ? WHERE id = ?").run(description, req.params.id);
  if (archivedAt !== undefined) db.prepare("UPDATE saved_searches SET archived_at = ? WHERE id = ?").run(archivedAt, req.params.id);
  if (hasOutreachMode) db.prepare("UPDATE saved_searches SET outreach_mode = ? WHERE id = ?").run(validOutreachMode(req.body?.outreachMode), req.params.id);
  if (hasOutreachService) db.prepare("UPDATE saved_searches SET outreach_service = ? WHERE id = ?").run(clean(req.body?.outreachService), req.params.id);
  if (hasOutreachEvidence) {
    const ids = Array.isArray(req.body?.outreachEvidenceIds) ? [...new Set((req.body.outreachEvidenceIds as unknown[]).map(clean).filter(Boolean))] : [];
    db.prepare("UPDATE saved_searches SET outreach_evidence_json = ? WHERE id = ?").run(JSON.stringify(ids), req.params.id);
  }
  return res.json(listSearches().find((item: any) => item.id === req.params.id));
});
app.get("/api/searches/:id/coverage", (req, res) => {
  const search = db
    .prepare("SELECT id, extraction_target FROM saved_searches WHERE id = ?")
    .get(req.params.id);
  if (!search)
    return res.status(404).json({ error: "Saved search not found." });
  const jobs = db
    .prepare(
      `SELECT * FROM search_jobs WHERE search_id = ? ORDER BY created_at`,
    )
    .all(req.params.id) as Array<Record<string, unknown>>;
  res.json({ extractionTargets, defaultExtractionTarget, extractionTarget: normalizeExtractionTarget((search as Record<string, unknown>).extraction_target), jobs: jobs.map(jobCoverage) });
});

app.post("/api/searches", async (req, res) => {
  try {
    const input = req.body as SearchInput;
    const extractionTarget = normalizeExtractionTarget(input.extractionTarget);
    const countryCode = clean(input.countryCode).toUpperCase();
    const region = clean(input.region);
    const industryIds = [...new Set((input.industryIds ?? []).map(clean).filter((id) => Boolean(catalogEntry(id))))];
    const customTerms = [...new Set((input.customTerms ?? []).map(clean).filter(Boolean))];
    const expandedTerms = expandIndustryTerms(industryIds, customTerms);
    const category = clean(input.category) || industryIds.map((id) => catalogEntry(id)?.displayName).filter(Boolean).join(" + ");
    const primaryTerm = expandedTerms[0] ?? category;
    const scopeMode =
      input.scopeMode === "entire_country" ||
      input.scopeMode === "selected_regions"
        ? input.scopeMode
        : "selected_cities";
    const regions =
      scopeMode === "selected_regions"
        ? [
            ...new Set(
              (input.regions ?? (region ? [region] : []))
                .map(clean)
                .filter(Boolean),
            ),
          ]
        : [];
    const cities =
      scopeMode === "selected_cities"
        ? [
            ...new Set(
              (input.cities ?? (input.city ? [input.city] : []))
                .map(clean)
                .filter(Boolean),
            ),
          ]
        : [];
    const exampleRegion =
      scopeMode === "selected_regions" ? (regions[0] ?? "") : region;
    const exampleCity =
      scopeMode === "selected_cities" ? (cities[0] ?? "") : "";
    // New campaigns do not carry the former pre-qualification filters. Keep
    // legacy columns readable for existing campaigns, but discovery starts
    // unrestricted and filtering happens in Leads after import.
    const qualification: Qualification = { website: "all", contacts: [], contactMatch: "any" };
    const { country, query } = makeQuery({
      countryCode,
      region: scopeMode === "selected_regions" ? exampleRegion : "",
      category: primaryTerm,
      city: exampleCity,
      scopeMode,
    });
    const id = randomUUID();
    const fallbackName =
      scopeMode === "entire_country"
        ? country
        : scopeMode === "selected_regions"
          ? `${regions.length} selected regions`
          : `${cities.length} selected cities`;
    const search = {
      id,
      name: clean(input.name) || `${category} in ${fallbackName}`,
      countryCode,
      countryName: country,
      region: scopeMode === "selected_regions" ? exampleRegion : "",
      city: exampleCity,
      regions,
      cities,
      scopeMode,
      category,
      query,
      extractionTarget,
      qualification,
      status: input.runNow ? "starting" : "saved",
      createdAt: new Date().toISOString(),
      industryIds,
      customTerms,
      industryTerms: expandedTerms,
    };
    db.prepare(
      `INSERT INTO saved_searches (id, name, description, country_code, country_name, region, city, category, query, status, scope_mode, cities_json, regions_json, qualification_website, qualification_contacts_json, qualification_contact_match, search_config_json, extraction_target, industry_ids_json, industry_terms_json, custom_terms_json, industry_catalog_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      search.name,
      clean(input.description),
      countryCode,
      country,
      search.region,
      exampleCity,
      category,
      query,
      search.status,
      scopeMode,
      JSON.stringify(cities),
      JSON.stringify(regions),
      qualification.website,
      JSON.stringify(qualification.contacts),
      qualification.contactMatch,
      JSON.stringify({ countryCode, category, primaryTerm, industryIds, industryTerms: expandedTerms, customTerms, industryCatalogVersion: INDUSTRY_CATALOG_VERSION, scopeMode, cities, regions, qualification, extractionTarget }),
      extractionTarget,
      JSON.stringify(industryIds),
      JSON.stringify(expandedTerms),
      JSON.stringify(customTerms),
      INDUSTRY_CATALOG_VERSION,
      search.createdAt,
    );
    if (input.runNow) {
      const persisted = db
        .prepare("SELECT * FROM saved_searches WHERE id = ?")
        .get(id) as Record<string, unknown>;
      await startSearch(persisted);
    }
    res.status(201).json(search);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save search.";
    const gosomUnavailable = message === "fetch failed" || message.includes("ECONNREFUSED") || message.includes("Scout Engine") || message.includes("Gosom");
    res.status(gosomUnavailable ? 503 : 422).json({
      error: gosomUnavailable
        ? "Scout Engine is offline. Start the local service and try again; the campaign was saved but this search did not start."
        : message,
      code: gosomUnavailable ? "gosom_unavailable" : "search_validation_failed",
    });
  }
});

app.post("/api/searches/:id/run", async (req, res) => {
  try {
    const search = db
      .prepare("SELECT * FROM saved_searches WHERE id = ?")
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (!search)
      return res.status(404).json({ error: "Saved search not found." });
    await startSearch(search);
    return res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start search.";
    const gosomUnavailable = message === "fetch failed" || message.includes("ECONNREFUSED") || message.includes("Scout Engine") || message.includes("Gosom");
    return res.status(gosomUnavailable ? 503 : 422).json({
      error: gosomUnavailable
        ? "Scout Engine is offline. Start the local service and try again; the search did not start."
        : message,
      code: gosomUnavailable ? "gosom_unavailable" : "search_validation_failed",
    });
  }
});

app.post("/api/searches/:id/cancel", (req, res) => {
  const execution = db.prepare("SELECT id FROM search_executions WHERE search_id = ? AND status IN ('starting', 'running') ORDER BY started_at DESC LIMIT 1").get(req.params.id) as { id: string } | undefined;
  if (!execution) return res.status(404).json({ error: "No active search execution found." });
  cancelledSearchExecutions.add(execution.id);
  markExecutionRemainingCancelled(execution.id);
  const now = new Date().toISOString();
  db.prepare("UPDATE search_executions SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, execution.id);
  db.prepare("UPDATE saved_searches SET status = ? WHERE id = ?").run("cancelled", req.params.id);
  emitSearchActivity();
  return res.json({ ok: true, executionId: execution.id });
});

app.post("/api/searches/:id/sync", async (req, res) => {
  try {
    const search = db
      .prepare("SELECT * FROM saved_searches WHERE id = ?")
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (!search)
      return res.status(404).json({ error: "Saved search not found." });
    const latestExecution = db.prepare("SELECT id, status FROM search_executions WHERE search_id = ? ORDER BY started_at DESC LIMIT 1").get(String(search.id)) as { id?: string; status?: string } | undefined;
    if (latestExecution?.id && ["starting", "running", "waiting_for_service"].includes(String(latestExecution.status))) {
      if (!(await gosomIsAvailable())) {
        markSearchWaitingForService(String(search.id), String(latestExecution.id));
        return res.json(listSearches().find((item: any) => item.id === search.id));
      }
      if (latestExecution.status === "waiting_for_service") resumeSearchAfterService(String(search.id), String(latestExecution.id));
    }
    let jobs = db
      .prepare(
        `SELECT * FROM search_jobs WHERE search_id = ? AND status IN ('running', 'starting')`,
    )
      .all(String(search.id)) as Array<Record<string, unknown>>;
    if (!jobs.length) {
      const latestExecution = db.prepare("SELECT id, status FROM search_executions WHERE search_id = ? ORDER BY started_at DESC LIMIT 1").get(String(search.id)) as { id?: string; status?: string } | undefined;
      const refreshedExecution = latestExecution?.id ? db.prepare("SELECT id, status FROM search_executions WHERE id = ?").get(String(latestExecution.id)) as { id?: string; status?: string } | undefined : undefined;
      if (refreshedExecution?.id && (refreshedExecution.status === "starting" || refreshedExecution.status === "running")) {
        await launchQueuedSearchJobs(search, refreshedExecution.id, executionCandidateTarget(refreshedExecution.id, qualificationCandidateBudget(normalizeExtractionTarget(search.extraction_target))));
        jobs = db.prepare(`SELECT * FROM search_jobs WHERE search_id = ? AND status IN ('running', 'starting')`).all(String(search.id)) as Array<Record<string, unknown>>;
      }
      if (jobs.length) {
        // A queue refill happened; continue through the normal status/import path.
      } else if (search.status === "starting" || search.status === "running") {
        db.prepare("UPDATE saved_searches SET status = ? WHERE id = ?").run("failed", String(search.id));
      }
      if (latestExecution?.id && latestExecution.status === "cancelled") cancelledSearchExecutions.delete(latestExecution.id);
      if (!jobs.length) return res.json(listSearches().find((item: any) => item.id === search.id));
    }
    const executionId = String(jobs[0]?.execution_id ?? "");
    const extractionTarget = executionCandidateTarget(executionId, qualificationCandidateBudget(normalizeExtractionTarget(search.extraction_target)));
    for (const record of jobs) {
      if (executionId && cancelledSearchExecutions.has(executionId)) {
        markExecutionRemainingCancelled(executionId);
        break;
      }
      if (executionId && executionCollected(executionId) >= extractionTarget) {
        markExecutionRemainingCancelled(executionId);
        break;
      }
      if (!record.gosom_job_id) continue;
      db.prepare(
        "UPDATE search_jobs SET stage = ?, updated_at = ? WHERE id = ?",
      ).run("collecting", new Date().toISOString(), String(record.id));
      emitSearchActivity();
      const response = await fetch(
        `${gosomUrl}/api/v1/jobs/${record.gosom_job_id}`,
      );
      if (!response.ok)
        throw new Error(`Scout Engine status request failed (${response.status}).`);
      const job = normalizeGosomJob(
        (await response.json()) as Record<string, unknown>,
      );
      if (job.status === "ok") {
        const imported = await importResults(
          String(search.id),
          job.id,
          String(record.id),
          extractionTarget,
        );
        db.prepare(
          "UPDATE search_jobs SET status = ?, stage = ?, imported = 1, result_count = ?, updated_at = ? WHERE id = ?",
        ).run(
          cancelledSearchExecutions.has(executionId) ? "cancelled" : "completed",
          cancelledSearchExecutions.has(executionId) ? "cancelled" : "completed",
          imported.processed,
          new Date().toISOString(),
          String(record.id),
        );
      } else if (job.status === "failed")
        db.prepare(
          "UPDATE search_jobs SET status = ?, stage = ?, error = ?, updated_at = ? WHERE id = ?",
        ).run(
          "failed",
          "failed",
          "Scout Engine job failed.",
          new Date().toISOString(),
          String(record.id),
        );
    }
    await launchQueuedSearchJobs(search, executionId, extractionTarget);
    const pending = db
      .prepare(
        `SELECT COUNT(*) AS count FROM search_jobs WHERE search_id = ? AND status IN ('running', 'starting')`,
      )
      .get(String(search.id)) as { count: number };
    const queued = db.prepare("SELECT COUNT(*) AS count FROM search_jobs WHERE search_id = ? AND status = 'queued'").get(String(search.id)) as { count: number };
    if (pending.count === 0 && queued.count > 0 && executionId && executionCollected(executionId) < extractionTarget) {
      return res.json(listSearches().find((item: any) => item.id === search.id));
    }
    if (pending.count === 0) {
      const failures = db
        .prepare(
          `SELECT COUNT(*) AS count FROM search_jobs WHERE search_id = ? AND status = 'failed'`,
        )
        .get(String(search.id)) as { count: number };
      const collectedFinal = executionId ? executionCollected(executionId) : 0;
      const targetFinal = normalizeExtractionTarget(search.extraction_target);
      const finalStatus = cancelledSearchExecutions.has(executionId)
        ? "cancelled"
        : failures.count
          ? "completed_with_errors"
          : collectedFinal < targetFinal
            ? "completed_with_shortfall"
            : "completed";
      db.prepare("UPDATE saved_searches SET status = ? WHERE id = ?").run(finalStatus, String(search.id));
      // Discovery may be complete while required qualification work is still
      // running. A campaign cannot be presented as successful at this point.
      refreshSearchQualificationState(String(search.id));
      const execution = db
        .prepare(
          "SELECT execution_id FROM search_jobs WHERE search_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .get(String(search.id)) as { execution_id: string } | undefined;
      if (execution?.execution_id) {
        db.prepare(
          "UPDATE search_executions SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
        ).run(
          failures.count ? "completed_with_errors" : "completed",
          new Date().toISOString(),
          new Date().toISOString(),
          execution.execution_id,
        );
        const status = cancelledSearchExecutions.has(execution.execution_id)
          ? "cancelled"
          : failures.count
            ? "completed_with_errors"
            : executionCollected(execution.execution_id) < executionCandidateTarget(execution.execution_id, qualificationCandidateBudget(normalizeExtractionTarget(search.extraction_target)))
              ? "completed_with_shortfall"
              : "completed";
        db.prepare("UPDATE search_executions SET status = ?, completed_at = ?, updated_at = ?, collected_count = ?, duplicate_count = (SELECT COALESCE(SUM(duplicate_count), 0) FROM search_jobs WHERE execution_id = ?) WHERE id = ?").run(status, new Date().toISOString(), new Date().toISOString(), executionCollected(execution.execution_id), execution.execution_id, execution.execution_id);
        cancelledSearchExecutions.delete(execution.execution_id);
      }
    }
    emitSearchActivity();
    res.json(listSearches().find((item: any) => item.id === search.id));
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Could not sync search.",
    });
  }
});

function leadFilter(query: Record<string, unknown>) {
  const where: string[] = [];
  const args: Array<string | number> = [];
  // Logical archival preserves all CRM, campaign, contact and audit records;
  // the main Leads list simply omits archived records unless explicitly asked.
  if (query.includeArchived !== "true") where.push("COALESCE(leads.archived_at, '') = ''");
  // New discoveries are candidates, not Leads Workspace entries. CRM membership
  // remains an explicit override so commercial work is never hidden.
  if (query.includeCandidates !== "true") where.push("(leads.qualification_status = 'qualified' OR EXISTS (SELECT 1 FROM outreach_pipeline qualification_crm WHERE qualification_crm.lead_id = leads.id))");
  for (const [key, column] of [
    ["country", "country_code"],
    ["region", "region"],
    ["city", "city"],
    ["status", "lead_status"],
  ] as const) {
    const value = clean(query[key]);
    if (value) {
      where.push(`${column} = ?`);
      args.push(value);
    }
  }
  const selectedCities = (
    Array.isArray(query.cities) ? query.cities : clean(query.cities).split(",")
  )
    .map(clean)
    .filter(Boolean);
  if (selectedCities.length) {
    where.push(`city IN (${selectedCities.map(() => "?").join(", ")})`);
    args.push(...selectedCities);
  }
  const noWebsiteListed = "COALESCE(TRIM(website), '') = ''";
  const hasWebsiteListed = "COALESCE(TRIM(website), '') != ''";
  const websiteStatus = clean(query.websiteStatus);
  if (websiteStatus === "missing") where.push(noWebsiteListed);
  else if (websiteStatus === "present") where.push(hasWebsiteListed);
  else if (query.websiteEmpty === "true") where.push(noWebsiteListed);
  if (query.hasInstagram === "true") where.push("instagram != ''");
  if (query.hasEmail === "true") where.push("business_email != ''");
  if (query.hasFacebook === "true") where.push("facebook != ''");
  if (query.hasAnyDigitalContact === "true")
    where.push("(instagram != '' OR business_email != '' OR facebook != '')");
  if (query.noDigitalContact === "true")
    where.push("instagram = '' AND business_email = '' AND facebook = ''");
  if (query.verifiedContactsOnly === "true")
    where.push("contact_status = 'verified'");
  if (query.noWebsiteHasInstagram === "true")
    where.push(`${noWebsiteListed} AND instagram != ''`);
  const auditStatus = clean(query.auditStatus);
  if (auditStatus && auditStatus !== "all") {
    where.push(
      "COALESCE((SELECT status FROM website_audits wa WHERE wa.lead_id = leads.id), 'not_analyzed') = ?",
    );
    args.push(auditStatus);
  }
  const opportunity = clean(query.opportunity);
  if (opportunity && opportunity !== "all") {
    where.push("COALESCE((SELECT level FROM website_opportunity_scores os WHERE os.lead_id = leads.id AND os.profile_key = 'website_opportunity'), 'not_analyzed') = ?");
    args.push(opportunity);
  }
  const contactAvailability = clean(query.contactAvailability);
  if (contactAvailability === "verified") where.push("contact_status = 'verified'");
  else if (contactAvailability === "possible") where.push("contact_status = 'possible'");
  else if (contactAvailability === "none") where.push("enrichment_status = 'completed' AND contact_status = 'not_found'");
  const minWebsiteScore = Number(query.minWebsiteScore);
  if (Number.isFinite(minWebsiteScore)) {
    where.push(
      "EXISTS (SELECT 1 FROM website_audits wa WHERE wa.lead_id = leads.id AND wa.score >= ?)",
    );
    args.push(minWebsiteScore);
  }
  const issueSeverity = clean(query.issueSeverity);
  if (issueSeverity && issueSeverity !== "all") {
    where.push(
      "EXISTS (SELECT 1 FROM website_audits wa JOIN website_audit_issues wai ON wai.audit_id = wa.id WHERE wa.lead_id = leads.id AND wai.severity = ?)",
    );
    args.push(issueSeverity);
  }
  const signalCode = clean(query.signalCode);
  if (signalCode) {
    where.push(
      "EXISTS (SELECT 1 FROM lead_observations lo WHERE lo.lead_id = leads.id AND lo.signal_code = ?)",
    );
    args.push(signalCode);
  }
  const minSignalConfidence = Number(query.minSignalConfidence);
  if (Number.isFinite(minSignalConfidence)) {
    where.push(
      "EXISTS (SELECT 1 FROM lead_observations lo WHERE lo.lead_id = leads.id AND lo.confidence >= ?)",
    );
    args.push(minSignalConfidence);
  }
  const freshnessDays = Number(query.signalFreshnessDays);
  if (Number.isFinite(freshnessDays) && freshnessDays >= 0) {
    where.push(
      "EXISTS (SELECT 1 FROM lead_observations lo WHERE lo.lead_id = leads.id AND lo.observed_at >= datetime('now', ?))",
    );
    args.push(`-${Math.floor(freshnessDays)} days`);
  }
  const searchId = clean(query.searchId);
  if (searchId) {
    where.push(
      "EXISTS (SELECT 1 FROM campaign_memberships cm WHERE cm.lead_id = leads.id AND cm.campaign_id = ?)",
    );
    args.push(searchId);
    if (query.qualificationScope === "qualified") {
      const search = db
        .prepare("SELECT * FROM saved_searches WHERE id = ?")
        .get(searchId) as Record<string, unknown> | undefined;
      if (search)
        where.push(...qualificationWhere(qualificationFromSearch(search)));
    }
  }
  if (query.unknownSource === "true")
    where.push(
      "NOT EXISTS (SELECT 1 FROM lead_sources ls WHERE ls.lead_id = leads.id)",
    );
  const industry = clean(query.industry);
  if (industry) {
    where.push("industry_normalized = ?");
    args.push(normalizeIndustry(industry));
  }
  const category = clean(query.category);
  if (category) {
    where.push("category = ?");
    args.push(category);
  }
  const term = clean(query.q);
  if (term) {
    where.push("(title LIKE ? OR category LIKE ? OR address LIKE ?)");
    args.push(`%${term}%`, `%${term}%`, `%${term}%`);
  }
  const selectedIds = clean(query.selectedIds)
    .split(",")
    .map(clean)
    .filter(Boolean);
  if (selectedIds.length) {
    where.push(`leads.id IN (${selectedIds.map(() => "?").join(", ")})`);
    args.push(...selectedIds);
  }
  const icpProfile = clean(query.icpProfile);
  const minIcpScore = Number(query.minIcpScore);
  if (icpProfile && Number.isFinite(minIcpScore)) {
    where.push(`COALESCE((SELECT score FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = ? ORDER BY calculated_at DESC LIMIT 1), -1) >= ?`);
    args.push(icpProfile, minIcpScore);
  }
  const sort = clean(query.sort);
  const orderBy =
    sort === "website_score_asc"
      ? "(SELECT score FROM website_audits wa WHERE wa.lead_id = leads.id) ASC NULLS LAST, leads.created_at DESC"
      : sort === "website_score_desc"
        ? "(SELECT score FROM website_audits wa WHERE wa.lead_id = leads.id) DESC NULLS LAST, leads.created_at DESC"
        : sort === "icp_score_desc" && icpProfile
          ? `(SELECT score FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = '${icpProfile.replace(/'/g, "''")}' ORDER BY calculated_at DESC LIMIT 1) DESC NULLS LAST, leads.created_at DESC`
          : sort === "icp_score_asc" && icpProfile
            ? `(SELECT score FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = '${icpProfile.replace(/'/g, "''")}' ORDER BY calculated_at DESC LIMIT 1) ASC NULLS LAST, leads.created_at DESC`
        : "CASE COALESCE((SELECT level FROM website_opportunity_scores os WHERE os.lead_id = leads.id AND os.profile_key = 'website_opportunity'), 'not_analyzed') WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, (SELECT score FROM website_opportunity_scores os WHERE os.lead_id = leads.id AND os.profile_key = 'website_opportunity') DESC NULLS LAST, leads.created_at DESC";
  return { where, args, orderBy };
}

function cohortCompiled(id: string) {
  const row = db.prepare("SELECT * FROM cohorts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  let definition: unknown;
  try { definition = JSON.parse(String(row.definition_json)); } catch { throw new Error("Cohort definition is not valid JSON."); }
  return { row, compiled: compileCohortDefinition(definition), definition };
}
function cohortPreview(compiled: CompiledCohort, limit: number, offset: number) {
  const reasonSelect = compiled.reasons.map((reason, index) => `CASE WHEN ${reason.sql} THEN ? ELSE '' END AS reason_${index}`).join(", ");
  const sql = `SELECT l.id, l.title, l.category, l.industry_normalized, l.country_code, l.region, l.city, l.website, l.business_email, l.phone, l.contact_status,
    (SELECT score FROM icp_scores s WHERE s.lead_id = l.id ORDER BY calculated_at DESC LIMIT 1) AS icp_score${reasonSelect ? `, ${reasonSelect}` : ""}
    FROM leads l WHERE ${compiled.sql} ORDER BY l.title COLLATE NOCASE, l.id LIMIT ? OFFSET ?`;
  const args: Array<string | number> = [...compiled.reasons.flatMap((reason) => [...reason.args, reason.label]), ...compiled.args, limit, offset];
  const rows = db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
  return rows.map((row) => ({ ...row, reasons: Object.keys(row).filter((key) => key.startsWith("reason_")).map((key) => row[key]).filter(Boolean) }));
}
function cohortCount(compiled: CompiledCohort) { return Number((db.prepare(`SELECT COUNT(*) AS count FROM leads l WHERE ${compiled.sql}`).get(...compiled.args) as { count: number }).count); }

app.get("/api/cohorts", (req, res) => {
  const term = clean(req.query.q).toLowerCase();
  const rows = db.prepare("SELECT * FROM cohorts ORDER BY updated_at DESC").all() as Array<Record<string, unknown>>;
  const result = rows.filter((row) => !term || `${row.name} ${row.description}`.toLowerCase().includes(term)).map((row) => {
    try { return { ...row, definition: JSON.parse(String(row.definition_json)), match_count: cohortCount(compileCohortDefinition(JSON.parse(String(row.definition_json)))) }; } catch { return { ...row, definition: null, match_count: 0, error: "Invalid cohort definition" }; }
  });
  res.json(result);
});
app.post("/api/cohorts", (req, res) => {
  try {
    const name = clean(req.body?.name); if (!name) return res.status(422).json({ error: "Cohort name is required." });
    const definition = compileCohortDefinition(req.body?.definition);
    const now = new Date().toISOString(); const id = randomUUID();
    db.prepare("INSERT INTO cohorts (id, name, description, definition_json, dynamic, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(id, name, clean(req.body?.description), JSON.stringify(req.body.definition), now, now);
    return res.status(201).json({ id, name, description: clean(req.body?.description), definition: req.body.definition, match_count: cohortCount(definition), created_at: now, updated_at: now });
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "Invalid cohort definition." }); }
});
app.patch("/api/cohorts/:id", (req, res) => {
  const current = db.prepare("SELECT * FROM cohorts WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: "Cohort not found." });
  try {
    const name = req.body?.name === undefined ? String(current.name) : clean(req.body.name); const description = req.body?.description === undefined ? String(current.description) : clean(req.body.description);
    const definition = req.body?.definition === undefined ? JSON.parse(String(current.definition_json)) : req.body.definition;
    const compiled = compileCohortDefinition(definition); const now = new Date().toISOString();
    db.prepare("UPDATE cohorts SET name = ?, description = ?, definition_json = ?, updated_at = ? WHERE id = ?").run(name, description, JSON.stringify(definition), now, req.params.id);
    return res.json({ ...current, name, description, definition, match_count: cohortCount(compiled), updated_at: now });
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "Invalid cohort definition." }); }
});
app.post("/api/cohorts/:id/duplicate", (req, res) => {
  const source = db.prepare("SELECT * FROM cohorts WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!source) return res.status(404).json({ error: "Cohort not found." });
  const now = new Date().toISOString(); const id = randomUUID(); const name = clean(req.body?.name) || `${source.name} copy`;
  db.prepare("INSERT INTO cohorts (id, name, description, definition_json, dynamic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, name, String(source.description ?? ""), String(source.definition_json), Number(source.dynamic ?? 1), now, now);
  return res.status(201).json({ id, name, description: source.description, definition: JSON.parse(String(source.definition_json)), match_count: cohortCount(compileCohortDefinition(JSON.parse(String(source.definition_json)))) });
});
app.delete("/api/cohorts/:id", (req, res) => { const result = db.prepare("DELETE FROM cohorts WHERE id = ?").run(req.params.id); if (!result.changes) return res.status(404).json({ error: "Cohort not found." }); return res.json({ deleted: true }); });
app.get("/api/cohorts/:id/preview", (req, res) => {
  try { const found = cohortCompiled(req.params.id); if (!found) return res.status(404).json({ error: "Cohort not found." }); const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100); const offset = Math.max(Number(req.query.offset) || 0, 0); return res.json({ rows: cohortPreview(found.compiled, limit, offset), total: cohortCount(found.compiled), limit, offset, definition: found.definition }); } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "Invalid cohort definition." }); }
});
app.post("/api/cohorts/preview", (req, res) => {
  try { const compiled = compileCohortDefinition(req.body?.definition); const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100); const offset = Math.max(Number(req.body?.offset) || 0, 0); return res.json({ rows: cohortPreview(compiled, limit, offset), total: cohortCount(compiled), limit, offset }); } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "Invalid cohort definition." }); }
});
app.post("/api/cohorts/:id/campaign", (req, res) => {
  try {
    const found = cohortCompiled(req.params.id); if (!found) return res.status(404).json({ error: "Cohort not found." });
    let campaignId = clean(req.body?.campaignId); const now = new Date().toISOString();
    if (campaignId && !db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(campaignId)) return res.status(404).json({ error: "Campaign not found." });
    if (!campaignId) { campaignId = randomUUID(); const name = clean(req.body?.name) || `Cohort · ${String(found.row.name)}`; db.prepare("INSERT INTO saved_searches (id, name, country_code, country_name, region, city, category, query, status, created_at) VALUES (?, ?, '', '', '', '', '', ?, 'saved', ?)").run(campaignId, name, `Cohort: ${String(found.row.name)}`, now); }
    const leads = db.prepare(`SELECT l.id FROM leads l WHERE ${found.compiled.sql}`).all(...found.compiled.args) as Array<{ id: string }>;
    const insert = db.prepare("INSERT INTO campaign_memberships (campaign_id, lead_id, first_seen_at, last_seen_at, source_count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(campaign_id, lead_id) DO UPDATE SET last_seen_at = excluded.last_seen_at");
    for (const lead of leads) insert.run(campaignId, lead.id, now, now);
    return res.status(201).json({ campaignId, added: leads.length, total: leads.length });
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "Could not apply cohort." }); }
});

app.get("/api/lead-intelligence/signals", (_req, res) => {
  res.json(
    db
      .prepare(
        "SELECT * FROM lead_signal_definitions WHERE active = 1 ORDER BY signal_group, label",
      )
      .all(),
  );
});

app.get("/api/icp/profiles", (_req, res) => {
  const profiles = db.prepare(`SELECT p.* FROM icp_profiles p WHERE p.version = (SELECT MAX(version) FROM icp_profiles current WHERE current.profile_key = p.profile_key) ORDER BY p.name`).all() as Array<Record<string, unknown>>;
  res.json(profiles.map((profile) => ({ ...profile, rules: profileRules(String(profile.id)) })));
});

app.get("/api/icp/profiles/:key/history", (req, res) => {
  const profiles = db.prepare("SELECT * FROM icp_profiles WHERE profile_key = ? ORDER BY version DESC").all(clean(req.params.key)) as Array<Record<string, unknown>>;
  res.json(profiles.map((profile) => ({ ...profile, rules: profileRules(String(profile.id)) })));
});

app.post("/api/icp/profiles", (req, res) => {
  const key = clean(req.body?.key).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const name = clean(req.body?.name);
  const rawRules = Array.isArray(req.body?.rules) ? req.body.rules : [];
  if (!key || !name || !rawRules.length) return res.status(422).json({ error: "A profile key, name, and at least one rule are required." });
  if (rawRules.length > 30) return res.status(422).json({ error: "A profile supports at most 30 rules." });
  if (rawRules.some((raw: unknown) => { const rule = raw as Record<string, unknown>; const weight = Number(rule.weight); const confidence = Number(rule.minConfidence ?? 0); return !clean(rule.code) || !Number.isFinite(weight) || weight < 0 || weight > 100 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1; })) return res.status(422).json({ error: "Rules need a code, weight from 0 to 100, and confidence from 0 to 1." });
  const latest = currentIcpProfile(key);
  const now = new Date().toISOString(); const id = randomUUID(); const version = Number(latest?.version ?? 0) + 1;
  db.prepare("INSERT INTO icp_profiles (id, profile_key, name, description, version, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, key, name, clean(req.body?.description), version, req.body?.enabled === false ? 0 : 1, now, now);
  const insert = db.prepare("INSERT INTO icp_profile_rules (id, profile_id, rule_code, label, weight, min_confidence, enabled, config_json, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const [position, rule] of rawRules.entries()) {
    const data = rule as Record<string, unknown>; const code = clean(data.code);
    const weight = Number(data.weight); const confidence = Number(data.minConfidence ?? 0);
    if (!code || !Number.isFinite(weight) || weight < 0 || weight > 100 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return res.status(422).json({ error: "Rules need a code, weight from 0 to 100, and confidence from 0 to 1." });
    insert.run(randomUUID(), id, code, clean(data.label) || code, weight, confidence, data.enabled === false ? 0 : 1, JSON.stringify(data.config && typeof data.config === "object" ? data.config : {}), position);
  }
  res.status(201).json({ id, profile_key: key, version });
});

app.patch("/api/icp/profiles/:key", (req, res) => {
  // Versioned update: retain prior profiles and immutable score explanations.
  const key = clean(req.params.key); const current = currentIcpProfile(key);
  if (!current) return res.status(404).json({ error: "ICP profile was not found." });
  const now = new Date().toISOString(); const id = randomUUID(); const version = Number(current.version) + 1;
  const rawRules = Array.isArray(req.body?.rules) ? req.body.rules : profileRules(String(current.id));
  if (!rawRules.length || rawRules.length > 30) return res.status(422).json({ error: "A profile needs between 1 and 30 rules." });
  if (rawRules.some((raw: unknown) => { const rule = raw as Record<string, unknown>; const weight = Number(rule.weight); const confidence = Number(rule.minConfidence ?? 0); return !clean(rule.code) || !Number.isFinite(weight) || weight < 0 || weight > 100 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1; })) return res.status(422).json({ error: "Rules need a valid code, weight, and minimum confidence." });
  db.prepare("INSERT INTO icp_profiles (id, profile_key, name, description, version, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, key, clean(req.body?.name) || String(current.name), clean(req.body?.description ?? current.description), version, typeof req.body?.enabled === "boolean" ? Number(req.body.enabled) : Number(current.enabled), now, now);
  const insert = db.prepare("INSERT INTO icp_profile_rules (id, profile_id, rule_code, label, weight, min_confidence, enabled, config_json, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const [position, raw] of rawRules.entries()) {
    const rule = raw as Record<string, unknown>; const code = clean(rule.code); const weight = Number(rule.weight); const confidence = Number(rule.minConfidence ?? 0);
    if (!code || !Number.isFinite(weight) || weight < 0 || weight > 100 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return res.status(422).json({ error: "Rules need a valid code, weight, and minimum confidence." });
    insert.run(randomUUID(), id, code, clean(rule.label) || code, weight, confidence, rule.enabled === false ? 0 : 1, JSON.stringify(rule.config && typeof rule.config === "object" ? rule.config : {}), position);
  }
  res.json({ id, profile_key: key, version });
});

app.get("/api/leads/:id/icp-scores", (req, res) => {
  const profileKey = clean(req.query.profileKey);
  const history = req.query.history === "true";
  const sql = history
    ? `SELECT * FROM icp_scores WHERE lead_id = ? ${profileKey ? "AND profile_key = ?" : ""} ORDER BY calculated_at DESC`
    : `SELECT * FROM (SELECT s.*, ROW_NUMBER() OVER (PARTITION BY profile_key ORDER BY calculated_at DESC) AS rn FROM icp_scores s WHERE lead_id = ? ${profileKey ? "AND profile_key = ?" : ""}) WHERE rn = 1 ORDER BY profile_key`;
  const rows = db.prepare(sql).all(...(profileKey ? [req.params.id, profileKey] : [req.params.id])) as Array<Record<string, unknown>>;
  res.json(rows.map((row) => { let explanation: unknown = {}; try { explanation = JSON.parse(String(row.explanation_json)); } catch {} const evidence = db.prepare("SELECT * FROM icp_score_evidence WHERE score_id = ? ORDER BY rule_code, id").all(String(row.id)); return { ...row, explanation, evidence }; }));
});

app.get("/api/leads/:id/icp-outreach-context", (req, res) => {
  const profileKey = clean(req.query.profileKey);
  if (!profileKey) return res.status(422).json({ error: "Select an ICP profile." });
  const row = db.prepare("SELECT * FROM icp_scores WHERE lead_id = ? AND profile_key = ? ORDER BY calculated_at DESC LIMIT 1").get(req.params.id, profileKey) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "This lead has not been scored for the selected profile." });
  let explanation: Record<string, unknown> = {};
  try { explanation = JSON.parse(String(row.explanation_json)) as Record<string, unknown>; } catch { /* score record remains available */ }
  res.json({ leadId: req.params.id, profileKey, profileVersion: row.profile_version, score: row.score, evidenceCoverage: row.evidence_coverage, evidenceConfidence: row.evidence_confidence, calculatedAt: row.calculated_at, ...(explanation.outreachBrief as Record<string, unknown> ?? {}) });
});

app.post("/api/leads/:id/icp-scores", (req, res) => {
  const profileKey = clean(req.body?.profileKey);
  if (!profileKey) return res.status(422).json({ error: "Select an ICP profile." });
  const score = scoreLead(req.params.id, profileKey);
  if (!score) return res.status(404).json({ error: "Lead or enabled ICP profile was not found." });
  res.status(201).json(score);
});

app.post("/api/icp-scores/batch", (req, res) => {
  const profileKey = clean(req.body?.profileKey);
  const leadIds: string[] = Array.isArray(req.body?.leadIds) ? [...new Set((req.body.leadIds as unknown[]).map((item) => clean(item)).filter(Boolean))] : [];
  if (!profileKey || !leadIds.length) return res.status(422).json({ error: "Select an ICP profile and at least one lead." });
  if (!currentIcpProfile(profileKey)) return res.status(404).json({ error: "ICP profile was not found." });
  const runId = randomUUID(); const now = new Date().toISOString();
  db.prepare("INSERT INTO icp_score_runs (id, profile_key, status, total_count, processed_count, created_at) VALUES (?, ?, 'queued', ?, 0, ?)").run(runId, profileKey, leadIds.length, now);
  // Yield between small batches. Scoring remains local and uses only SQLite,
  // but this keeps the API and SSE connection responsive for large selections.
  void (async () => {
    let processed = 0;
    try {
      db.prepare("UPDATE icp_score_runs SET status = 'running' WHERE id = ?").run(runId);
      for (let index = 0; index < leadIds.length; index += 20) {
        for (const leadId of leadIds.slice(index, index + 20)) if (scoreLead(leadId, profileKey, runId)) processed += 1;
        db.prepare("UPDATE icp_score_runs SET processed_count = ? WHERE id = ?").run(processed, runId);
        emitIcpScoreEvent("", profileKey, "running", { runId, processed, total: leadIds.length });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      db.prepare("UPDATE icp_score_runs SET status = 'completed', processed_count = ?, completed_at = ? WHERE id = ?").run(processed, new Date().toISOString(), runId);
      emitIcpScoreEvent("", profileKey, "completed", { runId, processed, total: leadIds.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch scoring failed.";
      db.prepare("UPDATE icp_score_runs SET status = 'failed', processed_count = ?, error = ?, completed_at = ? WHERE id = ?").run(processed, message, new Date().toISOString(), runId);
      emitIcpScoreEvent("", profileKey, "failed", { runId, processed, total: leadIds.length, error: message });
    }
  })();
  res.status(202).json({ runId, profileKey, status: "queued", total: leadIds.length });
});

app.get("/api/icp-scores/runs/:id", (req, res) => {
  const run = db.prepare("SELECT * FROM icp_score_runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Scoring run was not found." });
  res.json(run);
});

app.get("/api/icp-scores/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
  res.write("retry: 2000\\nevent: ready\\ndata: {}\\n\\n"); icpScoreStreams.add(res);
  const heartbeat = setInterval(() => res.write(": keepalive\\n\\n"), 20_000);
  req.on("close", () => { clearInterval(heartbeat); icpScoreStreams.delete(res); });
});

app.get("/api/leads/:id/observations", (req, res) => {
  const latestOnly = req.query.latest === "true";
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const query = latestOnly
    ? `SELECT * FROM (SELECT lo.*, sd.label, sd.signal_group, ROW_NUMBER() OVER (PARTITION BY lo.signal_code ORDER BY lo.observed_at DESC) AS row_number
       FROM lead_observations lo JOIN lead_signal_definitions sd ON sd.code = lo.signal_code WHERE lo.lead_id = ?)
       WHERE row_number = 1 ORDER BY signal_group, observed_at DESC LIMIT ?`
    : `SELECT lo.*, sd.label, sd.signal_group FROM lead_observations lo JOIN lead_signal_definitions sd ON sd.code = lo.signal_code
       WHERE lo.lead_id = ? ORDER BY lo.observed_at DESC LIMIT ?`;
  res.json(db.prepare(query).all(req.params.id, limit));
});

app.get("/api/leads/:id/contacts", (req, res) => {
  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  res.json(db.prepare(`SELECT lc.*, cp.kind, cp.normalized_value, cp.display_value, p.display_name, p.normalized_name
    FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id
    LEFT JOIN people p ON p.id = cp.person_id WHERE lc.lead_id = ?
    ORDER BY lc.is_primary DESC, lc.verification_status = 'verified' DESC, lc.confidence DESC, lc.last_seen_at DESC`).all(req.params.id));
});

app.patch("/api/leads/:id/contacts/:contactId", (req, res) => {
  const contact = db.prepare(`SELECT lc.*, cp.id AS point_id, cp.kind, cp.display_value, cp.normalized_value, p.id AS person_id
    FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id LEFT JOIN people p ON p.id = cp.person_id
    WHERE lc.id = ? AND lc.lead_id = ?`).get(req.params.contactId, req.params.id) as Record<string, unknown> | undefined;
  if (!contact) return res.status(404).json({ error: "Contact was not found for this lead." });
  const status = clean(req.body?.verification_status);
  if (status && !["verified", "possible", "unverified"].includes(status)) return res.status(400).json({ error: "Invalid contact verification status." });
  const now = new Date().toISOString();
  const role = req.body?.role === undefined ? String(contact.role ?? "") : clean(req.body.role);
  const notes = req.body?.notes === undefined ? String(contact.notes ?? "") : String(req.body.notes);
  const display = req.body?.display_value === undefined ? String(contact.display_value ?? "") : clean(req.body.display_value);
  const normalizedDisplay = contact.kind === "email" ? normalizeEmail(display) : contact.kind === "phone" ? display.replace(/[^+\d]/g, "") : contact.kind === "instagram" || contact.kind === "facebook" || contact.kind === "linkedin" ? normalizeSocial(display, contact.kind) : display;
  if (req.body?.display_value !== undefined && !normalizedDisplay) return res.status(400).json({ error: "Contact value is invalid." });
  if (req.body?.is_primary === true) db.prepare("UPDATE lead_contacts SET is_primary = 0 WHERE lead_id = ?").run(req.params.id);
  db.prepare("UPDATE lead_contacts SET role = ?, notes = ?, verification_status = ?, verification_method = ?, is_primary = ?, last_seen_at = ? WHERE id = ? AND lead_id = ?").run(role, notes, status || String(contact.verification_status ?? "unverified"), "manual", req.body?.is_primary === false ? 0 : req.body?.is_primary === true ? 1 : Number(contact.is_primary ?? 0), now, req.params.contactId, req.params.id);
  if (display) db.prepare("UPDATE contact_points SET normalized_value = ?, display_value = ?, updated_at = ? WHERE id = ?").run(normalizedDisplay, display, now, String(contact.point_id));
  if (req.body?.name) {
    const name = clean(req.body.name);
    const normalizedName = normalizeText(name);
    const existingPerson = db.prepare("SELECT id FROM people WHERE normalized_name = ?").get(normalizedName) as { id: string } | undefined;
    const personId = String(contact.person_id ?? existingPerson?.id ?? randomUUID());
    if (existingPerson || contact.person_id) db.prepare("UPDATE people SET display_name = ?, normalized_name = ?, updated_at = ? WHERE id = ?").run(name, normalizedName, now, personId);
    else db.prepare("INSERT INTO people (id, normalized_name, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(personId, normalizedName, name, now, now);
    db.prepare("UPDATE contact_points SET person_id = ?, updated_at = ? WHERE id = ?").run(personId, now, String(contact.point_id));
  }
  synchronizePrimaryContact(req.params.id);
  res.json(db.prepare(`SELECT lc.*, cp.kind, cp.normalized_value, cp.display_value, p.display_name, p.normalized_name FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id LEFT JOIN people p ON p.id = cp.person_id WHERE lc.id = ?`).get(req.params.contactId));
});

app.patch("/api/leads/:id/observations/:observationId", (req, res) => {
  const status = clean(req.body?.verification_status);
  if (!["verified", "possible", "inconclusive"].includes(status)) return res.status(400).json({ error: "Verification status must be verified, possible or inconclusive." });
  const observation = db.prepare("SELECT id FROM lead_observations WHERE id = ? AND lead_id = ?").get(req.params.observationId, req.params.id);
  if (!observation) return res.status(404).json({ error: "Observation was not found for this lead." });
  const confidence = req.body?.confidence === undefined ? undefined : Math.max(0, Math.min(1, Number(req.body.confidence)));
  if (confidence !== undefined && !Number.isFinite(confidence)) return res.status(400).json({ error: "Confidence must be a number between 0 and 1." });
  db.prepare(`UPDATE lead_observations SET verification_status = ?${confidence === undefined ? "" : ", confidence = ?"} WHERE id = ? AND lead_id = ?`).run(...(confidence === undefined ? [status, req.params.observationId, req.params.id] : [status, confidence, req.params.observationId, req.params.id]));
  res.json(db.prepare(`SELECT lo.*, sd.label, sd.signal_group FROM lead_observations lo JOIN lead_signal_definitions sd ON sd.code = lo.signal_code WHERE lo.id = ?`).get(req.params.observationId));
});

app.get("/api/leads/cities", (req, res) => {
  const term = clean(req.query.q);
  const rows = db
    .prepare(
      `SELECT city, region, country_code, COUNT(*) AS lead_count FROM leads
       WHERE city != '' ${term ? "AND city LIKE ?" : ""}
       GROUP BY city, region, country_code ORDER BY lead_count DESC, city ASC LIMIT 250`,
    )
    .all(...(term ? [`%${term}%`] : []));
  res.json(rows);
});

app.get("/api/lead-collections/searches", (_req, res) => {
  const rows = listSearches().map((search: any) => ({
    id: search.id,
    name: search.name,
    category: search.category,
    country_name: search.country_name,
    status: search.status,
    lead_count: search.qualification_progress.qualified,
    all_lead_count: search.qualification_progress.extracted,
    enriched_count: search.qualification_progress.enriched,
    pending_count: search.qualification_progress.pending,
    job_count: search.progress.total,
    qualification: search.qualification,
  }));
  const unknown = db
    .prepare(
      `SELECT COUNT(*) AS lead_count FROM leads l WHERE NOT EXISTS (SELECT 1 FROM lead_sources ls WHERE ls.lead_id = l.id)`,
    )
    .get();
  res.json({
    collections: rows,
    unknownSourceCount: Number((unknown as { lead_count: number }).lead_count),
  });
});

app.get("/api/lead-collections/industries", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT industry_normalized AS industry, COUNT(*) AS lead_count,
    GROUP_CONCAT(DISTINCT category) AS categories FROM leads GROUP BY industry_normalized ORDER BY lead_count DESC, industry ASC`,
    )
    .all();
  res.json(rows);
});

type LeadArchiveRow = {
  id: string;
  title: string;
  audit_status: string;
  task_status: string | null;
  in_crm: number;
  archived_at: string;
};

type LeadArchivePreviewRow = LeadArchiveRow & { decision: LeadArchiveDecision };

function leadArchivePreview(): { rows: LeadArchivePreviewRow[]; summary: Record<string, number> } {
  const records = db.prepare(`SELECT l.id, l.title, COALESCE(a.status, 'not_analyzed') AS audit_status,
    (SELECT t.status FROM website_audit_tasks t WHERE t.lead_id = l.id ORDER BY t.updated_at DESC LIMIT 1) AS task_status,
    CASE WHEN EXISTS (SELECT 1 FROM outreach_pipeline p WHERE p.lead_id = l.id) THEN 1 ELSE 0 END AS in_crm,
    COALESCE(l.archived_at, '') AS archived_at
    FROM leads l LEFT JOIN website_audits a ON a.lead_id = l.id`).all() as LeadArchiveRow[];
  const rows = records.map((record) => ({
    ...record,
    decision: decideLeadArchive({
      auditStatus: record.audit_status,
      taskStatus: record.task_status,
      inCrm: record.in_crm === 1,
      archived: Boolean(record.archived_at),
    }),
  }));
  const summary: Record<string, number> = { total: rows.length, completed: 0, protected_crm: 0, deferred_active: 0, already_archived: 0, archive_total: 0 };
  for (const row of rows) {
    if (row.decision.action === "retain" && row.decision.reason === "completed") summary.completed += 1;
    else if (row.decision.action === "protected") summary.protected_crm += 1;
    else if (row.decision.action === "defer") summary.deferred_active += 1;
    else if (row.decision.action === "retain") summary.already_archived += 1;
    else if (row.decision.action === "archive") {
      summary.archive_total += 1;
      summary[`archive_${row.decision.reason}`] = (summary[`archive_${row.decision.reason}`] ?? 0) + 1;
    }
  }
  return { rows, summary };
}

// Read-only dry-run for the maintenance workflow. It deliberately exposes the
// reason for each candidate so the UI or an operator can review it before use.
app.get("/api/leads/archive-incomplete-audits/preview", (_req, res) => {
  const preview = leadArchivePreview();
  res.json({ summary: preview.summary, candidates: preview.rows.filter((row) => row.decision.action === "archive" || row.decision.action === "defer" || row.decision.action === "protected").map((row) => ({
    id: row.id, title: row.title, auditStatus: row.audit_status, taskStatus: row.task_status, decision: row.decision,
  })) });
});

// A guarded logical archive: neither a CRM row nor an audit that became active
// or completed after the preview can be hidden by this operation.
app.post("/api/leads/archive-incomplete-audits", (_req, res) => {
  const preview = leadArchivePreview();
  const candidates = preview.rows.filter((row) => row.decision.action === "archive");
  const now = new Date().toISOString();
  const archive = db.prepare(`UPDATE leads SET archived_at = ?, archive_reason = ?, updated_at = ?
    WHERE id = ? AND COALESCE(archived_at, '') = ''
      AND NOT EXISTS (SELECT 1 FROM outreach_pipeline p WHERE p.lead_id = leads.id)
      AND COALESCE((SELECT status FROM website_audits a WHERE a.lead_id = leads.id), 'not_analyzed') NOT IN ('completed', 'queued', 'analyzing', 'running', 'processing')
      AND COALESCE((SELECT status FROM website_audit_tasks t WHERE t.lead_id = leads.id ORDER BY t.updated_at DESC LIMIT 1), '') NOT IN ('queued', 'analyzing', 'running', 'processing')`);
  let archived = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const candidate of candidates)
      archived += Number(archive.run(now, candidate.decision.reason, now, candidate.id).changes);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ archived, preview: preview.summary });
});

// Recovery is deliberately explicit and does not enqueue an audit. The record
// keeps its original evidence, campaign memberships and CRM history intact.
app.post("/api/leads/:id/restore", (req, res) => {
  const result = db.prepare("UPDATE leads SET archived_at = '', archive_reason = '', updated_at = ? WHERE id = ? AND COALESCE(archived_at, '') != ''")
    .run(new Date().toISOString(), req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Archived lead not found." });
  res.json({ restored: true });
});

// Processing area for newly discovered businesses. These records are durable
// and diagnosable, but deliberately stay out of the main Leads Workspace.
app.get("/api/qualification/candidates", (req, res) => {
  const searchId = clean(req.query.searchId);
  const rows = db.prepare(`SELECT l.id, l.title, l.website, l.qualification_status, l.qualification_stage, l.qualification_error, l.created_at,
    COALESCE(a.status, 'not_analyzed') AS audit_status,
    (SELECT status FROM website_audit_tasks wat WHERE wat.lead_id = l.id ORDER BY wat.updated_at DESC LIMIT 1) AS website_audit_task_status,
    (SELECT stage FROM website_audit_tasks wat WHERE wat.lead_id = l.id ORDER BY wat.updated_at DESC LIMIT 1) AS website_audit_task_stage,
    (SELECT error FROM website_audit_tasks wat WHERE wat.lead_id = l.id ORDER BY wat.updated_at DESC LIMIT 1) AS website_audit_task_error,
    (SELECT updated_at FROM website_audit_tasks wat WHERE wat.lead_id = l.id ORDER BY wat.updated_at DESC LIMIT 1) AS website_audit_task_updated_at,
    (SELECT status FROM visual_ux_tasks vt WHERE vt.lead_id = l.id ORDER BY vt.updated_at DESC LIMIT 1) AS visual_task_status,
    (SELECT status FROM visual_ux_assessments vu WHERE vu.lead_id = l.id ORDER BY vu.created_at DESC LIMIT 1) AS visual_status
    FROM leads l LEFT JOIN website_audits a ON a.lead_id = l.id
    WHERE l.qualification_status != 'qualified' AND COALESCE(l.archived_at, '') = ''
      ${searchId ? "AND EXISTS (SELECT 1 FROM lead_sources ls WHERE ls.lead_id = l.id AND ls.search_id = ?)" : ""}
    ORDER BY l.created_at DESC`).all(...(searchId ? [searchId] : []));
  res.json(rows);
});

app.get("/api/leads", (req, res) => {
  const filter = leadFilter(req.query);
  const icpProfile = clean(req.query.icpProfile);
  const query = `SELECT leads.*,
    COALESCE((SELECT status FROM website_audits wa WHERE wa.lead_id = leads.id), 'not_analyzed') AS website_audit_status,
    (SELECT score FROM website_audits wa WHERE wa.lead_id = leads.id) AS website_score,
    (SELECT COUNT(*) FROM website_audit_issues wai JOIN website_audits wa ON wa.id = wai.audit_id WHERE wa.lead_id = leads.id) AS website_issue_count,
    COALESCE((SELECT level FROM website_opportunity_scores os WHERE os.lead_id = leads.id AND os.profile_key = 'website_opportunity'), 'not_analyzed') AS opportunity_level,
    (SELECT score FROM website_opportunity_scores os WHERE os.lead_id = leads.id AND os.profile_key = 'website_opportunity') AS opportunity_score,
    (SELECT issue_count FROM website_opportunity_scores os WHERE os.lead_id = leads.id AND os.profile_key = 'website_opportunity') AS opportunity_issue_count,
    (SELECT status FROM website_opportunity_scores os WHERE os.lead_id = leads.id AND os.profile_key = 'website_opportunity') AS opportunity_status,
    (SELECT status FROM website_audit_tasks wat WHERE wat.lead_id = leads.id ORDER BY wat.updated_at DESC LIMIT 1) AS website_audit_task_status,
    (SELECT status FROM visual_ux_tasks vut WHERE vut.lead_id = leads.id ORDER BY vut.updated_at DESC LIMIT 1) AS visual_ux_task_status,
    (SELECT status FROM visual_ux_assessments vua WHERE vua.lead_id = leads.id ORDER BY vua.created_at DESC LIMIT 1) AS visual_ux_status,
    ${icpProfile ? `(SELECT score FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = ? ORDER BY calculated_at DESC LIMIT 1) AS icp_score,
    (SELECT evidence_coverage FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = ? ORDER BY calculated_at DESC LIMIT 1) AS icp_evidence_coverage,` : "NULL AS icp_score, NULL AS icp_evidence_coverage,"}
    ${icpProfile ? `(SELECT evidence_confidence FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = ? ORDER BY calculated_at DESC LIMIT 1) AS icp_evidence_confidence,` : "NULL AS icp_evidence_confidence,"}
    (SELECT search_execution_id FROM lead_sources ls WHERE ls.lead_id = leads.id ORDER BY discovered_at DESC LIMIT 1) AS source_search_execution_id,
    (SELECT s.name FROM lead_sources ls JOIN saved_searches s ON s.id = ls.search_id WHERE ls.lead_id = leads.id ORDER BY ls.discovered_at DESC LIMIT 1) AS source_search_name,
    (SELECT p.status FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS pipeline_status,
    (SELECT p.channel FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS pipeline_channel,
    CASE WHEN EXISTS (SELECT 1 FROM lead_sources ls WHERE ls.lead_id = leads.id AND ls.was_inserted = 1 AND ls.search_execution_id = (SELECT id FROM search_executions ORDER BY started_at DESC LIMIT 1)) THEN 'New' ELSE '' END AS new_status,
    CASE WHEN EXISTS (
      SELECT 1 FROM lead_sources ls WHERE ls.lead_id = leads.id AND ls.was_inserted = 1
      AND ls.search_execution_id = (SELECT id FROM search_executions ORDER BY started_at DESC LIMIT 1)
    ) THEN 1 ELSE 0 END AS is_new_from_latest_search
    FROM leads ${filter.where.length ? `WHERE ${filter.where.join(" AND ")}` : ""} ORDER BY ${filter.orderBy}`;
  res.json(db.prepare(query).all(...(icpProfile ? [icpProfile, icpProfile, icpProfile, ...filter.args] : filter.args)));
});

const pipelineStatuses = new Set([
  "not_contacted",
  "contacted",
  "replied",
  "interested",
  "proposal_sent",
  "won",
  "lost",
]);
const pipelineChannels = new Set([
  "instagram",
  "email",
  "facebook",
  "linkedin",
  "other",
  "",
]);
const websiteOpportunities = new Set([
  "no_website",
  "needs_redesign",
  "broken_website",
  "review_later",
  "needs_review",
]);
const activityTypes = new Set([
  "message_sent",
  "response_received",
  "proposal_sent",
  "note_added",
]);

app.get("/api/pipeline", (req, res) => {
  const where: string[] = [];
  const args: string[] = [];
  for (const [key, column] of [
    ["status", "p.status"],
    ["channel", "p.channel"],
    ["region", "l.region"],
  ] as const) {
    const value = clean(req.query[key]);
    if (value) {
      where.push(`${column} = ?`);
      args.push(value);
    }
  }
  const industry = clean(req.query.industry);
  if (industry) {
    where.push("l.industry_normalized = ?");
    args.push(normalizeIndustry(industry));
  }
  const source = clean(req.query.searchId);
  if (source) {
    where.push(
      "EXISTS (SELECT 1 FROM lead_sources ls WHERE ls.lead_id = l.id AND ls.search_id = ?)",
    );
    args.push(source);
  }
  const term = clean(req.query.q);
  if (term) {
    where.push(
      "(l.title LIKE ? OR l.category LIKE ? OR l.city LIKE ? OR l.address LIKE ?)",
    );
    args.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
  }
  const rows = db
    .prepare(
      `SELECT l.*, p.status AS pipeline_status, p.channel AS pipeline_channel, p.notes AS pipeline_notes, p.last_contact_at, p.follow_up_at, p.website_opportunity, p.created_at AS pipeline_created_at
    FROM outreach_pipeline p JOIN leads l ON l.id = p.lead_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.updated_at DESC`,
    )
    .all(...args);
  res.json(rows);
});

app.post("/api/pipeline/batch", (req, res) => {
  const ids: string[] = Array.isArray(req.body?.leadIds)
    ? req.body.leadIds.map(clean).filter(Boolean)
    : [];
  if (!ids.length)
    return res.status(422).json({ error: "Select at least one lead." });
  const status = pipelineStatuses.has(clean(req.body?.status))
    ? clean(req.body?.status)
    : "not_contacted";
  const now = new Date().toISOString();
  let added = 0;
  const lead = db.prepare("SELECT id FROM leads WHERE id = ?");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO outreach_pipeline (lead_id, status, channel, notes, last_contact_at, created_at, updated_at) VALUES (?, ?, '', '', '', ?, ?)`,
  );
  for (const id of [...new Set(ids)])
    if (lead.get(id) && insert.run(id, status, now, now).changes) added += 1;
  res.status(201).json({ added });
});

app.post("/api/crm-email/batch", (req, res) => {
  const ids: string[] = Array.isArray(req.body?.leadIds) ? [...new Set((req.body.leadIds as unknown[]).map(clean).filter(Boolean))] : [];
  if (!ids.length) return res.status(422).json({ error: "Select at least one lead." });
  const now = new Date().toISOString(); let crmAdded = 0, emailAdded = 0, emailSkipped = 0;
  const lead = db.prepare("SELECT id FROM leads WHERE id = ?");
  const crm = db.prepare("INSERT OR IGNORE INTO outreach_pipeline (lead_id,status,channel,notes,last_contact_at,created_at,updated_at) VALUES (?, 'not_contacted', '', '', '', ?, ?)");
  const email = db.prepare("INSERT OR IGNORE INTO global_email_leads (lead_id,status,created_at,updated_at) VALUES (?, 'ready', ?, ?)");
  for (const id of ids) if (lead.get(id)) {
    crmAdded += Number(crm.run(id, now, now).changes);
    if (outreachRecipient(id)) emailAdded += Number(email.run(id, now, now).changes);
    else emailSkipped += 1;
  }
  res.status(201).json({ crmAdded, emailAdded, emailSkipped, total: ids.length });
});

function emailScopeAllows(leadId: string, campaignId = "") {
  return campaignId ? campaignLeadExists(campaignId, leadId) : globalEmailLeadExists(leadId);
}

function ensureGlobalEmailLead(leadId: string) {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO global_email_leads (lead_id,status,created_at,updated_at) VALUES (?, 'ready', ?, ?)").run(leadId, now, now);
}

app.get("/api/emails", (req, res) => {
  const campaignId = clean(req.query.campaignId);
  if (campaignId && !db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(campaignId)) return res.status(404).json({ error: "Campaign not found." });
  const membership = campaignId ? "FROM campaign_memberships cm JOIN leads l ON l.id = cm.lead_id LEFT JOIN global_email_leads g ON g.lead_id = l.id" : "FROM global_email_leads g JOIN leads l ON l.id=g.lead_id";
  const where = campaignId ? "WHERE cm.campaign_id = ? AND COALESCE(os.level, 'insufficient_evidence') IN ('high', 'medium', 'low')" : "WHERE COALESCE(os.level, 'insufficient_evidence') IN ('high', 'medium', 'low')";
  const rows = db.prepare(`SELECT l.*, COALESCE(g.status, 'ready') AS preparation_status, COALESCE(p.status, 'not_contacted') AS crm_status,
    COALESCE(d.status, 'not_generated') AS draft_status, COALESCE(d.subject, '') AS draft_subject,
    COALESCE(d.updated_at, '') AS draft_updated_at,
    COALESCE(os.level, 'insufficient_evidence') AS opportunity_level, os.score AS opportunity_score,
    COALESCE(os.issue_count, 0) AS opportunity_issue_count,
    CASE
      WHEN COALESCE(p.status, '') IN ('replied', 'interested', 'proposal_sent', 'won', 'lost') THEN 0
      WHEN COALESCE(p.status, '') = 'contacted' OR COALESCE(d.status, '') = 'sent' THEN 1
      ELSE 2
    END AS relationship_rank
    ${membership}
    LEFT JOIN outreach_pipeline p ON p.lead_id=l.id
    LEFT JOIN global_email_drafts d ON d.lead_id=l.id
    LEFT JOIN website_opportunity_scores os ON os.lead_id = l.id AND os.profile_key = 'website_opportunity'
    ${where}
    ORDER BY relationship_rank ASC,
      CASE COALESCE(os.level, 'insufficient_evidence') WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END ASC,
      COALESCE(os.score, -1) DESC, l.title COLLATE NOCASE`).all(...(campaignId ? [campaignId] : [])) as Array<Record<string, unknown>>;
  // Never surface a research candidate in the actionable Outreach workspace
  // until the persisted primary contact is verified and commercially eligible.
  res.json(rows.filter((row) => Boolean(outreachRecipient(String(row.id)))));
});

function globalEmailLeadExists(leadId: string) { return Boolean(db.prepare("SELECT 1 FROM global_email_leads WHERE lead_id = ?").get(leadId)); }
function commercialFocusForLead(leadId: string) {
  const issues = db.prepare(`SELECT i.id, i.category, i.severity, i.evidence, i.verification_status
    FROM website_audit_issues i JOIN website_audits a ON a.id = i.audit_id
    WHERE a.lead_id = ?`).all(leadId) as Array<{ id: string; category: string; severity: string; evidence: string; verification_status: string }>;
  const visual = db.prepare(`SELECT id, redesign_potential, summary FROM visual_ux_assessments
    WHERE lead_id = ? AND status = 'completed' AND approved = 1 ORDER BY created_at DESC LIMIT 1`).get(leadId) as { id: string; redesign_potential: string; summary: string } | undefined;
  return selectCommercialFocus([
    ...issues.map((issue) => ({ id: `audit:${issue.id}`, category: issue.category, severity: issue.severity, evidence: issue.evidence, verificationStatus: issue.verification_status })),
    ...(visual ? [{ id: `visual:${visual.id}`, category: "visual", severity: visual.redesign_potential, evidence: visual.summary, subjective: true, redesignPotential: visual.redesign_potential }] : []),
  ]);
}
function globalDraftRow(leadId: string): Record<string, any> {
  const row = db.prepare("SELECT * FROM global_email_drafts WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
  return row ? { ...row, service_override: Boolean(row.service_override), usage: jsonValue(row.usage_json, {}), evidence: jsonValue(row.evidence_json, []), history: jsonValue(row.history_json, []) } : { lead_id: leadId, subject: "", body: "", language: "", tone: "professional", service: "", service_override: false, guidance: "", status: "not_generated", evidence: [], history: [] };
}
function globalDraftResponse(leadId: string) {
  const focus = commercialFocusForLead(leadId);
  return { ...globalDraftRow(leadId), recommended_service: focus.label, recommended_focus: focus };
}
function saveGlobalDraft(leadId: string, input: { subject?: string; body?: string; language?: string; tone?: string; service?: string; serviceOverride?: boolean; guidance?: string; provider?: string; model?: string; usage?: Record<string, unknown>; evidence?: unknown[]; historyEntry?: Record<string, unknown>; status?: string }) {
  const previous = globalDraftRow(leadId); const now = new Date().toISOString();
  const subject = clean(input.subject ?? previous.subject); const rawBody = normalizeEmailBody(input.body ?? previous.body); const body = rawBody ? applySignature(rawBody) : "";
  const history = [...(previous.history as unknown[])]; if (input.historyEntry) history.unshift(input.historyEntry);
  db.prepare(`INSERT INTO global_email_drafts (id,lead_id,subject,body,language,tone,service,service_override,status,provider,model,usage_json,evidence_json,guidance,history_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(lead_id) DO UPDATE SET subject=excluded.subject,body=excluded.body,language=excluded.language,tone=excluded.tone,service=excluded.service,service_override=excluded.service_override,status=excluded.status,provider=excluded.provider,model=excluded.model,usage_json=excluded.usage_json,evidence_json=excluded.evidence_json,guidance=excluded.guidance,history_json=excluded.history_json,updated_at=excluded.updated_at`)
    .run(String(previous.id ?? randomUUID()), leadId, subject, body, input.language ?? previous.language ?? "", input.tone ?? (previous.tone || "professional"), input.service ?? (previous.service || ""), input.serviceOverride === undefined ? Number(Boolean(previous.service_override)) : Number(input.serviceOverride), input.status ?? (body ? "draft" : "not_generated"), input.provider ?? (previous.provider || ""), input.model ?? (previous.model || ""), JSON.stringify(input.usage ?? previous.usage ?? {}), JSON.stringify(input.evidence ?? previous.evidence ?? []), safeOutreachGuidance(input.guidance ?? previous.guidance), JSON.stringify(history), String(previous.created_at ?? now), now);
  db.prepare("UPDATE global_email_leads SET status = ?, updated_at = ? WHERE lead_id = ?").run(body ? "draft_ready" : "ready", now, leadId);
  return globalDraftRow(leadId);
}
app.get("/api/emails/:leadId/draft", (req, res) => {
  const campaignId = clean(req.query.campaignId);
  if (!emailScopeAllows(req.params.leadId, campaignId)) return res.status(404).json({ error: campaignId ? "Lead is not in this campaign." : "Lead is not in Global Emails." });
  res.json(globalDraftResponse(req.params.leadId));
});

app.patch("/api/emails/:leadId/draft", (req, res) => {
  const campaignId = clean(req.body?.campaignId ?? req.query.campaignId);
  if (!emailScopeAllows(req.params.leadId, campaignId)) return res.status(404).json({ error: campaignId ? "Lead is not in this campaign." : "Lead is not in Global Emails." });
  ensureGlobalEmailLead(req.params.leadId);
  const previous = globalDraftRow(req.params.leadId);
  saveGlobalDraft(req.params.leadId, { subject: clean(req.body?.subject ?? previous.subject), body: normalizeEmailBody(req.body?.body ?? previous.body), language: req.body?.language === "pt-BR" ? "pt-BR" : req.body?.language === "en" ? "en" : previous.language, tone: validTone(req.body?.tone, validTone(previous.tone)), service: clean(req.body?.service ?? previous.service), serviceOverride: typeof req.body?.serviceOverride === "boolean" ? req.body.serviceOverride : Boolean(previous.service_override), guidance: safeOutreachGuidance(req.body?.guidance ?? previous.guidance), historyEntry: req.body?.recordHistory ? { subject: clean(req.body?.subject ?? previous.subject), body: normalizeEmailBody(req.body?.body ?? previous.body), guidance: safeOutreachGuidance(req.body?.guidance ?? previous.guidance), at: new Date().toISOString(), source: "manual" } : undefined });
  res.json(globalDraftResponse(req.params.leadId));
});

app.post("/api/emails/:leadId/sent", (req, res) => {
  const campaignId = clean(req.body?.campaignId);
  if (!emailScopeAllows(req.params.leadId, campaignId)) return res.status(404).json({ error: campaignId ? "Lead is not in this campaign." : "Lead is not in Global Emails." });
  try {
    requireOutreachRecipient(req.params.leadId);
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "No eligible commercial email is available." }); }
  ensureGlobalEmailLead(req.params.leadId);
  const draft = globalDraftRow(req.params.leadId);
  if (!clean(draft.subject) || !clean(draft.body)) return res.status(422).json({ error: "Only a ready draft can be marked as sent." });
  const sentAt = clean(req.body?.sentAt) || new Date().toISOString();
  const now = new Date().toISOString();
  db.prepare("UPDATE global_email_drafts SET status = 'sent', sent_at = ?, updated_at = ? WHERE lead_id = ?").run(sentAt, now, req.params.leadId);
  db.prepare("UPDATE global_email_leads SET status = 'sent', updated_at = ? WHERE lead_id = ?").run(now, req.params.leadId);
  db.prepare(`INSERT INTO outreach_pipeline (lead_id, status, channel, notes, last_contact_at, created_at, updated_at)
    VALUES (?, 'contacted', 'email', ?, ?, ?, ?)
    ON CONFLICT(lead_id) DO UPDATE SET status = 'contacted', channel = 'email', notes = excluded.notes, last_contact_at = excluded.last_contact_at, updated_at = excluded.updated_at`)
    .run(req.params.leadId, String(req.body?.notes ?? ""), sentAt, now, now);
  db.prepare("INSERT INTO outreach_activities (id, lead_id, activity_type, channel, note, happened_at, created_at) VALUES (?, ?, 'contacted', 'email', ?, ?, ?)")
    .run(randomUUID(), req.params.leadId, String(req.body?.notes ?? ""), sentAt, now);
  return res.json({ draft: globalDraftResponse(req.params.leadId), sentAt, crmStatus: "contacted" });
});

function globalGenerationOptions(input: Record<string, unknown> | undefined): OutreachOptions | null {
  if (input?.language !== "en" && input?.language !== "pt-BR") return null;
  return outreachOptions(input);
}
const cancelledGlobalEmailRuns = new Set<string>();
const globalEmailRunControllers = new Map<string, Set<AbortController>>();
function orderedEmailLeadIds(campaignId = "", pendingOnly = false) {
  const membership = campaignId ? "FROM campaign_memberships cm JOIN leads l ON l.id = cm.lead_id" : "FROM global_email_leads g JOIN leads l ON l.id = g.lead_id";
  // "Generate all pending" is deliberately narrower than "has no draft": a
  // lead already being worked in the CRM, or explicitly marked sent, must not
  // be brought back into a bulk generation run without an explicit selection.
  const where = `${campaignId ? "cm.campaign_id = ?" : "1=1"} AND COALESCE(os.level, 'insufficient_evidence') IN ('high', 'medium', 'low')${pendingOnly ? " AND COALESCE(TRIM(d.body), '') = '' AND COALESCE(d.status, '') != 'sent' AND COALESCE(p.status, '') NOT IN ('contacted', 'replied', 'interested', 'proposal_sent', 'won', 'lost')" : ""}`;
  return (db.prepare(`SELECT l.id ${membership}
    LEFT JOIN outreach_pipeline p ON p.lead_id = l.id
    LEFT JOIN global_email_drafts d ON d.lead_id = l.id
    LEFT JOIN website_opportunity_scores os ON os.lead_id = l.id AND os.profile_key = 'website_opportunity'
    WHERE ${where}
    ORDER BY CASE WHEN COALESCE(p.status, '') IN ('replied', 'interested', 'proposal_sent', 'won', 'lost') THEN 0 WHEN COALESCE(p.status, '') = 'contacted' OR COALESCE(d.status, '') = 'sent' THEN 1 ELSE 2 END,
      CASE COALESCE(os.level, 'insufficient_evidence') WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
    COALESCE(os.score, -1) DESC, l.title COLLATE NOCASE`).all(...(campaignId ? [campaignId] : [])) as Array<{ id: string }>).map((row) => row.id).filter((leadId) => Boolean(outreachRecipient(leadId)));
}
async function generateGlobalDraft(leadId: string, options: OutreachOptions, regenerate = false, signal?: AbortSignal, campaignId = "") {
  if (!emailScopeAllows(leadId, campaignId)) throw new Error(campaignId ? "Lead is not in this campaign." : "Lead is not in Global Emails.");
  requireOutreachEvidence(leadId);
  requireOutreachRecipient(leadId);
  ensureGlobalEmailLead(leadId);
  const existing = globalDraftRow(leadId);
  if (clean(existing.body) && !regenerate) throw new Error("A saved draft already exists. Use Regenerate to replace it.");
  const context = baseOutreachContext(leadId); if (!context) throw new Error("Lead no longer exists.");
  const focus = commercialFocusForLead(leadId);
  const service = existing.service_override && clean(existing.service) ? clean(existing.service) : strategicOutreachService;
  const otherSubjects = db.prepare("SELECT subject FROM global_email_drafts WHERE lead_id != ? AND trim(subject) != '' ORDER BY updated_at DESC LIMIT 24").all(leadId) as Array<{ subject: string }>;
  const previousSubjects = [clean(existing.subject), ...(Array.isArray(existing.history) ? existing.history.map((item: any) => clean(item?.subject)) : []), ...otherSubjects.map((item) => clean(item.subject))].filter(Boolean).slice(0, 24);
  const effectiveOptions = { ...options, service, guidance: safeOutreachGuidance(options.guidance) || safeOutreachGuidance(existing.guidance), evidenceIds: options.evidenceIds.length ? options.evidenceIds : focus.evidenceIds, previousSubjects };
  requireConcreteOutreachEvidence(context, effectiveOptions);
  const generated = finalizeGlobalOutreach(await generateOutreach(context, effectiveOptions, signal), context, leadId, effectiveOptions.language);
  saveGlobalDraft(leadId, { ...effectiveOptions, serviceOverride: Boolean(existing.service_override), ...generated, evidence: evidenceForOutreach(context, effectiveOptions), historyEntry: { at: new Date().toISOString(), action: regenerate ? "regenerate" : "generate", ...effectiveOptions, provider: generated.provider, model: generated.model, usage: generated.usage } });
  console.info(`[outreach] persisted lead=${leadId}`);
  return { draft: globalDraftResponse(leadId), evidence: evidenceForOutreach(context, effectiveOptions) };
}
app.post("/api/emails/:leadId/generate", async (req, res) => {
  const options = globalGenerationOptions(req.body);
  if (!options) return res.status(422).json({ error: "Choose an email language before generating." });
  const controller = new AbortController();
  req.on("aborted", () => controller.abort("cancelled"));
  const campaignId = clean(req.body?.campaignId);
  try { return res.json(await generateGlobalDraft(req.params.leadId, options, req.body?.regenerate === true, controller.signal, campaignId)); }
  catch (error) { return sendOutreachError(res, error, "Could not generate email draft."); }
});
app.get("/api/emails/runs/:id", (req, res) => {
  const run = db.prepare("SELECT * FROM global_email_generation_runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Email generation run not found." });
  return res.json({ run, items: db.prepare("SELECT * FROM global_email_generation_items WHERE run_id = ? ORDER BY id").all(req.params.id) });
});
app.post("/api/emails/runs/:id/cancel", (req, res) => {
  if (!db.prepare("SELECT id FROM global_email_generation_runs WHERE id = ?").get(req.params.id)) return res.status(404).json({ error: "Email generation run not found." });
  cancelledGlobalEmailRuns.add(req.params.id);
  for (const controller of globalEmailRunControllers.get(req.params.id) ?? []) controller.abort("cancelled");
  db.prepare("UPDATE global_email_generation_runs SET status = 'cancelling', updated_at = ? WHERE id = ? AND status IN ('queued', 'running')").run(new Date().toISOString(), req.params.id);
  return res.json({ ok: true });
});
async function processGlobalEmailRun(runId: string, leadIds: string[], options: OutreachOptions, campaignId = "", regenerateExisting = false) {
  db.prepare("UPDATE global_email_generation_runs SET status = 'running', updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (cancelledGlobalEmailRuns.has(runId)) return;
      const leadId = leadIds[cursor++]; if (!leadId) return;
      db.prepare("UPDATE global_email_generation_items SET status = 'running', started_at = ? WHERE run_id = ? AND lead_id = ?").run(new Date().toISOString(), runId, leadId);
      const controller = new AbortController();
      const controllers = globalEmailRunControllers.get(runId) ?? new Set<AbortController>(); controllers.add(controller); globalEmailRunControllers.set(runId, controllers);
      try {
        await generateGlobalDraft(leadId, options, regenerateExisting, controller.signal, campaignId);
        db.prepare("UPDATE global_email_generation_items SET status = 'completed', completed_at = ? WHERE run_id = ? AND lead_id = ?").run(new Date().toISOString(), runId, leadId);
        db.prepare("UPDATE global_email_generation_runs SET completed = completed + 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
      } catch (error) {
        const cancelled = error instanceof OutreachGenerationError && error.code === "cancelled";
        db.prepare("UPDATE global_email_generation_items SET status = ?, error = ?, completed_at = ? WHERE run_id = ? AND lead_id = ?").run(cancelled ? "cancelled" : "failed", error instanceof Error ? error.message : "Generation failed.", new Date().toISOString(), runId, leadId);
        if (!cancelled) db.prepare("UPDATE global_email_generation_runs SET failed = failed + 1, error = ?, updated_at = ? WHERE id = ?").run(error instanceof Error ? error.message : "Generation failed.", new Date().toISOString(), runId);
      } finally { controllers.delete(controller); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(outreachConcurrency, leadIds.length) }, worker));
  const counts = db.prepare("SELECT completed, failed FROM global_email_generation_runs WHERE id = ?").get(runId) as { completed: number; failed: number };
  const cancelled = cancelledGlobalEmailRuns.has(runId) ? Math.max(leadIds.length - counts.completed - counts.failed, 0) : 0;
  const status = cancelled ? "cancelled" : counts.failed ? "completed_with_errors" : "completed";
  db.prepare("UPDATE global_email_generation_runs SET status = ?, cancelled = ?, updated_at = ? WHERE id = ?").run(status, cancelled, new Date().toISOString(), runId);
  cancelledGlobalEmailRuns.delete(runId);
  globalEmailRunControllers.delete(runId);
}
app.post("/api/emails/batch", (req, res) => {
  const options = globalGenerationOptions(req.body);
  if (!options) return res.status(422).json({ error: "Choose an email language before generating." });
  const campaignId = clean(req.body?.campaignId);
  if (campaignId && !db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(campaignId)) return res.status(404).json({ error: "Campaign not found." });
  const inScope = (leadId: string) => emailScopeAllows(leadId, campaignId);
  const requested = Array.isArray(req.body?.leadIds) ? [...new Set((req.body.leadIds as unknown[]).map(clean).filter(inScope))] : [];
  const allPending = req.body?.allPending === true;
  const regenerateExisting = req.body?.regenerateExisting === true;
  const allReady = req.body?.allReady === true;
  const priority = orderedEmailLeadIds(campaignId, allPending && !allReady);
  const requestedSet = new Set(allReady ? priority : allPending ? priority : requested);
  const leadIds = priority.filter((leadId) => requestedSet.has(leadId));
  const skipped: string[] = [];
  const protectedSkipped: Array<{ leadId: string; reason: string }> = [];
  const pending = leadIds.filter((leadId) => {
    const draft = globalDraftRow(leadId);
    const hasBody = Boolean(clean(draft.body));
    const protectedOutbox = db.prepare("SELECT status FROM outreach_outbox WHERE lead_id = ? AND status IN ('pending_review','approved','sending','sent') LIMIT 1").get(leadId) as { status?: string } | undefined;
    const protectedDraft = String(draft.status ?? "") === "sent";
    if (allReady && (!hasBody || protectedDraft || protectedOutbox)) {
      if (protectedDraft || protectedOutbox) protectedSkipped.push({ leadId, reason: protectedDraft ? "Draft already sent." : `Outbox status: ${protectedOutbox?.status ?? "protected"}.` });
      return false;
    }
    if (!allReady && hasBody && !regenerateExisting) { skipped.push(leadId); return false; }
    return true;
  });
  if (!pending.length) return res.status(422).json({ error: allReady ? "No eligible ready drafts are available for regeneration." : "No pending leads are available for generation.", skipped, protectedSkipped });
  const runId = randomUUID(); const now = new Date().toISOString();
  db.prepare("INSERT INTO global_email_generation_runs (id,status,total,language,tone,service,created_at,updated_at) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?)").run(runId, pending.length, options.language, options.tone, options.service, now, now);
  const insert = db.prepare("INSERT INTO global_email_generation_items (id,run_id,lead_id) VALUES (?,?,?)"); for (const leadId of pending) insert.run(randomUUID(), runId, leadId);
  void processGlobalEmailRun(runId, pending, options, campaignId, regenerateExisting);
  return res.status(202).json({ runId, total: pending.length, skipped, protectedSkipped });
});

app.patch("/api/pipeline/:leadId", (req, res) => {
  const current = db
    .prepare("SELECT * FROM outreach_pipeline WHERE lead_id = ?")
    .get(req.params.leadId) as Record<string, unknown> | undefined;
  if (!current)
    return res
      .status(404)
      .json({ error: "Lead is not in the outreach pipeline." });
  const status = clean(req.body?.status);
  const channelProvided = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    "channel",
  );
  const channel = channelProvided
    ? clean(req.body?.channel).toLowerCase()
    : String(current.channel);
  const websiteOpportunity = clean(req.body?.websiteOpportunity);
  if (status && !pipelineStatuses.has(status))
    return res.status(422).json({ error: "Invalid pipeline status." });
  if (!pipelineChannels.has(channel))
    return res.status(422).json({ error: "Invalid contact channel." });
  if (websiteOpportunity && !websiteOpportunities.has(websiteOpportunity))
    return res.status(422).json({ error: "Invalid website opportunity." });
  db.prepare(
    `UPDATE outreach_pipeline SET status = ?, channel = ?, notes = ?, last_contact_at = ?, follow_up_at = ?, website_opportunity = ?, updated_at = ? WHERE lead_id = ?`,
  ).run(
    status || String(current.status),
    channel,
    clean(req.body?.notes ?? current.notes),
    clean(req.body?.lastContactAt ?? current.last_contact_at),
    clean(req.body?.followUpAt ?? current.follow_up_at),
    websiteOpportunity || String(current.website_opportunity ?? "needs_review"),
    new Date().toISOString(),
    req.params.leadId,
  );
  res.json({ ok: true });
});

app.get("/api/pipeline/:leadId", (req, res) => {
  const lead = db
    .prepare(
      `SELECT l.*, p.status AS pipeline_status, p.channel AS pipeline_channel, p.notes AS pipeline_notes, p.last_contact_at, p.follow_up_at, p.website_opportunity,
    COALESCE(GROUP_CONCAT(DISTINCT s.name), '') AS source_searches
    FROM outreach_pipeline p JOIN leads l ON l.id = p.lead_id LEFT JOIN lead_sources ls ON ls.lead_id = l.id LEFT JOIN saved_searches s ON s.id = ls.search_id
    WHERE l.id = ? GROUP BY l.id`,
    )
    .get(req.params.leadId);
  if (!lead)
    return res
      .status(404)
      .json({ error: "Lead is not in the outreach pipeline." });
  const activities = db
    .prepare(
      `SELECT * FROM outreach_activities WHERE lead_id = ? ORDER BY happened_at DESC, created_at DESC`,
    )
    .all(req.params.leadId);
  return res.json({ lead, activities });
});

app.post("/api/pipeline/:leadId/activities", (req, res) => {
  const exists = db
    .prepare("SELECT lead_id FROM outreach_pipeline WHERE lead_id = ?")
    .get(req.params.leadId);
  if (!exists)
    return res
      .status(404)
      .json({ error: "Lead is not in the outreach pipeline." });
  const activityType = clean(req.body?.activityType);
  const channel = clean(req.body?.channel).toLowerCase();
  if (!activityTypes.has(activityType))
    return res.status(422).json({ error: "Invalid activity type." });
  if (!pipelineChannels.has(channel))
    return res.status(422).json({ error: "Invalid contact channel." });
  const happenedAt = clean(req.body?.happenedAt) || new Date().toISOString();
  db.prepare(
    `INSERT INTO outreach_activities (id, lead_id, activity_type, channel, note, happened_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    req.params.leadId,
    activityType,
    channel,
    clean(req.body?.note),
    happenedAt,
    new Date().toISOString(),
  );
  db.prepare(
    `UPDATE outreach_pipeline SET updated_at = ? WHERE lead_id = ?`,
  ).run(new Date().toISOString(), req.params.leadId);
  return res.status(201).json({ ok: true });
});

app.delete("/api/pipeline/batch", (req, res) => {
  const ids = Array.isArray(req.body?.leadIds)
    ? req.body.leadIds.map(clean).filter(Boolean)
    : [];
  if (!ids.length)
    return res.status(422).json({ error: "Select at least one lead." });
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM outreach_activities WHERE lead_id IN (${placeholders})`,
  ).run(...ids);
  const result = db
    .prepare(`DELETE FROM outreach_pipeline WHERE lead_id IN (${placeholders})`)
    .run(...ids);
  res.json({ removed: result.changes });
});

app.post("/api/leads/:id/enrich", (req, res) => {
  const result = enqueueEnrichment([req.params.id], Boolean(req.body?.refresh));
  if (!result.queued && !result.active && !result.completed)
    return res.status(404).json({ error: "Lead is unavailable." });
  return res.status(result.queued ? 202 : 200).json(result);
});

app.post("/api/enrichment/batch", (req, res) => {
  const ids = Array.isArray(req.body?.leadIds)
    ? req.body.leadIds.map(clean).filter(Boolean)
    : [];
  if (!ids.length)
    return res
      .status(422)
      .json({ error: "Select at least one lead to enrich." });
  const result = enqueueEnrichment(ids, Boolean(req.body?.refresh));
  return res.status(result.queued ? 202 : 200).json(result);
});

app.post("/api/enrichment/stop", (_req, res) => {
  const queuedLeadIds = db
    .prepare("SELECT lead_id FROM enrichment_tasks WHERE status = 'queued'")
    .all() as Array<{ lead_id: string }>;
  const result = db
    .prepare(
      "UPDATE enrichment_tasks SET status = 'cancelled', updated_at = ? WHERE status = 'queued'",
    )
    .run(new Date().toISOString());
  db.prepare(
    "UPDATE leads SET enrichment_status = 'cancelled' WHERE enrichment_status = 'queued'",
  ).run();
  queuedLeadIds.forEach((task) =>
    emitEnrichmentEvent(task.lead_id, "cancelled"),
  );
  res.json({ stopped: result.changes });
});

app.get("/api/enrichment/status", (_req, res) => {
  const counts = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM enrichment_tasks WHERE status IN ('queued', 'searching', 'processing', 'failed', 'cancelled') GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;
  const status = Object.fromEntries(
    counts.map((row) => [row.status, row.count]),
  ) as Record<string, number>;
  res.json({
    queued: status.queued ?? 0,
    searching: (status.searching ?? 0) + (status.processing ?? 0),
    failed: status.failed ?? 0,
    cancelled: status.cancelled ?? 0,
  });
});

app.get("/api/enrichment/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("retry: 2000\nevent: ready\ndata: {}\n\n");
  enrichmentStreams.add(res);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    enrichmentStreams.delete(res);
  });
});

app.post("/api/leads/:id/website-audit", (req, res) => {
  const result = enqueueWebsiteAudit(req.params.id, Boolean(req.body?.refresh));
  if (result.unavailable)
    return res.status(422).json({
      error: "A public website is required before it can be audited.",
    });
  return res.status(result.queued ? 202 : 200).json(result);
});

app.post("/api/website-audits/batch", (req, res) => {
  const leadIds: string[] = Array.isArray(req.body?.leadIds)
    ? req.body.leadIds.map(clean).filter(Boolean)
    : [];
  if (!leadIds.length)
    return res
      .status(422)
      .json({ error: "Select at least one lead to audit." });
  const results = leadIds.map((leadId: string) =>
    enqueueWebsiteAudit(leadId, Boolean(req.body?.refresh)),
  );
  const queued = results.filter((result) => result.queued).length;
  const cached = results.filter((result) => result.cached).length;
  const unavailable = results.filter((result) => result.unavailable).length;
  res.status(queued ? 202 : 200).json({ queued, cached, unavailable });
});

/** Read-only eligibility view for the explicit global recovery action. */
app.get("/api/qualification/recovery-preview", (_req, res) => {
  const audit = db.prepare(`SELECT l.id AS leadId, l.title, l.website, COALESCE(a.status, 'not_analyzed') AS status,
    COALESCE(a.error, '') AS reason, a.metrics_json AS metricsJson
    FROM leads l LEFT JOIN website_audits a ON a.lead_id = l.id
    WHERE TRIM(COALESCE(l.website, '')) != ''
      AND COALESCE(a.status, 'not_analyzed') NOT IN ('completed', 'access_restricted')
      AND NOT EXISTS (SELECT 1 FROM website_audit_tasks t WHERE t.lead_id = l.id AND t.status IN ('queued', 'analyzing'))
    ORDER BY l.created_at ASC`).all() as Array<Record<string, unknown>>;
  const auditCandidates = audit.map((row) => {
    let metrics: Record<string, unknown> = {}; try { metrics = JSON.parse(String(row.metricsJson ?? '{}')); } catch { /* full run is safest */ }
    const plan = String(row.status) === 'partial' ? deriveAuditRecoveryPlan(metrics) : { mode: 'full_reaudit' as const, stages: ['profile', 'browser', 'lighthouse'], reason: clean(row.reason) || `Audit status: ${row.status}.` };
    return { leadId: row.leadId, title: row.title, website: row.website, status: row.status, reason: plan.reason, stages: plan.stages, mode: plan.mode };
  }).filter((candidate) => candidate.mode !== 'none');
  const contactCandidates = db.prepare(`SELECT l.id AS leadId, l.title, l.website, l.enrichment_status AS status,
    l.enrichment_error AS reason, l.contact_diagnostic AS diagnostic
    FROM leads l WHERE l.enrichment_status IN ('failed', 'cancelled')
      OR (l.enrichment_status = 'completed' AND l.contact_diagnostic = 'search_unavailable')
    ORDER BY l.updated_at ASC`).all();
  res.json({ audit: { total: auditCandidates.length, candidates: auditCandidates }, contacts: { total: contactCandidates.length, candidates: contactCandidates } });
});

app.post("/api/qualification/reprocess", (req, res) => {
  const modes = Array.isArray(req.body?.modes) ? new Set((req.body.modes as unknown[]).map(clean)) : new Set(["audit", "contacts"]);
  const requested = Array.isArray(req.body?.leadIds) ? new Set((req.body.leadIds as unknown[]).map(clean).filter(Boolean)) : null;
  const result = { auditQueued: 0, auditSkipped: 0, contactsQueued: 0, contactsSkipped: 0 };
  if (modes.has("audit")) {
    const rows = db.prepare(`SELECT l.id, a.status, a.metrics_json FROM leads l LEFT JOIN website_audits a ON a.lead_id=l.id
      WHERE TRIM(COALESCE(l.website, '')) != '' AND COALESCE(a.status, 'not_analyzed') NOT IN ('completed', 'access_restricted')
      AND NOT EXISTS (SELECT 1 FROM website_audit_tasks t WHERE t.lead_id=l.id AND t.status IN ('queued','analyzing'))`).all() as Array<{ id: string; status: string; metrics_json: string }>;
    for (const row of rows) {
      if (requested && !requested.has(row.id)) continue;
      let metrics: Record<string, unknown> = {}; try { metrics = JSON.parse(row.metrics_json || '{}'); } catch { /* full run */ }
      const plan = row.status === 'partial' ? deriveAuditRecoveryPlan(metrics) : { mode: 'full_reaudit' as const, stages: [] as string[] };
      if (plan.mode === 'none') { result.auditSkipped += 1; continue; }
      const queued = enqueueWebsiteAudit(row.id, true, plan.mode === 'selective' ? plan.stages : []).queued;
      if (queued) result.auditQueued += 1; else result.auditSkipped += 1;
    }
  }
  if (modes.has("contacts")) {
    const rows = db.prepare(`SELECT id FROM leads WHERE enrichment_status IN ('failed', 'cancelled')
      OR (enrichment_status = 'completed' AND contact_diagnostic = 'search_unavailable')`).all() as Array<{ id: string }>;
    const selected = requested ? rows.filter((row) => requested.has(row.id)) : rows;
    const queued = enqueueEnrichment(selected.map((row) => row.id), true);
    result.contactsQueued = queued.queued; result.contactsSkipped = queued.active + queued.completed;
  }
  res.status(result.auditQueued || result.contactsQueued ? 202 : 200).json(result);
});

/** Read-only planner: it never queues a browser or Lighthouse process. */
app.get("/api/website-audits/recovery-preview", (_req, res) => {
  const rows = db.prepare(`SELECT a.id AS audit_id, a.lead_id, a.website, a.metrics_json, a.updated_at, l.title
    FROM website_audits a JOIN leads l ON l.id = a.lead_id
    WHERE a.status = 'partial' ORDER BY a.updated_at ASC`).all() as Array<Record<string, unknown>>;
  const candidates = rows.map((row) => {
    let metrics: Record<string, unknown> = {};
    try { metrics = JSON.parse(String(row.metrics_json ?? "{}")); } catch { /* explicitly require a full re-audit */ }
    const plan = deriveAuditRecoveryPlan(metrics);
    return { leadId: row.lead_id, auditId: row.audit_id, title: row.title, website: row.website, updatedAt: row.updated_at, ...plan };
  });
  const selective = candidates.filter((candidate) => candidate.mode === "selective");
  const fullReaudit = candidates.filter((candidate) => candidate.mode === "full_reaudit");
  res.json({
    totalPartial: candidates.length,
    selectiveCount: selective.length,
    fullReauditCount: fullReaudit.length,
    workload: {
      browserRuns: selective.filter((candidate) => candidate.stages.includes("browser")).length,
      lighthouseRuns: selective.filter((candidate) => candidate.stages.includes("lighthouse")).length,
      fullReauditsRequireExplicitConfirmation: fullReaudit.length,
    },
    candidates,
  });
});

app.post("/api/website-audits/recovery/selective", (req, res) => {
  const requested = Array.isArray(req.body?.leadIds) ? new Set((req.body.leadIds as unknown[]).map(clean).filter(Boolean)) : null;
  const rows = db.prepare("SELECT a.lead_id, a.metrics_json FROM website_audits a WHERE a.status = 'partial'").all() as Array<{ lead_id: string; metrics_json: string }>;
  const plans = rows.flatMap((row) => {
    if (requested && !requested.has(row.lead_id)) return [];
    let metrics: Record<string, unknown> = {};
    try { metrics = JSON.parse(row.metrics_json); } catch { return []; }
    const plan = deriveAuditRecoveryPlan(metrics);
    return plan.mode === "selective" ? [{ leadId: row.lead_id, stages: plan.stages }] : [];
  });
  const queued = plans.reduce((total, plan) => total + Number(enqueueWebsiteAudit(plan.leadId, true, plan.stages).queued), 0);
  res.status(queued ? 202 : 200).json({ queued, total: plans.length, plans });
});

app.post("/api/leads/:id/website-audit/cancel", (req, res) => {
  const leadId = req.params.id;
  const queued = db
    .prepare(
      "UPDATE website_audit_tasks SET status = 'cancelled', updated_at = ? WHERE lead_id = ? AND status = 'queued'",
    )
    .run(new Date().toISOString(), leadId);
  const controller = activeWebsiteAuditControllers.get(leadId);
  if (controller) controller.abort();
  if (!queued.changes && !controller)
    return res
      .status(404)
      .json({ error: "No queued or active website audit was found." });
  emitWebsiteAuditEvent(leadId, "cancelled");
  return res.json({ cancelled: true });
});

app.get("/api/leads/:id/website-audit", (req, res) => {
  const audit = db
    .prepare("SELECT * FROM website_audits WHERE lead_id = ?")
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!audit) return res.json({ status: "not_analyzed", issues: [] });
  let pages: string[] = [];
  let metrics: Record<string, unknown> = {};
  try {
    pages = JSON.parse(String(audit.pages_json ?? "[]"));
  } catch {
    /* preserve raw audit status */
  }
  try {
    metrics = JSON.parse(String(audit.metrics_json ?? "{}"));
  } catch {
    /* preserve raw audit status */
  }
  const issues = db
    .prepare(
      "SELECT category, severity, url, evidence, suggestion, verification_status FROM website_audit_issues WHERE audit_id = ? ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, category",
    )
    .all(String(audit.id));
  res.json({ ...audit, error: cleanAuditError(audit.error), pages, metrics: cleanAuditDiagnostics(metrics), issues });
});

app.get("/api/leads/:id/visual-ux", (req, res) => {
  res.json(db.prepare("SELECT * FROM visual_ux_assessments WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id));
});

async function performVisualUxAssessment(leadId: string) {
  const audit = db.prepare("SELECT * FROM website_audits WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
  const prior = db.prepare("SELECT * FROM visual_ux_assessments WHERE lead_id = ? AND audit_id = ? ORDER BY created_at DESC LIMIT 1").get(leadId, String(audit?.id ?? "")) as Record<string, unknown> | undefined;
  if (!audit?.id || !String(audit.desktop_screenshot) || !String(audit.mobile_screenshot)) throw new Error("Both persisted desktop and mobile screenshots are required for Visual & UX review.");
  const desktopFile = storedScreenshotPath(root, String(audit.id), "desktop"), mobileFile = storedScreenshotPath(root, String(audit.id), "mobile");
  if (!existsSync(desktopFile) || !existsSync(mobileFile)) throw new Error("Persisted screenshots are unavailable; run a homepage audit first.");
  let credential = await activeChatGptCredential(); const model = selectedChatGptModel();
  if (!credential?.accessToken || !credential.scopes.includes("chatgpt.tokens.use.direct") || !model) throw new Error("Connect ChatGPT and select a model with image input before Visual & UX review.");
  if (!visualUxModelAllowed(model)) throw new Error(`AI Visual Review only permits ${AI_VISUAL_MODEL}; no fallback model is used.`);
  const models = await listChatGptModels(credential); if (!models.includes(model)) throw new Error("The selected ChatGPT model is no longer available.");
  const content = [{ type: "input_text", text: "Assess these website screenshots as a subjective Visual & UX review. Return JSON only: {scores:{visual_hierarchy:0,typography:0,readability:0,spacing:0,consistency:0,layout:0,mobile_presentation:0,cta_clarity:0,presentation_quality:0},summary:string,findings:[{area:string,assessment:string,screenshot:'desktop'|'mobile'}],redesign_potential:'low'|'medium'|'high'|'insufficient'}. Scores are 0-100 subjective impressions, not technical defects. Do not call a site broken, do not infer business impact, and do not penalize a CMS/platform." }, { type: "input_image", image_url: `data:image/png;base64,${(await readFile(desktopFile)).toString("base64")}`, detail: "high" }, { type: "input_image", image_url: `data:image/png;base64,${(await readFile(mobileFile)).toString("base64")}`, detail: "high" }];
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort("visual_ux_timeout"), visualUxTimeoutMs);
  const request = (token: string) => fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ model, input: [{ role: "user", content }], instructions: "Return only valid JSON.", store: false, stream: false }), signal: controller.signal });
  let response: globalThis.Response;
  try { response = await request(credential.accessToken); }
  catch (error) { throw new Error(controller.signal.aborted ? "Visual & UX review timed out." : (error instanceof Error ? error.message : "Visual & UX provider request failed.")); }
  try {
    if (response.status === 401) { credential = await refreshChatGptCredential(); if (!credential?.accessToken) throw new Error("ChatGPT authorization expired."); response = await request(credential.accessToken); }
    if (!response.ok) throw new Error(response.status === 429 ? "ChatGPT plan usage limit reached." : `Selected model does not support this image assessment (${response.status}).`);
    const payload = await response.json() as Record<string, unknown>; const text = String((payload.output_text ?? "").toString()); let rubric: Record<string, unknown>; try { rubric = JSON.parse(text); } catch { throw new Error("The model did not return structured Visual & UX output."); }
    const usage = payload.usage && typeof payload.usage === "object" ? payload.usage : {};
    const now = new Date().toISOString(), id = randomUUID(); db.prepare("INSERT INTO visual_ux_assessments (id,lead_id,audit_id,version,status,model,method,evidence_json,rubric_json,summary,redesign_potential,usage_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, leadId, String(audit.id), Number(prior?.version ?? 0) + 1, "completed", model, "ai_visual", JSON.stringify({ screenshots: ["desktop", "mobile"], subjective: true }), JSON.stringify(rubric), clean(rubric.summary), clean(rubric.redesign_potential) || "insufficient", JSON.stringify(usage), now, now);
    refreshLeadQualification(leadId);
    return { id, model, rubric, subjective: true };
  } finally { clearTimeout(timeout); }
}

app.post("/api/leads/:id/visual-ux", async (req, res) => {
  const prior = db.prepare("SELECT vu.id FROM visual_ux_assessments vu JOIN website_audits wa ON wa.id = vu.audit_id WHERE vu.lead_id = ? AND wa.lead_id = ? ORDER BY vu.created_at DESC LIMIT 1").get(req.params.id, req.params.id);
  if (prior && !req.body?.refresh) return res.status(409).json({ error: "A visual assessment already exists. Explicitly request a refresh to create another version." });
  const queued = enqueueVisualUxReview(req.params.id, Boolean(req.body?.refresh));
  if (queued.active) return res.status(409).json({ error: "A Visual & UX review is already in progress for this lead." });
  return res.status(202).json({ queued: true, status: "queued" });
});

// A compact, read-only aggregate for the Lead workspace. It deliberately
// joins persisted records only: opening a lead never triggers discovery,
// browser automation, Lighthouse, or a scoring run.
app.get("/api/leads/:id/detail", (req, res) => {
  const leadId = req.params.id;
  const lead = db.prepare(`SELECT leads.*,
    (SELECT s.name FROM lead_sources ls JOIN saved_searches s ON s.id = ls.search_id WHERE ls.lead_id = leads.id ORDER BY ls.discovered_at DESC LIMIT 1) AS source_search_name,
    (SELECT p.status FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS pipeline_status,
    (SELECT p.channel FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS pipeline_channel,
    (SELECT p.notes FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS pipeline_notes,
    (SELECT p.last_contact_at FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS last_contact_at,
    (SELECT p.follow_up_at FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS follow_up_at,
    (SELECT p.website_opportunity FROM outreach_pipeline p WHERE p.lead_id = leads.id) AS website_opportunity
    FROM leads WHERE leads.id = ?`).get(leadId) as Record<string, unknown> | undefined;
  if (!lead) return res.status(404).json({ error: "Lead not found." });

  const auditRow = db.prepare("SELECT * FROM website_audits WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
  let audit: Record<string, unknown> = { status: "not_analyzed", issues: [] };
  if (auditRow) {
    let pages: unknown[] = []; let metrics: Record<string, unknown> = {};
    try { pages = JSON.parse(String(auditRow.pages_json ?? "[]")); } catch { /* retain raw audit */ }
    try { metrics = JSON.parse(String(auditRow.metrics_json ?? "{}")); } catch { /* retain raw audit */ }
    audit = { ...auditRow, error: cleanAuditError(auditRow.error), pages, metrics: cleanAuditDiagnostics(metrics), issues: db.prepare("SELECT category, severity, url, evidence, suggestion, verification_status FROM website_audit_issues WHERE audit_id = ? ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, category").all(String(auditRow.id)) };
  }
  const observations = db.prepare(`SELECT * FROM (
    SELECT lo.*, sd.label, sd.signal_group, ROW_NUMBER() OVER (PARTITION BY lo.signal_code ORDER BY lo.observed_at DESC) AS row_number
    FROM lead_observations lo JOIN lead_signal_definitions sd ON sd.code = lo.signal_code WHERE lo.lead_id = ?
  ) WHERE row_number = 1 ORDER BY signal_group, observed_at DESC`).all(leadId);
  const scoreRows = db.prepare(`SELECT * FROM (
    SELECT s.*, ROW_NUMBER() OVER (PARTITION BY profile_key ORDER BY calculated_at DESC) AS row_number FROM icp_scores s WHERE lead_id = ?
  ) WHERE row_number = 1 ORDER BY profile_key`).all(leadId) as Array<Record<string, unknown>>;
  const scores = scoreRows.map((row) => { let explanation: unknown = {}; try { explanation = JSON.parse(String(row.explanation_json)); } catch { /* preserve score */ } return { ...row, explanation, evidence: db.prepare("SELECT * FROM icp_score_evidence WHERE score_id = ? ORDER BY rule_code, id").all(String(row.id)) }; });
  const opportunity = db.prepare(`SELECT os.*, json_group_array(json_object('category', wi.category, 'severity', wi.severity, 'evidence', wi.evidence, 'suggestion', wi.suggestion)) AS evidence_json
    FROM website_opportunity_scores os LEFT JOIN website_opportunity_evidence oe ON oe.score_id = os.id LEFT JOIN website_audit_issues wi ON wi.id = oe.issue_id
    WHERE os.lead_id = ? AND os.profile_key = 'website_opportunity' GROUP BY os.id`).get(leadId) as Record<string, unknown> | undefined;
  const sources = db.prepare(`SELECT s.id, s.name, s.category, ls.search_execution_id, ls.discovered_at, ls.was_inserted
    FROM lead_sources ls JOIN saved_searches s ON s.id = ls.search_id WHERE ls.lead_id = ? ORDER BY ls.discovered_at DESC`).all(leadId);
  const activities = db.prepare("SELECT * FROM outreach_activities WHERE lead_id = ? ORDER BY happened_at DESC").all(leadId);
  const contacts = db.prepare(`SELECT lc.*, cp.kind, cp.normalized_value, cp.display_value, p.display_name, p.normalized_name
    FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id LEFT JOIN people p ON p.id = cp.person_id
    WHERE lc.lead_id = ? ORDER BY lc.is_primary DESC, lc.confidence DESC, lc.last_seen_at DESC`).all(leadId);
  const history = db.prepare(`SELECT 'contact_discovery' AS kind, status, error AS detail, updated_at AS occurred_at FROM enrichment_tasks WHERE lead_id = ?
    UNION ALL SELECT 'homepage_audit' AS kind, status, error AS detail, updated_at AS occurred_at FROM website_audit_tasks WHERE lead_id = ?
    UNION ALL SELECT 'icp_scoring' AS kind, profile_key AS status, '' AS detail, calculated_at AS occurred_at FROM icp_scores WHERE lead_id = ?
    UNION ALL SELECT 'outreach' AS kind, activity_type AS status, note AS detail, happened_at AS occurred_at FROM outreach_activities WHERE lead_id = ?
    ORDER BY occurred_at DESC LIMIT 100`).all(leadId, leadId, leadId, leadId);
  const visualUx = db.prepare("SELECT * FROM visual_ux_assessments WHERE lead_id = ? ORDER BY created_at DESC").all(leadId);
  const automatedUx = db.prepare("SELECT * FROM automated_ux_assessments WHERE lead_id = ? ORDER BY updated_at DESC").all(leadId);
  const latestAutomated = db.prepare("SELECT status, checks_json, findings_json, error, updated_at FROM automated_ux_assessments WHERE lead_id = ? ORDER BY updated_at DESC LIMIT 1").get(leadId) as { status?: string; checks_json?: string; findings_json?: string; error?: string; updated_at?: string } | undefined;
  const latestVisualTask = db.prepare("SELECT status, error, updated_at FROM visual_ux_tasks WHERE lead_id = ? ORDER BY updated_at DESC LIMIT 1").get(leadId) as { status?: string; error?: string; updated_at?: string } | undefined;
  const latestVisualAssessment = db.prepare("SELECT status, approved, created_at FROM visual_ux_assessments WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1").get(leadId) as { status?: string; approved?: number; created_at?: string } | undefined;
  const visualUxStatus = latestVisualAssessment?.status === "completed"
    ? { status: "completed", approved: Boolean(latestVisualAssessment.approved), at: latestVisualAssessment.created_at }
    : latestVisualTask
      ? { status: latestVisualTask.status, error: latestVisualTask.error || "", at: latestVisualTask.updated_at }
      : { status: "not_started", approved: false };
  let automatedFindings: unknown[] = [];
  let automatedChecks: unknown = {};
  try { automatedFindings = JSON.parse(String(latestAutomated?.findings_json ?? "[]")); } catch { /* preserve status */ }
  try { automatedChecks = JSON.parse(String(latestAutomated?.checks_json ?? "{}")); } catch { /* preserve status */ }
  const automatedUxStatus = latestAutomated ? { status: latestAutomated.status, method: "automated", error: latestAutomated.error || "", at: latestAutomated.updated_at } : { status: "not_started", method: "automated" };
  let opportunityEvidence: unknown[] = [];
  if (opportunity?.evidence_json) { try { opportunityEvidence = JSON.parse(String(opportunity.evidence_json)); } catch { /* preserve score when evidence is malformed */ } }
  return res.json({ lead, audit, opportunity: opportunity ? { ...opportunity, evidence: opportunityEvidence } : null, observations, scores, sources, activities, contacts, history, visualUx, visualUxStatus, automatedUx, automatedUxStatus: { ...automatedUxStatus, checks: automatedChecks, findings: automatedFindings } });
});

app.get("/api/website-audits/:id/screenshots/:kind", async (req, res) => {
  const kind =
    req.params.kind === "mobile"
      ? "mobile"
      : req.params.kind === "desktop"
        ? "desktop"
        : "";
  if (!kind) return res.status(404).end();
  const audit = db
    .prepare("SELECT id FROM website_audits WHERE id = ?")
    .get(req.params.id);
  if (!audit) return res.status(404).end();
  const path = storedScreenshotPath(root, req.params.id, kind);
  if (!existsSync(path)) return res.status(404).end();
  return res.type("image/png").sendFile(path);
});

app.get("/api/website-audits/status", (_req, res) => {
  const taskRows = db
    .prepare(
      "SELECT status, COUNT(*) AS count FROM website_audit_tasks GROUP BY status",
    )
    .all() as Array<{ status: string; count: number }>;
  const taskCounts = Object.fromEntries(
    taskRows.map((row) => [row.status, row.count]),
  ) as Record<string, number>;
  const auditRows = db.prepare("SELECT status, COUNT(*) AS count FROM website_audits GROUP BY status").all() as Array<{ status: string; count: number }>;
  const auditCounts = Object.fromEntries(auditRows.map((row) => [row.status, row.count])) as Record<string, number>;
  res.json({
    eligible: Number((db.prepare("SELECT COUNT(*) AS count FROM leads WHERE TRIM(COALESCE(website, '')) != ''").get() as { count: number }).count),
    completed: auditCounts.completed ?? 0,
    partial: auditCounts.partial ?? 0,
    queued: taskCounts.queued ?? 0,
    analyzing: taskCounts.analyzing ?? 0,
    running: taskCounts.analyzing ?? 0,
    failed: auditCounts.failed ?? 0,
    blocked: auditCounts.access_restricted ?? 0,
    concurrency: websiteAuditConcurrency,
  });
});

app.get("/api/qualification/progress", (_req, res) => {
  const row = db.prepare(`SELECT
    SUM(CASE WHEN COALESCE(TRIM(l.website), '') != '' AND COALESCE((SELECT status FROM website_audits wa WHERE wa.lead_id = l.id), 'not_analyzed') = 'not_analyzed' THEN 1 ELSE 0 END) AS awaiting,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_audit_tasks t WHERE t.lead_id = l.id AND t.status = 'analyzing') THEN 1 ELSE 0 END) AS running,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_audits wa WHERE wa.lead_id = l.id AND wa.status = 'completed') THEN 1 ELSE 0 END) AS analyzed,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_audits wa WHERE wa.lead_id = l.id AND wa.status = 'partial') THEN 1 ELSE 0 END) AS partialAudits,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_opportunity_scores os WHERE os.lead_id = l.id AND os.status = 'insufficient') THEN 1 ELSE 0 END) AS insufficientOpportunity,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_audits wa WHERE wa.lead_id = l.id AND wa.status = 'failed') THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_audits wa WHERE wa.lead_id = l.id AND wa.status = 'access_restricted') THEN 1 ELSE 0 END) AS blocked,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_audit_tasks t WHERE t.lead_id = l.id AND t.status = 'queued') THEN 1 ELSE 0 END) AS queued,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM website_opportunity_scores os WHERE os.lead_id = l.id AND os.level = 'high') THEN 1 ELSE 0 END) AS high,
    SUM(CASE WHEN l.contact_status = 'verified' THEN 1 ELSE 0 END) AS verifiedContacts
    FROM leads l`).get() as Record<string, number | null>;
  res.json(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)])));
});

app.post("/api/website-audits/retry-failed", (_req, res) => {
  const ids = db.prepare(`SELECT DISTINCT t.lead_id FROM website_audit_tasks t
    LEFT JOIN website_audits a ON a.lead_id = t.lead_id
    WHERE t.status IN ('exhausted', 'failed', 'cancelled') AND COALESCE(a.status, 'not_analyzed') NOT IN ('completed', 'access_restricted')
      AND NOT EXISTS (SELECT 1 FROM website_audit_tasks active WHERE active.lead_id = t.lead_id AND active.status IN ('queued', 'analyzing'))`).all() as Array<{ lead_id: string }>;
  const results = ids.map(({ lead_id }) => enqueueWebsiteAudit(lead_id, true));
  res.status(202).json({ queued: results.filter((result) => result.queued).length, total: ids.length });
});

app.get("/api/website-audits/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("retry: 2000\nevent: ready\ndata: {}\n\n");
  websiteAuditStreams.add(res);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    websiteAuditStreams.delete(res);
  });
});

app.get("/api/skills", (req, res) => {
  const task = clean(req.query.task) || "writer";
  const rows = db.prepare("SELECT slug, name, source, attribution, content, service_scope, enabled, editable, updated_at FROM skills ORDER BY name").all() as Array<Record<string, unknown>>;
  return res.json({ task, skills: rows, loaded: loadSkillsForTask(task, clean(req.query.service)) .map((skill) => skill.slug) });
});
app.patch("/api/skills/:slug", (req, res) => {
  const current = db.prepare("SELECT * FROM skills WHERE slug = ?").get(req.params.slug) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: "Skill not found." });
  const content = req.body?.content === undefined ? String(current.content) : String(req.body.content);
  if (content.length > 100_000) return res.status(413).json({ error: "Skill content is limited to 100,000 characters." });
  const nextEnabled = req.body?.enabled === undefined ? Number(current.enabled) : req.body.enabled ? 1 : 0;
  const serviceScope = req.body?.serviceScope === undefined ? String(current.service_scope) : clean(req.body.serviceScope);
  db.prepare("UPDATE skills SET content = ?, enabled = ?, service_scope = ?, updated_at = ? WHERE slug = ?").run(content, nextEnabled, serviceScope, new Date().toISOString(), req.params.slug);
  return res.json(db.prepare("SELECT slug, name, source, attribution, content, service_scope, enabled, editable, updated_at FROM skills WHERE slug = ?").get(req.params.slug));
});
app.get("/api/settings", (_req, res) => {
  res.json({
    automaticContactDiscovery: automaticContactDiscoveryEnabled(),
    automaticWebsiteAudits: automaticWebsiteAuditsEnabled(),
    enrichmentConcurrency,
    interfaceLanguage: appSetting("interface_language", "en") === "pt-BR" ? "pt-BR" : "en",
    outreachPreferences: outreachPreferences(),
  });
});

app.get("/api/chatgpt/status", async (_req, res) => {
  const credential = await readChatGptCredential(); const active = await activeChatGptCredential();
  res.json({ connected: Boolean(active), email: active?.email ?? credential.email ?? "", scopes: active?.scopes ?? credential.scopes, expiresAt: active?.expiresAt ?? null, provider: active ? "chatgpt_plan" : "none", selectedModel: selectedChatGptModel() });
});
app.get("/api/chatgpt/models", async (_req, res) => {
  const active = await activeChatGptCredential(); if (!active) return res.status(401).json({ error: "Connect ChatGPT first." });
  try {
    const models = await listChatGptModels(active);
    const selected = selectedChatGptModel();
    const lunaCandidates = models.filter((model) => /luna/i.test(model));
    return res.json({ models, selected, lunaCandidates, lunaAvailable: lunaCandidates.length > 0, discovery: { status: 200, count: models.length, ids: models } });
  } catch (error) {
    const discovery = error instanceof ChatGptModelDiscoveryError ? { status: error.status, count: 0, ids: [], code: error.code || undefined } : { status: 502, count: 0, ids: [] };
    console.error(`[chatgpt-model-discovery] route_error=${discovery.status}${discovery.code ? ` code=${discovery.code}` : ""}`);
    return res.status(discovery.status >= 400 && discovery.status < 500 ? discovery.status : 502).json({ error: error instanceof Error ? error.message : "Could not load ChatGPT models.", discovery });
  }
});
app.patch("/api/chatgpt/model", async (req, res) => {
  const active = await activeChatGptCredential(); if (!active) return res.status(401).json({ error: "Connect ChatGPT first." });
  const model = clean(req.body?.model);
  if (!model) return res.status(422).json({ error: "Choose a ChatGPT model." });
  let models: string[];
  try { models = await listChatGptModels(active); } catch (error) { return res.status(error instanceof ChatGptModelDiscoveryError && error.status >= 400 && error.status < 500 ? error.status : 502).json({ error: error instanceof Error ? error.message : "Could not load ChatGPT models." }); }
  if (!models.includes(model)) return res.status(422).json({ error: "Choose a model returned by the authenticated ChatGPT account." });
  saveSelectedChatGptModel(model);
  return res.json({ selected: model });
});
app.post("/api/chatgpt/connect", async (req, res) => {
  const current = await readChatGptCredential(); const switchAccount = req.body?.switchAccount === true;
  // A dynamically issued client is scoped to the workspace that authorized it.
  // Account switching must not reuse that scope or the prior host identifier.
  const hostId = switchAccount ? `urn:uuid:${randomUUID()}` : current.hostId || `urn:uuid:${randomUUID()}`;
  const clientId = switchAccount ? "dynamic_agent_client" : current.clientId || "dynamic_agent_client";
  const state = b64url(randomBytes(32)); const nonce = b64url(randomBytes(32)); const verifier = b64url(randomBytes(48)); const challenge = b64url(createHash("sha256").update(verifier).digest());
  pendingChatGptAuth = { state, nonce, verifier, redirectUri: oauthCallback, clientId, hostId, createdAt: Date.now() };
  if (!switchAccount) await writeChatGptCredential({ ...current, hostId });
  const params = new URLSearchParams({ client_id: clientId, ext_agent_host_id: hostId, response_type: "code", redirect_uri: oauthCallback, scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", resource: "https://api.openai.com/v1", state, nonce, code_challenge_method: "S256", code_challenge: challenge }); if (clientId === "dynamic_agent_client") params.set("agent_name_hint", "Scout"); else if (current.idToken) params.set("id_token_hint", current.idToken); if (!switchAccount && current.email) params.set("login_hint", current.email); if (switchAccount) params.set("prompt", "login");
  res.json({ authUrl: `https://auth.openai.com/api/accounts/authorize?${params.toString()}` });
});
app.get("/auth/callback", async (req, res) => {
  const pending = pendingChatGptAuth; pendingChatGptAuth = null; if (!pending || Date.now() - pending.createdAt > 10 * 60_000 || req.query.state !== pending.state) return res.status(400).send("Invalid or expired ChatGPT sign-in attempt.");
  if (req.query.error) return res.status(400).send(`ChatGPT sign-in was not completed: ${clean(req.query.error)}. You can close this window.`);
  const issuedClientId = clean(req.query.client_id) || pending.clientId; if (pending.clientId === "dynamic_agent_client" && issuedClientId === "dynamic_agent_client") return res.status(400).send("OpenAI did not return an issued client ID for this registration.");
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: issuedClientId, code: clean(req.query.code), code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: "https://api.openai.com/v1" }); const tokenResponse = await fetch("https://auth.openai.com/api/accounts/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!tokenResponse.ok) return res.status(502).send(`ChatGPT token exchange failed (${tokenResponse.status}). You can close this window.`);
  const token = await tokenResponse.json() as Record<string, unknown>; const scopes = String(token.scope ?? req.query.scope ?? "").split(/\s+/).filter(Boolean); if (!scopes.includes("chatgpt.tokens.use.direct")) return res.status(403).send("ChatGPT plan usage permission was not granted. You can close this window.");
  try { const claims = await validateIdToken(String(token.id_token ?? ""), issuedClientId, pending.nonce); await writeChatGptCredential({ hostId: pending.hostId, clientId: issuedClientId, email: String(claims.email ?? ""), subject: String(claims.sub ?? ""), idToken: String(token.id_token), accessToken: String(token.access_token), refreshToken: String(token.refresh_token ?? ""), tokenType: String(token.token_type ?? "Bearer"), expiresAt: Math.floor(Date.now() / 1000) + Number(token.expires_in ?? 3600), scopes, savedAt: new Date().toISOString() }); } catch (error) { return res.status(403).send(`${error instanceof Error ? error.message : "ChatGPT identity validation failed."} You can close this window.`); }
  res.type("html").send("<html><body><p>Scout is connected to ChatGPT. You can close this window.</p><script>window.close()</script></body></html>");
});
app.post("/api/chatgpt/disconnect", async (_req, res) => {
  const current = await readChatGptCredential(); if (current.refreshToken && current.clientId) { await fetch("https://auth.openai.com/.well-known/openid-configuration").then((response) => response.json()).then(async (config: any) => { if (config.revocation_endpoint) await fetch(config.revocation_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: current.refreshToken!, token_type_hint: "refresh_token", client_id: current.clientId! }) }); }).catch(() => undefined); }
  // Keep the local client registration, but never carry identity hints from a
  // disconnected account into the next authorization attempt.
  await writeChatGptCredential({ hostId: current.hostId || `urn:uuid:${randomUUID()}`, clientId: current.clientId, scopes: [] }); res.json({ connected: false });
});

type MailAccountRow = { id: string; provider: "gmail" | "zoho"; email: string; status: string; display_name: string; last_test_at: string; last_error: string; limits_json: string; created_at: string; updated_at: string };
function publicMailAccount(row: MailAccountRow) { let limits: Record<string, number> = {}; try { limits = JSON.parse(row.limits_json || "{}"); } catch { /* empty */ } return { id: row.id, provider: row.provider, email: row.email, status: row.status, displayName: row.display_name, lastTestAt: row.last_test_at || null, lastError: row.last_error || null, limits }; }
function mailAccount(id: string) { return db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(id) as MailAccountRow | undefined; }
function mailConfig(): GmailConfig | null { const clientId = clean(process.env.GMAIL_CLIENT_ID); const clientSecret = clean(process.env.GMAIL_CLIENT_SECRET); if (!clientId || !clientSecret) return null; return { clientId, clientSecret, redirectUri: clean(process.env.GMAIL_REDIRECT_URI) || `http://127.0.0.1:${port}/auth/mail/gmail/callback` }; }
function zohoConfig(): ZohoOAuthConfig | null { const clientId = clean(process.env.ZOHO_CLIENT_ID); const clientSecret = clean(process.env.ZOHO_CLIENT_SECRET); if (!clientId || !clientSecret) return null; const accountsDomain = clean(process.env.ZOHO_ACCOUNTS_DOMAIN) || "https://accounts.zoho.com"; return { clientId, clientSecret, accountsDomain, redirectUri: clean(process.env.ZOHO_REDIRECT_URI) || `http://127.0.0.1:${port}/auth/mail/zoho/callback`, apiDomain: clean(process.env.ZOHO_API_DOMAIN) || undefined }; }
function upsertMailAccount(id: string, provider: "gmail" | "zoho", email: string, status: string, error = "", lastTestAt = "", displayName?: string) { const now = new Date().toISOString(); const current = mailAccount(id); const nextDisplayName = displayName === undefined ? current?.display_name ?? "" : displayName; db.prepare(`INSERT INTO email_accounts (id,provider,email,status,display_name,last_test_at,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,email=excluded.email,status=excluded.status,display_name=excluded.display_name,last_test_at=excluded.last_test_at,last_error=excluded.last_error,updated_at=excluded.updated_at`).run(id, provider, email, status, nextDisplayName, lastTestAt, error, now, now); return publicMailAccount(mailAccount(id)!); }
function mailError(error: unknown): string {
  if (error instanceof GmailProviderError) {
    if (error.stage === "profile_lookup") return error.status === 403
      ? "O Google autorizou, mas a API do Gmail recusou a leitura do perfil. Verifique se a Gmail API está habilitada no projeto Google Cloud e tente novamente."
      : error.status === 401 ? "A autorização do Gmail expirou antes da confirmação da conta. Reconecte o Gmail." : "Não foi possível confirmar o perfil da conta Gmail após a autorização.";
    if (error.providerCode === "redirect_uri_mismatch") return "O Google rejeitou o redirect URI. Ele precisa coincidir exatamente com GMAIL_REDIRECT_URI no Google Cloud e no backend.";
    if (error.providerCode === "invalid_client") return "O Google rejeitou o Client ID ou Client Secret configurado no backend. Revise a credencial OAuth do tipo Web.";
    if (error.stage === "token_exchange") return "O Google não aceitou a troca do código OAuth. O código pode ter expirado ou o redirect URI pode estar diferente.";
    return "A autorização do Gmail não pôde ser concluída. Reconecte a conta.";
  }
  return error instanceof Error ? error.message.slice(0, 240) : "Falha na conexão com o provedor de e-mail.";
}
function logGmailFailure(error: unknown): void {
  if (error instanceof GmailProviderError) {
    console.warn(`[mail-oauth] provider=gmail stage=${error.stage} category=${error.category} status=${error.status ?? "none"} code=${error.providerCode ?? "none"}`);
  } else console.warn("[mail-oauth] provider=gmail stage=persistence category=storage_failure");
}

app.get("/api/email-accounts", async (_req, res) => { const rows = db.prepare("SELECT * FROM email_accounts ORDER BY created_at").all() as MailAccountRow[]; const accounts = await Promise.all(rows.map(async (row) => { const publicRow = publicMailAccount(row); const secret = await mailAccountStore.get(row.id).catch(() => null); const scopes = secret?.scopes ?? []; const sendReady = row.status === "connected" && (row.provider === "gmail" ? scopes.includes(GMAIL_SEND_SCOPE) : scopes.includes(ZOHO_MAIL_SEND_SCOPE)); return { ...publicRow, sendReady }; })); res.json({ accounts, configured: { encryptionKey: Boolean(process.env.MAIL_CREDENTIAL_ENCRYPTION_KEY?.trim()), gmailOAuth: Boolean(mailConfig()), zohoOAuth: Boolean(zohoConfig()) } }); });
app.post("/api/email-accounts/gmail/connect", async (_req, res) => { const config = mailConfig(); if (!config) return res.status(503).json({ error: "Gmail OAuth is not configured on the backend." }); if (!await mailAccountStore.hasConfiguredKey()) return res.status(503).json({ error: "Mail credential encryption is not configured on the backend." }); const id = randomUUID(); const state = b64url(randomBytes(32)); pendingGmailAuth = { state, accountId: id, redirectUri: config.redirectUri, createdAt: Date.now() }; upsertMailAccount(id, "gmail", "", "pending"); return res.json({ authUrl: gmailAuthorizationUrl(config, state), accountId: id }); });
app.get("/auth/mail/gmail/callback", async (req, res) => {
  const pending = pendingGmailAuth;
  pendingGmailAuth = null;
  if (!pending || Date.now() - pending.createdAt > 10 * 60_000 || req.query.state !== pending.state) {
    return res.status(400).send("A tentativa de autorização do Gmail é inválida ou expirou. Feche esta janela e tente novamente.");
  }
  if (req.query.error) {
    const providerError = clean(req.query.error);
    const message = providerError === "access_denied"
      ? "O Google recusou a autorização desta conta. Escolha novamente a conta adicionada como usuário de teste e confirme as permissões. Se ela for uma conta Google Workspace, verifique se o administrador permite apps OAuth de terceiros."
      : "A autorização do Gmail foi cancelada ou recusada pelo Google.";
    console.warn(`[mail-oauth] provider=gmail stage=authorization category=${providerError === "access_denied" ? "access_denied" : "provider_rejected"}`);
    upsertMailAccount(pending.accountId, "gmail", "", "error", message);
    return res.status(400).type("html").send(`<html><body><p>${message}</p><script>window.close()</script></body></html>`);
  }
  const config = mailConfig();
  const code = clean(req.query.code);
  if (!config) return res.status(503).send("O OAuth do Gmail não está configurado no backend. Defina as credenciais do servidor e tente novamente.");
  if (!code) return res.status(400).send("O Google não devolveu um código de autorização do Gmail. Feche esta janela e tente novamente.");
  let token;
  try {
    token = await exchangeGmailCode(config, code);
  } catch (error) {
    logGmailFailure(error);
    const message = mailError(error);
    upsertMailAccount(pending.accountId, "gmail", "", "error", message);
    return res.status(502).type("html").send(`<html><body><p>${message}</p><script>window.close()</script></body></html>`);
  }
  try {
    const displayName = mailAccount(pending.accountId)?.display_name ?? "";
    await mailAccountStore.upsert(pending.accountId, { provider: "gmail", email: token.email, displayName, accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: token.expiresAt, scopes: token.scopes });
    upsertMailAccount(pending.accountId, "gmail", token.email, "connected", "", new Date().toISOString(), displayName);
    return res.type("html").send("<html><body><p>Conta Gmail conectada com sucesso. Feche esta janela.</p><script>window.close()</script></body></html>");
  } catch (error) {
    logGmailFailure(error);
    const message = "A conta Gmail foi autorizada, mas não foi possível salvar as credenciais com segurança. Verifique a chave de criptografia do backend e tente novamente.";
    upsertMailAccount(pending.accountId, "gmail", "", "error", message);
    return res.status(500).type("html").send(`<html><body><p>${message}</p><script>window.close()</script></body></html>`);
  }
});
app.post("/api/email-accounts/zoho/connect", async (_req, res) => { const config = zohoConfig(); if (!config) return res.status(503).json({ error: "Zoho OAuth is not configured on the backend." }); if (!await mailAccountStore.hasConfiguredKey()) return res.status(503).json({ error: "Mail credential encryption is not configured on the backend." }); const id = randomUUID(); const state = b64url(randomBytes(32)); const pending = { state, accountId: id, redirectUri: config.redirectUri, createdAt: Date.now(), accountsDomain: config.accountsDomain }; pendingZohoAuth.create(state, pending, pending.createdAt); upsertMailAccount(id, "zoho", "", "pending"); return res.json({ authUrl: zohoAuthorizationUrl(config, state), accountId: id }); });
app.get("/auth/mail/zoho/callback", async (req, res) => { const pending = pendingZohoAuth.consume(req.query.state); if (!pending) return res.status(400).send("Invalid or expired Zoho sign-in attempt. You can close this window."); if (req.query.error) { upsertMailAccount(pending.accountId, "zoho", "", "error", "Zoho authorization was not completed."); return res.status(400).send("Zoho sign-in was not completed. You can close this window."); } const config = zohoConfig(); const code = clean(req.query.code); if (!config || !code) return res.status(400).send("Zoho did not return an authorization code. You can close this window."); try { const token = await exchangeZohoCode(config, code); await mailAccountStore.upsert(pending.accountId, { provider: "zoho", email: token.email, displayName: token.displayName, accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: token.expiresAt, apiDomain: token.apiDomain, accountId: token.accountId, scopes: token.scopes }); upsertMailAccount(pending.accountId, "zoho", token.email, "connected", "", new Date().toISOString(), token.displayName); return res.type("html").send("<html><body><p>Scout connected the Zoho Mail account. You can close this window.</p><script>window.close()</script></body></html>"); } catch (error) { const failure = zohoCallbackFailure(error); console.warn(`[mail-oauth] provider=zoho category=${failure.code}`); upsertMailAccount(pending.accountId, "zoho", "", "error", `${failure.message} (${failure.code})`); return res.status(502).type("html").send(`<html><body><p>${failure.message} (${failure.code}). You can close this window.</p><script>window.close()</script></body></html>`); } });
app.post("/api/email-accounts/zoho", async (req, res) => { const email = clean(req.body?.email); const password = String(req.body?.password ?? ""); if (!validateZohoConfig({ email, password })) return res.status(422).json({ error: "Provide a valid Zoho email and app password." }); if (!await mailAccountStore.hasConfiguredKey()) return res.status(503).json({ error: "Mail credential encryption is not configured on the backend." }); const config = { email, password, smtpHost: clean(req.body?.smtpHost) || clean(process.env.ZOHO_SMTP_HOST) || undefined, smtpPort: Number(req.body?.smtpPort || process.env.ZOHO_SMTP_PORT || 587), imapHost: clean(req.body?.imapHost) || clean(process.env.ZOHO_IMAP_HOST) || undefined, imapPort: Number(req.body?.imapPort || process.env.ZOHO_IMAP_PORT || 993) }; const id = randomUUID(); try { await testZoho(config); await mailAccountStore.upsert(id, { provider: "zoho", email, password, smtpHost: config.smtpHost, smtpPort: config.smtpPort, imapHost: config.imapHost, imapPort: config.imapPort }); return res.status(201).json(upsertMailAccount(id, "zoho", email, "connected", "", new Date().toISOString())); } catch (error) { return res.status(502).json({ error: mailError(error), status: "error" }); } });
app.post("/api/email-accounts/:id/test", async (req, res) => { const row = mailAccount(req.params.id); if (!row) return res.status(404).json({ error: "Email account not found." }); const secret = await mailAccountStore.get(row.id); if (!secret) return res.status(409).json({ error: "Credentials are unavailable; reconnect this account." }); try { let email = secret.email; let displayName = secret.displayName ?? row.display_name; if (row.provider === "gmail") { const config = mailConfig(); if (!config || !secret.refreshToken) throw new Error("Gmail account requires reconnection."); const token = await testGmail({ accessToken: secret.accessToken ?? "", refreshToken: secret.refreshToken, expiresAt: secret.expiresAt ?? 0, email: secret.email, scopes: secret.scopes }, config); email = token.email; await mailAccountStore.upsert(row.id, { ...secret, email, accessToken: token.accessToken, expiresAt: token.expiresAt, scopes: token.scopes }); } else if (secret.refreshToken) { const config = zohoConfig(); if (!config) throw new Error("Zoho OAuth account requires reconnection."); const token = await testZohoOAuth({ accessToken: secret.accessToken ?? "", refreshToken: secret.refreshToken, expiresAt: secret.expiresAt ?? 0, email: secret.email, displayName, apiDomain: secret.apiDomain ?? config.apiDomain ?? "https://mail.zoho.com", accountId: secret.accountId, scopes: secret.scopes }, config); email = token.email; displayName = token.displayName ?? displayName; await mailAccountStore.upsert(row.id, { ...secret, email, displayName, accessToken: token.accessToken, expiresAt: token.expiresAt, apiDomain: token.apiDomain, accountId: token.accountId, scopes: token.scopes }); } else await testZoho({ email: secret.email, password: secret.password ?? "", smtpHost: secret.smtpHost, smtpPort: secret.smtpPort, imapHost: secret.imapHost, imapPort: secret.imapPort }); return res.json(upsertMailAccount(row.id, row.provider, email, "connected", "", new Date().toISOString(), displayName)); } catch (error) { return res.status(502).json(upsertMailAccount(row.id, row.provider, row.email, "needs_reconnect", mailError(error), "", row.display_name)); } });
app.post("/api/email-accounts/:id/reconnect", async (req, res) => { const row = mailAccount(req.params.id); if (!row) return res.status(404).json({ error: "Email account not found." }); if (row.provider === "gmail") { const config = mailConfig(); if (!config) return res.status(503).json({ error: "Gmail OAuth is not configured on the backend." }); const state = b64url(randomBytes(32)); pendingGmailAuth = { state, accountId: row.id, redirectUri: config.redirectUri, createdAt: Date.now() }; return res.json({ authUrl: gmailAuthorizationUrl(config, state) }); } const config = zohoConfig(); if (config && !req.body?.password) { const state = b64url(randomBytes(32)); const pending = { state, accountId: row.id, redirectUri: config.redirectUri, createdAt: Date.now(), accountsDomain: config.accountsDomain }; pendingZohoAuth.create(state, pending, pending.createdAt); return res.json({ authUrl: zohoAuthorizationUrl(config, state) }); } const email = clean(req.body?.email) || row.email; const password = String(req.body?.password ?? ""); if (!password) return res.status(422).json({ error: "Provide the Zoho app password to reconnect." }); try { await testZoho({ email, password }); await mailAccountStore.upsert(row.id, { provider: "zoho", email, password }); return res.json(upsertMailAccount(row.id, "zoho", email, "connected", "", new Date().toISOString())); } catch (error) { return res.status(502).json({ error: mailError(error) }); } });
app.patch("/api/email-accounts/:id/display-name", async (req, res) => {
  const row = mailAccount(req.params.id);
  if (!row) return res.status(404).json({ error: "Email account not found." });
  const displayName = clean(req.body?.displayName).slice(0, 120);
  if (!displayName) return res.status(422).json({ error: "Informe um nome de exibição para o remetente." });
  const secret = await mailAccountStore.get(row.id);
  if (!secret) return res.status(409).json({ error: "Credentials are unavailable; reconnect this account." });
  await mailAccountStore.upsert(row.id, { ...secret, displayName });
  return res.json(upsertMailAccount(row.id, row.provider, row.email, row.status, row.last_error, row.last_test_at, displayName));
});
app.patch("/api/email-accounts/:id/limits", (req, res) => { const row = mailAccount(req.params.id); if (!row) return res.status(404).json({ error: "Email account not found." }); const daily = Number(req.body?.daily); if (!Number.isInteger(daily) || daily < 0 || daily > 10000) return res.status(422).json({ error: "Daily limit must be an integer from 0 to 10,000." }); db.prepare("UPDATE email_accounts SET limits_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({ daily }), new Date().toISOString(), row.id); return res.json(publicMailAccount(mailAccount(row.id)!)); });
app.delete("/api/email-accounts/:id", async (req, res) => { const row = mailAccount(req.params.id); if (!row) return res.status(404).json({ error: "Email account not found." }); await mailAccountStore.delete(row.id); db.prepare("DELETE FROM email_accounts WHERE id = ?").run(row.id); return res.json({ disconnected: true }); });

app.patch("/api/settings", (req, res) => {
  if (req.body?.automaticContactDiscovery !== undefined && typeof req.body.automaticContactDiscovery !== "boolean") return res.status(422).json({ error: "automaticContactDiscovery must be a boolean." });
  if (req.body?.automaticWebsiteAudits !== undefined && typeof req.body.automaticWebsiteAudits !== "boolean") return res.status(422).json({ error: "automaticWebsiteAudits must be a boolean." });
  if (req.body?.interfaceLanguage !== undefined && !["en", "pt-BR"].includes(req.body.interfaceLanguage)) return res.status(422).json({ error: "interfaceLanguage must be en or pt-BR." });
  if (typeof req.body?.automaticContactDiscovery === "boolean") saveAppSetting("automatic_contact_discovery", req.body.automaticContactDiscovery ? "true" : "false");
  if (typeof req.body?.automaticWebsiteAudits === "boolean") saveAppSetting("automatic_website_audits", req.body.automaticWebsiteAudits ? "true" : "false");
  if (req.body?.interfaceLanguage) saveAppSetting("interface_language", req.body.interfaceLanguage);
  if (req.body?.outreachPreferences !== undefined) {
    const incoming = req.body.outreachPreferences as Record<string, unknown>;
    const current = outreachPreferences(); const signature = (incoming.signature && typeof incoming.signature === "object" ? incoming.signature : {}) as Record<string, unknown>;
    const sender = (incoming.senderProfile && typeof incoming.senderProfile === "object" ? incoming.senderProfile : {}) as Record<string, unknown>;
    const next: OutreachPreferences = {
      tone: validTone(incoming.tone, validTone(current.tone)),
      structure: clean(incoming.structure) || current.structure,
      subjectGuidelines: clean(incoming.subjectGuidelines) || current.subjectGuidelines,
      subjectTemplate: clean(incoming.subjectTemplate),
      defaultLanguage: incoming.defaultLanguage === "pt-BR" ? "pt-BR" : incoming.defaultLanguage === "en" ? "en" : current.defaultLanguage,
      signatureEnabled: incoming.signatureEnabled === undefined ? current.signatureEnabled : Boolean(incoming.signatureEnabled),
      signature: {
        name: clean(signature.name ?? current.signature.name), role: clean(signature.role ?? current.signature.role), company: clean(signature.company ?? current.signature.company),
        website: clean(signature.website ?? current.signature.website), contact: clean(signature.contact ?? current.signature.contact),
      },
      senderProfile: {
        name: clean(sender.name ?? current.senderProfile.name), title: clean(sender.title ?? current.senderProfile.title),
        introduction: clean(sender.introduction ?? current.senderProfile.introduction), services: clean(sender.services ?? current.senderProfile.services),
        portfolioUrl: clean(sender.portfolioUrl ?? current.senderProfile.portfolioUrl), instagramUrl: clean(sender.instagramUrl ?? current.senderProfile.instagramUrl),
        emailSignature: clean(sender.emailSignature ?? current.senderProfile.emailSignature),
      },
    };
    saveAppSetting("outreach_preferences", JSON.stringify(next));
  }
  return res.json({
    automaticContactDiscovery: automaticContactDiscoveryEnabled(),
    automaticWebsiteAudits: automaticWebsiteAuditsEnabled(),
    enrichmentConcurrency,
    interfaceLanguage: appSetting("interface_language", "en") === "pt-BR" ? "pt-BR" : "en",
    outreachPreferences: outreachPreferences(),
  });
});

app.get("/api/enrichment/config", (_req, res) =>
  res.json({
    provider: process.env.CONTACT_SEARCH_PROVIDER ?? "duckduckgo_html",
    externalDiscoveryEnabled:
      (process.env.CONTACT_SEARCH_PROVIDER ?? "duckduckgo_html") === "duckduckgo_html",
  }),
);

app.patch("/api/leads/:id", (req, res) => {
  const status = clean(req.body.status);
  const notes = clean(req.body.notes);
  db.prepare(
    "UPDATE leads SET lead_status = ?, notes = ?, updated_at = ? WHERE id = ?",
  ).run(status || "new", notes, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

app.get("/api/leads/export.csv", (req, res) => {
  const filter = leadFilter(req.query);
  const icpProfile = clean(req.query.icpProfile);
  const rows = db
    .prepare(
      `SELECT title, category, address, city, region, country_code, phone, website, website_empty,
    CASE WHEN COALESCE(TRIM(website), '') = '' THEN 'No Website Listed' ELSE 'Has Website' END AS website_status,
    instagram, business_email, facebook, contact_status, enrichment_status, contact_origin, contact_diagnostic, contact_source_url, contact_confidence, contacts_updated_at,
    COALESCE((SELECT status FROM website_audits wa WHERE wa.lead_id = leads.id), 'not_analyzed') AS website_audit_status,
    (SELECT score FROM website_audits wa WHERE wa.lead_id = leads.id) AS website_quality_score,
    (SELECT performance_score FROM website_audits wa WHERE wa.lead_id = leads.id) AS website_performance_score,
    (SELECT seo_score FROM website_audits wa WHERE wa.lead_id = leads.id) AS website_seo_score,
    (SELECT accessibility_score FROM website_audits wa WHERE wa.lead_id = leads.id) AS website_accessibility_score,
    (SELECT best_practices_score FROM website_audits wa WHERE wa.lead_id = leads.id) AS website_best_practices_score,
    (SELECT COUNT(*) FROM website_audit_issues wai JOIN website_audits wa ON wa.id = wai.audit_id WHERE wa.lead_id = leads.id) AS website_issue_count,
    ${icpProfile ? `(SELECT score FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = ? ORDER BY calculated_at DESC LIMIT 1) AS icp_score,
    (SELECT evidence_coverage FROM icp_scores s WHERE s.lead_id = leads.id AND s.profile_key = ? ORDER BY calculated_at DESC LIMIT 1) AS icp_evidence_coverage,` : "NULL AS icp_score, NULL AS icp_evidence_coverage,"}
    (SELECT search_execution_id FROM lead_sources ls WHERE ls.lead_id = leads.id ORDER BY discovered_at DESC LIMIT 1) AS source_search_execution_id,
    CASE WHEN EXISTS (SELECT 1 FROM lead_sources ls WHERE ls.lead_id = leads.id AND ls.was_inserted = 1 AND ls.search_execution_id = (SELECT id FROM search_executions ORDER BY started_at DESC LIMIT 1)) THEN 'New' ELSE '' END AS new_status,
    review_count, review_rating, lead_status, notes, maps_url FROM leads ${filter.where.length ? `WHERE ${filter.where.join(" AND ")}` : ""} ORDER BY ${filter.orderBy}`,
    )
    .all(...(icpProfile ? [icpProfile, icpProfile, ...filter.args] : filter.args)) as Array<Record<string, unknown>>;
  res
    .type("text/csv")
    .attachment("scout-leads.csv")
    .send(
      toCsv(rows, [
        "title",
        "category",
        "address",
        "city",
        "region",
        "country_code",
        "phone",
        "website",
        "website_empty",
        "website_status",
        "instagram",
        "business_email",
        "facebook",
        "contact_status",
        "enrichment_status",
        "contact_origin",
        "contact_diagnostic",
        "contact_source_url",
        "contact_confidence",
        "contacts_updated_at",
        "website_audit_status",
        "website_quality_score",
        "website_performance_score",
        "website_seo_score",
        "website_accessibility_score",
        "website_best_practices_score",
        "website_issue_count",
        "icp_score",
        "icp_evidence_coverage",
        "source_search_execution_id",
        "new_status",
        "review_count",
        "review_rating",
        "lead_status",
        "notes",
        "maps_url",
      ]),
    );
});

app.get("/api/leads/:id", (req, res) => {
  const lead = db
    .prepare("SELECT * FROM leads WHERE id = ?")
    .get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  return res.json(lead);
});

// Safety-only maintenance preview. This creates a verified SQLite snapshot and
// reports a proposed retain/delete set; it never mutates campaign or lead data.
app.post("/api/maintenance/cleanup-dry-run", async (_req, res) => {
  const backupDir = join(root, "storage", "backups");
  await mkdir(backupDir, { recursive: true });
  const backupPath = join(backupDir, `capture-before-cleanup-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  try {
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    const verified = existsSync(backupPath) && (await readFile(backupPath)).byteLength > 0;
    const retained = db.prepare(`SELECT id, title, category, city, region, country_code, website, created_at FROM leads
      ORDER BY CASE WHEN business_email != '' THEN 0 ELSE 1 END, CASE WHEN website != '' THEN 0 ELSE 1 END, created_at DESC LIMIT 5`).all();
    const retainedIds = (retained as Array<{ id: string }>).map((lead) => lead.id);
    const allCounts = {
      leads: Number((db.prepare("SELECT COUNT(*) AS count FROM leads").get() as { count: number }).count),
      lead_sources: Number((db.prepare("SELECT COUNT(*) AS count FROM lead_sources").get() as { count: number }).count),
      audits: Number((db.prepare("SELECT COUNT(*) AS count FROM website_audits").get() as { count: number }).count),
      observations: Number((db.prepare("SELECT COUNT(*) AS count FROM lead_observations").get() as { count: number }).count),
      scores: Number((db.prepare("SELECT COUNT(*) AS count FROM icp_scores").get() as { count: number }).count),
      pipeline: Number((db.prepare("SELECT COUNT(*) AS count FROM outreach_pipeline").get() as { count: number }).count),
    };
    const placeholders = retainedIds.map(() => "?").join(",") || "''";
    const deletable = Number((db.prepare(`SELECT COUNT(*) AS count FROM leads WHERE id NOT IN (${placeholders})`).get(...retainedIds) as { count: number }).count);
    const integrity = db.prepare("PRAGMA foreign_key_check").all();
    res.json({ destructive: false, backup: { path: backupPath, verified }, retain: retained, proposedDelete: { leads: deletable, note: "Dependent records are reported for review but will not be deleted without a separate explicit approval." }, counts: allCounts, foreignKeyViolations: integrity });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not create cleanup dry-run." });
  }
});

function reconcilePersistedPrimaryContacts() {
  const leadIds = db.prepare(`SELECT DISTINCT lc.lead_id FROM lead_contacts lc JOIN contact_points cp ON cp.id = lc.contact_point_id WHERE cp.kind = 'email'`).all() as Array<{ lead_id: string }>;
  for (const row of leadIds) synchronizePrimaryContact(row.lead_id);
}

let searchReconciliationActive = false;
async function reconcileActiveSearches() {
  if (searchReconciliationActive) return;
  searchReconciliationActive = true;
  try {
    const searches = db.prepare(`SELECT DISTINCT search_id FROM search_executions
      WHERE status IN ('starting', 'running', 'waiting_for_service')`).all() as Array<{ search_id: string }>;
    await Promise.all(searches.map(async ({ search_id }) => {
      try {
        await fetch(`http://127.0.0.1:${port}/api/searches/${encodeURIComponent(search_id)}/sync`, {
          method: "POST",
          signal: AbortSignal.timeout(Math.max(5_000, searchReconciliationIntervalMs - 1_000)),
        });
      } catch {
        // The durable execution remains pending. The next tick retries when
        // the API or Gosom becomes available again.
      }
    }));
  } finally {
    searchReconciliationActive = false;
  }
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Scout API running at http://127.0.0.1:${port}`);
  reconcilePersistedPrimaryContacts();
  reconcileUncertainOutboxRows();
  void reconcileActiveSearches();
  setInterval(() => { void reconcileActiveSearches(); }, searchReconciliationIntervalMs).unref();
  setInterval(() => { void dispatchOutreachOutbox(); }, 30_000).unref();
});
