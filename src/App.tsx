import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  Check,
  Download,
  Globe2,
  LayoutDashboard,
  MapPin,
  Menu,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Tag,
  Target,
  X,
  Mail,
  Link2,
  Square,
  CheckSquare,
  StopCircle,
  MoreHorizontal,
  Phone,
  Instagram,
  Facebook,
  CircleUserRound,
  PanelRightOpen,
  Activity,
  ClipboardList,
  BarChart3,
  Info,
  MessageSquare,
  Clock3,
  Columns3,
  List,
  SlidersHorizontal,
  Inbox,
  Plug,
  Workflow,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";
import { createOutreachCopy, createTranslator, translateCount, formatDate, formatNumber, formatPercent, localizeDom, localizeIntelligenceStatus, localizeIntelligenceText, localizeMessage, localizeOutboxDispatch, localizeOutboxStatus, localizeOpportunityLevel, localizeOpportunityReason, localizeOpportunityTerm, localizeQualificationReason, localizeQualificationStage, localizeStatus, type UiLanguage } from "./i18n";
import { qualificationProcessingState, qualificationStateLabel, qualificationStateTone } from "./qualification-presentation";
import { emailDraftHtml, fixedOutreachSignaturePlain } from "./email-signature";
import { isTerminalGenerationRun } from "./email-generation";
import { campaignIsActive, campaignShouldAppear, compareCampaignsForIndex } from "./campaign-presentation";
import { AppShell as GlobalAppShell, PageContainer, PageHeader, SectionHeader, Sidebar } from "./design-system-layout";
import { Button, Card, EmptyState, MetricCard, MetricGrid, TableShell } from "./design-system";
const DesignSystemDemo = lazy(() => import("./design-system-demo").then(({ DesignSystemDemo: Demo }) => ({ default: Demo })));
type I18nValue = { language: UiLanguage; setLanguage: (language: UiLanguage) => void; t: (key: string, values?: Record<string, string | number>) => string };
const I18nContext = createContext<I18nValue>({ language: "en", setLanguage: () => undefined, t: (key) => key });
function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => window.localStorage.getItem("google-capture.interface-language") === "pt-BR" ? "pt-BR" : "en");
  const setLanguage = (next: UiLanguage) => { setLanguageState(next); window.localStorage.setItem("google-capture.interface-language", next); };
  useEffect(() => { document.documentElement.lang = language === "pt-BR" ? "pt-BR" : "en-US"; }, [language]);
  useEffect(() => {
    const root = document.querySelector("#root");
    if (!root) return;
    // Only translate newly mounted UI fragments. Observing text mutations and
    // rescanning the full Leads tree caused a render loop in the old approach.
    const pending = new Set<Element>();
    let frame = 0;
    const flush = () => { frame = 0; for (const element of pending) if (element.isConnected) localizeDom(language, element); pending.clear(); };
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        const element = node instanceof Element ? node : node.parentElement;
        if (element) pending.add(element);
      }
      if (pending.size && !frame) frame = window.requestAnimationFrame(flush);
    });
    observer.observe(root, { childList: true, subtree: true });
    frame = window.requestAnimationFrame(() => { localizeDom(language); frame = 0; });
    return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame); pending.clear(); };
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: createTranslator(language) }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
function useI18n() { return useContext(I18nContext); }

type Country = { code: string; name: string };
type Industry = { id: string; displayName: string; description: string; version: number; searchTerms: string[]; categoryAliases: string[]; serviceKeywords: string[] };
type LocationOption = {
  name: string;
  region?: string;
  regionCode?: string;
  code?: string;
};
type SearchJob = {
  id: string;
  city: string;
  region: string;
  query: string;
  search_term?: string;
  relevance_skipped_count?: number;
  status: string;
  gosom_job_id?: string;
  imported: number;
  result_count: number;
  error: string;
  extraction_target?: number;
};
type Qualification = {
  website: "all" | "missing" | "present";
  contacts: Array<"instagram" | "email" | "facebook">;
  contactMatch: "any" | "all";
};
type SearchItem = {
  id: string;
  name: string;
  country_code: string;
  country_name: string;
  region: string;
  city: string;
  regions?: string[];
  cities?: string[];
  scope_mode?: "entire_country" | "selected_regions" | "selected_cities";
  category: string;
  industryIds?: string[];
  industryTerms?: string[];
  customTerms?: string[];
  query: string;
  extraction_target?: number;
  status: string;
  current_stage?: string;
  description?: string;
  archived_at?: string;
  outreach_mode?: "smart" | "general";
  outreach_service?: string;
  created_at?: string;
  metrics?: { lead_count: number; contact_count: number; audit_count: number; high_icp_count: number };
  qualification?: Qualification;
  qualification_progress?: {
    extracted: number;
    enriched: number;
    websiteValidated?: number;
    auditsCompleted?: number;
    visualCompleted?: number;
    qualified: number;
    incomplete?: number;
    failed?: number;
    pending: number;
    remainingTarget?: number;
  };
  jobs?: SearchJob[];
  progress?: { total: number; completed: number; cancelled?: number; failed: number; target?: number; collected?: number; duplicates?: number };
};
type Lead = {
  id: string;
  title: string;
  created_at?: string;
  category: string;
  industry_normalized: string;
  address: string;
  city: string;
  region: string;
  country_code: string;
  phone: string;
  website: string;
  website_empty: number;
  instagram: string;
  business_email: string;
  facebook: string;
  contact_status: "verified" | "possible" | "not_found";
  enrichment_status: string;
  contact_origin: string;
  contact_diagnostic:
    "found" | "not_found" | "search_unavailable" | "low_confidence";
  contact_source_url: string;
  contact_confidence: number;
  contacts_updated_at: string;
  enrichment_error: string;
  review_count: number;
  review_rating: number;
  lead_status: string;
  notes: string;
  maps_url: string;
  website_audit_status:
    | "not_analyzed"
    | "queued"
    | "analyzing"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled"
    | "access_restricted";
  website_score: number | null;
  website_issue_count: number;
  opportunity_level: "high" | "medium" | "low" | "analyzing" | "not_analyzed" | "insufficient_evidence" | "audit_failed";
  opportunity_score: number | null;
  opportunity_issue_count: number;
  opportunity_status: string | null;
  website_audit_task_status?: string | null;
  visual_ux_task_status?: string | null;
  visual_ux_status?: string | null;
  source_search_execution_id?: string;
  source_search_name?: string;
  pipeline_status?: string;
  pipeline_channel?: string;
  is_new_from_latest_search?: number;
  icp_score?: number | null;
  icp_evidence_coverage?: number | null;
  icp_evidence_confidence?: number | null;
};
type IcpProfile = { id: string; profile_key: string; name: string; description: string; version: number; enabled: number; rules: Array<{ code: string; label: string; weight: number; minConfidence: number }> };
type IcpScore = { id: string; profile_key: string; profile_version: number; score: number; commercial_fit: number; evidence_coverage: number; evidence_confidence: number; calculated_at: string; explanation: { rules?: Array<{ code: string; label: string; status: string; contribution: number; reason: string; evidence: Array<{ detail: string; url?: string; confidence: number }> }> } };
type IcpScoreRun = { runId: string; profileKey: string; status: string; total: number; processed: number };
type SearchActivity = {
  executionId: string;
  searchId: string;
  name: string;
  category: string;
  country: string;
  region: string;
  status: string;
  stage: string;
  discovered: number;
  inserted: number;
  duplicates: number;
  preexistingDuplicates?: number;
  executionDuplicates?: number;
  processed: number;
  jobs: { total: number; completed: number; cancelled?: number; failed: number };
  target: number;
  collected: number;
  progressMode: "indeterminate" | "complete";
};
type WebsiteAudit = {
  id?: string;
  status:
    | "not_analyzed"
    | "queued"
    | "analyzing"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled"
    | "access_restricted";
  score?: number | null;
  performance_score?: number | null;
  seo_score?: number | null;
  accessibility_score?: number | null;
  best_practices_score?: number | null;
  pages?: string[];
  metrics?: Record<string, unknown>;
  desktop_screenshot?: string;
  mobile_screenshot?: string;
  error?: string;
  issues: Array<{
    category: string;
    severity: string;
    url: string;
    evidence: string;
    suggestion: string;
    verification_status?: "verified" | "possible" | "inconclusive";
  }>;
};
type LeadObservation = {
  id: string;
  signal_code: string;
  label: string;
  signal_group: string;
  value_text: string;
  confidence: number;
  evidence_url: string;
  evidence_excerpt: string;
  observed_at: string;
  collector: string;
  verification_status?: "verified" | "possible" | "inconclusive";
};
type Stats = {
  totalLeads: number;
  inCampaigns: number;
  notInCampaigns: number;
  contacted: number;
  contactsFound: number;
  missingWebsite: number;
  qualified: number;
  running: number;
  highOpportunity: number;
  mediumOpportunity: number;
  lowOpportunity: number;
  completedAudits: number;
  pendingAudits: number;
  activity: SearchActivity | null;
};
type WorkspaceSettings = {
  automaticContactDiscovery: boolean;
  automaticWebsiteAudits: boolean;
  enrichmentConcurrency: number;
  interfaceLanguage: UiLanguage;
  outreachPreferences: OutreachPreferences;
};
type OutreachSignature = { name: string; role: string; company: string; website: string; contact: string };
type SenderProfile = { name: string; title: string; introduction: string; services: string; portfolioUrl: string; instagramUrl: string; emailSignature: string };
type OutreachPreferences = { tone: string; structure: string; subjectGuidelines: string; subjectTemplate: string; defaultLanguage: "en" | "pt-BR"; signatureEnabled: boolean; signature: OutreachSignature; senderProfile: SenderProfile };
const defaultOutreachPreferences: OutreachPreferences = { tone: "professional", structure: "context, specific value, low-pressure question", subjectGuidelines: "Specific, concise, and grounded in verified evidence.", subjectTemplate: "", defaultLanguage: "en", signatureEnabled: false, signature: { name: "", role: "", company: "", website: "", contact: "" }, senderProfile: { name: "", title: "", introduction: "", services: "", portfolioUrl: "", instagramUrl: "", emailSignature: "" } };
type ChatGptStatus = { connected: boolean; email: string; scopes: string[]; expiresAt: number | null; provider: string; selectedModel?: string };
type SearchCollection = {
  id: string;
  name: string;
  category: string;
  country_name: string;
  status: string;
  lead_count: number;
  all_lead_count: number;
  enriched_count: number;
  pending_count: number;
  job_count: number;
  qualification: Qualification;
};
type IndustryCollection = {
  industry: string;
  lead_count: number;
  categories: string;
};
type PipelineLead = Lead & {
  pipeline_status: string;
  pipeline_channel: string;
  pipeline_notes: string;
  last_contact_at: string;
  follow_up_at: string;
  website_opportunity: string;
};
type PipelineActivity = {
  id: string;
  activity_type: string;
  channel: string;
  note: string;
  happened_at: string;
};

const europeanCodes = new Set([
  "AL",
  "AD",
  "AT",
  "BE",
  "BA",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IS",
  "IE",
  "IT",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "MD",
  "MC",
  "ME",
  "NL",
  "MK",
  "NO",
  "PL",
  "PT",
  "RO",
  "SM",
  "RS",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "UA",
  "GB",
  "VA",
]);
const searchKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body as T;
};

type GenerationFeedback = {
  scope: "single" | "batch";
  status: "loading" | "error" | "timeout" | "cancelled" | "complete";
  title: string;
  detail: string;
  total?: number;
  completed?: number;
  failed?: number;
  current?: string;
};
function GenerationProgressModal({ state, onCancel, onClose, onRetry }: { state: GenerationFeedback | null; onCancel: () => void; onClose: () => void; onRetry?: () => void }) {
  const { language } = useI18n();
  const translate = createTranslator(language);
  const text = { processed: translate("generationProcessed"), complete: translate("generationComplete"), failed: translate("generationFailed"), cancel: translate("cancelGeneration"), retry: translate("retry"), close: translate("close") };
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (state && state.status !== "loading") closeButton.current?.focus(); }, [state?.status]);
  if (!state) return null;
  const active = state.status === "loading";
  const processed = (state.completed ?? 0) + (state.failed ?? 0);
  const percentage = state.scope === "batch" && state.total ? Math.min(100, Math.round((processed / state.total) * 100)) : 0;
  return <div className="generation-overlay" role="presentation"><section className="generation-modal" role="dialog" aria-modal="true" aria-labelledby="generation-modal-title" aria-live="polite">
    <div className="generation-spinner" aria-hidden="true" />
    <h2 id="generation-modal-title">{state.title}</h2><p>{state.detail}</p>
    {state.scope === "batch" && <div className="generation-progress"><strong>{processed} / {state.total ?? 0} {text.processed}</strong>{state.current && <span>{state.current}</span>}<div className="generation-progress-track" aria-label={`${percentage}% ${text.complete}`}><i style={{ width: `${percentage}%` }} /></div><small>{state.completed ?? 0} {text.complete} · {state.failed ?? 0} {text.failed}</small></div>}
    <div className="generation-modal-actions">{active ? <button className="secondary" onClick={onCancel}>{text.cancel}</button> : <>{onRetry && state.status !== "complete" && <button className="primary" onClick={onRetry}>{text.retry}</button>}<button className="secondary" ref={closeButton} onClick={onClose}>{text.close}</button></>}</div>
  </section></div>;
}

const statusLabel = (status: string, language: UiLanguage = "en") => localizeStatus(language, status);

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(email);
      else {
        const field = document.createElement("textarea");
        field.value = email;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      className="copy-email"
      onClick={() => void copy()}
      title={email}
      aria-label={`Copy ${email}`}
    >
      {copied ? <Check size={14} /> : <Mail size={14} />}
      {copied ? "Copied" : "Copy email"}
    </button>
  );
}

function ScoutApplication() {
  const [view, setView] = useState<
    "dashboard" | "campaigns" | "search" | "leads" | "emails" | "pipeline" | "settings"
  >("dashboard");
  const { language: activeLanguage } = useI18n();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => localizeDom(activeLanguage));
    return () => window.cancelAnimationFrame(frame);
  }, [activeLanguage, view, campaignId]);
  const [health, setHealth] = useState("checking");
  const [countries, setCountries] = useState<Country[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [searches, setSearches] = useState<SearchItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalLeads: 0,
    inCampaigns: 0,
    notInCampaigns: 0,
    contacted: 0,
    contactsFound: 0,
    missingWebsite: 0,
    qualified: 0,
    running: 0,
    highOpportunity: 0,
    mediumOpportunity: 0,
    lowOpportunity: 0,
    completedAudits: 0,
    pendingAudits: 0,
    activity: null,
  });
  const [dashboardStatus, setDashboardStatus] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNoticeState] = useState("");
  const [territory, setTerritory] = useState<"all" | "Europe">("all");
  const [filters, setFilters] = useState({
    q: "",
    country: "",
    region: "",
    city: "",
    cities: [] as string[],
    searchId: "",
    qualificationScope: "all" as "all" | "qualified",
    industry: "",
    category: "",
    unknownSource: false,
    websiteStatus: "all",
    hasInstagram: false,
    hasEmail: false,
    hasFacebook: false,
    hasAnyDigitalContact: false,
    noDigitalContact: false,
    verifiedContactsOnly: false,
    noWebsiteHasInstagram: false,
    auditStatus: "all",
    opportunity: "all",
    contactAvailability: "all",
    issueSeverity: "all",
    minWebsiteScore: "",
    signalCode: "",
    minSignalConfidence: "",
    signalFreshnessDays: "",
    icpProfile: "website_redesign",
    minIcpScore: "",
    sort: "",
  });
  const [leadMode, setLeadMode] = useState<"all" | "search" | "industry">(
    "all",
  );
  const [searchCollections, setSearchCollections] = useState<
    SearchCollection[]
  >([]);
  const [industryCollections, setIndustryCollections] = useState<
    IndustryCollection[]
  >([]);
  const [unknownSourceCount, setUnknownSourceCount] = useState(0);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [campaignDrawerLead, setCampaignDrawerLead] = useState<Lead | null>(null);
  const [submittingEnrichment, setSubmittingEnrichment] = useState<string[]>(
    [],
  );
  const { language, setLanguage, t } = useI18n();
  const setNotice = (message: string) => setNoticeState(localizeMessage(language, message));
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(
    { automaticContactDiscovery: true, automaticWebsiteAudits: true, enrichmentConcurrency: 2, interfaceLanguage: "en", outreachPreferences: defaultOutreachPreferences },
  );
  const [chatGptStatus, setChatGptStatus] = useState<ChatGptStatus>({ connected: false, email: "", scopes: [], expiresAt: null, provider: "none" });
  const [icpProfiles, setIcpProfiles] = useState<IcpProfile[]>([]);
  const [icpScoreRun, setIcpScoreRun] = useState<IcpScoreRun | null>(null);
  const hadActiveEnrichment = useRef(false);
  const [form, setForm] = useState({
    name: "",
    countryCode: "CA",
    countryLabel: "Canada",
    regionDraft: "Ontario",
    regions: ["Ontario"],
    cityRegionDraft: "Ontario",
    cityDraft: "Toronto",
    cities: ["Toronto"],
    scopeMode: "selected_regions" as
      "entire_country" | "selected_regions" | "selected_cities",
    category: "",
    industryIds: [] as string[],
    customTerms: [] as string[],
    extractionTarget: 100,
  });

  useEffect(() => {
    const copyLegacyEmailLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        'a[href^="mailto:"]',
      );
      if (!link) return;
      event.preventDefault();
      const email = decodeURIComponent(
        link.getAttribute("href")?.slice("mailto:".length).split("?")[0] ?? "",
      );
      if (!email) return;
      const copied = navigator.clipboard?.writeText(email);
      if (copied)
        void copied
          .then(() => setNotice("Email copied to clipboard."))
          .catch(() => setNotice("Could not copy the email."));
      else {
        const field = document.createElement("textarea");
        field.value = email;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const succeeded = document.execCommand("copy");
        field.remove();
        setNotice(
          succeeded
            ? "Email copied to clipboard."
            : "Could not copy the email.",
        );
      }
    };
    document.addEventListener("click", copyLegacyEmailLink);
    return () => document.removeEventListener("click", copyLegacyEmailLink);
  }, []);
  useEffect(() => {
    if (view !== "campaigns") setCampaignDrawerLead(null);
  }, [view]);

  const refresh = async () => {
    const leadQuery = new URLSearchParams(
      Object.fromEntries(
        Object.entries(filters)
          .filter(([key, value]) =>
            [
              "q",
              "country",
              "region",
              "city",
              "cities",
              "searchId",
              "industry",
              "category",
              "auditStatus",
              "issueSeverity",
              "minWebsiteScore",
              "sort",
              "signalCode",
              "minSignalConfidence",
              "signalFreshnessDays",
              "icpProfile",
              "minIcpScore",
            ].includes(key)
              ? Array.isArray(value)
                ? value.length > 0
                : Boolean(value)
              : key === "websiteStatus" || key === "qualificationScope"
                ? value !== "all"
                : (key.startsWith("has") ||
                    key.startsWith("no") ||
                    key === "verifiedContactsOnly" ||
                    key === "unknownSource") &&
                  Boolean(value),
          )
          .map(([key, value]) => [key, String(value)]),
      ),
    );
    const [
      nextStats,
      nextSearches,
      nextLeads,
      nextSearchCollections,
      nextIndustryCollections,
      nextIcpProfiles,
    ] = await Promise.all([
      api<Stats>("/api/dashboard"),
      api<SearchItem[]>("/api/searches"),
      api<Lead[]>(`/api/leads?${leadQuery}`),
      api<{ collections: SearchCollection[]; unknownSourceCount: number }>(
        "/api/lead-collections/searches",
      ),
      api<IndustryCollection[]>("/api/lead-collections/industries"),
      api<IcpProfile[]>("/api/icp/profiles"),
    ]);
    setStats(nextStats);
    setDashboardStatus("ready");
    setSearches(nextSearches);
    setLeads(nextLeads);
    setSearchCollections(nextSearchCollections.collections);
    setUnknownSourceCount(nextSearchCollections.unknownSourceCount);
    setIndustryCollections(nextIndustryCollections);
    setIcpProfiles(nextIcpProfiles);
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    api<Country[]>("/api/countries")
      .then(setCountries)
      .catch(() => setNotice("Country directory is unavailable."));
    api<{ version: number; industries: Industry[] }>("/api/industries")
      .then((catalog) => setIndustries(catalog.industries))
      .catch(() => setNotice("Industry catalog is unavailable."));
    api<{ gosom: string }>("/api/health")
      .then((item) => setHealth(item.gosom))
      .catch(() => setHealth("unavailable"));
    api<WorkspaceSettings>("/api/settings")
      .then((next) => { setWorkspaceSettings(next); setLanguage(next.interfaceLanguage); })
      .catch(() => setNotice("Workspace settings are unavailable."));
    api<ChatGptStatus>("/api/chatgpt/status").then(setChatGptStatus).catch(() => undefined);
  }, []);
  useEffect(() => {
    const checkGosom = () => {
      api<{ gosom: string }>("/api/health")
        .then((item) => setHealth(item.gosom))
        .catch(() => setHealth("unavailable"));
    };
    const timer = window.setInterval(checkGosom, 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const stream = new EventSource("/api/search-activity/events");
    const updateFromSearch = () => {
      void refreshRef.current().catch(() => undefined);
    };
    stream.addEventListener("search-activity", updateFromSearch);
    return () => {
      stream.removeEventListener("search-activity", updateFromSearch);
      stream.close();
    };
  }, []);
  useEffect(() => {
    refresh().catch((error: Error) => { setDashboardStatus("error"); setNotice(error.message); });
  }, [filters]);
  useEffect(() => {
    const active = searches.filter(
      (item) => item.status === "running" || item.status === "starting",
    );
    if (!active.length) return;
    const timer = window.setInterval(
      () =>
        Promise.all(
          active.map((item) =>
            api(`/api/searches/${item.id}/sync`, { method: "POST" }),
          ),
        )
          .then(refresh)
          .catch(() => undefined),
      4000,
    );
    return () => window.clearInterval(timer);
  }, [searches]);
  useEffect(() => {
    let cancelled = false;
    let syncing = false;
    const syncEnrichment = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const status = await api<{ queued: number; searching: number }>(
          "/api/enrichment/status",
        );
        const active = status.queued > 0 || status.searching > 0;
        // Refresh once more when the queue transitions to idle so the final
        // contact fields replace the last visible "Searching" state.
        const shouldRefresh = active || hadActiveEnrichment.current;
        hadActiveEnrichment.current = active;
        if (!cancelled && shouldRefresh) await refresh();
      } catch {
        // Contact discovery is optional; a temporary status failure must not interrupt the workspace.
      } finally {
        syncing = false;
      }
    };
    void syncEnrichment();
    const timer = window.setInterval(() => {
      void syncEnrichment();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [filters]);
  useEffect(() => {
    const stream = new EventSource("/api/enrichment/events");
    const updateFromEvent = () => {
      void refreshRef.current().catch(() => undefined);
    };
    stream.addEventListener("enrichment", updateFromEvent);
    return () => {
      stream.removeEventListener("enrichment", updateFromEvent);
      stream.close();
    };
  }, []);
  useEffect(() => {
    const stream = new EventSource("/api/website-audits/events");
    const updateFromAudit = () => {
      void refreshRef.current().catch(() => undefined);
    };
    stream.addEventListener("website-audit", updateFromAudit);
    return () => {
      stream.removeEventListener("website-audit", updateFromAudit);
      stream.close();
    };
  }, []);
  useEffect(() => {
    const stream = new EventSource("/api/icp-scores/events");
    const update = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as Partial<IcpScoreRun>;
        if (payload.runId) setIcpScoreRun((current) => current?.runId === payload.runId ? { ...current, ...payload } as IcpScoreRun : current);
      } catch { /* refresh is still safe */ }
      void refreshRef.current().catch(() => undefined);
    };
    stream.addEventListener("icp-score", update);
    return () => { stream.removeEventListener("icp-score", update); stream.close(); };
  }, []);

  const visibleCountries = useMemo(
    () =>
      territory === "Europe"
        ? countries.filter((item) => europeanCodes.has(item.code))
        : countries,
    [countries, territory],
  );
  const countryName =
    countries.find((item) => item.code === form.countryCode)?.name ??
    "a country";
  const scopeReady =
    form.scopeMode === "entire_country" ||
    (form.scopeMode === "selected_regions"
      ? form.regions.length > 0
      : form.cities.length > 0 &&
        (form.countryCode !== "BR" || Boolean(form.cityRegionDraft)));
  const canRun = Boolean(form.countryCode && (form.category || form.industryIds.length) && scopeReady);

  async function saveSearch(runNow: boolean) {
    try {
      const payload = {
        name: form.name,
        countryCode: form.countryCode,
        category: form.category,
        industryIds: form.industryIds,
        customTerms: form.customTerms,
        scopeMode: form.scopeMode,
        extractionTarget: Number(form.extractionTarget),
        ...(form.scopeMode === "selected_regions"
          ? { regions: form.regions }
          : {}),
        ...(form.scopeMode === "selected_cities"
          ? { cities: form.cities }
          : {}),
        runNow,
      };
      const created = await api<SearchItem>("/api/searches", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setNotice(
        runNow
          ? `Extraction started for ${created.query}.`
          : `Saved “${created.name}”.`,
      );
      await refresh();
      setView(runNow ? "dashboard" : "search");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save search.",
      );
    }
  }
  async function runSaved(item: SearchItem) {
    try {
      await api(`/api/searches/${item.id}/run`, { method: "POST" });
      setNotice(`Extraction started for ${item.name}.`);
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not start search.",
      );
    }
  }
  async function cancelSearch() {
    const searchId = stats.activity?.searchId;
    if (!searchId) return;
    try {
      await api(`/api/searches/${searchId}/cancel`, { method: "POST" });
      setNotice("Search cancellation requested. Collected leads were preserved.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not cancel search."); }
  }
  async function updateCampaign(id: string, changes: { name?: string; description?: string; archived?: boolean; outreachMode?: "smart" | "general"; outreachService?: string }) {
    try {
      await api(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
      setNotice(changes.archived ? "Campaign archived. Global leads were preserved." : "Campaign updated.");
      if (changes.archived) setCampaignId("");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update campaign."); }
  }
  async function updateLead(lead: Lead, changes: Partial<Lead>) {
    await api(`/api/leads/${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: changes.lead_status ?? lead.lead_status,
        notes: changes.notes ?? lead.notes,
      }),
    });
    await refresh();
  }
  async function enrich(ids: string[], refreshContacts = false) {
    const uniqueIds = [...new Set(ids)];
    setSubmittingEnrichment((current) => [
      ...new Set([...current, ...uniqueIds]),
    ]);
    try {
      const result = await api<{
        queued: number;
        active: number;
        completed: number;
      }>("/api/enrichment/batch", {
        method: "POST",
        body: JSON.stringify({ leadIds: uniqueIds, refresh: refreshContacts }),
      });
      const messages = [
        result.queued ? `${result.queued} queued` : "",
        result.active ? `${result.active} already searching` : "",
        result.completed ? `${result.completed} already checked` : "",
      ].filter(Boolean);
      setNotice(
        messages.length
          ? `Contact discovery: ${messages.join(", ")}.`
          : "No eligible leads were selected.",
      );
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not queue contact discovery.",
      );
    } finally {
      setSubmittingEnrichment((current) =>
        current.filter((id) => !uniqueIds.includes(id)),
      );
    }
  }
  async function stopEnrichment() {
    try {
      const result = await api<{ stopped: number }>("/api/enrichment/stop", {
        method: "POST",
      });
      setNotice(
        `${result.stopped} queued enrichment task${result.stopped === 1 ? "" : "s"} stopped.`,
      );
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not stop queued enrichment.",
      );
    }
  }
  async function addToPipeline(ids: string[]) {
    try {
      const result = await api<{ crmAdded: number; emailAdded: number }>("/api/crm-email/batch", {
        method: "POST",
        body: JSON.stringify({ leadIds: ids }),
      });
      setNotice(
        `${result.crmAdded} added to CRM and ${result.emailAdded} added to E-mails.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not add leads to the pipeline.",
      );
    }
  }
  async function auditLeads(ids: string[]) {
    try {
      const result = await api<{
        queued: number;
        cached: number;
        unavailable: number;
      }>("/api/website-audits/batch", {
        method: "POST",
        body: JSON.stringify({ leadIds: ids }),
      });
      setNotice(
        `Website Intelligence: ${result.queued} queued${result.cached ? `, ${result.cached} already analyzed` : ""}${result.unavailable ? `, ${result.unavailable} without a listed website` : ""}.`,
      );
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not queue website audits.",
      );
    }
  }
  async function scoreLeads(ids: string[], profileKey: string) {
    try {
      const result = await api<{ runId: string; profileKey: string; status: string; total: number }>("/api/icp-scores/batch", { method: "POST", body: JSON.stringify({ leadIds: ids, profileKey }) });
      setIcpScoreRun({ ...result, processed: 0 });
      setNotice(`ICP scoring queued for ${result.total} leads.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not queue ICP scoring.");
    }
  }
  async function updateAutomaticContactDiscovery(enabled: boolean) {
    try {
      const updated = await api<WorkspaceSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ automaticContactDiscovery: enabled }),
      });
      setWorkspaceSettings(updated);
      setNotice(
        enabled
          ? "Automatic Contact Discovery is on for newly imported leads."
          : "Automatic Contact Discovery is off. Existing records are unchanged.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not update Contact Discovery settings.",
      );
    }
  }
  async function updateAutomaticWebsiteAudits(enabled: boolean) {
    try {
      const updated = await api<WorkspaceSettings>("/api/settings", { method: "PATCH", body: JSON.stringify({ automaticWebsiteAudits: enabled }) });
      setWorkspaceSettings(updated);
      setNotice(enabled ? "Automatic Website Intelligence is on for newly imported leads." : "Automatic Website Intelligence is off. Existing records are unchanged.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update Website Intelligence settings.");
    }
  }
  async function updateOutreachPreferences(outreachPreferences: OutreachPreferences) {
    try {
      const updated = await api<WorkspaceSettings>("/api/settings", { method: "PATCH", body: JSON.stringify({ outreachPreferences }) });
      setWorkspaceSettings(updated);
      setNotice(t("preferencesSaved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save outreach preferences.");
    }
  }
  async function updateInterfaceLanguage(next: UiLanguage) {
    setLanguage(next);
    try {
      const updated = await api<WorkspaceSettings>("/api/settings", { method: "PATCH", body: JSON.stringify({ interfaceLanguage: next }) });
      setWorkspaceSettings(updated);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save interface language.");
    }
  }
  async function updateIcpProfile(profile: IcpProfile, enabled: boolean) {
    try {
      await api(`/api/icp/profiles/${encodeURIComponent(profile.profile_key)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setNotice(`${profile.name} is now ${enabled ? "enabled" : "disabled"} as a new profile version.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update the scoring profile.");
    }
  }

  return (
    <GlobalAppShell sidebar={<Sidebar
      logoSrc="/assets/scout-logo-black.png"
      logoAlt="Scout"
      title={health === "connected" ? t("engineOnline") : health === "checking" ? t("engineChecking") : t("engineOffline")}
      mobileOpen={mobileNavOpen}
      onMobileOpenChange={setMobileNavOpen}
      labels={{ navigation: createTranslator(language)("uiMainNavigation"), open: createTranslator(language)("uiOpenMenu"), close: createTranslator(language)("uiCloseMenu") }}
      items={[
        { id: "dashboard", label: t("dashboard"), icon: <LayoutDashboard size={17} />, active: view === "dashboard", onSelect: () => { setView("dashboard"); setMobileNavOpen(false); } },
        { id: "campaigns", label: t("campaigns"), icon: <Tag size={17} />, active: view === "campaigns", onSelect: () => { setView("campaigns"); setMobileNavOpen(false); } },
        { id: "search", label: t("search"), icon: <Search size={17} />, active: view === "search", onSelect: () => { setView("search"); setMobileNavOpen(false); } },
        { id: "emails", label: t("sendsNav"), icon: <Send size={17} />, active: view === "emails", onSelect: () => { setView("emails"); setMobileNavOpen(false); } },
        { id: "pipeline", label: "CRM", icon: <Tag size={17} />, active: view === "pipeline", onSelect: () => { setView("pipeline"); setMobileNavOpen(false); } },
        { id: "settings", label: t("settings"), icon: <Settings size={17} />, active: view === "settings", onSelect: () => { setView("settings"); setMobileNavOpen(false); } },
      ]}
      footer={<><div className="local-dot"><i className={health === "connected" ? "connected" : health === "checking" ? "checking" : "disconnected"} /> {t("localWorkspace")}</div><p><strong>{health === "connected" ? t("engineOnline") : health === "checking" ? t("engineChecking") : t("engineOffline")}</strong></p></>}
    />}>
      <main className={`app-main ${view === "dashboard" ? "dashboard-main" : ""}`}>
        <PageContainer className="app-page-container">
        {!(view === "dashboard" || view === "settings" || view === "emails" || (view === "campaigns" && campaignId)) && <PageHeader
          className={`topbar ${view === "leads" ? "leads-topbar" : ""}`}
          title={view === "leads" ? t("leads") : view === "search" ? t("newSearch") : view === "campaigns" ? t("campaigns") : "CRM"}
          description={view === "leads" ? t("allImportedLeads") : view === "search" ? t("newSearchSubtitle") : view === "campaigns" ? createTranslator(language)("uiManageAndTrackYourProspectingCampaigns") : t("crmSubtitle")}
          actions={view === "search" || view === "pipeline" ? undefined : view === "leads" ? <div className="leads-header-actions"><button className="secondary" onClick={() => void refresh()}><Activity size={14} /> {t("refresh")}</button><button className="primary" onClick={() => setView("search")}><Plus size={15} /> {t("import")}</button></div> : <button className="primary" onClick={() => setView("search")}><Plus size={17} /> {t("newCampaign")}</button>}
        />}
        {notice && (
          <div className="notice" role="status" aria-live="polite">
            <Sparkles size={16} />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label={t("dismiss")}>
              <X size={15} />
            </button>
          </div>
        )}
        {view === "dashboard" && (
          <DashboardRedesign
            stats={stats}
            status={dashboardStatus}
            searches={searches}
            onSearch={() => setView("search")}
            onOpenCampaign={(id) => { setCampaignId(id); setView("campaigns"); }}
            onViewHighOpportunities={() => { setFilters({ q: "", country: "", region: "", city: "", cities: [], searchId: "", qualificationScope: "all", industry: "", category: "", unknownSource: false, websiteStatus: "all", hasInstagram: false, hasEmail: false, hasFacebook: false, hasAnyDigitalContact: false, noDigitalContact: false, verifiedContactsOnly: false, noWebsiteHasInstagram: false, auditStatus: "all", opportunity: "high", contactAvailability: "all", issueSeverity: "all", minWebsiteScore: "", signalCode: "", minSignalConfidence: "", signalFreshnessDays: "", icpProfile: "website_redesign", minIcpScore: "", sort: "" }); setLeadMode("all"); setView("leads"); }}
            onViewCampaigns={() => { setCampaignId(""); setView("campaigns"); }}
            onRetry={() => { setDashboardStatus("loading"); void refresh().catch((error: Error) => { setDashboardStatus("error"); setNotice(error.message); }); }}
          />
        )}
        {view === "search" && (
          <SearchView
            form={form}
            setForm={setForm}
            countries={visibleCountries}
            countryName={countryName}
            industries={industries}
            territory={territory}
            setTerritory={setTerritory}
            onSave={saveSearch}
            canRun={canRun}
            clearNotice={() => setNotice("")}
          />
        )}
        {view === "campaigns" && (
          <CampaignsView
            campaigns={searches}
            selectedId={campaignId}
            onSelect={(id: string) => { setCampaignDrawerLead(null); setCampaignId(id); }}
            onCreate={() => setView("search")}
            onRun={runSaved}
            onUpdate={updateCampaign}
            onOpenLeads={(id: string) => { setCampaignDrawerLead(null); setSelectedLeads([]); setFilters({ ...filters, searchId: id, qualificationScope: "all", industry: "", category: "", unknownSource: false, q: id ? filters.q : "" }); setLeadMode("all"); setView("leads"); }}
            onOpenLeadDetails={(lead: Lead) => setCampaignDrawerLead(lead)}
            workspaceSettings={workspaceSettings}
            onPreferencesChange={updateOutreachPreferences}
            onNotice={setNotice}
          />
        )}
        {view === "leads" && (
          <LeadsView
            leads={leads}
            stats={stats}
            filters={filters}
            setFilters={setFilters}
            onUpdate={updateLead}
            selected={selectedLeads}
            setSelected={setSelectedLeads}
            onEnrich={enrich}
            onRetry={(id: string) => enrich([id], true)}
            onStop={stopEnrichment}
            submitting={submittingEnrichment}
            leadMode={leadMode}
            setLeadMode={setLeadMode}
            searchCollections={searchCollections}
            industryCollections={industryCollections}
            unknownSourceCount={unknownSourceCount}
            onAddPipeline={addToPipeline}
            onAuditBatch={auditLeads}
            icpProfiles={icpProfiles}
            onScoreBatch={scoreLeads}
            icpScoreRun={icpScoreRun}
          />
        )}
        {view !== "leads" && campaignDrawerLead && (
          <LeadsView
            leads={leads}
            stats={stats}
            filters={filters}
            setFilters={setFilters}
            onUpdate={updateLead}
            selected={selectedLeads}
            setSelected={setSelectedLeads}
            onEnrich={enrich}
            onRetry={(id: string) => enrich([id], true)}
            onStop={stopEnrichment}
            submitting={submittingEnrichment}
            leadMode={leadMode}
            setLeadMode={setLeadMode}
            searchCollections={searchCollections}
            industryCollections={industryCollections}
            unknownSourceCount={unknownSourceCount}
            onAddPipeline={addToPipeline}
            onAuditBatch={auditLeads}
            icpProfiles={icpProfiles}
            onScoreBatch={scoreLeads}
            icpScoreRun={icpScoreRun}
            externalLead={campaignDrawerLead}
            drawerOnly
            onDrawerClose={() => setCampaignDrawerLead(null)}
          />
        )}
        {view === "pipeline" && (
          <PipelineView
            industries={industryCollections}
            searches={searchCollections}
          />
        )}
        {view === "emails" && <OutboxView onNotice={setNotice} />}
        {view === "settings" && (
          <SettingsView
            health={health}
            settings={workspaceSettings}
            chatGptStatus={chatGptStatus}
            onChatGptStatusChange={setChatGptStatus}
            onAutomaticDiscoveryChange={updateAutomaticContactDiscovery}
            onAutomaticWebsiteAuditsChange={updateAutomaticWebsiteAudits}
            onPreferencesChange={updateOutreachPreferences}
            onInterfaceLanguageChange={updateInterfaceLanguage}
            icpProfiles={icpProfiles}
            onIcpProfileEnabledChange={updateIcpProfile}
          />
        )}
        </PageContainer>
      </main>
    </GlobalAppShell>
  );
}

type CohortNodeUi = { type: "group"; operator: "AND" | "OR" | "NOT"; children: CohortNodeUi[] } | { type: "condition"; field: string; operator: string; value: any; label?: string };
const newCohortCondition = (): CohortNodeUi => ({ type: "condition", field: "industry", operator: "contains", value: "", label: "" });
const newCohortGroup = (): CohortNodeUi => ({ type: "group", operator: "AND", children: [newCohortCondition()] });
const cohortFields = ["industry", "category", "country", "state", "city", "website", "contact", "decision_role", "signal", "signal_status", "signal_confidence", "signal_freshness", "icp_score"];
function CohortNodeEditor({ node, onChange, onRemove }: { node: CohortNodeUi; onChange: (node: CohortNodeUi) => void; onRemove?: () => void }) {
  const { t, language } = useI18n();
  if (node.type === "group") return <fieldset className="cohort-group"><legend><select value={node.operator} onChange={(event) => onChange({ ...node, operator: event.target.value as "AND" | "OR" | "NOT" })}><option>AND</option><option>OR</option><option>NOT</option></select> group {onRemove && <button className="text-button" onClick={onRemove}>{t("remove")}</button>}</legend>{node.children.map((child, index) => <CohortNodeEditor key={index} node={child} onChange={(next) => onChange({ ...node, children: node.children.map((item, itemIndex) => itemIndex === index ? next : item) })} onRemove={node.children.length > 1 ? () => onChange({ ...node, children: node.children.filter((_, itemIndex) => itemIndex !== index) }) : undefined} />)}<div className="cohort-builder-actions"><button className="secondary" onClick={() => onChange({ ...node, children: [...node.children, newCohortCondition()] })}>{t("condition")}</button><button className="secondary" onClick={() => onChange({ ...node, children: [...node.children, newCohortGroup()] })}>{t("nestedGroup")}</button></div></fieldset>;
  const update = (changes: Partial<Extract<CohortNodeUi, { type: "condition" }>>) => onChange({ ...node, ...changes } as CohortNodeUi);
  const field = node.field;
  const simpleOperator = ["industry", "category", "country", "state", "city"].includes(field) ? ["eq", "neq", "contains"] : field === "decision_role" ? ["contains", "eq"] : field === "signal" ? ["exists", "missing"] : field === "signal_confidence" || field === "icp_score" ? ["gte", "lte"] : field === "signal_freshness" ? ["within_days"] : ["eq"];
  const objectValue = field === "signal_confidence" ? (node.value && typeof node.value === "object" ? node.value : { signal: "", min: 0.8 }) : field === "signal_freshness" ? (node.value && typeof node.value === "object" ? node.value : { signal: "", days: 90 }) : field === "icp_score" ? (node.value && typeof node.value === "object" ? node.value : { profile: "", score: 70 }) : null;
  return <div className="cohort-condition"><select value={field} onChange={(event) => { const next = event.target.value; update({ field: next, operator: next === "signal" ? "exists" : next === "signal_freshness" ? "within_days" : next === "signal_confidence" || next === "icp_score" ? "gte" : "eq", value: next === "website" ? "present" : next === "contact" ? "present" : next === "signal_confidence" ? { signal: "", min: 0.8 } : next === "signal_freshness" ? { signal: "", days: 90 } : next === "icp_score" ? { profile: "", score: 70 } : "" }); }}><option value="">{t("chooseField")}</option>{cohortFields.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><select value={node.operator} onChange={(event) => update({ operator: event.target.value })}>{simpleOperator.map((item) => <option key={item}>{item}</option>)}</select>{field === "website" || field === "contact" ? <select value={String(node.value)} onChange={(event) => update({ value: event.target.value })}><option value="present">{t("present")}</option><option value="missing">{t("missingEvidence")}</option>{field === "contact" && <option value="verified">{t("verifiedContact")}</option>}</select> : objectValue ? <><input value={String(objectValue.signal ?? objectValue.profile ?? "")} placeholder={field === "icp_score" ? "ICP profile key" : "Signal code"} onChange={(event) => update({ value: { ...objectValue, ...(field === "icp_score" ? { profile: event.target.value } : { signal: event.target.value }) } })} /><input type="number" value={String(objectValue.min ?? objectValue.days ?? objectValue.score ?? 0)} onChange={(event) => update({ value: { ...objectValue, ...(field === "signal_confidence" ? { min: Number(event.target.value) } : field === "signal_freshness" ? { days: Number(event.target.value) } : { score: Number(event.target.value) }) } })} /></> : <input value={String(node.value ?? "")} placeholder={t("value")} onChange={(event) => update({ value: event.target.value })} />}<input value={node.label ?? ""} placeholder={t("whyCondition")} onChange={(event) => update({ label: event.target.value })} />{onRemove && <button className="text-button" onClick={onRemove} aria-label={t("remove")}>×</button>}</div>;
}
function CohortsView({ onNotice, onOpenCampaign }: { onNotice: (message: string) => void; onOpenCampaign: (id: string) => void }) {
  const { t, language } = useI18n();
  const [cohorts, setCohorts] = useState<any[]>([]); const [selectedId, setSelectedId] = useState(""); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [definition, setDefinition] = useState<CohortNodeUi>(newCohortGroup()); const [preview, setPreview] = useState<any>({ rows: [], total: 0 }); const [page, setPage] = useState(0); const [campaigns, setCampaigns] = useState<SearchItem[]>([]); const [campaignId, setCampaignId] = useState("");
  const load = async () => { const [next, nextCampaigns] = await Promise.all([api<any[]>("/api/cohorts"), api<SearchItem[]>("/api/campaigns")]); setCohorts(next); setCampaigns(nextCampaigns); if (!selectedId && next[0]) select(next[0]); };
  const select = (cohort: any) => { setSelectedId(cohort.id); setName(cohort.name); setDescription(cohort.description ?? ""); setDefinition(cohort.definition ?? newCohortGroup()); setPage(0); };
  const refreshPreview = async () => { if (!selectedId && !name) return; setPreview(await api<any>("/api/cohorts/preview", { method: "POST", body: JSON.stringify({ definition, limit: 20, offset: page * 20 }) })); };
  useEffect(() => { void load().catch(() => undefined); }, []);
  useEffect(() => { void refreshPreview().catch(() => undefined); }, [selectedId, page, definition]);
  const save = async () => { const payload = { name: name || "Untitled cohort", description, definition }; const result = selectedId ? await api<any>(`/api/cohorts/${selectedId}`, { method: "PATCH", body: JSON.stringify(payload) }) : await api<any>("/api/cohorts", { method: "POST", body: JSON.stringify(payload) }); setSelectedId(result.id); onNotice(t("cohortSaved")); await load(); };
  const create = () => { setSelectedId(""); setName("New cohort"); setDescription(""); setDefinition(newCohortGroup()); setPreview({ rows: [], total: 0 }); };
  const apply = async () => { if (!selectedId) return; const result = await api<any>(`/api/cohorts/${selectedId}/campaign`, { method: "POST", body: JSON.stringify(campaignId ? { campaignId } : {}) }); onNotice(`${result.added} leads added to the campaign.`); if (result.campaignId) onOpenCampaign(result.campaignId); };
  return <section className="cohort-workspace"><div className="section-head"><div><p className="crumb">{t("persistedSegmentation")}</p><h2>{t("cohortBuilder")}</h2><span>{t("cohortHelp")}</span></div><button className="primary" onClick={create}><Plus size={15} /> {t("newCohort")}</button></div><div className="cohort-layout"><aside className="panel cohort-index"><input value="" readOnly placeholder={t("searchCohorts")} />{cohorts.map((cohort) => <button key={cohort.id} className={cohort.id === selectedId ? "active" : ""} onClick={() => select(cohort)}><strong data-no-translate>{cohort.name}</strong><small>{cohort.match_count ?? 0} {t("matchingLeads").toLowerCase()}</small></button>)}</aside><main className="panel cohort-editor"><div className="settings-form-grid"><label>{t("name")}<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>{t("description")}<input value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><h3>{t("conditions")}</h3><CohortNodeEditor node={definition} onChange={setDefinition} /><div className="cohort-toolbar"><button className="primary" onClick={() => void save()}>{t("saveCohort")}</button><button className="secondary" disabled={!selectedId} onClick={async () => { const copy = await api<any>(`/api/cohorts/${selectedId}/duplicate`, { method: "POST" }); await load(); select(copy); }}>{t("duplicate")}</button><button className="secondary danger" disabled={!selectedId} onClick={async () => { await api(`/api/cohorts/${selectedId}`, { method: "DELETE" }); create(); await load(); }}>{t("delete")}</button><select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">{t("createCampaignFromCohort")}</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{t("addToPipeline")} {campaign.name}</option>)}</select><button className="secondary" disabled={!selectedId} onClick={() => void apply()}>{t("applyMatches")}</button></div><div className="cohort-preview"><div className="campaign-tab-head"><div><h3>{t("matchingLeads")}</h3><p>{preview.total ?? 0} {t("dynamicMatches")} · {t("noEnrichmentHere")}</p></div></div>{preview.rows?.map((row: any) => <article key={row.id}><strong data-no-translate>{row.title}</strong><span>{[row.city, row.region, row.country_code].filter(Boolean).join(", ")}</span><em>ICP {row.icp_score ?? "—"}</em><small>{row.reasons?.join(" · ") || t("matchedByConditions")}</small></article>)}<div className="pagination"><button className="secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>{t("previous")}</button><span>Page {page + 1}</span><button className="secondary" disabled={(page + 1) * 20 >= (preview.total ?? 0)} onClick={() => setPage((current) => current + 1)}>{t("next")}</button></div></div></main></div></section>;
}

function SharedLeadTable({ leads, onDetails }: { leads: any[]; onDetails: (lead: any) => void }) {
  const { language } = useI18n();
  const opportunity = (lead: any) => lead.opportunity_level === "high" || lead.opportunity_level === "medium" || lead.opportunity_level === "low"
    ? <div className="opportunity-primary"><span className={`badge badge-${lead.opportunity_level === "high" ? "success" : lead.opportunity_level === "medium" ? "warning" : "info"}`}>{localizeOpportunityLevel(language, lead.opportunity_level)}</span><span className="opportunity-score">{lead.opportunity_score}/100 · {lead.opportunity_issue_count} {localizeOpportunityTerm(language, lead.opportunity_issue_count === 1 ? "issue" : "issues")}</span></div>
    : <span className="badge badge-neutral">{localizeOpportunityLevel(language, "insufficient_evidence")}</span>;
  return <div className="lead-table contacts-table shared-campaign-lead-table"><div className="table-head"><span>{createTranslator(language)("uiLeadBusiness")}</span><span>{createTranslator(language)("uiEmailContact")}</span><span>{createTranslator(language)("uiOpportunity")}</span><span>{createTranslator(language)("uiActions")}</span></div>{leads.map((lead) => <div className="lead-row lead-row-card" key={lead.id} role="button" tabIndex={0} onClick={(event) => { if ((event.target as HTMLElement).closest("button, a, input, summary")) return; onDetails(lead); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onDetails(lead); } }}><div className="lead-identity"><span className="lead-avatar" aria-hidden="true">{lead.title?.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("")}</span><div className="lead-copy"><div className="lead-title-line"><strong data-no-translate title={lead.title}>{lead.title}</strong>{lead.pipeline_status && <span className="crm-tag">CRM</span>}</div><p className="lead-location"><MapPin size={12} />{[lead.city, lead.region].filter(Boolean).join(", ") || (createTranslator(language)("uiLocationUnavailable"))}</p></div></div><div className="contact-links">{lead.business_email && <CopyEmailButton email={lead.business_email} />}{lead.phone && <a href={`tel:${lead.phone}`} aria-label={createTranslator(language)("uiCallBusiness")}><Phone size={15} /></a>}{lead.website && <a href={/^https?:\/\//.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" aria-label="Website"><Globe2 size={15} /></a>}</div><div className="lead-evidence"><div className="website-opportunity-cell">{opportunity(lead)}<em className="opportunity-meta">{localizeOpportunityTerm(language, lead.website_audit_status === "completed" ? "Audit complete" : lead.website_audit_status === "partial" ? "Audit partial" : lead.website_audit_status === "access_restricted" ? "Access restricted" : "Awaiting audit")}</em></div></div><div className="lead-actions"><button className="quiet-action open-details" onClick={() => onDetails(lead)}><PanelRightOpen size={14} /> {createTranslator(language)("uiDetails")}</button></div></div>)}</div>;
}

function CampaignsView({ campaigns, selectedId, onSelect, onCreate, onRun, onUpdate, onOpenLeads, onOpenLeadDetails, workspaceSettings, onPreferencesChange, onNotice }: {
  campaigns: SearchItem[]; selectedId: string; onSelect: (id: string) => void; onCreate: () => void;
  onRun: (campaign: SearchItem) => void; onUpdate: (id: string, changes: { name?: string; description?: string; archived?: boolean; outreachMode?: "smart" | "general"; outreachService?: string }) => void; onOpenLeads: (id: string) => void; onOpenLeadDetails: (lead: Lead) => void; workspaceSettings: WorkspaceSettings; onPreferencesChange: (preferences: OutreachPreferences) => void; onNotice: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("overview");
  const [detail, setDetail] = useState<any>(null);
  const [leadPreview, setLeadPreview] = useState<any[]>([]);
  const [candidatePreview, setCandidatePreview] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [showTechnicalHistory, setShowTechnicalHistory] = useState(false);
  const active = campaigns.filter(campaignIsActive);
  const available = campaigns.filter((item) => !item.archived_at);
  const primaryCampaigns = available.filter(campaignShouldAppear).sort(compareCampaignsForIndex);
  const historyCampaigns = available.filter((item) => !campaignShouldAppear(item)).sort(compareCampaignsForIndex);
  const visible = (showTechnicalHistory ? [...primaryCampaigns, ...historyCampaigns] : primaryCampaigns)
    .filter((item) => `${item.name} ${item.category} ${item.country_name}`.toLowerCase().includes(query.toLowerCase()));
  const selected = available.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!selectedId) { setDetail(null); setCandidatePreview([]); return; }
    const refresh = () => {
      api<any>(`/api/campaigns/${selectedId}`).then(setDetail).catch(() => setDetail(null));
      api<{ rows: any[] }>(`/api/campaigns/${selectedId}/leads?limit=200`).then((result) => setLeadPreview(result.rows)).catch(() => setLeadPreview([]));
      api<any[]>(`/api/qualification/candidates?searchId=${selectedId}`).then(setCandidatePreview).catch(() => setCandidatePreview([]));
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId]);
  const metrics = primaryCampaigns.reduce((sum, item) => ({
    leads: sum.leads + Number(item.metrics?.lead_count ?? 0),
    contacts: sum.contacts + Number(item.metrics?.contact_count ?? 0),
    audits: sum.audits + Number(item.metrics?.audit_count ?? 0),
    high: sum.high + Number(item.metrics?.high_icp_count ?? 0),
  }), { leads: 0, contacts: 0, audits: 0, high: 0 });
  if (selected) return <section className="campaign-workspace">
    <header className="campaign-detail-head">
      <div className="campaign-detail-main">
        <nav className="campaign-breadcrumb" aria-label={createTranslator(language)("uiCampaignNavigation")}>
          <button type="button" onClick={() => onSelect("")}>{t("campaigns")}</button>
          <ChevronRight size={14} aria-hidden="true" />
          <span data-no-translate>{selected.name}</span>
        </nav>
        <div className="campaign-detail-title">
          <h2 data-no-translate>{selected.name}</h2>
          <span>{selected.category} · {selected.country_name}</span>
        </div>
      </div>
      <div className="campaign-head-actions">
        <button className="secondary" onClick={() => onRun(selected)} disabled={["running", "starting", "qualifying"].includes(selected.status)}><Play size={14} /> {["running", "starting"].includes(selected.status) ? t("extracting") : selected.status === "qualifying" ? (createTranslator(language)("uiQualifyingLeads")) : t("runResearch")}</button>
        <button className="secondary" onClick={() => onOpenLeads(selected.id)}><Building2 size={14} /> {t("openLeads")}</button>
      </div>
    </header>
    <div className="campaign-tabs" role="tablist">{[["overview", t("overview")], ["leads", t("leads")], ["outreach", t("outreach")], ["settings", t("settings")]].map(([item, label]) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{label}</button>)}</div>
    {tab === "overview" && <div className="campaign-detail-grid"><section className="panel"><h3>{t("campaignStatistics")}</h3><div className="campaign-metrics"><span><small>{t("uniqueLeads")}</small><strong>{selected.metrics?.lead_count ?? 0}</strong></span><span><small>{t("contactsFound")}</small><strong>{selected.metrics?.contact_count ?? 0}</strong></span><span><small>{t("auditsCompleted")}</small><strong>{selected.metrics?.audit_count ?? 0}</strong></span><span><small>{t("highIcp")}</small><strong>{selected.metrics?.high_icp_count ?? 0}</strong></span></div></section><section className="panel"><h3>{createTranslator(language)("uiQualification")}</h3><div className="campaign-metrics"><span><small>{createTranslator(language)("uiQualifiedTarget")}</small><strong>{selected.extraction_target ?? 0}</strong></span><span><small>{createTranslator(language)("uiDiscovered")}</small><strong>{selected.qualification_progress?.extracted ?? 0}</strong></span><span><small>{createTranslator(language)("uiQualified")}</small><strong>{selected.qualification_progress?.qualified ?? 0}</strong></span><span><small>{createTranslator(language)("uiRemaining")}</small><strong>{selected.qualification_progress?.remainingTarget ?? 0}</strong></span></div><small>{t("qualificationProgressSummary", { audits: formatNumber(selected.qualification_progress?.auditsCompleted ?? 0, language), visual: formatNumber(selected.qualification_progress?.visualCompleted ?? 0, language), incomplete: formatNumber(selected.qualification_progress?.incomplete ?? 0, language) })}</small></section><section className="panel"><h3>{t("searchConfiguration")}</h3><p>{selected.category} · {selected.scope_mode === "entire_country" ? `${t("entireCountry")} ${selected.country_name}` : selected.scope_mode === "selected_regions" ? (selected.regions ?? []).join(", ") : (selected.cities ?? []).join(", ")}</p><small>{selected.query}</small></section><section className="panel wide"><h3>{t("runsActivity")}</h3>{detail?.runs?.length ? <div className="campaign-history">{detail.runs.map((run: any) => <article key={run.id}><span className={`badge badge-${run.status === "completed" ? "success" : run.status === "failed" ? "error" : "info"}`}>{statusLabel(String(run.status), language)}</span><strong>{run.completed_jobs ?? 0}/{run.job_count ?? 0} {t("jobsComplete")}</strong><small>{formatDate(run.started_at, language, { dateStyle: "short", timeStyle: "short" })}</small></article>)}</div> : <p className="audit-empty">{t("noRuns")}</p>}</section></div>}
    {tab === "leads" && (() => {
      const states = candidatePreview.map((candidate) => ({ candidate, state: qualificationProcessingState(candidate) }));
      const activeCandidates = states.filter(({ state }) => state === "active");
      const queuedCandidates = states.filter(({ state }) => state === "queued" || state === "partial" || state === "waiting");
      const blockedCandidates = states.filter(({ state }) => state === "restricted" || state === "failed");
      return <section className="panel campaign-leads-panel"><div className="campaign-tab-head"><div><h3>{createTranslator(language)("uiQualifiedLeads")}</h3><p>{createTranslator(language)("uiTheSharedLeadsWorkspaceStructureFilteredToThisCampaign")}</p></div><button className="secondary" onClick={() => onOpenLeads(selected.id)}>{createTranslator(language)("uiOpenFullLeadsWorkspace")}</button></div>{leadPreview.length ? <SharedLeadTable leads={leadPreview} onDetails={onOpenLeadDetails} /> : <p className="audit-empty">{createTranslator(language)("uiNoQualifiedLeadsAreAvailableForThisCampaignYet")}</p>}<div className="campaign-candidate-preview"><div className="candidate-progress-head"><div><h3>{createTranslator(language)("uiQualificationTracking")}</h3><p>{t("candidateProgressSummary", { active: formatNumber(activeCandidates.length, language), pending: formatNumber(queuedCandidates.length, language), blocked: formatNumber(blockedCandidates.length, language) })}</p></div><span className="candidate-progress-count">{candidatePreview.length}</span></div>{activeCandidates.length > 0 && <div className="candidate-current-callout"><span className="candidate-live-dot" aria-hidden="true" /><div><strong>{createTranslator(language)("uiAuditInProgressNow")}</strong><p>{activeCandidates.map(({ candidate }) => candidate.title).join(" · ")}</p></div></div>}<div className="candidate-groups">{[...activeCandidates, ...queuedCandidates, ...blockedCandidates].map(({ candidate, state }) => <article key={candidate.id} className={`candidate-state-${qualificationStateTone(state)}`}><div className="candidate-main"><strong data-no-translate>{candidate.title}</strong><span>{localizeQualificationStage(language, candidate.qualification_stage ?? "")}</span></div><div className="candidate-state"><span className={`candidate-status candidate-status-${qualificationStateTone(state)}`}>{qualificationStateLabel(language, state)}</span>{candidate.website_audit_task_stage && state === "active" && <small>{localizeQualificationStage(language, candidate.website_audit_task_stage)}</small>}</div>{(candidate.qualification_error || candidate.website_audit_task_error) && <small className="candidate-reason">{localizeQualificationReason(language, candidate.qualification_error || candidate.website_audit_task_error)}</small>}</article>)}</div>{!candidatePreview.length && <small>{createTranslator(language)("uiNoPendingOrBlockedCandidates")}</small>}</div></section>;
    })()}
    {tab === "outreach" && <><div className="campaign-outbox-bar"><div><strong>{t("campaignEmails")}</strong><span>{t("campaignEmailsHelp")}</span></div><CampaignOutboxLauncher campaignId={selected.id} onNotice={onNotice} /></div><GlobalEmailsView campaignId={selected.id} campaignName={selected.name} preferences={workspaceSettings.outreachPreferences} onPreferencesChange={onPreferencesChange} /></>}
    {tab === "settings" && <CampaignSettings campaign={selected} onUpdate={onUpdate} />}
  </section>;
  const filtered = visible.filter((item) => status === "all" || item.status === status);
  return <section className="campaign-index">
    {active.length > 0 && <section className="campaign-active-section"><div className="campaign-section-head"><div><h2>{createTranslator(language)("uiActiveCampaigns")}</h2><p>{createTranslator(language)("uiTrackCurrentWorkAndRealProgress")}</p></div><span className="campaign-section-count">{active.length}</span></div><div className="dashboard-active-campaign-list">{active.sort(compareCampaignsForIndex).map((campaign) => <CampaignProgressCard key={campaign.id} search={campaign} onOpen={() => onSelect(campaign.id)} language={language} />)}</div></section>}
    <div className="campaign-summary" aria-label={createTranslator(language)("uiCampaignSummary")}>
      <CampaignMetricCard label={t("activeCampaigns")} value={active.length} icon={<Tag />} language={language} />
      <CampaignMetricCard label={t("uniqueMemberships")} value={metrics.leads} icon={<Building2 />} language={language} />
      <CampaignMetricCard label={t("contactsFound")} value={metrics.contacts} icon={<CircleUserRound />} language={language} />
      <CampaignMetricCard label={createTranslator(language)("uiSitesAnalyzed")} value={metrics.audits} icon={<Globe2 />} language={language} />
    </div>
    <section className="campaign-table-surface" aria-labelledby="all-campaigns-heading">
      <div className="campaign-table-heading"><h2 id="all-campaigns-heading">{createTranslator(language)("uiAllCampaigns")}</h2><span>{filtered.length} {createTranslator(language)("uiCampaigns")}</span></div>
      <div className="campaign-filter">
        <label className="campaign-search-field"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchCampaigns")} aria-label={t("searchCampaigns")} /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t("allStatuses")}><option value="all">{t("allStatuses")}</option><option value="running">{t("extracting")}</option><option value="qualifying">{createTranslator(language)("uiQualifying")}</option><option value="completed">{t("completed")}</option><option value="completed_with_shortfall">{createTranslator(language)("uiCoverageExhausted")}</option><option value="cancelled">{t("cancelled")}</option>{showTechnicalHistory && <><option value="saved">{t("saved")}</option><option value="completed_with_errors">{t("withErrors")}</option><option value="failed">{createTranslator(language)("uiFailed")}</option></>}</select>
        <button type="button" className={`secondary history-toggle ${showTechnicalHistory ? "active" : ""}`} onClick={() => setShowTechnicalHistory((current) => !current)}>{createTranslator(language)("uiTechnicalHistory")} <small>{historyCampaigns.length}</small></button>
        <button type="button" className="secondary global-leads-access" onClick={() => onOpenLeads("")}><Building2 size={14} /> {t("allLeadsAccess")}</button>
      </div>
      {filtered.length ? <div className="campaign-table-scroll"><table className="campaign-table"><thead><tr><th scope="col">{createTranslator(language)("uiCampaign")}</th><th scope="col">Status</th><th scope="col">{t("leads")}</th><th scope="col">{t("contacts")}</th><th scope="col">{createTranslator(language)("uiWebsites")}</th><th scope="col"><span className="sr-only">{createTranslator(language)("uiOpenCampaign")}</span></th></tr></thead><tbody>{filtered.map((campaign) => <tr key={campaign.id} tabIndex={0} onClick={() => onSelect(campaign.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(campaign.id); } }}><th scope="row"><span data-no-translate className="campaign-table-name">{campaign.name}</span><span data-no-translate className="campaign-table-meta">{campaign.category} · {campaign.country_name}</span></th><td><span className={`campaign-status-badge ${campaign.status}`}><i aria-hidden="true" />{statusLabel(campaign.status, language)}</span></td><td>{campaign.metrics?.lead_count ?? 0}</td><td>{campaign.metrics?.contact_count ?? 0}</td><td>{campaign.metrics?.audit_count ?? 0}</td><td><button type="button" className="campaign-open-action" aria-label={`${createTranslator(language)("uiOpenCampaign2")}: ${campaign.name}`} onClick={(event) => { event.stopPropagation(); onSelect(campaign.id); }}><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div> : <div className="campaign-table-empty"><Empty title={t("noCampaigns")} body={t("noCampaignsHelp")} action={t("newCampaign")} onClick={onCreate} /></div>}
      <div className="campaign-table-footer">{t("campaignsShown", { count: formatNumber(filtered.length, language) })}</div>
    </section>
  </section>;
}

function CampaignMetricCard({ label, value, icon, language }: { label: string; value: number; icon: ReactNode; language: UiLanguage }) {
  return <article className="campaign-metric-card"><div><span>{label}</span><i aria-hidden="true">{icon}</i></div><strong>{formatNumber(value, language)}</strong></article>;
}

function CampaignSettings({ campaign, onUpdate }: { campaign: SearchItem; onUpdate: (id: string, changes: { name?: string; description?: string; archived?: boolean; outreachMode?: "smart" | "general"; outreachService?: string }) => void }) {
  const { t, language } = useI18n();
  const [mode, setMode] = useState<"smart" | "general">(campaign.outreach_mode ?? "smart");
  const [service, setService] = useState(campaign.outreach_service ?? "");
  return <section className="panel campaign-settings"><label>{t("name")}<input defaultValue={campaign.name} onBlur={(event) => event.target.value !== campaign.name && onUpdate(campaign.id, { name: event.target.value, description: campaign.description ?? "" })} /></label><label>{t("description")}<textarea defaultValue={campaign.description} placeholder={createTranslator(language)("uiDescribeTheResearchObjective")} onBlur={(event) => event.target.value !== (campaign.description ?? "") && onUpdate(campaign.id, { name: campaign.name, description: event.target.value })} /></label><div className="campaign-config-readonly"><strong>{t("searchConfiguration")}</strong><span>{campaign.category}</span><span>{campaign.scope_mode === "entire_country" ? `${t("entireCountry")} ${campaign.country_name}` : campaign.scope_mode === "selected_regions" ? (campaign.regions ?? []).join(", ") : (campaign.cities ?? []).join(", ")}</span><small>{campaign.query}</small></div><div className="campaign-outreach-settings"><div><h3>{t("outreach")}</h3><p>{createTranslator(language)("uiSmartOutreachUsesVerifiedCommercialEvidenceGeneralOutreachUses")}</p></div><label>{createTranslator(language)("uiMode")}<select value={mode} onChange={(event) => setMode(event.target.value as "smart" | "general")}><option value="smart">{t("smartOutreach")}</option><option value="general">{t("generalOutreach")}</option></select></label><label>{createTranslator(language)("uiDefaultService")}<input value={service} onChange={(event) => setService(event.target.value)} placeholder={t("serviceExample")} /></label><button className="secondary" onClick={() => onUpdate(campaign.id, { outreachMode: mode, outreachService: service })}>{createTranslator(language)("uiSaveOutreachSettings")}</button></div><p>{createTranslator(language)("uiConfigurationIsSnapshottedFromTheGoogleMapsSearchUI")}</p><button className="secondary danger" onClick={() => onUpdate(campaign.id, { archived: true })}>{createTranslator(language)("uiArchiveCampaign")}</button></section>;
}

type OutreachLead = { id: string; title: string; business_email?: string; city?: string; region?: string; icp_score?: number | null; draft_status: string; draft_updated_at: string; contacted_at?: string; review_notes?: string; repeat_outreach_risk?: number; };
type OutreachEvidence = { id: string; source?: string; label?: string; detail?: string; excerpt?: string; url?: string; verificationStatus?: string; confidence?: number };
type OutreachDraft = { subject: string; body: string; language: "en" | "pt-BR"; tone: string; service: string; provider: string; model: string; usage: Record<string, unknown>; evidence: Array<Record<string, unknown>>; generationHistory: Array<Record<string, unknown>>; reviewStatus: string; contactedAt: string; reviewNotes: string; translatedSubject: string; translatedBody: string; translationLanguage: string; translationProvider: string; translationModel: string; repeatConflict?: Record<string, unknown> | null; };
const blankOutreachDraft = (language: "en" | "pt-BR" = "en", tone = "professional"): OutreachDraft => ({ subject: "", body: "", language, tone, service: "", provider: "", model: "", usage: {}, evidence: [], generationHistory: [], reviewStatus: "not_generated", contactedAt: "", reviewNotes: "", translatedSubject: "", translatedBody: "", translationLanguage: "", translationProvider: "", translationModel: "" });
function OutreachStudio({ campaignId, preferences, mode, service, onNotice }: { campaignId: string; preferences: OutreachPreferences; mode: "smart" | "general"; service: string; onNotice: (message: string) => void }) {
  const { t, language } = useI18n();
  const [leads, setLeads] = useState<OutreachLead[]>([]); const [query, setQuery] = useState(""); const [selectedId, setSelectedId] = useState(""); const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<OutreachDraft>(blankOutreachDraft(preferences.defaultLanguage, preferences.tone));
  const [contextEvidence, setContextEvidence] = useState<OutreachEvidence[]>([]); const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<Record<string, OutreachDraft>>({}); const [busy, setBusy] = useState(false); const [translationBusy, setTranslationBusy] = useState(false); const [run, setRun] = useState<any>(null); const [error, setError] = useState("");
  const [modelInfo, setModelInfo] = useState<{ selected: string; lunaAvailable: boolean }>({ selected: "", lunaAvailable: false }); const [outboxOpen, setOutboxOpen] = useState(false); const [mailAccounts, setMailAccounts] = useState<MailAccountSummary[]>([]);
  const visible = leads.filter((lead) => `${lead.title} ${lead.business_email ?? ""} ${lead.city ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const loadDraft = async (leadId: string) => { const [next, context] = await Promise.all([api<OutreachDraft | null>(`/api/campaigns/${campaignId}/outreach/${leadId}/draft`), api<{ evidence: OutreachEvidence[] }>(`/api/campaigns/${campaignId}/outreach/${leadId}/context`)]); setDraft(next ?? blankOutreachDraft(preferences.defaultLanguage, preferences.tone)); setContextEvidence(context.evidence ?? []); setEvidenceIds((next?.evidence ?? context.evidence ?? []).map((item: any) => String(item.id)).filter(Boolean)); };
  const save = async () => { if (!selectedId) return; const next = await api<OutreachDraft>(`/api/campaigns/${campaignId}/outreach/${selectedId}/draft`, { method: "PATCH", body: JSON.stringify(draft) }); setDraft(next); setSavedDrafts((current) => ({ ...current, [selectedId]: next })); setLeads((current) => current.map((lead) => lead.id === selectedId ? { ...lead, draft_status: next.reviewStatus, draft_updated_at: new Date().toISOString(), review_notes: next.reviewNotes } : lead)); onNotice(t("draftSaved")); };
  const choose = async (leadId: string) => { if (selectedId) await save(); setSelectedId(leadId); setError(""); await loadDraft(leadId); };
  const generate = async () => { if (!selectedId) return; setBusy(true); setError(""); try { const result = await api<{ draft: OutreachDraft }>(`/api/campaigns/${campaignId}/outreach/${selectedId}/generate`, { method: "POST", body: JSON.stringify({ ...draft, mode, service: draft.service || service, evidenceIds }) }); setDraft(result.draft); setSavedDrafts((current) => ({ ...current, [selectedId]: result.draft })); setLeads((current) => current.map((lead) => lead.id === selectedId ? { ...lead, draft_status: result.draft.reviewStatus, draft_updated_at: new Date().toISOString() } : lead)); } catch (e) { setError(e instanceof Error ? e.message : "Could not generate draft."); } finally { setBusy(false); } };
  const batch = async () => { if (!selected.length) return; setBusy(true); setError(""); try { const result = await api<{ runId: string; total: number; skipped?: string[] }>(`/api/campaigns/${campaignId}/outreach/batch`, { method: "POST", body: JSON.stringify({ leadIds: selected, language: draft.language, tone: draft.tone, service: draft.service || service, mode, evidenceIds }) }); if (result.skipped?.length) onNotice(`${result.skipped.length} leads skipped because they already have drafts or prior outreach.`); setRun({ run: { id: result.runId, status: "queued", total: result.total, completed: 0, failed: 0 } }); const stream = new EventSource(`/api/outreach/runs/${result.runId}/events`); stream.addEventListener("outreach-progress", (event) => { const payload = JSON.parse((event as MessageEvent).data); setRun(payload); if (["completed", "completed_with_errors", "cancelled"].includes(payload.run.status)) { stream.close(); setBusy(false); void api<{ rows: OutreachLead[] }>(`/api/campaigns/${campaignId}/leads?limit=200`).then((data) => setLeads(data.rows)); } }); } catch (e) { setError(e instanceof Error ? e.message : "Could not start batch generation."); setBusy(false); } };
  const cancelBatch = async () => { if (!run?.run?.id) return; await api(`/api/outreach/runs/${run.run.id}/cancel`, { method: "POST" }); };
  const openOutbox = async () => { try { const result = await api<{ accounts: MailAccountSummary[] }>("/api/email-accounts"); setMailAccounts(result.accounts ?? []); setOutboxOpen(true); } catch (error) { onNotice(error instanceof Error ? error.message : createTranslator(language)("couldNotLoadSendAccounts")); } };
  const markContacted = async () => { if (!selectedId) return; setBusy(true); try { const next = await api<OutreachDraft>(`/api/campaigns/${campaignId}/outreach/${selectedId}/contact`, { method: "POST", body: JSON.stringify({ contactedAt: draft.contactedAt || new Date().toISOString(), reviewNotes: draft.reviewNotes }) }); setDraft(next); setLeads((current) => current.map((lead) => lead.id === selectedId ? { ...lead, draft_status: "contacted", contacted_at: next.contactedAt } : lead)); onNotice(t("contactedInCampaign")); } catch (e) { setError(e instanceof Error ? e.message : "Could not mark as contacted."); } finally { setBusy(false); } };
  const translate = async () => { if (!selectedId || !draft.subject || !draft.body) return; setTranslationBusy(true); setError(""); try { const result = await api<{ draft: OutreachDraft }>(`/api/campaigns/${campaignId}/outreach/${selectedId}/translate`, { method: "POST", body: JSON.stringify({ subject: draft.subject, body: draft.body }) }); setDraft(result.draft); } catch (e) { setError(e instanceof Error ? e.message : "Could not translate draft."); } finally { setTranslationBusy(false); } };
  useEffect(() => { void api<{ rows: OutreachLead[] }>(`/api/campaigns/${campaignId}/leads?limit=200`).then((data) => { setLeads(data.rows); if (data.rows[0]) { setSelectedId(data.rows[0].id); void loadDraft(data.rows[0].id); } }); void api<{ selected: string; lunaAvailable: boolean }>("/api/chatgpt/models").then((data) => setModelInfo({ selected: data.selected, lunaAvailable: data.lunaAvailable })).catch(() => setModelInfo({ selected: "", lunaAvailable: false })); }, [campaignId, preferences.defaultLanguage, preferences.tone]);
  const currentEvidence = draft.evidence ?? [];
  const statusLabels: Record<string, string> = { not_generated: t("notGenerated"), draft: t("draft"), reviewed: t("reviewed"), sent: createTranslator(language)("uiSent"), contacted: t("contacted"), replied: t("replied"), interested: t("interested") };
  return <section className="outreach-studio"><aside className="outreach-leads"><div className="outreach-pane-head"><div><h3>{t("campaignLeads")}</h3><small>{leads.length} · {leads.filter((lead) => lead.draft_status !== "not_generated").length} {t("drafts")}</small></div><button className="secondary" onClick={batch} disabled={!selected.length || busy}>{t("generateSelected")} ({selected.length})</button></div><div className="outreach-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchCompanyEmail")} /></div><div className="outreach-lead-list">{visible.map((lead) => <button className={lead.id === selectedId ? "active" : ""} key={lead.id} onClick={() => void choose(lead.id)}><input type="checkbox" checked={selected.includes(lead.id)} onChange={(event) => { event.stopPropagation(); setSelected((current) => event.target.checked ? [...new Set([...current, lead.id])] : current.filter((id) => id !== lead.id)); }} onClick={(event) => event.stopPropagation()} /><span><strong data-no-translate>{lead.title}</strong><small>{lead.business_email || t("noEmail")}</small></span><em>{lead.icp_score ?? "—"}</em><i>{statusLabels[lead.draft_status] ?? lead.draft_status.replaceAll("_", " ")}{lead.repeat_outreach_risk ? ` · ${t("priorOutreach")}` : ""}</i></button>)}</div></aside><article className="outreach-editor"><div className="outreach-editor-head"><div><p className="crumb">{t("manualDraftStudio")} · {mode === "smart" ? t("smartOutreach") : t("generalOutreach")}</p><h3>{leads.find((lead) => lead.id === selectedId)?.title ?? t("selectLead")}</h3><small>{leads.find((lead) => lead.id === selectedId)?.business_email || t("noEmail")}</small><small className="outreach-model">{t("activeModel")}: {modelInfo.selected || t("noModelSelected")}</small></div><div className="outreach-actions"><button className="secondary" onClick={() => void save()} disabled={!selectedId}>{t("save")}</button><button className="secondary" onClick={() => navigator.clipboard?.writeText(`${draft.subject}\n\n${draft.body}`)} disabled={!draft.body}>{t("copy")}</button><button className="secondary" onClick={() => void translate()} disabled={!draft.body || translationBusy}>{translationBusy ? t("translating") : t("portuguese")}</button><button className="secondary" onClick={() => void markContacted()} disabled={!selectedId || busy}>{t("markContacted")}</button><button className="primary" onClick={() => void generate()} disabled={!selectedId || busy}>{busy ? t("generating") : draft.body ? t("regenerate") : t("generate")}</button></div></div>{!modelInfo.selected && <p className="outreach-error">{t("connectChatGPTFirst")}</p>}{modelInfo.selected && !modelInfo.lunaAvailable && <p className="outreach-warning">{t("lunaUnavailable")}</p>}{draft.repeatConflict && <p className="outreach-warning">{t("repeatOutreachBlocked")}</p>}<div className="outreach-controls"><label>{createTranslator(language)("uiMode")}<select value={mode} disabled><option value="smart">{t("smartOutreach")}</option><option value="general">{t("generalOutreach")}</option></select></label><label>{t("reviewStatus")}<select value={draft.reviewStatus} onChange={(event) => setDraft({ ...draft, reviewStatus: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>{t("language")}<select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as "en" | "pt-BR" })}><option value="en">{t("english")}</option><option value="pt-BR">{t("portuguese")}</option></select></label><label>{t("tone")}<select value={draft.tone} onChange={(event) => setDraft({ ...draft, tone: event.target.value })}><option value="professional">{t("professional")}</option><option value="warm">{t("warm")}</option><option value="direct">{t("direct")}</option><option value="consultative">{t("consultative")}</option></select></label><label>{t("service")}<input value={draft.service || service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} /></label></div><label className="outreach-field">{t("subject")}<input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder={t("subject")} /></label><label className="outreach-field">{t("body")}<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder={`${t("body")}…`} /></label><label className="outreach-field">{t("reviewNotes")}<textarea value={draft.reviewNotes} onChange={(event) => setDraft({ ...draft, reviewNotes: event.target.value })} placeholder={t("optional")} /></label>{draft.contactedAt && <small className="outreach-contact-date">{t("contacted")} {formatDate(draft.contactedAt, language)}</small>}{draft.translatedBody && <div className="outreach-translation"><h4>{t("translation")}</h4><strong>{draft.translatedSubject}</strong><p>{draft.translatedBody}</p></div>}{error && <p className="outreach-error">{error}</p>}{run && <div className="outreach-progress"><strong>{t("batchStatus", { status: localizeStatus(language, run.run.status) })}</strong><span>{t("batchSummary", { completed: formatNumber(run.run.completed, language), total: formatNumber(run.run.total, language), failed: formatNumber(run.run.failed, language) })}</span>{["queued", "running", "cancelling"].includes(run.run.status) && <button className="secondary" onClick={() => void cancelBatch()}>{t("cancel")}</button>}</div>}<div className="outreach-evidence"><h4>{t("supportingEvidence")} · {createTranslator(language)("uiSelectInputs")}</h4>{contextEvidence.length ? contextEvidence.map((item) => <label className="outreach-evidence-select" key={item.id}><input type="checkbox" checked={evidenceIds.includes(item.id)} onChange={(event) => setEvidenceIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{item.label ?? item.source}</strong><small>{item.detail ?? item.excerpt ?? (createTranslator(language)("uiVerifiedEvidence"))}{item.confidence !== undefined ? ` · ${t("evidenceConfidence", { percent: formatPercent(item.confidence / 100, language) })}` : ""}</small></span></label>) : <p>{t("noEvidence")}</p>}{draft.evidence.length > 0 && <small className="outreach-used-evidence">{createTranslator(language)("uiUsedInSavedDraft")}: {draft.evidence.map((item) => String(item.label ?? item.source)).join(" · ")}</small>}</div></article></section>;
}

function campaignScopeSummary(search: SearchItem, language: UiLanguage) {
  if (search.scope_mode === "entire_country") return search.country_name + " · " + (createTranslator(language)("uiMultipleRegions"));
  const count = new Set((search.scope_mode === "selected_regions" ? search.regions : search.cities) ?? []).size || 1;
  const unit = search.scope_mode === "selected_regions"
    ? (count === 1 ? (createTranslator(language)("uiRegion")) : (createTranslator(language)("uiRegions")))
    : (count === 1 ? (createTranslator(language)("uiCity")) : (createTranslator(language)("uiCities")));
  return search.country_name + " · " + count + " " + unit;
}

function campaignSearchState(search: SearchItem, language: UiLanguage) {
  if (search.status === "waiting_for_service") return createTranslator(language)("uiWaitingForEngine");
  if (["starting", "running"].includes(search.status)) return createTranslator(language)("uiCollecting");
  if (["failed", "cancelled", "completed_with_errors", "completed_with_shortfall"].includes(search.status)) return statusLabel(search.status, language);
  const progress = search.qualification_progress;
  if (progress && (Number(progress.pending ?? 0) > 0 || Number(progress.remainingTarget ?? 0) > 0) && Number(progress.extracted ?? 0) > 0) return createTranslator(language)("uiQualifying");
  return createTranslator(language)("uiCompleted");
}

function campaignProgressFor(search: SearchItem) {
  return {
    discovered: Number(search.progress?.collected ?? search.qualification_progress?.extracted ?? search.metrics?.lead_count ?? 0),
    qualified: Number(search.qualification_progress?.qualified ?? search.metrics?.lead_count ?? 0),
    contacts: Number(search.metrics?.contact_count ?? 0),
  };
}

function campaignStageLabel(search: SearchItem, language: UiLanguage) {
  const labels: Record<string, string> = { starting: createTranslator(language)("uiStarting"), collecting: createTranslator(language)("uiDiscovery"), processing: createTranslator(language)("uiProcessing"), saving: createTranslator(language)("uiSaving") };
  return labels[search.current_stage ?? ""] ?? (search.status === "qualifying" ? (createTranslator(language)("uiQualifying")) : statusLabel(search.status, language));
}

function campaignProgressPercent(search: SearchItem) {
  const total = Number(search.progress?.total ?? 0);
  const completed = Number(search.progress?.completed ?? 0) + Number(search.progress?.failed ?? 0);
  return total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
}

function CampaignProgressCard({ search, onOpen, language }: { search: SearchItem; onOpen: () => void; language: UiLanguage }) {
  const result = campaignProgressFor(search);
  const percent = campaignProgressPercent(search);
  return <Card as="article" padding="compact" className="dashboard-active-campaign"><button className="dashboard-active-campaign-link" onClick={onOpen}><span className={`status ${search.status}`}>{campaignSearchState(search, language)}</span><strong data-no-translate>{search.name}</strong><small>{search.category} · {campaignScopeSummary(search, language)}</small></button><div className="dashboard-active-stage"><span>{createTranslator(language)("uiStage")} <strong>{campaignStageLabel(search, language)}</strong></span><span>{createTranslator(language)("uiProgress")} <strong>{percent}%</strong></span><div className="dashboard-progress-track"><i style={{ width: `${percent}%` }} /></div></div><div className="dashboard-active-metrics"><span><small>{createTranslator(language)("uiCompanies")}</small><strong>{result.discovered}</strong></span><span><small>{createTranslator(language)("uiAudits")}</small><strong>{search.qualification_progress?.auditsCompleted ?? 0}</strong></span><span><small>{createTranslator(language)("uiQualified2")}</small><strong>{result.qualified}</strong></span><span><small>{createTranslator(language)("uiContacts")}</small><strong>{result.contacts}</strong></span><ChevronRight size={17} aria-hidden="true" /></div></Card>;
}

function DashboardRedesign({
  stats,
  status,
  searches,
  onSearch,
  onOpenCampaign,
  onViewHighOpportunities,
  onViewCampaigns,
  onRetry,
}: {
  stats: Stats;
  status: "loading" | "ready" | "error";
  searches: SearchItem[];
  onSearch: () => void;
  onOpenCampaign: (id: string) => void;
  onViewHighOpportunities: () => void;
  onViewCampaigns: () => void;
  onRetry: () => void;
}) {
  const { t, language } = useI18n();
  const recentSearches = searches.slice(0, 3);
  const translate = createTranslator(language);
  const opportunityTotal = stats.highOpportunity + stats.mediumOpportunity + stats.lowOpportunity;
  const auditTotal = stats.completedAudits + stats.pendingAudits;
  const auditCompletion = auditTotal > 0 ? stats.completedAudits / auditTotal : 0;
  const [auditHelpOpen, setAuditHelpOpen] = useState(false);
  const opportunityLevels = [
    { key: "high", count: stats.highOpportunity, label: localizeOpportunityLevel(language, "high") },
    { key: "medium", count: stats.mediumOpportunity, label: localizeOpportunityLevel(language, "medium") },
    { key: "low", count: stats.lowOpportunity, label: localizeOpportunityLevel(language, "low") },
  ];
  const highStop = opportunityTotal > 0 ? stats.highOpportunity / opportunityTotal * 360 : 0;
  const mediumStop = opportunityTotal > 0 ? (stats.highOpportunity + stats.mediumOpportunity) / opportunityTotal * 360 : 0;
  const header = <PageHeader className="dashboard-intro" title={translate("uiOverview")} description={translate("uiYourProspectingPerformanceInOnePlace")} actions={<Button leadingIcon={<Plus size={17} />} onClick={onSearch}>{t("newSearch")}</Button>} />;

  if (status !== "ready") return <section className="dashboard-page">
    {header}
    <Card as="section" className="dashboard-state" role="status">
      {status === "loading"
        ? <><div className="dashboard-state-skeleton"><span /><span /><span /></div><p>{translate("uiLoadingMetrics")}</p></>
        : <EmptyState title={translate("uiCouldNotLoadTheOverview")} description={translate("uiCheckTheAPIConnectionAndTryAgain")} action={<Button variant="secondary" onClick={onRetry}>{translate("uiTryAgain")}</Button>} />}
    </Card>
  </section>;

  return <section className="dashboard-page">
    {header}
    <MetricGrid className="dashboard-metric-grid" aria-label={translate("uiKeyMetrics")}>
      <MetricCard className="dashboard-kpi" label={translate("uiCompaniesDiscovered")} value={formatNumber(stats.totalLeads, language)} icon={<Building2 size={16} />} />
      <MetricCard className="dashboard-kpi" label={translate("uiContactsFound")} value={formatNumber(stats.contactsFound, language)} icon={<CircleUserRound size={16} />} />
      <MetricCard className="dashboard-kpi" label={translate("uiQualifiedLeads")} value={formatNumber(stats.qualified, language)} icon={<Tag size={16} />} />
      <MetricCard className="dashboard-kpi" label={translate("uiHighPriorityOpportunities")} value={formatNumber(stats.highOpportunity, language)} icon={<BarChart3 size={16} />} />
    </MetricGrid>

    <div className="dashboard-composition">
      <Card as="section" className="dashboard-panel dashboard-actions" aria-labelledby="dashboard-actions-title">
        <header className="dashboard-card-heading"><div><h2 id="dashboard-actions-title">{translate("uiNextActions")}</h2><p>{translate("uiNextActionsDescription")}</p></div></header>
        <div className="dashboard-action-list">
          <div className="dashboard-action-row"><span className="dashboard-action-icon"><Target size={16} aria-hidden="true" /></span><div className="dashboard-action-copy"><strong>{translate("uiReviewPriorityOpportunities")}</strong><p>{translate("uiReviewPriorityOpportunitiesDescription")}</p></div><strong className="dashboard-action-count">{formatNumber(stats.highOpportunity, language)}</strong><Button variant="secondary" size="compact" onClick={onViewHighOpportunities}>{translate("uiViewCompanies")}</Button></div>
          <div className="dashboard-action-row"><span className="dashboard-action-icon dashboard-action-icon--neutral"><Search size={16} aria-hidden="true" /></span><div className="dashboard-action-copy"><strong>{translate("uiStartASearch")}</strong><p>{translate("uiStartASearchDescription")}</p></div><span className="dashboard-action-spacer" aria-hidden="true" /><Button variant="secondary" size="compact" onClick={onSearch}>{translate("uiConfigure")}</Button></div>
        </div>
      </Card>

      <Card as="section" className="dashboard-panel dashboard-opportunities" aria-labelledby="dashboard-opportunities-title">
        <header className="dashboard-card-heading"><div><h2 id="dashboard-opportunities-title">{translate("uiOpportunityDistribution")}</h2><p>{translate("uiOpportunityRatingsForAnalyzedWebsites")}</p></div></header>
        {opportunityTotal > 0 ? <div className="dashboard-opportunity-content">
          <div className="dashboard-donut-wrap"><div className="dashboard-donut" role="img" aria-label={translate("uiOpportunityChartDescription", { total: formatNumber(opportunityTotal, language), high: formatNumber(stats.highOpportunity, language), medium: formatNumber(stats.mediumOpportunity, language), low: formatNumber(stats.lowOpportunity, language) })} style={{ background: `conic-gradient(var(--scout-chart-high) 0deg ${highStop}deg, var(--scout-chart-medium) ${highStop}deg ${mediumStop}deg, var(--scout-chart-low) ${mediumStop}deg 360deg)` }}><div className="dashboard-donut-center"><strong>{formatNumber(opportunityTotal, language)}</strong><span>{translate("uiClassifiedShort")}</span></div></div></div>
          <div className="dashboard-opportunity-legend">{opportunityLevels.map((item) => <div className="dashboard-legend-row" key={item.key}><span className="dashboard-legend-label"><i className={`dashboard-legend-dot ${item.key}`} aria-hidden="true" />{item.label}</span><span className="dashboard-legend-value"><strong>{formatNumber(item.count, language)}</strong><small>{formatPercent(item.count / opportunityTotal, language, { maximumFractionDigits: 1 })}</small></span></div>)}</div>
        </div> : <EmptyState className="dashboard-panel-empty" title={translate("uiNoOpportunityData")} description={translate("uiOpportunitiesWillAppearAfterWebsitesAreAnalyzed")} />}
      </Card>

      <Card as="section" padding="none" className="dashboard-panel dashboard-searches" aria-labelledby="dashboard-searches-title">
        <header className="dashboard-card-heading dashboard-card-heading--padded"><div><h2 id="dashboard-searches-title">{translate("uiRecentSearches")}</h2><p>{translate("uiRecentSearchesDescription")}</p></div><Button variant="tertiary" size="compact" onClick={onViewCampaigns}>{translate("uiViewAllCampaigns")}</Button></header>
        {recentSearches.length > 0 ? <TableShell label={translate("uiRecentSearchesTable")} minWidth={620} className="dashboard-search-table-shell"><table className="dashboard-search-table"><thead><tr><th scope="col">{translate("uiSearchName")}</th><th scope="col">{translate("uiSegmentAndLocation")}</th><th scope="col">{translate("uiCreated")}</th><th scope="col">{translate("uiSearchStatus")}</th><th scope="col"><span className="visually-hidden">{translate("uiOpenCampaign2")}</span></th></tr></thead><tbody>{recentSearches.map((search) => <tr key={search.id}>
          <td><button type="button" className="dashboard-search-open" onClick={() => onOpenCampaign(search.id)}><span className="dashboard-search-name" data-no-translate>{search.name}</span><span className="visually-hidden">{translate("uiOpenCampaign2")}</span></button></td>
          <td><span className="dashboard-search-detail" data-no-translate>{search.category} · {search.country_name}</span></td>
          <td className="dashboard-search-date">{search.created_at ? formatDate(search.created_at, language, { dateStyle: "medium" }) : "—"}</td>
          <td><span className={`status ${search.status}`} aria-label={campaignSearchState(search, language)}>{campaignSearchState(search, language)}</span></td>
          <td><Button variant="quiet" size="compact" className="dashboard-search-arrow" aria-label={`${translate("uiOpenCampaign2")}: ${search.name}`} onClick={() => onOpenCampaign(search.id)}><ChevronRight size={16} aria-hidden="true" /></Button></td>
        </tr>)}</tbody></table></TableShell> : <div className="dashboard-search-empty"><EmptyState title={translate("uiNoSearchesYet")} description={translate("uiStartSearchToSeeResults")} action={<Button variant="secondary" onClick={onSearch}>{t("newSearch")}</Button>} /></div>}
      </Card>

      <Card as="section" className="dashboard-panel dashboard-audit-panel" aria-labelledby="dashboard-audits-title">
        <header className="dashboard-card-heading"><div><h2 id="dashboard-audits-title">{translate("uiWebsiteIntelligence")}</h2><p>{translate("uiWebsiteIntelligenceDescription")}</p></div><div className="dashboard-help-wrap"><button type="button" className="dashboard-help-button" aria-label={translate("uiAuditExplanationButton")} aria-expanded={auditHelpOpen} aria-controls="dashboard-audit-explanation" aria-describedby={auditHelpOpen ? "dashboard-audit-explanation" : undefined} onKeyDown={(event) => { if (event.key === "Escape") setAuditHelpOpen(false); }} onClick={() => setAuditHelpOpen((open) => !open)}><Info size={16} aria-hidden="true" /></button>{auditHelpOpen && <div className="dashboard-audit-tooltip" id="dashboard-audit-explanation" role="tooltip">{translate("uiAuditTechnicalExplanation")}</div>}</div></header>
        {auditTotal > 0 ? <>
          <div className="dashboard-audit-overview"><div className="dashboard-audit-ratio"><strong>{formatNumber(stats.completedAudits, language)}</strong><span> / {formatNumber(auditTotal, language)}</span></div><strong className="dashboard-audit-percent">{formatPercent(auditCompletion, language, { maximumFractionDigits: 1 })}</strong></div>
          <p className="dashboard-audit-context">{translate("uiWebsiteAuditsCompleted")}</p>
          <div className="dashboard-audit-track" role="progressbar" aria-label={translate("uiAuditCoverage")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(auditCompletion * 100)} aria-valuetext={translate("uiAuditCoverageValue", { completed: formatNumber(stats.completedAudits, language), total: formatNumber(auditTotal, language), percent: formatPercent(auditCompletion, language, { maximumFractionDigits: 1 }) })}><span style={{ width: `${auditCompletion * 100}%` }} /></div>
          <div className="dashboard-audit-legend"><div><span><Check size={14} aria-hidden="true" />{translate("uiCompleted2")}</span><strong>{formatNumber(stats.completedAudits, language)}</strong></div><div><span><Clock3 size={14} aria-hidden="true" />{translate("uiPendingOrIncomplete")}</span><strong>{formatNumber(stats.pendingAudits, language)}</strong></div></div>
        </> : <EmptyState className="dashboard-panel-empty" title={translate("uiNoWebsiteAuditsRecordedYet")} description={translate("uiAuditDataWillAppearWhenAvailable")} />}
      </Card>
    </div>
  </section>;
}

function Dashboard({
  stats,
  searches,
  onSearch,
  onCancelSearch,
}: {
  stats: Stats;
  searches: SearchItem[];
  onSearch: () => void;
  onCancelSearch: () => void;
}) {
  const { t, language } = useI18n();
  const latest = searches[0];
  const scope =
    latest?.scope_mode === "entire_country"
      ? `Entire ${latest.country_name}`
      : latest?.scope_mode === "selected_regions"
        ? `${latest.regions?.length ?? 1} selected ${latest.regions?.length === 1 ? "region" : "regions"} in ${latest.country_name}`
        : latest
          ? `${latest.cities?.length ?? 1} selected ${latest.cities?.length === 1 ? "city" : "cities"} in ${latest.country_name}`
          : (createTranslator(language)("uiSetARealTerritory"));
  const subtitle =
    latest?.scope_mode === "entire_country"
      ? `${latest.category} across ${latest.country_name}. Collection is distributed across known regions.`
      : latest?.scope_mode === "selected_regions"
        ? `${latest.category} across ${(latest.regions ?? [latest.region]).join(", ")}. Each region runs as an independent job.`
        : latest
          ? `${latest.category} across ${(latest.cities ?? [latest.city]).join(", ")}. Each city runs as an independent job.`
          : (createTranslator(language)("uiChooseACountryPrioritizedRegionsOrAGroupOf"));
  const activity = stats.activity;
  return (
    <section className="page-grid">
      <div className="territory-ribbon">
        <div>
          <p>{t("currentTerritory")} · {scope}</p>
          <h2>{latest ? latest.name : "Every search starts with a place."}</h2>
          <span>{subtitle}</span>
        </div>
        <div className="ribbon-count">
          <strong>
            {latest?.progress?.completed ?? 0}
            <small> / {latest?.progress?.total ?? 0} {t("jobsComplete")}</small>
          </strong>
          <Globe2 size={74} strokeWidth={1} />
        </div>
      </div>
      <div className="metrics">
        <Metric
          label={t("leadsStored")}
          value={stats.totalLeads}
          icon={<Building2 />}
        />
        <Metric
          label={t("missingWebsites")}
          value={stats.missingWebsite}
          icon={<Globe2 />}
        />
        <Metric label={t("qualified")} value={stats.qualified} icon={<Tag />} />
        <Metric label={t("extracting")} value={stats.running} icon={<Sparkles />} />
      </div>
      <section className="panel wide">
        <div className="section-head">
          <div>
            <h2>{t("searchActivity")}</h2>
            <p>{t("searchActivityHelp")}</p>
          </div>
          <button className="text-button" onClick={onSearch}>
            {t("newSearch")} <ChevronRight size={15} />
          </button>
        </div>
        {activity ? (
          <div className="search-activity">
            <div className="search-activity-head">
              <div>
                <strong>{activity.category}</strong>
                <p>
                  {activity.region} · {activity.country}
                </p>
              </div>
              <span className={`status ${activity.status}`}>
                {statusLabel(activity.status)} · {activity.stage}
              </span>
              {activity.status === "running" && <button className="secondary" onClick={onCancelSearch}>{t("cancel")}</button>}
            </div>
            <div
              className={`activity-progress ${activity.progressMode === "indeterminate" ? "indeterminate" : "complete"}`}
              aria-label={
                activity.progressMode === "indeterminate"
                  ? "Collection progress is active; Scout Engine has not supplied an exact percentage."
                  : "Collection completed"
              }
            >
              <i />
            </div>
            <small>
              {activity.jobs.completed}/{activity.jobs.total} {t("jobsComplete")}
              {activity.jobs.cancelled ? ` · ${activity.jobs.cancelled} ${t("cancelled").toLowerCase()}` : ""}
              {activity.jobs.failed ? ` · ${activity.jobs.failed} failed` : ""}
              {activity.progressMode === "indeterminate"
                ? " · collecting progress is unavailable"
                : ""}
            </small>
            <div className="activity-counts">
              <span>
                <strong>{activity.discovered}</strong> {t("discovered")}
              </span>
              <span>
                <strong>{activity.processed}</strong> {t("processed")}
              </span>
              <span>
                <strong>{activity.collected} / {activity.target}</strong> {t("uniqueLeads")}
              </span>
              <span>
                <strong>{activity.duplicates}</strong> {t("existingDuplicates")}
              </span>
              <span>
                <strong>{activity.preexistingDuplicates ?? 0}</strong> {t("alreadyStored")} · <strong>{activity.executionDuplicates ?? 0}</strong> {t("repeatedInRun")}
              </span>
            </div>
          </div>
        ) : (
          <Empty
            title={t("newSearchActivity")}
            body={t("startTargetedSearch")}
            action={t("newSearch")}
            onClick={onSearch}
          />
        )}
      </section>
    </section>
  );
}
function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const { language } = useI18n();
  return (
    <div className="metric">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{formatNumber(value, language)}</strong>
    </div>
  );
}
function LocationAutocomplete({
  value,
  options,
  onChange,
  onSelect,
  placeholder,
  empty,
}: {
  value: string;
  options: LocationOption[];
  onChange: (value: string) => void;
  onSelect: (option: LocationOption) => void;
  placeholder: string;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const visible = options
    .filter((option) => {
      const query = searchKey(value);
      return (
        searchKey(option.name).includes(query) ||
        searchKey(option.code ?? "").includes(query) ||
        searchKey(option.regionCode ?? "").includes(query)
      );
    })
    .sort((left, right) => {
      const query = searchKey(value);
      const rank = (option: LocationOption) =>
        searchKey(option.code ?? "") === query ||
        searchKey(option.regionCode ?? "") === query
          ? 0
          : searchKey(option.name).startsWith(query)
            ? 1
            : 2;
      return rank(left) - rank(right);
    })
    .slice(0, 8);
  const choose = (option: LocationOption) => {
    onSelect(option);
    setOpen(false);
    setActive(0);
  };
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="location-autocomplete" ref={root}>
      <input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="location-suggestions"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((active + 1) % Math.max(visible.length, 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(
              (active - 1 + Math.max(visible.length, 1)) %
                Math.max(visible.length, 1),
            );
          } else if (event.key === "Enter" && visible[active]) {
            event.preventDefault();
            choose(visible[active]);
          } else if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div
          id="location-suggestions"
          className="location-suggestions"
          role="listbox"
        >
          {visible.length ? (
            visible.map((option, index) => (
              <button
                type="button"
                key={`${option.code ?? ""}-${option.name}`}
                className={index === active ? "active" : ""}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span>{option.name}</span>
                {option.region && <small>{option.region}</small>}
                {option.code && <small>{option.code}</small>}
              </button>
            ))
          ) : (
            <p>{empty}</p>
          )}
        </div>
      )}
    </div>
  );
}
function SearchView({
  form,
  setForm,
  countries,
  industries,
  countryName,
  territory,
  setTerritory,
  onSave,
  canRun,
  clearNotice,
}: any) {
  const { t, language } = useI18n();
  const update = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  const [industryQuery, setIndustryQuery] = useState("");
  const [nameWasEdited, setNameWasEdited] = useState(Boolean(form.name));
  const [regionOptions, setRegionOptions] = useState<LocationOption[]>([]);
  const [cityOptions, setCityOptions] = useState<LocationOption[]>([]);
  useEffect(() => {
    if (!form.countryCode) {
      setRegionOptions([]);
      setCityOptions([]);
      return;
    }
    api<LocationOption[]>(
      `/api/locations?${new URLSearchParams({ countryCode: form.countryCode, kind: "region" })}`,
    )
      .then(setRegionOptions)
      .catch(() => setRegionOptions([]));
    if (form.countryCode === "BR" && !form.cityRegionDraft) {
      setCityOptions([]);
      return;
    }
    api<LocationOption[]>(
      `/api/locations?${new URLSearchParams({
        countryCode: form.countryCode,
        kind: "city",
        ...(form.cityRegionDraft ? { region: form.cityRegionDraft } : {}),
      })}`,
    )
      .then(setCityOptions)
      .catch(() => setCityOptions([]));
  }, [form.countryCode, form.cityRegionDraft]);
  const regionLabel = (option: LocationOption) =>
    form.countryCode === "BR" && option.code
      ? `${option.name}, ${option.code}`
      : option.name;
  const addCity = (option: LocationOption) => {
    const city =
      form.countryCode === "BR" && option.regionCode
        ? `${option.name}, ${option.regionCode}`
        : option.region
          ? `${option.name}, ${option.region}`
          : option.name;
    if (!form.cities.includes(city))
      setForm({
        ...form,
        cities: [...form.cities, city],
        cityDraft: "",
      });
  };
  const addRegion = (option: LocationOption) => {
    const region = regionLabel(option);
    if (!form.regions.includes(region))
      setForm({
        ...form,
        regions: [...form.regions, region],
        regionDraft: "",
      });
  };
  const selectCityRegion = (option: LocationOption) =>
    setForm({
      ...form,
      cityRegionDraft: regionLabel(option),
      cityDraft: "",
    });
  const removeCity = (city: string) =>
    setForm({
      ...form,
      cities: form.cities.filter((item: string) => item !== city),
    });
  const removeRegion = (region: string) =>
    setForm({
      ...form,
      regions: form.regions.filter((item: string) => item !== region),
    });
  const entire = form.scopeMode === "entire_country";
  const regions = form.scopeMode === "selected_regions";
  const categorySummary = industries.filter((industry: Industry) => form.industryIds.includes(industry.id)).map((industry: Industry) => industry.displayName).join(" + ") || form.category || "Segmento";
  const scopeText = entire
    ? `${categorySummary} em ${countryName}`
    : regions
      ? `${categorySummary} em ${form.regions.length} ${form.regions.length === 1 ? "região" : "regiões"}, ${countryName}`
      : `${categorySummary} em ${form.cities.length} ${form.cities.length === 1 ? "cidade" : "cidades"}, ${countryName}`;
  const jobText = entire
    ? t("regionalJobs")
    : t(regions ? "jobsByRegion" : "jobsByCity", { count: formatNumber(regions ? form.regions.length : form.cities.length, language) });
  const countryOptions = countries.map((country: Country) => ({
    name: country.name,
    code: country.code,
  }));
  const filteredIndustries = industries.filter((industry: Industry) =>
    `${industry.displayName} ${industry.description} ${industry.searchTerms.join(" ")}`.toLocaleLowerCase().includes(industryQuery.toLocaleLowerCase()),
  );
  const selectedIndustries = industries.filter((industry: Industry) => form.industryIds.includes(industry.id));
  const suggestedCategory = selectedIndustries.map((industry: Industry) => industry.displayName).join(" + ") || form.category;
  const suggestedLocation = entire ? countryName : regions ? `${form.regions.length || ""} regiões · ${countryName}` : `${form.cities[0] || ""}${form.cities.length > 1 ? ` + ${form.cities.length - 1} cidades` : ""} · ${countryName}`;
  const suggestedName = suggestedCategory ? `${suggestedCategory} · ${suggestedLocation}` : "";
  useEffect(() => {
    if (!nameWasEdited && suggestedName && form.name !== suggestedName) setForm({ ...form, name: suggestedName });
  }, [nameWasEdited, suggestedName]);
  const toggleIndustry = (id: string) => {
    const industryIds = form.industryIds.includes(id) ? form.industryIds.filter((item: string) => item !== id) : [...form.industryIds, id];
    setForm({ ...form, industryIds });
  };
  const addCustomTerm = () => {
    const term = String(form.customTermDraft ?? "").trim();
    if (term && !form.customTerms.includes(term)) setForm({ ...form, customTerms: [...form.customTerms, term], customTermDraft: "" });
  };
  const changeScope = (
    scopeMode: "entire_country" | "selected_regions" | "selected_cities",
  ) => {
    clearNotice();
    setForm({ ...form, scopeMode });
  };
  return (
    <section className="search-layout search-composer">
      <div className="search-config-column">
        <section className="search-config-section coverage-section">
          <div className="search-section-heading"><MapPin size={18} aria-hidden="true" /><div><h2>{t("searchLocation")} <span className="search-required" aria-label={t("required")}>*</span></h2><p>{t("searchLocationHelp")}</p></div></div>
        <div className="shortcuts">
          <span>{t("shortcuts")}</span>
          {["USA", "Canada", "Europe", "Worldwide"].map((shortcut) => (
            <button
              key={shortcut}
              className={territory === shortcut ? "selected" : ""}
              onClick={() => {
                clearNotice();
                if (shortcut === "USA") {
                  setForm({
                    ...form,
                    countryCode: "US",
                    countryLabel: "United States",
                  });
                  setTerritory("all");
                } else if (shortcut === "Canada") {
                  setForm({
                    ...form,
                    countryCode: "CA",
                    countryLabel: "Canada",
                  });
                  setTerritory("all");
                } else if (shortcut === "Europe") setTerritory("Europe");
                else {
                  setTerritory("all");
                  setForm({ ...form, countryCode: "", countryLabel: "" });
                }
              }}
            >
              {t(shortcut === "USA" ? "usa" : shortcut === "Canada" ? "canada" : shortcut === "Europe" ? "europe" : "worldwide")}
            </button>
          ))}
        </div>
        <div className="mode-switch three-modes">
          <button
            className={entire ? "mode-active" : ""}
            onClick={() => changeScope("entire_country")}
          >
            <Globe2 size={17} />
            <span>{t("entireCountry")}</span>
            <small>{t("distributedKnownRegions")}</small>
          </button>
          <button
            className={regions ? "mode-active" : ""}
            onClick={() => changeScope("selected_regions")}
          >
            <Tag size={17} />
            <span>{t("selectedRegions")}</span>
            <small>{t("preferredOneJobRegion")}</small>
          </button>
          <button
            className={!entire && !regions ? "mode-active" : ""}
            onClick={() => changeScope("selected_cities")}
          >
            <MapPin size={17} />
            <span>{t("selectedCities")}</span>
            <small>{t("oneJobCity")}</small>
          </button>
        </div>
        <div className="form-grid search-configuration-grid">
          <label>
            <span className="search-field-label">{t("country")} <span className="search-required" aria-label={t("required")}>*</span></span>
            <LocationAutocomplete
              value={form.countryLabel}
              options={countryOptions}
              onChange={(value) =>
                setForm({
                  ...form,
                  countryLabel: value,
                  countryCode: "",
                  regionDraft: "",
                  regions: [],
                  cityRegionDraft: "",
                  cityDraft: "",
                  cities: [],
                })
              }
              onSelect={(option) =>
                setForm({
                  ...form,
                  countryLabel: option.name,
                  countryCode: option.code,
                  regionDraft: "",
                  regions: [],
                  cityRegionDraft: "",
                  cityDraft: "",
                  cities: [],
                })
              }
              placeholder={t("searchCountryPlaceholder")}
              empty={t("noCountryFound")}
            />
            <small>
              {form.countryCode
                ? countryName
                : territory === "all"
                  ? t("selectCountry")
                  : t("selectEuropeanCountry")}
            </small>
          </label>
          {regions && (
              <label className="full">
                {t("stateProvinceRegion")} {t("add").toLowerCase()}
              <LocationAutocomplete
                value={form.regionDraft}
                options={regionOptions}
                onChange={(value) => update("regionDraft", value)}
                onSelect={addRegion}
                placeholder="Ontário, Califórnia, Île-de-France"
                empty={t("noRegionFound")}
              />
            </label>
          )}
          {!entire && !regions && (
            <>
              <label className="full">
                {t("stateProvinceRegion")} {t("city").toLowerCase()}
                <LocationAutocomplete
                  value={form.cityRegionDraft}
                  options={regionOptions}
                  onChange={(value) => update("cityRegionDraft", value)}
                  onSelect={selectCityRegion}
                  placeholder={t("stateProvinceRegion")}
                  empty={t("noRegionFound")}
                />
                {form.countryCode === "BR" && (
                  <small>
                    {t("selectRegionFirst")}
                  </small>
                )}
              </label>
              <label className="full">
                {t("city")} {t("add").toLowerCase()}
                <LocationAutocomplete
                  value={form.cityDraft}
                  options={cityOptions}
                  onChange={(value) => update("cityDraft", value)}
                  onSelect={addCity}
                  placeholder="Toronto, São Paulo, Munique"
                  empty={
                    form.countryCode === "BR" && !form.cityRegionDraft
                      ? t("noStateFirst")
                      : t("noCityFound")
                  }
                />
              </label>
            </>
          )}
          </div>
        {regions && (
          <div className="city-list">
            <span>{t("regionsJobs", { count: formatNumber(form.regions.length, language) })}</span>
            <div>
              {form.regions.map((region: string) => (
                <button key={region} onClick={() => removeRegion(region)}>
                  {region}
                  <X size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
        {!entire && !regions && (
          <div className="city-list">
            <span>{t("citiesJobs", { count: formatNumber(form.cities.length, language) })}</span>
            <div>
              {form.cities.map((city: string) => (
                <button key={city} onClick={() => removeCity(city)}>
                  {city}
                  <X size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
        </section>
        <section className="search-config-section market-section">
          <div className="search-section-heading"><Building2 size={18} aria-hidden="true" /><div><h2>{t("marketSegment")} <span className="search-required" aria-label={t("required")}>*</span></h2><p>{t("marketSegmentHelp")}</p></div></div>
          <div className="full industry-picker"><div className="search-section-heading"><h3>{t("whatToSearch")}</h3><p>{t("marketSegmentHint")}</p></div>
            <label className="industry-search-field">
              <span className="sr-only">{t("searchIndustries")}</span><Search size={16} aria-hidden="true" />
              <input value={industryQuery} onChange={(event) => setIndustryQuery(event.target.value)} placeholder={t("searchIndustries")} aria-label={t("searchIndustries")} />
            </label>
            <div className="industry-options" role="listbox" aria-label={t("allIndustries")} aria-multiselectable="true">
              {filteredIndustries.map((industry: Industry) => (
                <button type="button" key={industry.id} className={form.industryIds.includes(industry.id) ? "industry-option selected" : "industry-option"} onClick={() => toggleIndustry(industry.id)} aria-pressed={form.industryIds.includes(industry.id)}>
                  <span><strong>{industry.displayName}</strong><small>{industry.description}</small></span><ChevronRight size={15} />
                </button>
              ))}
            </div>
            {selectedIndustries.length > 0 && <div className="selected-industries"><span>{t("selected")}:</span>{selectedIndustries.map((industry: Industry) => <button type="button" key={industry.id} onClick={() => toggleIndustry(industry.id)}>{industry.displayName}<X size={13} /></button>)}</div>}
          </div>
          <details className="full advanced-search-terms">
            <summary>{t("advancedSearchTerms")}</summary>
            {selectedIndustries.length > 0 && <small>{t("relatedTerms")}: {[...new Set(selectedIndustries.flatMap((industry: Industry) => industry.searchTerms))].join(" · ")}</small>}
            <small>{t("searchCandidatesNote")}</small>
            <p>{t("advancedTermsHelp")}</p>
            <div className="custom-term-row"><input value={form.customTermDraft ?? ""} onChange={(event) => update("customTermDraft", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomTerm(); } }} placeholder={t("industryExample")} /><button type="button" onClick={addCustomTerm}><Plus size={14} /> {t("add")}</button></div>
            <div className="selected-industries">{form.customTerms.map((term: string) => <button type="button" key={term} onClick={() => setForm({ ...form, customTerms: form.customTerms.filter((item: string) => item !== term) })}>{term}<X size={13} /></button>)}</div>
            <label>{t("customCategory")} <input value={form.category} onChange={(event) => update("category", event.target.value)} placeholder={t("customCategoryHint")} /></label>
          </details>
        </section>
        <section className="search-config-section target-section">
          <div className="search-section-heading"><Target size={18} aria-hidden="true" /><div><h2>{t("targetHeading")}</h2><p>{t("targetHelp")}</p></div></div>
          <label>
            {t("qualifiedTarget")}
            <select
              value={form.extractionTarget}
              onChange={(event) => setForm({ ...form, extractionTarget: Number(event.target.value) })}
            >
              {[20, 50, 100, 250, 500, 1000].map((target) => <option key={target} value={target}>{t("qualifiedOption", { count: formatNumber(target, language) })}</option>)}
            </select>
            <small>{t("qualifiedTargetHelp")}</small>
          </label>
        </section>
      </div>
      <aside className="search-review-card" aria-label={t("searchSummary")}>
        <div className="search-review-heading"><h2>{t("searchSummary")}</h2><p>{t("searchSummaryHelp")}</p></div>
        <label className="search-name-field"><span>{t("savedSearchName")}</span><input value={form.name} onChange={(e) => { setNameWasEdited(true); update("name", e.target.value); }} placeholder={suggestedName || "Ex.: HVAC · Ontário"} /></label>
        <div className="search-review-details" aria-live="polite">
          <div><span>{t("country")}</span><strong>{form.countryCode ? countryName : t("notSelected")}</strong></div>
          <div><span>{entire ? t("coverage") : regions ? t("selectedRegions") : t("selectedCities")}</span><strong>{entire ? t("countryWide") : (regions ? form.regions : form.cities).join(", ") || t("noSelection")}</strong></div>
          <div><span>{t("segments")}</span><strong>{selectedIndustries.map((industry: Industry) => industry.displayName).join(", ") || form.category || t("noSegment")}</strong></div>
        </div>
        <div className="search-review-metrics">
          <div><span>{entire ? t("coverage") : regions ? t("regionsShort") : t("citiesShort")}</span><strong>{entire ? t("country") : regions ? form.regions.length : form.cities.length}</strong></div>
          <div><span>{t("estimatedJobs")}</span><strong>{entire ? (regionOptions.length || "≈") : regions ? form.regions.length : form.cities.length}</strong></div>
          <div><span>{t("qualifiedGoal")}</span><strong>{formatNumber(form.extractionTarget, language)}</strong></div>
        </div>
        {!canRun && <p className="search-review-guidance" role="status">{!form.countryCode ? `${t("selectCountry")} ` : ""}{!(form.category || form.industryIds.length) ? `${t("selectSegment")} ` : ""}{form.countryCode && (form.category || form.industryIds.length) && !canRun ? (regions ? t("addRegionHint") : t("addCityHint")) : ""}</p>}
        <div className="search-review-actions">
        <div className="form-actions">
          <button
            className="secondary"
            onClick={() => onSave(false)}
            disabled={!canRun}
          >
            {t("saveForLater")}
          </button>
          <button
            className="primary"
            onClick={() => onSave(true)}
            disabled={!canRun}
          >
            <Play size={16} /> {t("startSearch")} · {jobText}
          </button>
        </div>
          <p>{t("resultsInCampaigns")}</p>
        </div>
      </aside>
    </section>
  );
}
function LeadsView({
  leads,
  stats,
  filters,
  setFilters,
  onUpdate,
  selected,
  setSelected,
  onEnrich,
  onRetry,
  onStop,
  submitting,
  leadMode,
  setLeadMode,
  searchCollections,
  industryCollections,
  unknownSourceCount,
  onAddPipeline,
  onAuditBatch,
  icpProfiles,
  onScoreBatch,
  icpScoreRun,
  externalLead,
  drawerOnly = false,
  onDrawerClose,
}: any) {
  const { t, language } = useI18n();
  const [auditLead, setAuditLead] = useState<Lead | null>(null);
  const [audit, setAudit] = useState<WebsiteAudit | null>(null);
  const [observations, setObservations] = useState<LeadObservation[]>([]);
  const [icpScores, setIcpScores] = useState<IcpScore[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("overview");
  useEffect(() => {
    if (!auditLead) return;
    const frame = window.requestAnimationFrame(() => localizeDom(language));
    return () => window.cancelAnimationFrame(frame);
  }, [auditLead, detailTab, observations, language]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [cityOptions, setCityOptions] = useState<
    Array<{
      city: string;
      region: string;
      country_code: string;
      lead_count: number;
    }>
  >([]);
  const [cityQuery, setCityQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [qualificationProgress, setQualificationProgress] = useState<{ awaiting: number; running: number; analyzed: number; partialAudits: number; insufficientOpportunity: number; failed: number; high: number; verifiedContacts: number }>({ awaiting: 0, running: 0, analyzed: 0, partialAudits: 0, insufficientOpportunity: 0, failed: 0, high: 0, verifiedContacts: 0 });
  useEffect(() => {
    const load = () => api<typeof qualificationProgress>("/api/qualification/progress").then(setQualificationProgress).catch(() => undefined);
    void load(); const timer = window.setInterval(load, 10_000); return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    api<
      Array<{
        city: string;
        region: string;
        country_code: string;
        lead_count: number;
      }>
    >(`/api/leads/cities?q=${encodeURIComponent(cityQuery)}`)
      .then(setCityOptions)
      .catch(() => setCityOptions([]));
  }, [cityQuery]);
  const exportQuery = new URLSearchParams(
    Object.fromEntries(
      Object.entries(filters)
        .filter(([, value]) => value !== "" && value !== false)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const toggle = (id: string) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((item: string) => item !== id)
        : [...selected, id],
    );
  useEffect(() => { setSelected([]); }, [filters.searchId, filters.unknownSource]);
  const toggleFilter = (key: string) =>
    setFilters({ ...filters, [key]: !filters[key] });
  const clearFilters = () =>
    setFilters({
      q: "",
      country: "",
      region: "",
      city: "",
      cities: [],
      searchId: "",
      qualificationScope: "all",
      industry: "",
      category: "",
      unknownSource: false,
      websiteStatus: "all",
      hasInstagram: false,
      hasEmail: false,
      hasFacebook: false,
      hasAnyDigitalContact: false,
      noDigitalContact: false,
      verifiedContactsOnly: false,
      noWebsiteHasInstagram: false,
      auditStatus: "all",
      opportunity: "all",
      contactAvailability: "all",
      issueSeverity: "all",
      minWebsiteScore: "",
      signalCode: "",
      minSignalConfidence: "",
      signalFreshnessDays: "",
      icpProfile: "website_redesign",
      minIcpScore: "",
      sort: "",
    });
  const loadAudit = async (lead: Lead) => {
    setAuditLead(lead);
    setDetailTab("overview");
    setAuditLoading(true);
    try {
      const nextDetail = await api<any>(`/api/leads/${lead.id}/detail`);
      setDetail(nextDetail);
      setAudit(nextDetail.audit);
      setObservations(nextDetail.observations ?? []);
      setIcpScores(nextDetail.scores ?? []);
    } finally {
      setAuditLoading(false);
    }
  };
  useEffect(() => {
    if (externalLead) void loadAudit(externalLead);
  }, [externalLead?.id]);
  const updateObservationStatus = async (item: LeadObservation, status: LeadObservation["verification_status"]) => {
    if (!status) return;
    const updated = await api<LeadObservation>(`/api/leads/${auditLead?.id}/observations/${item.id}`, { method: "PATCH", body: JSON.stringify({ verification_status: status }) });
    setObservations((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
  };
  const updateLeadContact = async (contact: any, input: Record<string, unknown>) => {
    if (!auditLead) return;
    const updated = await api<any>(`/api/leads/${auditLead.id}/contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify(input) });
    setDetail((current: any) => ({ ...current, contacts: (current?.contacts ?? []).map((item: any) => item.id === updated.id ? updated : item) }));
  };
  const cityLabel = (city: {
    city: string;
    region: string;
    country_code: string;
  }) => [city.city, city.region, city.country_code].filter(Boolean).join(", ");
  const toggleCity = (city: string) =>
    setFilters({
      ...filters,
      cities: filters.cities.includes(city)
        ? filters.cities.filter((item: string) => item !== city)
        : [...filters.cities, city],
    });
  const categoryTone = (category: string) => {
    const value = category.toLowerCase();
    if (/plumb/.test(value)) return "plumbing";
    if (/dent|orthodont/.test(value)) return "dental";
    if (/salon|hair|spa|beaut/.test(value)) return "salon";
    if (/gym|fitness|yoga/.test(value)) return "fitness";
    return "other";
  };
  const allVisibleSelected =
    leads.length > 0 && leads.every((lead: Lead) => selected.includes(lead.id));
  const toggleVisibleSelection = () =>
    setSelected(
      allVisibleSelected
        ? selected.filter(
            (id: string) => !leads.some((lead: Lead) => lead.id === id),
          )
        : [...new Set([...selected, ...leads.map((lead: Lead) => lead.id)])],
    );
  const selectedExportQuery = new URLSearchParams(exportQuery);
  if (selected.length)
    selectedExportQuery.set("selectedIds", selected.join(","));
  const queueAudit = async (refresh = false) => {
    if (!auditLead) return;
    setAuditLoading(true);
    try {
      await api(`/api/leads/${auditLead.id}/website-audit`, {
        method: "POST",
        body: JSON.stringify({ refresh }),
      });
      setAudit(
        (current) =>
          ({
            ...(current ?? { issues: [] }),
            status: "queued",
          }) as WebsiteAudit,
      );
    } finally {
      setAuditLoading(false);
    }
  };
  const cancelAudit = async () => {
    if (!auditLead) return;
    setAuditLoading(true);
    try {
      await api(`/api/leads/${auditLead.id}/website-audit/cancel`, {
        method: "POST",
      });
      setAudit(
        (current) =>
          ({
            ...(current ?? { issues: [] }),
            status: "cancelled",
            error: "Audit cancelled.",
          }) as WebsiteAudit,
      );
    } finally {
      setAuditLoading(false);
    }
  };
  useEffect(() => {
    if (!auditLead) return;
    const stream = new EventSource("/api/website-audits/events");
    const update = (event: Event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        leadId?: string;
      };
      if (payload.leadId === auditLead.id) void loadAudit(auditLead);
    };
    stream.addEventListener("website-audit", update);
    return () => {
      stream.removeEventListener("website-audit", update);
      stream.close();
    };
  }, [auditLead?.id]);
  useEffect(() => {
    if (!auditLead) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAuditLead(null);
        onDrawerClose?.();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [auditLead?.id, onDrawerClose]);
  const manualSearch = (lead: Lead) =>
    `https://www.google.com/search?q=${encodeURIComponent([lead.title, lead.city, lead.region, lead.country_code, "Instagram Facebook email"].filter(Boolean).join(" "))}`;
  const externalWebsite = (website: string) =>
    /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const isSearching = (lead: Lead) =>
    submitting.includes(lead.id) ||
    lead.enrichment_status === "queued" ||
    lead.enrichment_status === "searching" ||
    lead.enrichment_status === "processing";
  const confidenceLabel = (lead: Lead) => {
    if (lead.contact_diagnostic === "search_unavailable")
      return "Search unavailable";
    if (lead.contact_diagnostic === "low_confidence") return "Low confidence";
    if (lead.contact_status === "verified") return "Verified";
    if (lead.contact_status === "possible") return "Possible";
    return "Not Found";
  };
  const auditSummaryLabel = (lead: Lead) => {
    if (lead.website_audit_status === "completed") return localizeOpportunityTerm(language, "Audit complete");
    if (lead.website_audit_status === "partial") return localizeOpportunityTerm(language, "Audit partial");
    if (lead.website_audit_status === "access_restricted") return localizeOpportunityTerm(language, "Access restricted");
    if (lead.website_audit_status === "failed" || lead.website_audit_status === "cancelled") return localizeOpportunityTerm(language, "Audit failed");
    if (lead.website_audit_status === "queued" || lead.website_audit_status === "analyzing") return localizeOpportunityTerm(language, "Audit in progress");
    return localizeOpportunityTerm(language, "Awaiting audit");
  };
  const opportunityMeta = (lead: Lead) => [
    auditSummaryLabel(lead),
    lead.contact_status === "verified" ? localizeOpportunityTerm(language, "Contact verified") : lead.contact_status === "possible" ? localizeOpportunityTerm(language, "Contact possible") : localizeOpportunityTerm(language, "No verified contact"),
  ].filter(Boolean).join(" · ");
  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  const workspaceSummary = useMemo(() => ({
    total: leads.length,
    website: leads.filter((lead: Lead) => Boolean(lead.website)).length,
    noWebsite: leads.filter((lead: Lead) => !lead.website).length,
    contacts: leads.filter((lead: Lead) => lead.business_email || lead.instagram || lead.facebook || lead.phone).length,
    audited: leads.filter((lead: Lead) => lead.website_audit_status === "completed" || lead.website_audit_status === "partial").length,
    highIcp: leads.filter((lead: Lead) => (lead.icp_score ?? -1) >= 70 && (lead.icp_evidence_coverage ?? 0) >= 50).length,
  }), [leads]);
  const reprocessPendingAndFailed = async () => {
    try {
      const preview = await api<any>("/api/qualification/recovery-preview");
      const auditCount = Number(preview.audit?.total ?? 0);
      const contactCount = Number(preview.contacts?.total ?? 0);
      const text = t("recoveryPreview", { audits: formatNumber(auditCount, language), contacts: formatNumber(contactCount, language) });
      if (!auditCount && !contactCount) return window.alert(createTranslator(language)("uiThereAreNoEligibleItemsToReprocess"));
      if (!window.confirm(text)) return;
      const leadIds = [...new Set([
        ...(preview.audit?.candidates ?? []).map((candidate: { leadId: string }) => candidate.leadId),
        ...(preview.contacts?.candidates ?? []).map((candidate: { leadId: string }) => candidate.leadId),
      ])];
      const result = await api<any>("/api/qualification/reprocess", { method: "POST", body: JSON.stringify({ modes: ["audit", "contacts"], leadIds }) });
      window.alert(t("recoveryQueued", { audits: formatNumber(result.auditQueued, language), contacts: formatNumber(result.contactsQueued, language) }));
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not prepare recovery."); }
  };
  const activeFilterCount = useMemo(() => Object.entries(filters).filter(([key, value]) => key !== "q" && key !== "icpProfile" && ((Array.isArray(value) && value.length > 0) || (typeof value === "boolean" && value) || (typeof value === "string" && value !== "" && value !== "all"))).length, [filters]);
  const chooseSearch = (id: string) => {
    setFilters({
      ...filters,
      searchId: id,
      qualificationScope: "qualified",
      industry: "",
      category: "",
      unknownSource: false,
    });
    setLeadMode("all");
  };
  const chooseIndustry = (industry: string, category = "") => {
    setFilters({
      ...filters,
      industry,
      category,
      searchId: "",
      qualificationScope: "all",
      unknownSource: false,
    });
    setLeadMode("all");
  };
  return (
    <section className={`leads-page${drawerOnly ? " drawer-host" : ""}`}>
      <div className="leads-main-toolbar">
        <label className="lead-view-select"><span className="sr-only">Lead view</span><select value={leadMode} onChange={(event) => { const next = event.target.value; setLeadMode(next); if (next === "all") setFilters({ ...filters, searchId: "", qualificationScope: "all", industry: "", category: "", unknownSource: false }); }}><option value="all">All Leads</option><option value="search">By Search</option><option value="industry">By Industry</option></select></label>
        <button className={`advanced-filter-button ${activeFilterCount ? "has-filters" : ""}`} onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}><Tag size={14} /> Advanced filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>
        <div className="leads-search-field"><Search size={15} /><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search leads…" aria-label={t("searchLeads")} /></div>
        {!filters.searchId && <button className="secondary" onClick={() => void reprocessPendingAndFailed()}><Activity size={14} /> {createTranslator(language)("uiReprocessPendingFailed")}</button>}
        <details className="bulk-actions-dropdown"><summary>Bulk actions <ChevronRight size={13} /></summary><div role="menu"><button role="menuitem" onClick={toggleVisibleSelection}>{allVisibleSelected ? "Clear visible" : `Select visible (${leads.length})`}</button><button role="menuitem" onClick={() => setSelected([...new Set([...selected, ...leads.map((lead: Lead) => lead.id)])])}>Select all matching ({leads.length})</button><a role="menuitem" href={`/api/leads/export.csv?${exportQuery}`}><Download size={14} /> Export filtered</a>{selected.length > 0 && <><button role="menuitem" onClick={() => onEnrich(selected)}><Sparkles size={14} /> Enrich selected ({selected.length})</button><button role="menuitem" onClick={() => onAddPipeline(selected)}><Plus size={14} /> Add to pipeline ({selected.length})</button><button role="menuitem" onClick={() => onAuditBatch(selected)}><Globe2 size={14} /> Audit selected ({selected.length})</button><button role="menuitem" onClick={() => onScoreBatch(selected, filters.icpProfile)}><Sparkles size={14} /> Score selected ({selected.length})</button></>}</div></details>
      </div>
      {leadMode === "search" && (
        <div className="collection-grid">
          {searchCollections.map((item: SearchCollection) => (
            <button
              className="collection-card"
              key={item.id}
              onClick={() => chooseSearch(item.id)}
            >
              <strong>{item.name}</strong>
              <span>
                {item.category} · {item.country_name}
              </span>
              <small>
                {item.lead_count} qualified · {item.all_lead_count} collected ·{" "}
                {item.pending_count} pending
              </small>
            </button>
          ))}
          <button
            className="collection-card unknown-source"
            onClick={() => {
              setFilters({
                ...filters,
                searchId: "",
                qualificationScope: "all",
                industry: "",
                category: "",
                unknownSource: true,
              });
              setLeadMode("all");
            }}
          >
            <strong>{t("unknownSource")}</strong>
            <span>{createTranslator(language)("uiLegacyRecordsWithoutAVerifiedImportRelation")}</span>
            <small>{unknownSourceCount} {t("uniqueLeads")}</small>
          </button>
        </div>
      )}
      {filters.searchId && (
        <div className="qualification-view-toggle">
          <span>{t("search")}</span>
          <button
            className={
              filters.qualificationScope === "qualified" ? "active" : ""
            }
            onClick={() =>
              setFilters({ ...filters, qualificationScope: "qualified" })
            }
          >
            {t("qualified")} {createTranslator(language)("uiOnly")}
          </button>
          <button
            className={filters.qualificationScope === "all" ? "active" : ""}
            onClick={() =>
              setFilters({ ...filters, qualificationScope: "all" })
            }
          >
            {createTranslator(language)("uiAllCollected")}
          </button>
          <small>{createTranslator(language)("uiCSVExportFollowsThisSelection")}</small>
        </div>
      )}
      {leadMode === "industry" && (
        <div className="collection-grid">
          {industryCollections.map((item: IndustryCollection) => (
            <button
              className="collection-card"
              key={item.industry}
              onClick={() => chooseIndustry(item.industry)}
            >
              <strong>{item.industry}</strong>
              <span>{item.categories}</span>
              <small>{item.lead_count} unique leads</small>
            </button>
          ))}
        </div>
      )}
      <div className="lead-stats" aria-label={t("leads")}>
        <article><small>{createTranslator(language)("uiAwaitingAnalysis")}</small><strong>{qualificationProgress.awaiting}</strong></article>
        <article><small>{createTranslator(language)("uiAuditsRunning")}</small><strong>{qualificationProgress.running}</strong></article>
        <article><small>{createTranslator(language)("uiAnalyzed")}</small><strong>{qualificationProgress.analyzed}</strong></article>
        <article><small>{createTranslator(language)("uiPartialAudits")}</small><strong>{qualificationProgress.partialAudits}</strong></article>
        <article><small>{createTranslator(language)("uiOpportunityInsufficientEvidence")}</small><strong>{qualificationProgress.insufficientOpportunity}</strong></article>
        <article><small>{createTranslator(language)("uiFailedAudits")}</small><strong>{qualificationProgress.failed}</strong></article>
        <article><small>{createTranslator(language)("uiHighOpportunity")}</small><strong>{qualificationProgress.high}</strong></article>
        <article><small>{createTranslator(language)("uiVerifiedContacts")}</small><strong>{qualificationProgress.verifiedContacts}</strong></article>
      </div>
      {advancedOpen && <section className="advanced-filters" aria-label="Advanced lead filters">
      <div className="advanced-filter-grid">
        <input
          value={filters.country}
          onChange={(e) =>
            setFilters({ ...filters, country: e.target.value.toUpperCase() })
          }
          placeholder="Country"
        />
        <input
          value={filters.region}
          onChange={(e) => setFilters({ ...filters, region: e.target.value })}
          placeholder="Region"
        />
        <div className="city-multiselect">
          <input
            value={cityQuery}
            onChange={(event) => setCityQuery(event.target.value)}
            placeholder="Filter cities"
            aria-label="Filter cities"
          />
          {cityQuery && (
            <div className="city-options" role="listbox" aria-label="Cities">
              {cityOptions.map((city) => (
                <button
                  key={`${city.city}-${city.region}-${city.country_code}`}
                  type="button"
                  className={filters.cities.includes(city.city) ? "active" : ""}
                  onClick={() => toggleCity(city.city)}
                >
                  {cityLabel(city)} <small>{city.lead_count}</small>
                </button>
              ))}
              {!cityOptions.length && <small>No matching cities</small>}
            </div>
          )}
        </div>
      </div>
      {filters.cities.length > 0 && (
        <div className="city-filter-chips" aria-label="Selected city filters">
          {filters.cities.map((city: string) => (
            <button key={city} onClick={() => toggleCity(city)}>
              {city} <X size={13} />
            </button>
          ))}
          <button
            className="clear-filters"
            onClick={() => setFilters({ ...filters, cities: [] })}
          >
            Clear cities
          </button>
        </div>
      )}
      <div className="contact-filters website-status">
        <span>Website status</span>
        {[
          ["all", "All Businesses"],
          ["missing", "No Website Listed"],
          ["present", "Has Website"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filters.websiteStatus === value ? "active" : ""}
            onClick={() =>
              setFilters({
                ...filters,
                websiteStatus: value,
                noWebsiteHasInstagram: false,
              })
            }
          >
            {label}
          </button>
        ))}
        <small>Listed in Google Maps; not a confirmed website audit.</small>
      </div>
      <div className="contact-filters">
        {[
          ["hasInstagram", "Has Instagram"],
          ["hasEmail", "Has Email"],
          ["hasFacebook", "Has Facebook"],
          ["hasAnyDigitalContact", "Any digital contact"],
          ["noDigitalContact", "No digital contact"],
          ["verifiedContactsOnly", "Verified only"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filters[key] ? "active" : ""}
            onClick={() => toggleFilter(key)}
          >
            {label}
          </button>
        ))}
        <button
          className={filters.noWebsiteHasInstagram ? "active" : ""}
          onClick={() =>
            setFilters({
              ...filters,
              noWebsiteHasInstagram: !filters.noWebsiteHasInstagram,
              websiteStatus: !filters.noWebsiteHasInstagram
                ? "missing"
                : filters.websiteStatus,
              hasInstagram: !filters.noWebsiteHasInstagram
                ? true
                : filters.hasInstagram,
            })
          }
        >
          No Website Listed + Has Instagram
        </button>
        <button className="clear-filters" onClick={clearFilters}>
          Clear filters
        </button>
      </div>
      <div className="contact-filters audit-filters">
        <span>Website intelligence</span>
        <select
          value={filters.auditStatus}
          onChange={(event) =>
            setFilters({ ...filters, auditStatus: event.target.value })
          }
        >
          <option value="all">{createTranslator(language)("uiAllAuditStatuses")}</option>
          <option value="not_analyzed">{createTranslator(language)("uiNotAnalyzed")}</option>
          <option value="completed">{createTranslator(language)("uiCompleted")}</option>
          <option value="partial">{createTranslator(language)("uiPartial")}</option>
          <option value="failed">{createTranslator(language)("uiFailed")}</option>
          <option value="cancelled">{createTranslator(language)("uiCancelled")}</option>
        </select>
        <select value={filters.opportunity} onChange={(event) => setFilters({ ...filters, opportunity: event.target.value })} aria-label="Filter opportunity">
          <option value="all">{createTranslator(language)("uiAllOpportunities")}</option>
          <option value="high">{localizeOpportunityLevel(language, "high")}</option>
          <option value="medium">{localizeOpportunityLevel(language, "medium")}</option>
          <option value="low">{localizeOpportunityLevel(language, "low")}</option>
          <option value="insufficient_evidence">{localizeOpportunityLevel(language, "insufficient_evidence")}</option>
          <option value="audit_failed">{localizeOpportunityLevel(language, "audit_failed")}</option>
          <option value="not_analyzed">{localizeOpportunityLevel(language, "not_analyzed")}</option>
        </select>
        <select value={filters.contactAvailability} onChange={(event) => setFilters({ ...filters, contactAvailability: event.target.value })} aria-label="Filter contact availability">
          <option value="all">All contact availability</option>
          <option value="verified">Verified contacts</option>
          <option value="possible">Possible contacts</option>
          <option value="none">No contacts found</option>
        </select>
        <select
          value={filters.issueSeverity}
          onChange={(event) =>
            setFilters({ ...filters, issueSeverity: event.target.value })
          }
        >
          <option value="all">{createTranslator(language)("uiAllIssueSeverities")}</option>
          <option value="high">{createTranslator(language)("uiHighIssues")}</option>
          <option value="medium">{createTranslator(language)("uiMediumIssues")}</option>
          <option value="low">{createTranslator(language)("uiLowIssues")}</option>
        </select>
        <input
          type="number"
          min="0"
          max="100"
          value={filters.minWebsiteScore}
          onChange={(event) =>
            setFilters({ ...filters, minWebsiteScore: event.target.value })
          }
          placeholder="Minimum score"
        />
        <select
          value={filters.sort}
          onChange={(event) =>
            setFilters({ ...filters, sort: event.target.value })
          }
        >
          <option value="">Newest leads</option>
          <option value="website_score_asc">Website score: low first</option>
          <option value="website_score_desc">Website score: high first</option>
          <option value="icp_score_desc">ICP score: high first</option>
          <option value="icp_score_asc">ICP score: low first</option>
        </select>
        <select
          value={filters.icpProfile}
          onChange={(event) => setFilters({ ...filters, icpProfile: event.target.value })}
          aria-label="ICP scoring profile"
        >
          {icpProfiles.map((profile: IcpProfile) => <option key={profile.profile_key} value={profile.profile_key}>{profile.name} · v{profile.version}</option>)}
        </select>
        <input
          type="number" min="0" max="100" value={filters.minIcpScore}
          onChange={(event) => setFilters({ ...filters, minIcpScore: event.target.value })}
          placeholder="Minimum ICP score"
        />
        <input
          value={filters.signalCode}
          onChange={(event) =>
            setFilters({
              ...filters,
              signalCode: event.target.value.toUpperCase(),
            })
          }
          placeholder="Signal code"
        />
        <input
          type="number"
          min="0"
          max="1"
          step="0.05"
          value={filters.minSignalConfidence}
          onChange={(event) =>
            setFilters({ ...filters, minSignalConfidence: event.target.value })
          }
          placeholder="Min signal confidence"
        />
        <select
          value={filters.signalFreshnessDays}
          onChange={(event) =>
            setFilters({ ...filters, signalFreshnessDays: event.target.value })
          }
        >
          <option value="">Any signal age</option>
          <option value="7">Observed in 7 days</option>
          <option value="30">Observed in 30 days</option>
          <option value="90">Observed in 90 days</option>
        </select>
      </div>
      <div className="advanced-filter-footer"><span>{activeFilterCount ? `${activeFilterCount} filters active` : "No advanced filters applied"}</span><button className="text-button" onClick={clearFilters}>Reset filters</button></div>
      </section>}
      <div className="panel table-panel">
        <div className="section-head">
          <div>
            <h2>{leads.length} leads</h2>
            <p>Persistent local records, deduplicated by place identifier.</p>
          </div>
          <div className="enrich-actions">
            <button className="secondary" onClick={toggleVisibleSelection}>
              {allVisibleSelected
                ? "Clear visible"
                : `Select visible (${leads.length})`}
            </button>
            <button
              className="secondary"
              onClick={() =>
                setSelected([
                  ...new Set([
                    ...selected,
                    ...leads.map((lead: Lead) => lead.id),
                  ]),
                ])
              }
            >
              Select all matching ({leads.length})
            </button>
            <a
              className="secondary export"
              href={`/api/leads/export.csv?${exportQuery}`}
            >
              <Download size={15} /> Export all filtered
            </a>
            {selected.length > 0 && (
              <>
                <a
                  className="secondary export"
                  href={`/api/leads/export.csv?${selectedExportQuery}`}
                >
                  <Download size={15} /> Export selected ({selected.length})
                </a>
                <button
                  className="secondary"
                  onClick={() => onEnrich(selected)}
                >
                  <Sparkles size={15} /> Enrich Selected ({selected.length})
                </button>
                <button
                  className="secondary"
                  onClick={() => onAddPipeline(selected)}
                >
                  <Plus size={15} /> Add to Pipeline ({selected.length})
                </button>
                <button
                  className="secondary"
                  onClick={() => onAuditBatch(selected)}
                >
                  <Globe2 size={15} /> Audit selected ({selected.length})
                </button>
                <button className="secondary" onClick={() => onScoreBatch(selected, filters.icpProfile)}>
                  <Sparkles size={15} /> Score selected ({selected.length})
                </button>
              </>
            )}
            <button className="text-button" onClick={onStop}>
              <StopCircle size={14} /> Stop queue
            </button>
          </div>
        </div>
        {icpScoreRun && (
          <div className="score-run-progress" role="status">
            <span>ICP scoring · {icpScoreRun.processed}/{icpScoreRun.total} processed</span>
            <i><b style={{ width: `${icpScoreRun.total ? (icpScoreRun.processed / icpScoreRun.total) * 100 : 0}%` }} /></i>
            <small>{icpScoreRun.status}</small>
          </div>
        )}
        {leads.length ? (
            <div className="lead-table contacts-table">
            <div className="table-head">
              <span>Select</span>
              <span>Lead / business</span>
              <span>Email / contact</span>
              <span>Opportunity</span>
              <span>Actions</span>
            </div>
            {leads.map((lead: Lead) => (
              <div
                className="lead-row lead-row-card"
                key={lead.id}
                role="button"
                tabIndex={0}
                aria-label={`Open details for ${lead.title}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button, a, input, summary")) return;
                  void loadAudit(lead);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void loadAudit(lead);
                  }
                }}
              >
                <div>
                  <button
                    className="select-lead"
                    onClick={() => toggle(lead.id)}
                  >
                    {selected.includes(lead.id) ? (
                      <CheckSquare size={17} />
                    ) : (
                      <Square size={17} />
                    )}
                  </button>
                </div>
                <div className="lead-identity">
                  <span className="lead-avatar" aria-hidden="true">{initials(lead.title)}</span>
                  <div className="lead-copy">
                  <div className="lead-title-line"><strong data-no-translate title={lead.title}>{lead.title}</strong>{lead.pipeline_status && <span className="crm-tag" title={t("inCrm")}>CRM</span>}</div>
                  <p className="lead-location"><MapPin size={12} aria-hidden="true" />{[lead.city, lead.region, lead.country_code].filter(Boolean).join(", ") || "Location unavailable"}</p>
                  <p className="lead-rating" aria-label={`${lead.review_rating || "No"} rating from ${lead.review_count || 0} reviews`}><span aria-hidden="true">★</span> {lead.review_rating || "—"} <small>({lead.review_count || 0} reviews)</small></p>
                  <div className="lead-badges">
                    {lead.is_new_from_latest_search === 1 && (
                      <span className="badge badge-info">New</span>
                    )}
                    {!lead.website && (
                      <span
                        className="badge badge-warning"
                        title={t("websiteNotListedHelp")}
                      >
                        No website recorded
                      </span>
                    )}
                    {lead.category && (
                      <span
                        className={`badge badge-neutral industry-${categoryTone(lead.category)}`}
                      >
                        {lead.category}
                      </span>
                    )}
                    {lead.lead_status && lead.lead_status !== "new" && <span className="badge badge-neutral">{localizeStatus(language, lead.lead_status)}</span>}
                  </div>
                  <small className="lead-source">{lead.created_at ? formatDate(lead.created_at, language) : t("dateUnavailable")} · {lead.source_search_name ? `${t("source")}: ${lead.source_search_name}` : t("unknownSource")}</small>
                  </div>
                </div>
                <div className="contact-links">
                  {lead.business_email && (
                    <CopyEmailButton email={lead.business_email} />
                  )}
                  {lead.phone && <a href={`tel:${lead.phone}`} title="Call business" aria-label="Call business"><Phone size={15} /></a>}
                  {lead.instagram && (
                    <a href={lead.instagram} target="_blank" rel="noreferrer" title="Instagram" aria-label="Instagram"><Instagram size={15} /></a>
                  )}
                  {lead.facebook && (
                    <a href={lead.facebook} target="_blank" rel="noreferrer" title="Facebook" aria-label="Facebook"><Facebook size={15} /></a>
                  )}
                  {lead.website && <a href={externalWebsite(lead.website)} target="_blank" rel="noreferrer" title="Website" aria-label="Website"><Globe2 size={15} /></a>}
                  {!lead.business_email &&
                    !lead.instagram &&
                    !lead.facebook && <small>—</small>}
                </div>
                <div className="lead-evidence">
                  <div className="website-opportunity-cell" title={opportunityMeta(lead)}>
                    {lead.website_audit_status === "queued" || lead.website_audit_status === "analyzing" ? (
                      <span className="opportunity-state analyzing"><i aria-hidden="true" />{createTranslator(language)("uiAnalyzing")}</span>
                    ) : lead.opportunity_level === "high" || lead.opportunity_level === "medium" || lead.opportunity_level === "low" ? (
                      <div className="opportunity-primary"><span className={`badge badge-${lead.opportunity_level === "high" ? "success" : lead.opportunity_level === "medium" ? "warning" : "info"}`}>{localizeOpportunityLevel(language, lead.opportunity_level)}</span><span className="opportunity-score">{lead.opportunity_score}/100 · {lead.opportunity_issue_count} {localizeOpportunityTerm(language, lead.opportunity_issue_count === 1 ? "issue" : "issues")}</span></div>
                    ) : (
                      <span className="badge badge-neutral">{localizeOpportunityLevel(language, "insufficient_evidence")}</span>
                    )}
                    <em className="opportunity-meta">{opportunityMeta(lead)}</em>
                  </div>
                </div>
                <div className="lead-actions">
                  <button className="quiet-action open-details" onClick={() => void loadAudit(lead)}><PanelRightOpen size={14} /> Details</button>
                  {lead.enrichment_status !== "completed" && <button
                    className="quiet-action"
                    disabled={isSearching(lead)}
                    onClick={() =>
                      lead.enrichment_status === "completed" ||
                      lead.enrichment_status === "failed" ||
                      lead.enrichment_status === "cancelled"
                        ? onRetry(lead.id)
                        : onEnrich([lead.id])
                    }
                  >
                    <Sparkles size={14} />{" "}
                    {isSearching(lead)
                      ? "Searching…"
                      : lead.enrichment_status === "failed" || lead.enrichment_status === "cancelled"
                        ? "Retry discovery"
                        : "Find contacts"}
                  </button>}
                  <details className="more-actions">
                    <summary aria-label={`More actions for ${lead.title}`}><MoreHorizontal size={18} /><span>More</span></summary>
                    <div role="menu">
                      <button role="menuitem" onClick={() => onAddPipeline([lead.id])}><Plus size={14} /> Add to pipeline</button>
                      {lead.website && <button role="menuitem" onClick={() => void loadAudit(lead)}><Globe2 size={14} /> View homepage audit</button>}
                      {lead.contact_source_url && <a role="menuitem" href={lead.contact_source_url} target="_blank" rel="noreferrer"><Link2 size={14} /> Contact source</a>}
                      <a role="menuitem" href={manualSearch(lead)} target="_blank" rel="noreferrer"><Search size={14} /> Search manually</a>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No leads match this view"
            body="Run a targeted local search or adjust the location filters."
          />
        )}
      </div>
      {auditLead && (
        <aside className="audit-drawer lead-detail-drawer" aria-label={`Lead details for ${auditLead.title}`}>
          <div className="audit-drawer-head">
            <span className="lead-avatar lead-avatar-large" aria-hidden="true">{initials(auditLead.title)}</span>
            <div>
              <p>Lead workspace</p>
              <h2>{auditLead.title}</h2>
              <span>{[auditLead.city, auditLead.region, auditLead.country_code].filter(Boolean).join(", ") || "Location unavailable"}</span>
            </div>
            <button className="text-button" onClick={() => { setAuditLead(null); onDrawerClose?.(); }}>
              <X size={18} /> Close
            </button>
          </div>
          <div className="detail-top-metrics" aria-label="Lead summary">
            <span><small>Rating</small><strong>{auditLead.review_rating || "—"}{auditLead.review_count ? ` · ${auditLead.review_count}` : ""}</strong></span>
            <span><small>Audit status</small><strong>{localizeQualificationStage(language, auditLead.website_audit_status)}</strong></span>
            <span><small>{createTranslator(language)("uiWebsiteQuality")}</small><strong>{audit?.score ?? localizeOpportunityLevel(language, "not_analyzed")}{audit?.score !== null && audit?.score !== undefined ? "/100" : ""}</strong></span>
            <span><small>{createTranslator(language)("uiWebsiteOpportunity")}</small><strong>{auditLead.opportunity_score ?? (auditLead.website_audit_status === "analyzing" || auditLead.website_audit_status === "queued" ? (createTranslator(language)("uiAnalyzing")) : localizeOpportunityLevel(language, auditLead.opportunity_level ?? "not_analyzed"))}{auditLead.opportunity_score !== null && auditLead.opportunity_score !== undefined ? "/100" : ""}</strong></span>
            <span><small>Automated UX</small><strong>{detail?.automatedUxStatus?.status ? localizeStatus(language, detail.automatedUxStatus.status) : localizeStatus(language, "not_started")}</strong></span>
            <span><small>AI Visual Review</small><strong>{detail?.visualUxStatus?.status ? localizeStatus(language, detail.visualUxStatus.status) : localizeStatus(language, "not_started")}</strong></span>
          </div>
          <div className="detail-tabs" role="tablist" aria-label="Lead detail sections">
            {[["overview", "Overview", ClipboardList], ["website", "Website", Globe2], ["intelligence", "Intelligence", Activity], ["icp", "ICP", BarChart3], ["contacts", "Contacts", CircleUserRound], ["outreach", "Outreach", MessageSquare], ["history", "History", Clock3]].map(([id, label, Icon]: any) => <button key={id} role="tab" aria-selected={detailTab === id} className={detailTab === id ? "active" : ""} onClick={() => setDetailTab(id)}><Icon size={14} /> {label}</button>)}
          </div>
          <div className="detail-panel" role="tabpanel">
          {detailTab === "overview" && <div className="detail-overview"><section><h3>Business summary</h3><div className="detail-badges">{auditLead.category && <span className={`badge badge-neutral industry-${categoryTone(auditLead.category)}`}>{auditLead.category}</span>}<span className="badge badge-info">{auditLead.lead_status || "new"}</span>{detail?.lead?.pipeline_status && <span className="badge badge-success">{localizeStatus(language, detail.lead.pipeline_status)}</span>}</div><p>{auditLead.address || "Address unavailable"}</p><p>{detail?.sources?.length ? `Found in ${detail.sources.length} saved search${detail.sources.length === 1 ? "" : "es"}.` : "Unknown source — no reliable search association is stored."}</p></section><section><h3>Opportunity explanation</h3>{detail?.opportunity ? <><p><strong>{localizeOpportunityLevel(language, String(detail.opportunity.level))}</strong>{detail.opportunity.score !== null && detail.opportunity.score !== undefined ? ` · ${detail.opportunity.score}/100` : ""}</p><p>{localizeOpportunityReason(language, String(detail.opportunity.reason ?? ""))}</p>{Array.isArray(detail.opportunity.evidence) && detail.opportunity.evidence.filter((item: any) => item?.category).slice(0, 5).map((item: any, index: number) => <small key={`${item.category}-${index}`} className="opportunity-evidence-line">{localizeOpportunityTerm(language, String(item.severity))} · {localizeOpportunityTerm(language, String(item.category))}: {item.suggestion}</small>)}</> : <p>{localizeOpportunityLevel(language, "not_analyzed")}</p>}</section><section><h3>Quick actions</h3><div className="detail-quick-actions">{auditLead.website && <a className="secondary" href={externalWebsite(auditLead.website)} target="_blank" rel="noreferrer"><Globe2 size={14} /> Visit website</a>}<button className="secondary" onClick={() => onAddPipeline([auditLead.id])}><Plus size={14} /> {detail?.lead?.pipeline_status ? "In pipeline" : "Add to pipeline"}</button></div></section><section><h3>Notes</h3><textarea defaultValue={auditLead.notes} placeholder="No commercial notes yet" onBlur={(event) => { if (event.target.value !== auditLead.notes) void onUpdate(auditLead, { notes: event.target.value }); }} /></section></div>}
          {detailTab === "contacts" && <div className="detail-contacts"><h3>Business contacts</h3>{auditLead.business_email && <p><Mail size={15} /><CopyEmailButton email={auditLead.business_email} /></p>}{auditLead.phone && <p><Phone size={15} /><a href={`tel:${auditLead.phone}`}>{auditLead.phone}</a></p>}{auditLead.website && <p><Globe2 size={15} /><a href={externalWebsite(auditLead.website)} target="_blank" rel="noreferrer">{auditLead.website}</a></p>}{auditLead.instagram && <p><Instagram size={15} /><a href={auditLead.instagram} target="_blank" rel="noreferrer">Instagram</a></p>}{auditLead.facebook && <p><Facebook size={15} /><a href={auditLead.facebook} target="_blank" rel="noreferrer">Facebook</a></p>}<h4>Public people and contact points</h4>{detail?.contacts?.length ? detail.contacts.map((contact: any) => <article className="contact-card" key={contact.id}><strong>{contact.display_name || contact.display_value}</strong>{contact.role && <span>{contact.role}</span>}<small>{contact.kind} · {contact.display_value}</small><blockquote>{contact.evidence}</blockquote><label>Verification <select value={contact.verification_status} onChange={(event) => void updateLeadContact(contact, { verification_status: event.target.value })}><option value="verified">Verified public</option><option value="possible">Possible</option><option value="unverified">Unverified</option></select></label><input defaultValue={contact.display_value} aria-label="Contact value" placeholder="Contact value" onBlur={(event) => { if (event.target.value !== contact.display_value) void updateLeadContact(contact, { display_value: event.target.value }); }} /><input defaultValue={contact.role} aria-label="Contact role" placeholder="Role" onBlur={(event) => { if (event.target.value !== contact.role) void updateLeadContact(contact, { role: event.target.value }); }} /></article>) : <p className="audit-empty">No public people or contact points are saved. This is not proof that the business has no contacts.</p>}<small>Discovery: {confidenceLabel(auditLead)} · Public confirmation does not imply mailbox deliverability.</small></div>}
          {detailTab === "outreach" && <div className="detail-overview"><section><h3>Outreach pipeline</h3><p>{detail?.lead?.pipeline_status ? `${localizeStatus(language, detail.lead.pipeline_status)} · ${detail.lead.pipeline_channel || t("channelNotSelected")}` : "This lead has not been added to the pipeline."}</p><button className="secondary" onClick={() => onAddPipeline([auditLead.id])}><Plus size={14} /> {detail?.lead?.pipeline_status ? "Open pipeline" : "Add to pipeline"}</button></section><section><h3>Outreach Studio</h3><p className="audit-empty">Reserved for future manual drafts and controlled outreach. No automatic sending is enabled.</p></section></div>}
          {detailTab === "history" && <div className="detail-history"><h3>Recorded activity</h3>{detail?.history?.length ? detail.history.map((item: any, index: number) => <article key={`${item.kind}-${item.occurred_at}-${index}`}><span className="badge badge-neutral">{localizeStatus(language, String(item.kind))}</span><strong>{localizeStatus(language, String(item.status))}</strong>{item.detail && <p>{item.detail}</p>}<small>{formatDate(item.occurred_at, language, { dateStyle: "short", timeStyle: "short" })}</small></article>) : <p className="audit-empty">No persisted activity exists for this lead yet.</p>}</div>}
          {detailTab === "intelligence" && <div className="lead-intelligence"><section className="audit-stage-status"><h3>Automated UX · objective evidence</h3><p><strong>Status:</strong> {detail?.automatedUxStatus?.status ? localizeStatus(language, detail.automatedUxStatus.status) : localizeStatus(language, "not_started")}</p>{detail?.automatedUxStatus?.error && <p>{detail.automatedUxStatus.error}</p>}{(detail?.automatedUxStatus?.findings ?? []).map((item: any) => <details key={item.id}><summary>{item.severity} · {item.category} · {item.property}</summary><p>{item.evidence}</p><small>{item.selector} · observed {item.observedValue} · rule: {item.rule}</small></details>)}</section><section className="audit-stage-status"><h3>AI Visual Review · subjective</h3><p><strong>Status:</strong> {detail?.visualUxStatus?.status ? localizeStatus(language, detail.visualUxStatus.status) : localizeStatus(language, "not_started")}{detail?.visualUxStatus?.approved ? " · approved" : ""}</p>{detail?.visualUxStatus?.error && <p>{detail.visualUxStatus.error}</p>}{detail?.visualUx?.map((item: any) => <details key={item.id}><summary>{item.redesign_potential} redesign potential</summary><p>{item.summary}</p><small>{item.model} · v{item.version} · {formatDate(item.created_at, language, { dateStyle: "short", timeStyle: "short" })}</small></details>)}</section><h3>Persisted homepage signals</h3>{observations.length ? <div className="signal-groups">{(["technology", "marketing", "contact", "booking", "website_opportunities", "discovery", "profile", "people", "verification"] as const).map((group) => { const items = observations.filter((item) => item.signal_group === group); return items.length ? <section key={group}><small>{group.replaceAll("_", " ")}</small><div>{items.map((item) => <details key={item.id} className="signal-badge"><summary>{item.label} <em>{localizeIntelligenceStatus(language, item.verification_status ?? "verified")} · {formatPercent(item.confidence, language)}</em></summary><p>{item.value_text}</p><small>{formatDate(item.observed_at, language, { dateStyle: "short", timeStyle: "short" })} · {item.collector}</small><blockquote>{item.evidence_excerpt}</blockquote></details>)}</div></section> : null; })}</div> : <p className="audit-empty">No persisted findings are stored yet. Unavailable signals are not treated as negative findings.</p>}</div>}
          {detailTab === "icp" && <div className="lead-intelligence"><h3>Evidence-based opportunity scores</h3>{icpScores.length ? icpScores.map((score) => <details key={score.id} className="signal-badge" open={score.profile_key === filters.icpProfile}><summary>{icpProfiles.find((profile: IcpProfile) => profile.profile_key === score.profile_key)?.name ?? score.profile_key}: <em>{score.score}/100 · {formatPercent(score.evidence_coverage / 100, language)} {createTranslator(language)("uiCoverage")}</em></summary><p>Evidence confidence {formatPercent(score.evidence_confidence / 100, language)} · calculated {formatDate(score.calculated_at, language, { dateStyle: "short", timeStyle: "short" })} · profile v{score.profile_version}</p>{(score.explanation.rules ?? []).map((rule) => <p key={rule.code}><strong>{rule.label}</strong> · {rule.status} · +{rule.contribution}<br /><small>{rule.reason}</small></p>)}</details>) : <p className="audit-empty">Not scored yet. Scoring uses only persisted lead, audit and observation evidence.</p>}</div>}
          {detailTab === "website" && (auditLoading && !audit ? (
            <p className="audit-empty">Loading audit…</p>
          ) : audit?.status === "not_analyzed" ? (
            <div className="audit-empty">
              <strong>Not Analyzed</strong>
              <p>
                Run a local browser audit to capture evidence and technical
                metrics.
              </p>
              <button
                className="primary"
                disabled={auditLoading}
                onClick={() => void queueAudit()}
              >
                <Globe2 size={15} /> Audit homepage
              </button>
            </div>
          ) : audit?.status === "queued" || audit?.status === "analyzing" ? (
            <div className="audit-empty">
              <strong>
                {audit.status === "queued" ? "Queued" : "Analyzing homepage…"}
              </strong>
              <p>
                Chromium is inspecting the public homepage. Results will appear
                here automatically.
              </p>
              <button
                className="secondary"
                disabled={auditLoading}
                onClick={() => void cancelAudit()}
              >
                <StopCircle size={14} /> Cancel audit
              </button>
            </div>
          ) : audit?.status === "failed" || audit?.status === "cancelled" ? (
            <div className="audit-content">
              <p className="audit-error"><strong>{audit.status === "cancelled" ? "Audit cancelled" : "Audit could not complete"}</strong><br />{audit.error || "No diagnostic reason was persisted."}</p>
              {Boolean(audit.metrics?.stages) && <section className="audit-stage-status"><h3>Audit stages</h3>{Object.entries((audit.metrics?.stages ?? {}) as Record<string, any>).map(([stage, item]) => <p key={stage}><strong>{stage}</strong> · {item.status ?? "unknown"}{item.reason ? ` · ${item.reason}` : ""}</p>)}</section>}
              <p className="audit-empty">Contact discovery remains independent of website auditing. Retry only when the stored reason may be transient.</p>
              <button className="primary" disabled={auditLoading} onClick={() => void queueAudit(true)}><Sparkles size={15} /> Retry audit</button>
            </div>
          ) : audit ? (
            <div className="audit-content">
              {audit.status === "partial" && <p className="audit-error"><strong>Audit partially completed.</strong> Some technical stages were not analyzed; no missing score is inferred.</p>}
              {audit.status === "access_restricted" && <p className="audit-error">Access restricted. {audit.error || "The site did not permit this public audit; no protection was bypassed. Any saved profile evidence remains available below."}</p>}
              {Boolean(audit.metrics?.stages) && typeof audit.metrics?.stages === "object" && <section className="audit-stage-status"><h3>Audit stages</h3>{Object.entries(audit.metrics.stages as Record<string, unknown>).map(([stage, raw]) => { const detail = raw as { status?: string; reason?: string }; return <p key={stage}><strong>{stage}</strong> · {detail.status?.replaceAll("_", " ") ?? "unknown"}{detail.reason ? ` · ${detail.reason}` : ""}</p>; })}</section>}
              <div className="audit-score-grid">
                {[
                  ["Quality", audit.score],
                  ["Performance", audit.performance_score],
                  ["SEO", audit.seo_score],
                  ["Accessibility", audit.accessibility_score],
                  ["Best practices", audit.best_practices_score],
                ].map(([label, score]) => (
                  <div key={String(label)} className="audit-score">
                    <span>{label}</span>
                    <strong>
                      {score === null || score === undefined
                        ? "Not Analyzed"
                        : `${score}/100`}
                    </strong>
                  </div>
                ))}
              </div>
              {audit.error && <p className="audit-error">{audit.error}</p>}
              <div className="audit-actions">
                <button
                  className="secondary"
                  disabled={auditLoading || !audit.desktop_screenshot || !audit.mobile_screenshot}
                  onClick={() => void api(`/api/leads/${auditLead.id}/visual-ux`, { method: "POST", body: JSON.stringify({}) }).then(() => { window.alert("Visual & UX assessment queued. Open Intelligence to follow its status."); }).catch((error) => window.alert(error instanceof Error ? error.message : "Visual assessment could not start."))}
                >
                  Analyze Visual &amp; UX
                </button>
                <button
                  className="secondary"
                  disabled={auditLoading}
                  onClick={() => void queueAudit(true)}
                >
                  <Sparkles size={14} /> Re-audit
                </button>
                <small>
                  {audit.pages?.length ?? 1} page{(audit.pages?.length ?? 1) === 1 ? "" : "s"} profiled
                  {(audit.pages?.length ?? 0) > 1
                    ? ` · limited depth`
                    : ""}
                </small>
              </div>
              {!!audit.pages?.length && <details className="audit-pages"><summary>Profiled pages</summary><ul>{audit.pages.map((page: string) => <li key={page}><a href={page} target="_blank" rel="noreferrer">{page}</a></li>)}</ul></details>}
              <div className="audit-screenshots">
                {audit.desktop_screenshot && (
                  <a
                    href={audit.desktop_screenshot}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={audit.desktop_screenshot}
                      alt="Desktop website screenshot"
                    />
                    <span>Desktop</span>
                  </a>
                )}
                {audit.mobile_screenshot && (
                  <a
                    href={audit.mobile_screenshot}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={audit.mobile_screenshot}
                      alt="Mobile website screenshot"
                    />
                    <span>Mobile</span>
                  </a>
                )}
              </div>
              <div className="lead-intelligence">
                <h3>ICP scoring</h3>
                {icpScores.length ? icpScores.map((score) => (
                  <details key={score.id} className="signal-badge">
                    <summary>{icpProfiles.find((profile: IcpProfile) => profile.profile_key === score.profile_key)?.name ?? score.profile_key}: <em>{score.score}/100 · {formatPercent(score.evidence_coverage / 100, language)} {createTranslator(language)("uiCoverage")}</em></summary>
                    <p>Evidence confidence {formatPercent(score.evidence_confidence / 100, language)} · calculated {formatDate(score.calculated_at, language, { dateStyle: "short", timeStyle: "short" })} · profile v{score.profile_version}</p>
                    {(score.explanation.rules ?? []).map((rule) => <p key={rule.code}><strong>{rule.label}</strong> · {rule.status} · +{rule.contribution}<br /><small>{rule.reason}</small></p>)}
                  </details>
                )) : (
                  <p className="audit-empty">Not scored for this profile yet. Scoring uses only saved audits, listing data, and observations.</p>
                )}
                <h3>Lead Intelligence</h3>
                {observations.length ? (
                  <div className="signal-groups">
                    {(
                      [
                        "technology",
                        "marketing",
                        "contact",
                        "booking",
                        "website_opportunities",
                        "discovery",
                        "profile",
                        "people",
                        "verification",
                      ] as const
                    ).map((group) => {
                      const items = observations.filter(
                        (item) => item.signal_group === group,
                      );
                      if (!items.length) return null;
                      return (
                        <section key={group}>
                          <small>{group.replaceAll("_", " ")}</small>
                          <div>
                            {items.map((item) => (
                              <details key={item.id} className="signal-badge">
                                <summary>
                                  {item.label}{" "}
                                  <em>{localizeIntelligenceStatus(language, item.verification_status ?? "verified")} · {formatPercent(item.confidence, language)}</em>
                                </summary>
                                <p>{item.value_text}</p>
                                <small>
                                  {formatDate(item.observed_at, language, { dateStyle: "short", timeStyle: "short" })}{" "}
                                  · {item.collector}
                                </small>
                                <blockquote>{item.evidence_excerpt}</blockquote>
                                <label>Verification <select value={item.verification_status ?? "verified"} onChange={(event) => void updateObservationStatus(item, event.target.value as LeadObservation["verification_status"])}><option value="verified">Verified</option><option value="possible">Possible</option><option value="inconclusive">Inconclusive</option></select></label>
                                {item.evidence_url && (
                                  <a
                                    href={item.evidence_url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Homepage evidence
                                  </a>
                                )}
                              </details>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <p className="audit-empty">
                    No confirmed homepage signals yet. Run or refresh the
                    homepage audit to collect public evidence.
                  </p>
                )}
              </div>
              <div className="audit-metrics">
                {Object.entries(audit.metrics ?? {}).filter(([label, value]) => label !== "stages" && (typeof value === "string" || typeof value === "number" || value === null)).map(([label, value]) => (
                  <span key={label}>
                    <small>{label.replace(/([A-Z])/g, " $1")}</small>
                    <strong>{value === null || value === undefined ? "Not Analyzed" : String(value)}</strong>
                  </span>
                ))}
              </div>
              <div className="audit-issues">
                <h3>Improvement opportunities</h3>
                {audit.issues.length ? (
                  audit.issues.map((issue, index) => (
                    <article key={`${issue.url}-${index}`}>
                      <span className={`issue-severity ${issue.severity}`}>
                        {localizeOpportunityTerm(language, issue.severity)}
                      </span>
                      <strong>{localizeOpportunityTerm(language, issue.category)}</strong>
                      {issue.verification_status && <span className="badge badge-neutral">{issue.verification_status}</span>}
                      <p>{issue.evidence}</p>
                      <small>{issue.url}</small>
                      <em>{issue.suggestion}</em>
                    </article>
                  ))
                ) : (
                  <p className="audit-empty">
                    {createTranslator(language)("uiNoMeasurableIssuesWereDetectedInTheAnalyzedPages")}
                  </p>
                )}
              </div>
            </div>
          ) : null)}
          </div>
        </aside>
      )}
    </section>
  );
  return (
    <section className="leads-page">
      <div className="filter-bar">
        <Search size={17} />
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search companies, categories or addresses"
        />
        <input
          value={filters.country}
          onChange={(e) =>
            setFilters({ ...filters, country: e.target.value.toUpperCase() })
          }
          placeholder="Country"
        />
        <input
          value={filters.region}
          onChange={(e) => setFilters({ ...filters, region: e.target.value })}
          placeholder="Region"
        />
        <input
          value={filters.city}
          onChange={(e) => setFilters({ ...filters, city: e.target.value })}
          placeholder="City"
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.websiteEmpty}
            onChange={() => toggleFilter("websiteEmpty")}
          />{" "}
          No website
        </label>
        <a className="export" href={`/api/leads/export.csv?${exportQuery}`}>
          <Download size={16} /> Export CSV
        </a>
      </div>
      <div className="contact-filters">
        {[
          ["hasInstagram", "Has Instagram"],
          ["hasEmail", "Has Email"],
          ["hasFacebook", "Has Facebook"],
          ["hasAnyDigitalContact", "Any digital contact"],
          ["noDigitalContact", "No digital contact"],
          ["verifiedContactsOnly", "Verified only"],
          ["noWebsiteHasInstagram", "No website + Instagram"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filters[key] ? "active" : ""}
            onClick={() => toggleFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel table-panel">
        <div className="section-head">
          <div>
            <h2>{leads.length} leads</h2>
            <p>Persistent local records, deduplicated by place identifier.</p>
          </div>
          <div className="enrich-actions">
            {selected.length > 0 && (
              <>
                <button
                  className="secondary"
                  onClick={() => onEnrich(selected)}
                >
                  {" "}
                  <Sparkles size={15} /> Enrich Selected ({selected.length})
                </button>
                <button className="text-button" onClick={() => setSelected([])}>
                  Clear
                </button>
              </>
            )}
            <button className="text-button" onClick={onStop}>
              <StopCircle size={14} /> Stop queue
            </button>
          </div>
        </div>
        {leads.length ? (
          <div className="lead-table contacts-table">
            <div className="table-head">
              <span>Select</span>
              <span>Company</span>
              <span>Location</span>
              <span>Contacts</span>
              <span>Contact status</span>
              <span>Actions</span>
            </div>
            {leads.map((lead: Lead) => (
              <div className="lead-row" key={lead.id}>
                <div>
                  <button
                    className="select-lead"
                    aria-label={`Select ${lead.title}`}
                    onClick={() => toggle(lead.id)}
                  >
                    {selected.includes(lead.id) ? (
                      <CheckSquare size={17} />
                    ) : (
                      <Square size={17} />
                    )}
                  </button>
                </div>
                <div>
                  <strong data-no-translate>{lead.title}</strong>
                  <p>
                    {lead.category} · {lead.review_rating || "—"} ★ (
                    {lead.review_count || 0})
                  </p>
                </div>
                <div>
                  <p>
                    {lead.city}
                    {lead.region ? `, ${lead.region}` : ""}
                  </p>
                  <small>{lead.country_code}</small>
                </div>
                <div className="contact-links">
                  {lead.business_email && (
                    <CopyEmailButton email={lead.business_email} />
                  )}
                  {lead.instagram && (
                    <a href={lead.instagram} target="_blank" rel="noreferrer">
                      <Link2 size={14} /> Instagram
                    </a>
                  )}
                  {lead.facebook && (
                    <a href={lead.facebook} target="_blank" rel="noreferrer">
                      <Link2 size={14} /> Facebook
                    </a>
                  )}
                  {!lead.business_email &&
                    !lead.instagram &&
                    !lead.facebook && <small>—</small>}
                </div>
                <div>
                  <span className={`contact-status ${lead.contact_status}`}>
                    {lead.enrichment_status === "processing" ||
                    lead.enrichment_status === "queued"
                      ? lead.enrichment_status
                      : lead.contact_status === "not_found"
                        ? "Not found"
                        : lead.contact_status === "verified"
                          ? "Verified"
                          : "Possible"}
                  </span>
                  {lead.contact_source_url && (
                    <a
                      className="source-link"
                      href={lead.contact_source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source
                    </a>
                  )}
                </div>
                <div>
                  <button
                    className="quiet-action"
                    disabled={
                      lead.enrichment_status === "queued" ||
                      lead.enrichment_status === "processing"
                    }
                    onClick={() => onEnrich([lead.id])}
                  >
                    <Sparkles size={14} />{" "}
                    {lead.enrichment_status === "processing"
                      ? "Finding…"
                      : "Find contacts"}
                  </button>
                  <select
                    value={lead.lead_status}
                    onChange={(e) =>
                      onUpdate(lead, { lead_status: e.target.value })
                    }
                  >
                    <option value="new">New</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="qualified">Qualified</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No leads match this view"
            body="Run a targeted local search or adjust the location filters."
          />
        )}
      </div>
    </section>
  );
}
type OutboxItem = { id: string; campaign_id: string; lead_id: string; account_id: string; to_email: string; subject: string; body: string; status: string; send_at: string; sent_at?: string | null; attempts: number; provider_message_id?: string | null; uncertain: boolean; error?: string | null; dispatchState?: string; isTest?: boolean };
type MailAccountSummary = { id: string; provider: "gmail" | "zoho"; email: string; status: string; limits?: { daily?: number }; sendReady?: boolean; lastError?: string | null };
const outboxStatuses = ["pending_review", "approved", "sending", "sent", "rejected", "cancelled", "failed"] as const;
function formatOutboxDateTime(value: string | null | undefined, language: UiLanguage) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : formatDate(date, language, { dateStyle: "short", timeStyle: "short" }); }
function OutboxView({ onNotice }: { onNotice: (message: string) => void }) {
  const { t, language } = useI18n();
  const [items, setItems] = useState<OutboxItem[]>([]); const [accounts, setAccounts] = useState<MailAccountSummary[]>([]); const [filter, setFilter] = useState("all"); const [query, setQuery] = useState(""); const [paused, setPaused] = useState(true); const [sendingEnabled, setSendingEnabled] = useState(false); const [busy, setBusy] = useState(false); const [selectedTerminal, setSelectedTerminal] = useState<string[]>([]);
  const load = async () => { const [outbox, mail] = await Promise.all([api<{ items: OutboxItem[]; paused: boolean; sendingEnabled: boolean }>("/api/outreach/outbox"), api<{ accounts: MailAccountSummary[] }>("/api/email-accounts")]); setItems(outbox.items ?? []); setPaused(outbox.paused); setSendingEnabled(outbox.sendingEnabled); setAccounts(mail.accounts ?? []); };
  useEffect(() => { void load().catch((error) => onNotice(error instanceof Error ? error.message : t("couldNotLoadSends"))); const timer = window.setInterval(() => { void load(); }, 8_000); return () => window.clearInterval(timer); }, []);
  const action = async (id: string, verb: "approve" | "cancel") => { setBusy(true); try { await api(`/api/outreach/outbox/${id}/${verb}`, { method: "POST", body: verb === "cancel" ? JSON.stringify({ reason: "cancelled_by_user" }) : undefined }); await load(); } catch (error) { onNotice(error instanceof Error ? error.message : t("couldNotUpdateSchedule")); } finally { setBusy(false); } };
  const clearSelected = async () => { if (!selectedTerminal.length) return; setBusy(true); try { const result = await api<{ removed: number }>("/api/outreach/outbox", { method: "DELETE", body: JSON.stringify({ ids: selectedTerminal }) }); setSelectedTerminal([]); onNotice(t("removedOutboxItems", { count: formatNumber(result.removed, language) })); await load(); } catch (error) { onNotice(error instanceof Error ? error.message : t("couldNotClearSelected")); } finally { setBusy(false); } };
  const togglePause = async () => { setBusy(true); try { const next = await api<{ paused: boolean }>(`/api/outreach/sending/${paused ? "resume" : "pause"}`, { method: "POST" }); setPaused(next.paused); if (paused) onNotice(t("sendingRemainsDisabled")); } catch (error) { onNotice(error instanceof Error ? error.message : t("couldNotChangePause")); } finally { setBusy(false); } };
  const visible = items.filter((item) => (filter === "all" || item.status === filter) && `${item.to_email} ${item.subject}`.toLowerCase().includes(query.toLowerCase()));
  const removableVisible = visible.filter((item) => ["cancelled", "rejected", "failed"].includes(item.status));
  const counts = items.reduce<Record<string, number>>((result, item) => { result[item.status] = (result[item.status] ?? 0) + 1; return result; }, {});
  return <section className="outbox-page"><PageHeader className="outbox-hero" title={t("sendActivityTitle")} description={t("sendActivitySubtitle")} actions={<div className="outbox-hero-actions"><TestOutboxComposer accounts={accounts} onCreated={() => void load()} onNotice={onNotice} /><span className={`outbox-lock ${sendingEnabled ? "armed" : ""}`}>{sendingEnabled ? t("sendingEnabled") : t("sendingDisabled")}</span><button className="secondary" disabled={busy || !sendingEnabled} title={!sendingEnabled ? t("onlyEnableSendingBackend") : undefined} onClick={() => void togglePause()}>{paused ? t("resume") : t("pause")}</button></div>} />
    <div className="outbox-account-strip">{accounts.length ? accounts.map((account) => <div className="outbox-account-chip" key={account.id}><span className={`provider-dot ${account.provider}`} /> <strong>{account.email}</strong><small>{account.sendReady ? t("dailyLimit", { count: formatNumber(account.limits?.daily ?? 50, language) }) : t("sendPermissionPending")}</small></div>) : <span>{t("noConnectedAccounts")}</span>}</div>
    <div className="outbox-summary"><div><span>{t("scheduledCount")}</span><strong>{counts.approved ?? 0}</strong></div><div><span>{t("outboxPendingReview")}</span><strong>{counts.pending_review ?? 0}</strong></div><div><span>{t("sentCount")}</span><strong>{counts.sent ?? 0}</strong></div><div><span>{t("failedCount")}</span><strong>{counts.failed ?? 0}</strong></div></div>
    <div className="outbox-toolbar"><div className="outbox-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchRecipient")} /></div><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("filterStatus")}><option value="all">{t("allStatuses")}</option>{outboxStatuses.map((value) => <option key={value} value={value}>{localizeOutboxStatus(language, value)}</option>)}</select><button className="secondary" onClick={() => void load()}>{t("refresh")}</button>{removableVisible.length > 0 && <button className="quiet-action" disabled={busy || !selectedTerminal.length} onClick={() => void clearSelected()}>{t("removeSelected")}</button>}</div>
    <div className="outbox-list">{visible.map((item) => { const removable = ["cancelled", "rejected", "failed"].includes(item.status); return <article className={`outbox-row ${item.uncertain ? "uncertain" : ""}`} key={item.id}><div className="outbox-row-main">{removable && <label className="outbox-row-select"><input type="checkbox" checked={selectedTerminal.includes(item.id)} onChange={(event) => setSelectedTerminal((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} aria-label={t("chooseForRemoval", { subject: item.subject || item.to_email })} /></label>}<div className="outbox-badges"><span className={`outbox-status ${item.status}`}>{item.isTest ? t("testMessage") : ""}{localizeOutboxStatus(language, item.status)}</span><span className="outbox-dispatch-state">{localizeOutboxDispatch(language, item.dispatchState ?? "terminal")}</span></div><h3 data-no-translate>{item.subject || t("noSubject")}</h3><p>{t("recipient")} <strong data-no-translate>{item.to_email}</strong> · {t("account")} {accounts.find((account) => account.id === item.account_id)?.email ?? item.account_id}</p></div><div className="outbox-row-meta"><span>{item.status === "sent" && item.sent_at ? t("sentAt", { date: formatOutboxDateTime(item.sent_at, language) }) : t("plannedFor", { date: formatOutboxDateTime(item.send_at, language) })}</span><small>{translateCount(language, item.attempts, { one: "attemptsOne", other: "attemptsOther" })}{item.uncertain ? ` · ${t("uncertainResult")}` : ""}</small></div><div className="outbox-row-actions">{item.status === "pending_review" && <button className="secondary" disabled={busy} onClick={() => void action(item.id, "approve")}>{t("approve")}</button>}{["pending_review", "approved"].includes(item.status) && <button className="quiet-action" disabled={busy} onClick={() => void action(item.id, "cancel")}>{t("cancel")}</button>}</div>{item.error && <p className="outbox-error">{item.error}</p>}</article>; })}{!visible.length && <div className="outbox-empty"><Mail size={22} /><strong>{t("noSendActivity")}</strong><span>{t("noSendActivityHelp")}</span></div>}</div>
  </section>;
}

function TestOutboxComposer({ accounts, onCreated, onNotice }: { accounts: MailAccountSummary[]; onCreated: () => void; onNotice: (message: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false); const [recipients, setRecipients] = useState<string[]>([]); const [toEmail, setToEmail] = useState(""); const [accountId, setAccountId] = useState(""); const [subject, setSubject] = useState("Test message — Scout"); const [body, setBody] = useState("Scout test message."); const [busy, setBusy] = useState(false);
  const openComposer = async () => { try { const result = await api<{ recipients: string[] }>("/api/outreach/test-recipients"); setRecipients(result.recipients ?? []); setToEmail(result.recipients?.[0] ?? ""); setAccountId(accounts.find((account) => account.sendReady)?.id ?? accounts[0]?.id ?? ""); setOpen(true); } catch (error) { onNotice(error instanceof Error ? error.message : t("couldNotLoadTestRecipients")); } };
  const create = async () => { setBusy(true); try { await api("/api/outreach/test-message", { method: "POST", body: JSON.stringify({ toEmail, accountId, subject, body }) }); onNotice(t("testPrepared")); setOpen(false); onCreated(); } catch (error) { onNotice(error instanceof Error ? error.message : t("couldNotPrepareTest")); } finally { setBusy(false); } };
  return <><button className="secondary" onClick={() => void openComposer()}>{t("createTestEmail")}</button>{open && <div className="outbox-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="outbox-modal outbox-test-modal" role="dialog" aria-modal="true" aria-labelledby="test-mail-title"><header><div><p className="crumb">{t("sendsNav")}</p><h2 id="test-mail-title">{t("createTestEmail")}</h2><p>{t("testEmailHelp")}</p></div><button className="quiet-action" onClick={() => setOpen(false)} aria-label={t("close")}><X size={18} /></button></header><div className="outbox-test-fields"><label>{t("senderAccount")}<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.filter((account) => account.status === "connected").map((account) => <option key={account.id} value={account.id}>{account.email} · {account.sendReady ? t("sendingAuthorized") : t("reconnectRequired")}</option>)}</select></label><label>{t("authorizedRecipient")}<select value={toEmail} onChange={(event) => setToEmail(event.target.value)}>{recipients.map((recipient) => <option key={recipient} value={recipient}>{recipient}</option>)}</select></label><label>{t("subject")}<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>{t("message")}<textarea value={body} onChange={(event) => setBody(event.target.value)} /></label>{!recipients.length && <p className="outbox-test-warning">{t("noTestRecipients")} <code>OUTREACH_TEST_RECIPIENTS</code> {t("inBackend")}</p>}</div><footer><span>{t("testEmailReview")}</span><button className="secondary" onClick={() => setOpen(false)}>{t("cancel")}</button><button className="primary" disabled={busy || !recipients.length || !accountId} onClick={() => void create()}>{busy ? t("preparing") : t("prepareTest")}</button></footer></section></div>}</>;
}

function CampaignOutboxLauncher({ campaignId, onNotice }: { campaignId: string; onNotice: (message: string) => void }) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false); const [leads, setLeads] = useState<Array<{ id: string; title: string; business_email?: string; contact_status?: string }>>([]); const [accounts, setAccounts] = useState<MailAccountSummary[]>([]); const [selected, setSelected] = useState<string[]>([]); const [accountIds, setAccountIds] = useState<string[]>([]); const [quantity, setQuantity] = useState(0); const [quantityEdited, setQuantityEdited] = useState(false); const [spacing, setSpacing] = useState(15); const [startAt, setStartAt] = useState(""); const [busy, setBusy] = useState(false);
  const load = async () => { const [leadResult, accountResult] = await Promise.all([api<Array<{ id: string; title: string; business_email?: string; contact_status?: string; draft_status?: string }>>(`/api/emails?campaignId=${encodeURIComponent(campaignId)}`), api<{ accounts: MailAccountSummary[] }>("/api/email-accounts")]); const seenRecipients = new Set<string>(); const available = (leadResult ?? []).filter((lead) => { const recipient = lead.business_email?.trim().toLowerCase() ?? ""; if (!recipient || !["draft", "reviewed"].includes(lead.draft_status ?? "") || seenRecipients.has(recipient)) return false; seenRecipients.add(recipient); return true; }); setLeads(available); setSelected(available.map((lead) => lead.id)); setQuantity(available.length); setQuantityEdited(false); setAccounts(accountResult.accounts ?? []); setAccountIds((accountResult.accounts ?? []).filter((account) => account.status === "connected").map((account) => account.id)); };
  const openModal = async () => { try { await load(); setOpen(true); } catch (error) { onNotice(error instanceof Error ? error.message : t("couldNotPrepareSchedule")); } };
  const stage = async () => { const ids = selected.slice(0, Math.max(1, quantity)); if (!ids.length || !accountIds.length) return; setBusy(true); try { const result = await api<{ staged: string[]; skipped: Array<{ leadId: string; reasons: string[] }>; sendingEnabled: boolean }>(`/api/campaigns/${campaignId}/outbox`, { method: "POST", body: JSON.stringify({ leadIds: ids, accountIds, spacingMinutes: spacing, startAt: startAt ? new Date(startAt).toISOString() : undefined }) }); const detail = result.skipped.length ? ` ${t("skippedMessages", { count: formatNumber(result.skipped.length, language), reasons: result.skipped.map((item) => item.reasons.join(", ")).join("; ") })}` : ""; onNotice(`${t("stagedMessages", { count: formatNumber(result.staged.length, language) })}${detail}${result.sendingEnabled ? "" : ` ${t("sendingStillDisabled")}`}`); setOpen(false); } catch (error) { onNotice(error instanceof Error ? error.message : t("couldNotPrepareQueue")); } finally { setBusy(false); } };
  return <><button className="secondary outbox-launch-button" onClick={() => void openModal()}>{t("prepareSending")}</button>{open && <div className="outbox-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="outbox-modal" role="dialog" aria-modal="true" aria-labelledby="outbox-modal-title"><header><div><p className="crumb">{t("campaigns")}</p><h2 id="outbox-modal-title">{t("prepareSending")}</h2><p>{t("prepareSendingHelp")}</p></div><button className="quiet-action" onClick={() => setOpen(false)} aria-label={t("close")}><X size={18} /></button></header><div className="outbox-modal-grid"><div><label>{t("quantity")}<input type="number" min={1} max={selected.length || 1} value={quantity} onChange={(event) => { setQuantity(Number(event.target.value) || 1); setQuantityEdited(true); }} /></label><label>{t("messageInterval")}<select value={spacing} onChange={(event) => setSpacing(Number(event.target.value))}><option value={5}>{t("minutes", { count: 5 })}</option><option value={15}>{t("minutes", { count: 15 })}</option><option value={30}>{t("minutes", { count: 30 })}</option><option value={60}>{t("oneHour")}</option></select></label><label>{t("optionalStart")}<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label></div><div><h3>{t("senderAccounts")}</h3>{accounts.filter((account) => account.status === "connected").map((account) => <label className="outbox-account-option" key={account.id}><input type="checkbox" checked={accountIds.includes(account.id)} onChange={(event) => setAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} /><span><strong>{account.email}</strong><small>{account.sendReady ? `${account.provider} · limite ${account.limits?.daily ?? 50}/dia` : t("reconnectToSend")}</small></span></label>)}{!accounts.length && <p className="muted">{t("connectAccountFirst")}</p>}</div></div><div className="outbox-modal-leads"><div className="outbox-modal-leads-head"><strong>{t("availableMessages")}</strong><small>{t("selectedCount", { count: formatNumber(selected.length, language) })}</small></div>{leads.map((lead) => <label key={lead.id}><input type="checkbox" checked={selected.includes(lead.id)} onChange={(event) => setSelected((current) => { const next = event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id); if (!quantityEdited) setQuantity(next.length); return next; })} /><span>{lead.title}<small>{lead.business_email}</small></span></label>)}{!leads.length && <p className="muted">{t("noEligibleMessages")}</p>}</div><footer><span>{t("gateWillVerify")}</span><button className="secondary" onClick={() => setOpen(false)}>{t("cancel")}</button><button className="primary" disabled={busy || !selected.length || !accountIds.length} onClick={() => void stage()}>{busy ? t("preparing") : t("addToSendingQueue")}</button></footer></section></div>}</>;
}

function GlobalEmailsView({ preferences, onPreferencesChange, campaignId = "", campaignName = "" }: { preferences: OutreachPreferences; onPreferencesChange: (preferences: OutreachPreferences) => void; campaignId?: string; campaignName?: string }) {
  const { language: interfaceLanguage } = useI18n();
  const copy = createOutreachCopy(interfaceLanguage);
  const [rows, setRows] = useState<Array<any>>([]);
  const [selected, setSelected] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [draftCache, setDraftCache] = useState<Record<string, any>>({});
  const [emailLanguage, setEmailLanguage] = useState<"en" | "pt-BR">(preferences.defaultLanguage);
  const [tone, setTone] = useState(preferences.tone);
  const [senderOpen, setSenderOpen] = useState(false);
  const [senderProfile, setSenderProfile] = useState<SenderProfile>(preferences.senderProfile);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedTarget, setCopiedTarget] = useState<"subject" | "message" | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [generation, setGeneration] = useState<GenerationFeedback | null>(null);
  const generationAbort = useRef<AbortController | null>(null);
  const scopeQuery = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
  const scopeBody = campaignId ? { campaignId } : {};
  const loadRows = () => api<any[]>(`/api/emails${scopeQuery}`).then((items) => { setRows(items); setSelected((current: any) => current ? items.find((item) => item.id === current.id) ?? items[0] ?? null : items[0] ?? null); }).catch(() => setRows([]));
  useEffect(() => { setSelected(null); setDraft(null); setDraftCache({}); setSelectedIds([]); void loadRows(); }, [campaignId]);
  useEffect(() => {
    if (!selected) { setDraft(null); return; }
    const cached = draftCache[selected.id];
    if (cached) { setDraft(cached); return; }
    void api<any>(`/api/emails/${selected.id}/draft${scopeQuery}`).then((next) => { setDraft(next); setDraftCache((current) => ({ ...current, [selected.id]: next })); }).catch(() => setDraft(null));
  }, [selected?.id]);
  useEffect(() => { setEmailLanguage(preferences.defaultLanguage); setTone(preferences.tone); setSenderProfile(preferences.senderProfile); }, [preferences]);
  useEffect(() => {
    if (!run?.id || isTerminalGenerationRun(run)) return;
    let disposed = false;
    let timer: number | undefined;
    const reconcile = async () => {
      try {
        const next = await api<any>(`/api/emails/runs/${run.id}`);
        if (disposed) return;
        const nextRun = { ...next.run, items: next.items ?? [] };
        const terminal = isTerminalGenerationRun(nextRun);
        const current = nextRun.items.find((item: any) => item.status === "running");
        setRun(nextRun);
        setGeneration((active) => active?.scope === "batch" ? {
          ...active,
          status: terminal ? (nextRun.status === "cancelled" ? "cancelled" : nextRun.failed ? "error" : "complete") : "loading",
          detail: nextRun.status === "cancelled" ? createTranslator(interfaceLanguage)("generationRemainingCancelled") : nextRun.failed ? createTranslator(interfaceLanguage)("generationPartial") : terminal ? createTranslator(interfaceLanguage)("generationSaved") : createTranslator(interfaceLanguage)("generationPreparing"),
          total: nextRun.total,
          completed: nextRun.completed,
          failed: nextRun.failed,
          current: current ? rows.find((lead) => lead.id === current.lead_id)?.title : undefined,
        } : active);
        if (terminal) {
          setBusy(false);
          void loadRows();
          return;
        }
      } catch (error) {
        if (!disposed) {
          setBusy(false);
          setGeneration((active) => active?.scope === "batch" ? { ...active, status: "error", detail: error instanceof Error ? error.message : copy.error } : active);
        }
        return;
      }
      if (!disposed) timer = window.setTimeout(() => void reconcile(), 900);
    };
    void reconcile();
    return () => { disposed = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [run?.id, run?.status]);
  useEffect(() => () => generationAbort.current?.abort(), []);
  useEffect(() => {
    if (!copiedTarget) return;
    const timer = window.setTimeout(() => setCopiedTarget(null), 2400);
    return () => window.clearTimeout(timer);
  }, [copiedTarget]);
  const changeDraft = (changes: Record<string, unknown>) => { if (!selected || !draft) return; const next = { ...draft, ...changes }; setDraft(next); setDraftCache((current) => ({ ...current, [selected.id]: next })); };
  const persistGuidance = async () => { if (!selected || !draft) return; try { const next = await api<any>(`/api/emails/${selected.id}/draft${scopeQuery}`, { method:"PATCH", body:JSON.stringify({ ...scopeBody, guidance:draft.guidance || "" }) }); setDraft(next); setDraftCache((current) => ({ ...current, [selected.id]: next })); } catch { setNotice(copy.saveError); } };
  const persistFocus = async () => { if (!selected || !draft) return; try { const next = await api<any>(`/api/emails/${selected.id}/draft${scopeQuery}`, { method:"PATCH", body:JSON.stringify({ ...scopeBody, service:draft.service || "", serviceOverride:Boolean(draft.service_override) }) }); setDraft(next); setDraftCache((current) => ({ ...current, [selected.id]: next })); } catch { setNotice(copy.saveError); } };
  const useSuggestedFocus = async () => { if (!selected || !draft) return; const nextDraft = { ...draft, service:"", service_override:false }; setDraft(nextDraft); setDraftCache((current) => ({ ...current, [selected.id]: nextDraft })); try { const saved = await api<any>(`/api/emails/${selected.id}/draft${scopeQuery}`, { method:"PATCH", body:JSON.stringify({ ...scopeBody, service:"", serviceOverride:false }) }); setDraft(saved); setDraftCache((current) => ({ ...current, [selected.id]: saved })); } catch { setNotice(copy.saveError); } };
  const save = async () => { if (!selected || !draft) return; try { const next = await api<any>(`/api/emails/${selected.id}/draft${scopeQuery}`, { method:"PATCH", body:JSON.stringify({ ...scopeBody, ...draft, language: emailLanguage || "en", recordHistory:true }) }); setDraft(next); setDraftCache((current) => ({ ...current, [selected.id]: next })); setEditing(false); void loadRows(); } catch { setNotice(copy.saveError); } };
  const saveGlobal = (changes: Partial<OutreachPreferences>) => onPreferencesChange({ ...preferences, ...changes });
  const updateSender = (key: keyof SenderProfile, value: string) => setSenderProfile((current) => ({ ...current, [key]: value }));
  const persistSender = () => saveGlobal({ senderProfile });
  const generate = async (regenerate = false) => { if (!selected || busy) return; const controller = new AbortController(); generationAbort.current = controller; setBusy(true); setNotice(""); setGeneration({ scope:"single", status:"loading", title:copy.generating, detail:createTranslator(interfaceLanguage)("uiPreparingVerifiedLeadIntelligenceAndGeneratingAPersonalizedDraft") }); try { const result = await api<any>(`/api/emails/${selected.id}/generate`, { method:"POST", signal:controller.signal, body:JSON.stringify({ ...scopeBody, language:emailLanguage, tone, guidance:draft?.guidance || "", regenerate }) }); setDraft(result.draft); setDraftCache((current) => ({ ...current, [selected.id]: result.draft })); setEditing(false); setGeneration(null); setNotice(copy.generated); void loadRows(); } catch (error) { const message = error instanceof Error ? error.message : copy.error; const timeout = /timed out|maximum allowed time|stopped sending/i.test(message); const cancelled = controller.signal.aborted; setGeneration({ scope:"single", status:cancelled ? "cancelled" : timeout ? "timeout" : "error", title:cancelled ? (createTranslator(interfaceLanguage)("uiGenerationCancelled")) : timeout ? (createTranslator(interfaceLanguage)("uiGenerationTimedOut")) : (createTranslator(interfaceLanguage)("uiCouldNotGenerateEmail")), detail:cancelled ? (createTranslator(interfaceLanguage)("uiNoDraftWasSaved")) : message }); setNotice(message); } finally { if (generationAbort.current === controller) generationAbort.current = null; setBusy(false); } };
  const startBatch = async (allPending = false, leadIds = selectedIds, regenerateExisting = false) => { if (!allPending && !regenerateExisting && !leadIds.length) { setNotice(copy.batchNone); return; } setBusy(true); setNotice(""); try { const result = await api<any>("/api/emails/batch", { method:"POST", body:JSON.stringify({ ...scopeBody, language:emailLanguage, tone, leadIds, allPending, allReady:regenerateExisting, regenerateExisting }) }); setRun({ id:result.runId, status:"queued", total:result.total, completed:0, failed:0, cancelled:0 }); setGeneration({ scope:"batch", status:"loading", title:regenerateExisting ? (createTranslator(interfaceLanguage)("uiRegeneratingReadyDrafts")) : createTranslator(interfaceLanguage)("uiGeneratingPersonalizedEmails"), detail:createTranslator(interfaceLanguage)("uiPreparingPersonalizedDraftsFromVerifiedLeadIntelligence"), total:result.total, completed:0, failed:0 }); if (result.skipped?.length || result.protectedSkipped?.length) setNotice(`${(result.skipped?.length ?? 0) + (result.protectedSkipped?.length ?? 0)} ${copy.generated.toLowerCase()}.`); } catch (error) { const message = error instanceof Error ? error.message : copy.error; setGeneration({ scope:"batch", status:"error", title:createTranslator(interfaceLanguage)("uiCouldNotStartBatchGeneration"), detail:message }); setNotice(message); setBusy(false); } };
  const cancelGeneration = () => { if (generation?.scope === "single") { generationAbort.current?.abort(); return; } if (run?.id) void api(`/api/emails/runs/${run.id}/cancel`, { method:"POST" }).then(() => setGeneration((active) => active ? { ...active, detail:"Cancelling the remaining drafts…" } : active)); };
  const copyPlainText = async (value: string) => {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; }
    const fallback = document.createElement("textarea"); fallback.value = value; fallback.setAttribute("readonly", ""); fallback.style.position = "fixed"; fallback.style.opacity = "0"; document.body.appendChild(fallback); fallback.select();
    const copied = document.execCommand("copy"); document.body.removeChild(fallback); if (!copied) throw new Error("Clipboard copy failed.");
  };
  const copySubject = async (subject: string) => { try { await copyPlainText(subject); setCopiedTarget("subject"); } catch { setNotice(copy.copyError); } };
  const copyEmail = async (body: string) => {
    const plain = body;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([plain], { type: "text/plain" }), "text/html": new Blob([emailDraftHtml(body)], { type: "text/html" }) })]);
      } else await copyPlainText(plain);
      setCopiedTarget("message");
    } catch { setNotice(copy.copyError); }
  };
  const visibleRows = rows.filter((lead) => `${lead.title} ${lead.business_email} ${lead.website}`.toLowerCase().includes(query.toLowerCase()));
  const hasDraft = Boolean(draft?.subject?.trim() && draft?.body?.trim());
  const isSent = draft?.status === "sent" || selected?.draft_status === "sent";
  const sentLabel = createTranslator(interfaceLanguage)("uiSent");
  const markSentLabel = createTranslator(interfaceLanguage)("uiMarkAsSent");
  const statusLabel = (lead: any) => lead.draft_status === "sent" ? sentLabel : lead.draft_status === "draft" ? copy.generated : lead.draft_status === "generating" ? copy.generating : lead.draft_status === "failed" ? copy.failed : copy.pending;
  const relationshipLabel = (lead: any) => lead.relationship_rank === 0 ? (createTranslator(interfaceLanguage)("uiInRelationship")) : lead.relationship_rank === 1 ? (createTranslator(interfaceLanguage)("uiSentContacted")) : statusLabel(lead);
  const opportunityLabel = (lead: any) => ["high", "medium", "low"].includes(lead.opportunity_level) ? `${lead.opportunity_level[0].toUpperCase() + lead.opportunity_level.slice(1)} · ${lead.opportunity_score}/100` : (createTranslator(interfaceLanguage)("uiInsufficientEvidence"));
  const markSent = async () => { if (!selected || !hasDraft || isSent || busy) return; setBusy(true); try { const result = await api<any>(`/api/emails/${selected.id}/sent`, { method:"POST", body:JSON.stringify(scopeBody) }); setDraft(result.draft); setDraftCache((current) => ({ ...current, [selected.id]: result.draft })); setNotice(`${sentLabel} · CRM ${createTranslator(interfaceLanguage)("uiUpdated")}.`); await loadRows(); } catch (error) { setNotice(error instanceof Error ? error.message : copy.saveError); } finally { setBusy(false); } };
  return <section className="email-studio" aria-label={createTranslator(interfaceLanguage)("globalEmails")}>
    {!campaignId ? <section className="panel email-global-settings">
      <div className="email-global-head"><div><h2>{copy.globalSettings}</h2><p>{copy.senderProfileHint}</p></div><span className="email-selection-count">Global</span></div>
      <div className="email-global-controls">
        <label>{copy.language}<select value={emailLanguage} onChange={(event) => { const value = event.target.value as "en" | "pt-BR"; setEmailLanguage(value); saveGlobal({ defaultLanguage:value }); }}><option value="en">{copy.english}</option><option value="pt-BR">{copy.portuguese}</option></select></label>
        <label>{copy.tone}<select value={tone} onChange={(event) => { const value = event.target.value; setTone(value); saveGlobal({ tone:value }); }}><option value="professional">{copy.professional}</option><option value="warm">{copy.warm}</option><option value="direct">{copy.direct}</option><option value="consultative">{copy.consultative}</option></select></label>
        <button type="button" className="secondary sender-profile-toggle" onClick={() => setSenderOpen((open) => !open)} aria-expanded={senderOpen}>{copy.senderProfile}</button>
      </div>
      {senderOpen && <div className="sender-profile-fields">
        <label>{copy.senderName}<input value={senderProfile.name} onChange={(event) => updateSender("name", event.target.value)} onBlur={persistSender} /></label>
        <label>{copy.senderTitle}<input value={senderProfile.title} onChange={(event) => updateSender("title", event.target.value)} onBlur={persistSender} /></label>
        <label className="sender-wide">{copy.senderIntroduction}<textarea value={senderProfile.introduction} onChange={(event) => updateSender("introduction", event.target.value)} onBlur={persistSender} maxLength={500} /></label>
        <label>{copy.senderServices}<input value={senderProfile.services} onChange={(event) => updateSender("services", event.target.value)} onBlur={persistSender} /></label>
        <label>{copy.portfolioUrl}<input value={senderProfile.portfolioUrl} onChange={(event) => updateSender("portfolioUrl", event.target.value)} onBlur={persistSender} inputMode="url" /></label>
        <label>{copy.instagramUrl}<input value={senderProfile.instagramUrl} onChange={(event) => updateSender("instagramUrl", event.target.value)} onBlur={persistSender} inputMode="url" /></label>
        <label className="sender-wide">{copy.fixedSignature}<textarea readOnly value={fixedOutreachSignaturePlain} aria-label={copy.fixedSignature} /></label>
      </div>}
    </section> : <div className="campaign-email-context"><strong>{campaignName}</strong><span>{createTranslator(interfaceLanguage)("uiCampaignEmailsLanguageToneAndSignatureUseGlobalSettings")}</span></div>}
    <div className="email-workspace">
    <aside className="panel email-list">
      <div className="section-head email-list-heading"><div><h2>{copy.businesses}</h2><p>{rows.length} {copy.ready}</p></div><span className="email-selection-count">{selectedIds.length} {copy.selected}</span></div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} />
      <div className="email-batch-actions"><button className="primary" disabled={busy || !selectedIds.length} onClick={() => void startBatch(false)}>{campaignId ? (createTranslator(interfaceLanguage)("uiGenerateEmails")) : copy.generateSelected}</button><button className="secondary" disabled={busy} onClick={() => void (campaignId ? startBatch(false, [], true) : startBatch(true))}>{campaignId ? (createTranslator(interfaceLanguage)("uiRegenerateReadyDrafts")) : copy.generatePending}</button></div>
      <div className="email-lead-scroll">{visibleRows.map((lead) => <div key={lead.id} className={`email-lead ${selected?.id === lead.id ? "active" : ""}`}><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => setSelectedIds((current) => current.includes(lead.id) ? current.filter((id) => id !== lead.id) : [...current, lead.id])} aria-label={`${lead.title} ${copy.selected}`} /><button onClick={() => { setSelected(lead); setEditing(false); }}><strong data-no-translate>{lead.title}</strong><span className="email-lead-meta"><small className={`email-draft-status ${lead.relationship_rank < 2 ? "sent" : lead.draft_status}`}>{relationshipLabel(lead)}</small><small className={`email-opportunity ${lead.opportunity_level}`}>{opportunityLabel(lead)}</small>{lead.business_email && <small className="email-available">{copy.emailAvailable}</small>}</span></button></div>)}{!visibleRows.length && <p className="audit-empty">{campaignId ? (createTranslator(interfaceLanguage)("uiNoCompaniesWithSufficientEvidenceForOutreach")) : copy.batchNone}</p>}</div>
    </aside>
    <main className="panel email-editor">
      {selected ? <>
        <header className="email-editor-header"><div><h2>{selected.title}</h2><div className="email-contact-pair"><a href={selected.website || undefined} target="_blank" rel="noreferrer" title={selected.website || undefined}>{selected.website || "—"}</a>{selected.business_email ? <a href={`mailto:${selected.business_email}`} title={selected.business_email}>{selected.business_email}</a> : <span>{copy.noEmailAvailable}</span>}</div></div><span className={`email-draft-status ${isSent ? "sent" : hasDraft ? "draft" : "not_generated"}`}>{isSent ? sentLabel : hasDraft ? copy.generated : copy.pending}</span></header>
        <div className="email-controls">
          {!campaignId && <label className="email-focus">{copy.autoService}<input value={draft?.service_override ? draft.service : draft?.recommended_service || ""} onChange={(event) => changeDraft({ service:event.target.value, service_override:true })} onBlur={() => void persistFocus()} placeholder={copy.neutralFocus} />{draft?.recommended_focus && <small>{draft.recommended_focus.key === "redesign" ? copy.focusSubjective : `${copy.focusEvidence} · ${draft.recommended_focus.evidenceIds.length}`}</small>}{draft?.service_override && <button className="text-button" type="button" onClick={() => void useSuggestedFocus()}>{copy.useSuggestedFocus}</button>}</label>}
          <label className="email-guidance">{copy.guidance}<textarea value={draft?.guidance || ""} onChange={(event) => changeDraft({ guidance:event.target.value })} onBlur={() => void persistGuidance()} placeholder={copy.guidanceHint} maxLength={500} /><small>{copy.guidanceHint}</small></label>
        </div>
        {!hasDraft ? <div className="email-generate-empty"><p>{copy.noDraft}</p><p className="muted">{copy.noEvidence}</p><button className="primary" disabled={busy} onClick={() => void generate(false)}>{busy ? copy.generating : copy.generate}</button></div> : <>
          <div className="email-editor-toolbar"><div>{editing && <span className="unsaved-note">{copy.unsaved}</span>}</div><div>{!isSent && <><button className="secondary" onClick={() => setEditing((value) => !value)}>{copy.edit}</button><button className="secondary" disabled={busy} onClick={() => void generate(true)}>{copy.regenerate}</button><button className="primary" disabled={busy} onClick={() => void markSent()}>{markSentLabel}</button></>}</div></div>
          <section className="email-draft-section email-subject-section"><header><label>{copy.subject}<input readOnly={!editing} value={draft.subject} onChange={(event) => changeDraft({ subject:event.target.value })} /></label><button type="button" className="secondary email-copy-button" onClick={() => void copySubject(draft.subject)} aria-label={copy.copySubject}>{copiedTarget === "subject" ? copy.copied : copy.copySubject}</button></header></section>
          <section className="email-draft-section email-message-section"><header><strong>{copy.message}</strong><button type="button" className="secondary email-copy-button" onClick={() => void copyEmail(draft.body)} aria-label={copy.copyEmail}>{copiedTarget === "message" ? copy.copied : copy.copyEmail}</button></header>{editing ? <textarea className="email-message-editor" value={draft.body} onChange={(event) => changeDraft({ body:event.target.value })} aria-label={copy.message} /> : <div className="email-rich-preview" aria-label="Formatted email preview" dangerouslySetInnerHTML={{ __html: emailDraftHtml(draft.body) }} />}</section>
          {editing && <div className="email-editor-actions"><button className="primary" onClick={() => void save()}>{copy.save}</button></div>}
          <p className="sr-only" role="status" aria-live="polite">{copiedTarget === "subject" ? copy.copySubject.replace(/Copiar |Copy /, "") + " " + copy.copied : copiedTarget === "message" ? copy.copyEmail.replace(/Copiar |Copy /, "") + " " + copy.copied : ""}</p>
          {Array.isArray(draft?.evidence) && <details className="email-evidence"><summary>{copy.evidence}</summary>{draft.evidence.length ? <ul>{draft.evidence.slice(0, 2).map((item: any, index: number) => <li key={item.id || index}>{item.label}: {item.detail || item.excerpt}</li>)}</ul> : <p>{copy.noEvidence}</p>}</details>}
        </>}
        {notice && <p className="email-notice" role="status">{notice}</p>}
        {run && <div className="email-run" role="status"><strong>{copy.batchProgress}</strong><span>{run.completed + run.failed} {copy.of} {run.total} · {run.completed} {copy.complete}{run.failed ? ` · ${run.failed} ${copy.failed.toLowerCase()}` : ""}</span>{["queued", "running", "cancelling"].includes(run.status) && <button className="secondary" onClick={() => void api(`/api/emails/runs/${run.id}/cancel`, { method:"POST" }).then(() => setRun({ ...run, status:"cancelling" }))}>{copy.cancel}</button>}{Array.isArray(run.items) && <ul className="email-run-items">{run.items.map((item: any) => <li key={item.lead_id}><span>{rows.find((lead) => lead.id === item.lead_id)?.title || item.lead_id}</span><em className={item.status}>{item.status === "completed" ? copy.complete : item.status === "failed" ? copy.failed : item.status === "running" ? copy.generating : copy.pending}</em>{item.error && <small>{item.error}</small>}</li>)}</ul>}</div>}
      </> : <p className="audit-empty">{copy.noSelection}</p>}
    </main>
    </div>
    <GenerationProgressModal state={generation} onCancel={cancelGeneration} onClose={() => setGeneration(null)} onRetry={generation?.scope === "single" ? () => void generate(Boolean(hasDraft)) : generation?.scope === "batch" && generation.status === "error" ? () => void startBatch(false, (run?.items ?? []).filter((item: any) => item.status === "failed").map((item: any) => item.lead_id)) : undefined} />
  </section>;
}

function LegacyPipelineView({
  industries,
  searches,
}: {
  industries: IndustryCollection[];
  searches: SearchCollection[];
}) {
  const [rows, setRows] = useState<PipelineLead[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    status: "",
    channel: "",
    industry: "",
    searchId: "",
    region: "",
  });
  const load = () =>
    api<PipelineLead[]>(
      `/api/pipeline?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))}`,
    )
      .then(setRows)
      .catch(() => setRows([]));
  useEffect(() => {
    void load();
  }, [filters]);
  const patch = async (lead: PipelineLead, changes: Record<string, string>) => {
    await api(`/api/pipeline/${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: lead.pipeline_status,
        channel: lead.pipeline_channel,
        notes: lead.pipeline_notes,
        lastContactAt: lead.last_contact_at,
        ...changes,
      }),
    });
    void load();
  };
  const remove = async (ids: string[]) => {
    await api("/api/pipeline/batch", {
      method: "DELETE",
      body: JSON.stringify({ leadIds: ids }),
    });
    setSelected((current) => current.filter((id) => !ids.includes(id)));
    void load();
  };
  const statuses = [
    ["not_contacted", "Not Contacted"],
    ["contacted", "Contacted"],
    ["replied", "Replied"],
    ["interested", "Interested"],
    ["proposal_sent", "Proposal Sent"],
    ["won", "Won"],
    ["lost", "Lost"],
  ];
  return (
    <section className="leads-page">
      <div className="filter-bar pipeline-filters">
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters({ ...filters, status: event.target.value })
          }
        >
          <option value="">All statuses</option>
          {statuses.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={filters.channel}
          onChange={(event) =>
            setFilters({ ...filters, channel: event.target.value })
          }
        >
          <option value="">All channels</option>
          {["instagram", "email", "facebook", "linkedin", "other"].map(
            (value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ),
          )}
        </select>
        <select
          value={filters.industry}
          onChange={(event) =>
            setFilters({ ...filters, industry: event.target.value })
          }
        >
          <option value="">All industries</option>
          {industries.map((item) => (
            <option value={item.industry} key={item.industry}>
              {item.industry}
            </option>
          ))}
        </select>
        <select
          value={filters.searchId}
          onChange={(event) =>
            setFilters({ ...filters, searchId: event.target.value })
          }
        >
          <option value="">All origins</option>
          {searches.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          value={filters.region}
          onChange={(event) =>
            setFilters({ ...filters, region: event.target.value })
          }
          placeholder="Region"
        />
      </div>
      <div className="panel table-panel">
        <div className="section-head">
          <div>
            <h2>{rows.length} pipeline leads</h2>
            <p>
              Commercial status is separate from source data and Contact
              Discovery.
            </p>
          </div>
          {selected.length > 0 && (
            <button className="secondary" onClick={() => remove(selected)}>
              Remove from Pipeline ({selected.length})
            </button>
          )}
        </div>
        {rows.length ? (
          <div className="lead-table pipeline-table">
            <div className="table-head">
              <span>Select</span>
              <span>Company</span>
              <span>Segment</span>
              <span>Status</span>
              <span>Channel</span>
              <span>Last contact</span>
              <span>Notes</span>
              <span>Action</span>
            </div>
            {rows.map((lead) => (
              <div className="lead-row" key={lead.id}>
                <div>
                  <button
                    className="select-lead"
                    onClick={() =>
                      setSelected(
                        selected.includes(lead.id)
                          ? selected.filter((id) => id !== lead.id)
                          : [...selected, lead.id],
                      )
                    }
                  >
                    {selected.includes(lead.id) ? (
                      <CheckSquare size={17} />
                    ) : (
                      <Square size={17} />
                    )}
                  </button>
                </div>
                <div>
                  <strong data-no-translate>{lead.title}</strong>
                  <p>
                    {lead.city}
                    {lead.region ? `, ${lead.region}` : ""}
                  </p>
                </div>
                <div>{lead.industry_normalized}</div>
                <div>
                  <select
                    value={lead.pipeline_status}
                    onChange={(event) =>
                      patch(lead, { status: event.target.value })
                    }
                  >
                    {statuses.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={lead.pipeline_channel}
                    onChange={(event) =>
                      patch(lead, { channel: event.target.value })
                    }
                  >
                    <option value="">Choose</option>
                    {[
                      "instagram",
                      "email",
                      "facebook",
                      "linkedin",
                      "other",
                    ].map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="date"
                    value={lead.last_contact_at?.slice(0, 10) ?? ""}
                    onChange={(event) =>
                      patch(lead, { lastContactAt: event.target.value })
                    }
                  />
                </div>
                <div>
                  <input
                    defaultValue={lead.pipeline_notes}
                    onBlur={(event) =>
                      patch(lead, { notes: event.target.value })
                    }
                    placeholder="Add note"
                  />
                </div>
                <div>
                  <button
                    className="text-button"
                    onClick={() => remove([lead.id])}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No leads in this pipeline view"
            body="Add qualified records from Leads when they are ready for outreach."
          />
        )}
      </div>
    </section>
  );
}
function PipelineView({
  industries,
  searches,
}: {
  industries: IndustryCollection[];
  searches: SearchCollection[];
}) {
  const { t, language } = useI18n();
  const [rows, setRows] = useState<PipelineLead[]>([]);
  const [mode, setMode] = useState<"board" | "list">("board");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerId, setDrawerId] = useState("");
  const [detail, setDetail] = useState<{
    lead: PipelineLead & { source_searches: string };
    activities: PipelineActivity[];
  } | null>(null);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    channel: "",
    industry: "",
    searchId: "",
    region: "",
  });
  const [saving, setSaving] = useState("");
  const statuses = [
    ["not_contacted", t("toContact")],
    ["contacted", createTranslator(language)("uiAwaitingReply")],
    ["replied", t("replied")],
    ["interested", t("interested")],
    ["proposal_sent", t("proposalSent")],
    ["won", t("won")],
    ["lost", t("lost")],
  ] as const;
  const channels = ["instagram", "email", "facebook", "linkedin", "other"];
  const opportunities = [
    ["no_website", t("noWebsite")],
    ["needs_review", t("needsReview")],
    ["needs_redesign", t("needsRedesign")],
    ["broken_website", t("brokenUx")],
    ["review_later", t("reviewLater")],
  ] as const;
  const load = () =>
    api<PipelineLead[]>(
      `/api/pipeline?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))}`,
    )
      .then(setRows)
      .catch(() => setRows([]));
  const open = async (id: string) => {
    setDrawerId(id);
    try {
      setDetail(await api(`/api/pipeline/${id}`));
    } catch {
      setDetail(null);
    }
  };
  useEffect(() => {
    void load();
  }, [filters]);
  const save = async (lead: PipelineLead, changes: Record<string, string>) => {
    setSaving(lead.id);
    try {
      await api(`/api/pipeline/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: lead.pipeline_status,
          channel: lead.pipeline_channel,
          notes: lead.pipeline_notes,
          lastContactAt: lead.last_contact_at,
          followUpAt: lead.follow_up_at,
          websiteOpportunity: lead.website_opportunity,
          ...changes,
        }),
      });
      await load();
      if (drawerId === lead.id) await open(lead.id);
    } finally {
      setSaving("");
    }
  };
  const overdue = (value: string) =>
    Boolean(value) &&
    value.slice(0, 10) < new Date().toISOString().slice(0, 10);
  const waitingDays = (value: string) => {
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, Math.floor((Date.now() - date) / 86_400_000)) : null;
  };
  const activeFilters = [
    filters.status && statuses.find(([value]) => value === filters.status)?.[1],
    filters.channel,
    filters.industry,
    filters.searchId && searches.find((item) => item.id === filters.searchId)?.name,
    filters.region,
  ].filter(Boolean);
  const card = (lead: PipelineLead) => (
    <button
      type="button"
      className="pipeline-card"
      key={lead.id}
      onClick={() => void open(lead.id)}
      aria-label={`${createTranslator(language)("uiOpen")} ${lead.title}`}
    >
      <strong data-no-translate>{lead.title}</strong>
      {lead.industry_normalized && <span className="pipeline-card-industry">{lead.industry_normalized}</span>}
      <span className="pipeline-card-city"><MapPin size={12} aria-hidden="true" />{[lead.city, lead.region].filter(Boolean).join(", ") || (createTranslator(language)("uiLocationUnavailable"))}</span>
      <span className="pipeline-card-bottom">
        <span className="pipeline-card-contact">{lead.pipeline_channel && <span>{lead.pipeline_channel}</span>}{lead.last_contact_at && <span>{formatDate(lead.last_contact_at, language, { dateStyle: "short" })}</span>}{lead.pipeline_status === "contacted" && lead.last_contact_at && waitingDays(lead.last_contact_at) !== null && <span>{waitingDays(lead.last_contact_at)} {createTranslator(language)("uiDaysWaiting")}</span>}{lead.follow_up_at && <span className={overdue(lead.follow_up_at) ? "overdue-text" : ""}>{createTranslator(language)("uiReview")} {formatDate(lead.follow_up_at, language, { dateStyle: "short" })}</span>}{!lead.pipeline_channel && !lead.last_contact_at && !lead.follow_up_at && <span className={`opportunity-badge ${lead.website_opportunity || "needs_review"}`}>{opportunities.find(([value]) => value === lead.website_opportunity)?.[1] ?? t("needsReview")}</span>}</span>
        <ChevronRight size={15} aria-hidden="true" />
      </span>
    </button>
  );
  const addActivity = async (
    activityType: string,
    note: string,
    channel: string,
  ) => {
    if (!detail) return;
    await api(`/api/pipeline/${detail.lead.id}/activities`, {
      method: "POST",
      body: JSON.stringify({
        activityType,
        note,
        channel,
        happenedAt: new Date().toISOString(),
      }),
    });
    await open(detail.lead.id);
  };
  return (
    <section className="leads-page crm-page">
      <div className="crm-metrics" aria-label={createTranslator(language)("uiPipelineIndicators")}>
        <article><span>{createTranslator(language)("uiCompaniesInPipeline")}</span><strong>{rows.length}</strong><Building2 size={17} aria-hidden="true" /></article>
        <article><span>{createTranslator(language)("uiAwaitingReply")}</span><strong>{rows.filter((lead) => lead.pipeline_status === "contacted").length}</strong><Clock3 size={17} aria-hidden="true" /></article>
        <article><span>{createTranslator(language)("uiCompaniesThatReplied")}</span><strong>{rows.filter((lead) => lead.pipeline_status === "replied").length}</strong><MessageSquare size={17} aria-hidden="true" /></article>
        <article><span>{createTranslator(language)("uiClosedDeals")}</span><strong>{rows.filter((lead) => lead.pipeline_status === "won").length}</strong><Check size={17} aria-hidden="true" /></article>
      </div>
      <div className="crm-controls">
        <div className="crm-toolbar">
          <label className="crm-search"><Search size={16} aria-hidden="true" /><input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder={createTranslator(language)("uiSearchCompany")} aria-label={createTranslator(language)("uiSearchCompany2")} /></label>
          <button type="button" className={`crm-filter-toggle ${filtersOpen || activeFilters.length ? "active" : ""}`} onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}><SlidersHorizontal size={15} />{createTranslator(language)("uiFilters")}{activeFilters.length > 0 && <span>{activeFilters.length}</span>}</button>
          <div className="crm-view-switch" role="group" aria-label={createTranslator(language)("uiView")}>
            <button type="button" className={mode === "board" ? "active" : ""} onClick={() => setMode("board")} aria-pressed={mode === "board"}><Columns3 size={15} />{createTranslator(language)("uiBoard")}</button>
            <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")} aria-pressed={mode === "list"}><List size={15} />{createTranslator(language)("uiList")}</button>
          </div>
        </div>
        {filtersOpen && <div className="crm-filter-panel">
          <label>{createTranslator(language)("uiStage")}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">{createTranslator(language)("uiAllStages")}</option>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>{createTranslator(language)("uiChannel")}<select value={filters.channel} onChange={(event) => setFilters({ ...filters, channel: event.target.value })}><option value="">{createTranslator(language)("uiAllChannels")}</option>{channels.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label>{createTranslator(language)("uiIndustry")}<select value={filters.industry} onChange={(event) => setFilters({ ...filters, industry: event.target.value })}><option value="">{createTranslator(language)("uiAllIndustries")}</option>{industries.map((item) => <option value={item.industry} key={item.industry}>{item.industry}</option>)}</select></label>
          <label>{createTranslator(language)("uiOrigin")}<select value={filters.searchId} onChange={(event) => setFilters({ ...filters, searchId: event.target.value })}><option value="">{createTranslator(language)("uiAllOrigins")}</option>{searches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>{createTranslator(language)("uiRegion2")}<input value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value })} placeholder={createTranslator(language)("uiSearchRegion")} /></label>
        </div>}
        {activeFilters.length > 0 && <div className="crm-active-filters"><span>{createTranslator(language)("uiActiveFilters")}</span>{activeFilters.map((value, index) => <span className="crm-filter-chip" key={`${value}-${index}`}>{value}</span>)}</div>}
      </div>
      {mode === "board" ? (
        <div className="pipeline-board">
          {statuses.map(([status, label]) => (
            <section className={`pipeline-column stage-${status}`} key={status}>
              <header>
                <strong>{label}</strong>
                <span>
                  {
                    rows.filter((lead) => lead.pipeline_status === status)
                      .length
                  }
                </span>
              </header>
              <div className="pipeline-column-body">
                {rows.filter((lead) => lead.pipeline_status === status).length ? rows.filter((lead) => lead.pipeline_status === status).map(card) : <div className="pipeline-empty"><Inbox size={21} aria-hidden="true" /><span>{createTranslator(language)("uiNoCompanies")}</span></div>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel table-panel">
          <div className="lead-table pipeline-table">
            <div className="table-head">
              <span>{createTranslator(language)("uiCompany")}</span>
              <span>{createTranslator(language)("uiSegment")}</span>
              <span>{createTranslator(language)("uiStage")}</span>
              <span>{createTranslator(language)("uiChannel")}</span>
              <span>{createTranslator(language)("uiWebsiteOpportunity2")}</span>
              <span>{createTranslator(language)("uiFollowUp")}</span>
            </div>
            {rows.map((lead) => (
              <div
                className="lead-row pipeline-list-row"
                key={lead.id}
                role="button"
                tabIndex={0}
                onClick={() => void open(lead.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void open(lead.id); } }}
              >
                <div>
                  <strong data-no-translate>{lead.title}</strong>
                  <p>{[lead.city, lead.region].filter(Boolean).join(", ")}</p>
                </div>
                <div>{lead.industry_normalized}</div>
                <div>
                  {
                    statuses.find(
                      ([value]) => value === lead.pipeline_status,
                    )?.[1]
                  }
                </div>
                <div>{lead.pipeline_channel || "—"}</div>
                <div>
                  {
                    opportunities.find(
                      ([value]) => value === lead.website_opportunity,
                    )?.[1]
                  }
                </div>
                <div
                  className={overdue(lead.follow_up_at) ? "overdue-text" : ""}
                >
                  {lead.follow_up_at?.slice(0, 10) || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {drawerId && (
        <aside
          className="crm-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Lead details"
        >
          <button
            className="drawer-close"
            onClick={() => {
              setDrawerId("");
              setDetail(null);
            }}
          >
            <X size={18} />
          </button>
          {detail ? (
            <div className="drawer-content">
              <p className="crumb">Outreach record</p>
              <h2>{detail.lead.title}</h2>
              <p>
                {detail.lead.category} ·{" "}
                {[
                  detail.lead.city,
                  detail.lead.region,
                  detail.lead.country_code,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <div className="drawer-links">
                {detail.lead.website && (
                  <a
                    href={
                      detail.lead.website.startsWith("http")
                        ? detail.lead.website
                        : `https://${detail.lead.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website
                  </a>
                )}
                {detail.lead.business_email && (
                  <a href={`mailto:${detail.lead.business_email}`}>Email</a>
                )}
                {detail.lead.instagram && (
                  <a
                    href={detail.lead.instagram}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Instagram
                  </a>
                )}
                {detail.lead.facebook && (
                  <a
                    href={detail.lead.facebook}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Facebook
                  </a>
                )}
                {!detail.lead.website &&
                  !detail.lead.business_email &&
                  !detail.lead.instagram &&
                  !detail.lead.facebook && (
                    <small>No public contact links recorded.</small>
                  )}
              </div>
              <small className="contact-origin">
                Contact confidence:{" "}
                {detail.lead.contact_status === "verified"
                  ? "Verified"
                  : detail.lead.contact_status === "possible"
                    ? "Possible"
                    : "Not Found"}
              </small>
              <div className="drawer-form">
                <label>
                  Commercial stage
                  <select
                    value={detail.lead.pipeline_status}
                    onChange={(event) =>
                      void save(detail.lead, { status: event.target.value })
                    }
                  >
                    {statuses.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Preferred channel
                  <select
                    value={detail.lead.pipeline_channel}
                    onChange={(event) =>
                      void save(detail.lead, { channel: event.target.value })
                    }
                  >
                    <option value="">Not set</option>
                    {channels.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Website opportunity
                  <select
                    value={detail.lead.website_opportunity}
                    onChange={(event) =>
                      void save(detail.lead, {
                        websiteOpportunity: event.target.value,
                      })
                    }
                  >
                    {opportunities.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Last contact
                  <input
                    type="date"
                    value={detail.lead.last_contact_at?.slice(0, 10) ?? ""}
                    onChange={(event) =>
                      void save(detail.lead, {
                        lastContactAt: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Follow-up date
                  <input
                    type="date"
                    value={detail.lead.follow_up_at?.slice(0, 10) ?? ""}
                    onChange={(event) =>
                      void save(detail.lead, { followUpAt: event.target.value })
                    }
                  />
                </label>
                <label className="full">
                  Notes
                  <textarea
                    defaultValue={detail.lead.pipeline_notes}
                    onBlur={(event) =>
                      void save(detail.lead, { notes: event.target.value })
                    }
                    placeholder="Add a commercial note"
                  />
                </label>
              </div>
              <section className="activity-log">
                <h3>Activity history</h3>
                <div className="activity-add">
                  <select id="activity-type" defaultValue="note_added">
                    <option value="message_sent">Message sent</option>
                    <option value="response_received">Response received</option>
                    <option value="proposal_sent">Proposal sent</option>
                    <option value="note_added">Note added</option>
                  </select>
                  <input id="activity-note" placeholder="Activity note" />
                  <button
                    className="secondary"
                    onClick={() => {
                      const type = document.getElementById(
                        "activity-type",
                      ) as HTMLSelectElement;
                      const note = document.getElementById(
                        "activity-note",
                      ) as HTMLInputElement;
                      void addActivity(
                        type.value,
                        note.value,
                        detail.lead.pipeline_channel,
                      );
                      note.value = "";
                    }}
                  >
                    Add activity
                  </button>
                </div>
                {detail.activities.map((activity) => (
                  <div className="activity-item" key={activity.id}>
                    <strong>
                      {activity.activity_type.replaceAll("_", " ")}
                    </strong>
                    <small>
                      {activity.happened_at.slice(0, 10)}
                      {activity.channel ? ` · ${activity.channel}` : ""}
                    </small>
                    <p>{activity.note}</p>
                  </div>
                ))}
              </section>
              <small>
                Source: {detail.lead.source_searches || "Unknown Source"}
              </small>
            </div>
          ) : (
            <div className="drawer-content">
              <p>Loading lead details…</p>
            </div>
          )}
        </aside>
      )}
    </section>
  );
}
type MailAccount = { id: string; provider: "gmail" | "zoho"; email: string; status: string; displayName?: string; lastTestAt?: string | null; lastError?: string | null; limits: { daily?: number } };
function EmailAccountsSettings() {
  const { language } = useI18n();
  const [accounts, setAccounts] = useState<MailAccount[]>([]); const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [advanced, setAdvanced] = useState(false); const [zohoEmail, setZohoEmail] = useState(""); const [zohoPassword, setZohoPassword] = useState("");
  const pt = language === "pt-BR";
  const load = async () => { const result = await api<{ accounts: MailAccount[] }>("/api/email-accounts"); setAccounts(result.accounts); };
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : (createTranslator(language)("uiCouldNotLoadAccounts")))); }, []);
  const act = async (key: string, callback: () => Promise<void>) => { setBusy(key); setMessage(""); try { await callback(); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : (createTranslator(language)("uiCouldNotCompleteTheOperation"))); } finally { setBusy(""); } };
  const openOAuth = async (endpoint: string, key: string, text: string) => act(key, async () => { const result = await api<{ authUrl: string }>(endpoint, { method: "POST" }); window.open(result.authUrl, "_blank", "noopener,noreferrer"); setMessage(text); });
  const test = (account: MailAccount) => void act(account.id, async () => { await api(`/api/email-accounts/${account.id}/test`, { method: "POST" }); });
  const reconnect = (account: MailAccount) => void openOAuth(`/api/email-accounts/${account.id}/reconnect`, `reconnect-${account.id}`, createTranslator(language)("uiFinishAuthorizationInTheNewWindow"));
  const disconnect = (account: MailAccount) => void act(account.id, async () => { await api(`/api/email-accounts/${account.id}`, { method: "DELETE" }); });
  const connectAdvancedZoho = () => void act("zoho-advanced", async () => { await api("/api/email-accounts/zoho", { method: "POST", body: JSON.stringify({ email: zohoEmail, password: zohoPassword }) }); setZohoPassword(""); });
  const statusLabel = (status: string) => ({ connected: createTranslator(language)("uiConnected"), pending: createTranslator(language)("uiAwaitingAuthorization"), needs_reconnect: createTranslator(language)("uiNeedsReconnection"), error: createTranslator(language)("uiError") }[status] ?? status);
  const card = (provider: "gmail" | "zoho", title: string, description: string, button: string, action: () => void) => {
    const providerAccounts = accounts.filter((account) => account.provider === provider);
    const hasConnectedAccount = providerAccounts.some((account) => account.status === "connected");
    const connectedCount = providerAccounts.filter((account) => account.status === "connected").length;
    return <div className="mail-provider-card">
      <div className={`mail-provider-mark ${provider}`}>{provider === "gmail" ? "M" : "Z"}</div>
      <div className="mail-provider-copy"><h3>{title}</h3><p>{description}</p><small className={hasConnectedAccount ? "mail-provider-status connected" : "mail-provider-status"}>{connectedCount ? translateCount(language, connectedCount, { one: "connectedAccountOne", other: "connectedAccountOther" }) : (createTranslator(language)("uiNotConnected"))}</small></div>
      {!hasConnectedAccount ? <button className="primary mail-provider-connect" onClick={action} disabled={Boolean(busy)}>{busy === provider ? (createTranslator(language)("uiOpening")) : button}</button> : <button className="tertiary mail-add-account" onClick={action} disabled={Boolean(busy)}>{busy === provider ? (createTranslator(language)("uiOpening")) : (createTranslator(language)("uiAddAnotherAccount"))}</button>}
      {providerAccounts.map((account) => <div className="mail-connected-account" key={account.id}><div className="mail-account-identity"><strong>{account.displayName || account.email || (createTranslator(language)("uiAccountAwaitingAuthorization"))}</strong>{account.displayName && account.email && <small>{account.email}</small>}<small><span className={`mail-account-status ${account.status}`}>{statusLabel(account.status)}</span>{account.lastTestAt && ` · ${createTranslator(language)("uiTested")}`}</small></div><div className="settings-actions"><button className="secondary" onClick={() => test(account)} disabled={Boolean(busy)}>{createTranslator(language)("uiTest")}</button><button className="secondary" onClick={() => reconnect(account)} disabled={Boolean(busy)}>{createTranslator(language)("uiReconnect")}</button><button className="secondary danger" onClick={() => disconnect(account)} disabled={Boolean(busy)}>{createTranslator(language)("uiDisconnect")}</button></div>{account.lastError && <small className="mail-error">{account.lastError}</small>}</div>)}
    </div>;
  };
  return <div className="panel email-accounts-panel"><div className="settings-card-head"><div><h2>{createTranslator(language)("uiEmailAccounts")}</h2><p>{createTranslator(language)("uiConnectAccountsToManageEmailFromScoutNo")}</p></div></div><div className="mail-provider-grid">{card("gmail", "Gmail", createTranslator(language)("uiConnectYourGoogleAccountSecurely"), "Continuar com Google", () => void openOAuth("/api/email-accounts/gmail/connect", "gmail", createTranslator(language)("uiFinishGoogleAuthorizationInTheNewWindow")))}{card("zoho", "Zoho Mail", createTranslator(language)("uiConnectYourZohoMailAccountSecurely"), "Conectar Zoho Mail", () => void openOAuth("/api/email-accounts/zoho/connect", "zoho", createTranslator(language)("uiFinishZohoAuthorizationInTheNewWindow")))}</div>{message && <p className="settings-warning">{message}</p>}<details className="mail-advanced" open={advanced} onToggle={(event) => setAdvanced((event.currentTarget as HTMLDetailsElement).open)}><summary>{createTranslator(language)("uiAdvancedConfiguration")}</summary><p>{createTranslator(language)("uiUseSMTPIMAPWithAnAppPasswordOnlyWhen")}</p><div className="email-account-zoho"><input type="email" value={zohoEmail} onChange={(event) => setZohoEmail(event.target.value)} placeholder="conta@zoho.com" aria-label="E-mail Zoho" /><input type="password" value={zohoPassword} onChange={(event) => setZohoPassword(event.target.value)} placeholder={createTranslator(language)("uiAppPassword")} aria-label={createTranslator(language)("uiZohoAppPassword")} /><button className="secondary" onClick={connectAdvancedZoho} disabled={Boolean(busy) || !zohoEmail || !zohoPassword}>{busy === "zoho-advanced" ? (createTranslator(language)("uiTesting")) : (createTranslator(language)("uiTestSMTPIMAP"))}</button></div></details></div>;
}

function SettingsView({
  health,
  settings,
  chatGptStatus,
  onChatGptStatusChange,
  onAutomaticDiscoveryChange,
  onAutomaticWebsiteAuditsChange,
  onPreferencesChange,
  onInterfaceLanguageChange,
  icpProfiles,
  onIcpProfileEnabledChange,
}: {
  health: string;
  settings: WorkspaceSettings;
  chatGptStatus: ChatGptStatus;
  onChatGptStatusChange: (status: ChatGptStatus) => void;
  onAutomaticDiscoveryChange: (enabled: boolean) => void;
  onAutomaticWebsiteAuditsChange: (enabled: boolean) => void;
  onPreferencesChange: (preferences: OutreachPreferences) => void;
  onInterfaceLanguageChange: (language: UiLanguage) => void;
  icpProfiles: IcpProfile[];
  onIcpProfileEnabledChange: (profile: IcpProfile, enabled: boolean) => void;
}) {
  const { t, language } = useI18n();
  const [preferences, setPreferences] = useState<OutreachPreferences>(settings.outreachPreferences);
  const [category, setCategory] = useState<"general" | "integrations" | "automations" | "prospecting" | "intelligence" | "security">("general");
  useEffect(() => setPreferences(settings.outreachPreferences), [settings.outreachPreferences]);
  const updatePreference = <K extends keyof OutreachPreferences>(key: K, value: OutreachPreferences[K]) => setPreferences((current) => ({ ...current, [key]: value }));
  const updateSignature = (key: keyof OutreachSignature, value: string) => setPreferences((current) => ({ ...current, signature: { ...current.signature, [key]: value } }));
  const previewSignature = [preferences.signature.name, preferences.signature.role, preferences.signature.company, preferences.signature.website, preferences.signature.contact].filter(Boolean).join("\n");
  const pt = language === "pt-BR";
  const engineLabel = health === "connected" ? t("engineOnline") : health === "checking" ? t("engineChecking") : t("engineOffline");
  return (
    <section className="settings-page">
      <PageHeader className="settings-page-header" title={t("settings")} description={t("settingsSubtitle")} />
      <div className="settings-workspace">
        <nav className="settings-category-nav" aria-label={t("settingsCategories")}>
          {([
            ["general", SlidersHorizontal, t("languageRegion")],
            ["integrations", Plug, t("settingsIntegrations")],
            ["automations", Workflow, t("settingsAutomations")],
            ["prospecting", Mail, t("settingsProspecting")],
            ["intelligence", BrainCircuit, t("settingsIntelligence")],
            ["security", ShieldCheck, t("settingsSecurity")],
          ] as const).map(([key, Icon, label]) => <button key={key} type="button" className={category === key ? "active" : ""} aria-current={category === key ? "page" : undefined} onClick={() => setCategory(key)}><Icon size={16} aria-hidden="true" />{label}</button>)}
        </nav>
        <div className="settings-category-content">
          <div className="settings-category-panel" hidden={category !== "general"}>
            <SettingsGroup title={t("languageRegion")} description={t("languageRegionHelp")}>
              <div className="panel settings-compact-panel settings-form-grid"><label className="settings-language-field">{t("interfaceLanguage")}<select value={language} onChange={(event) => onInterfaceLanguageChange(event.target.value as UiLanguage)}><option value="en">{t("englishUs")}</option><option value="pt-BR">{t("portugueseBr")}</option></select></label><label className="settings-language-field">{t("defaultEmailLanguage")}<select value={preferences.defaultLanguage} onChange={(event) => updatePreference("defaultLanguage", event.target.value as OutreachPreferences["defaultLanguage"])}><option value="en">{t("englishUs")}</option><option value="pt-BR">{t("portugueseBr")}</option></select></label></div>
              {preferences.defaultLanguage !== settings.outreachPreferences.defaultLanguage && <p className="settings-detail" role="status">{t("languageRegionUnsaved")}</p>}
              <div className="settings-save-actions"><button className="primary" onClick={() => onPreferencesChange(preferences)}>{t("saveLanguageRegion")}</button></div>
            </SettingsGroup>
          </div>
          <div className="settings-category-panel" hidden={category !== "integrations"}>
            <SettingsGroup title={t("settingsIntegrations")} description={t("settingsIntegrationHelp")}>
              <div className="panel settings-integration-card"><span className="settings-integration-icon"><Globe2 size={19} /></span><div><h3>{t("scoutEngine")}</h3><p>{t("engineDescription")}</p></div><span className={`settings-integration-status ${health === "connected" ? "connected" : health === "checking" ? "checking" : "disconnected"}`}>{engineLabel}</span></div>
              <ChatGptSettings status={chatGptStatus} onChange={onChatGptStatusChange} />
              <EmailAccountsSettings />
            </SettingsGroup>
          </div>
          <div className="settings-category-panel" hidden={category !== "automations"}>
            <SettingsGroup title={t("settingsAutomations")} description={t("settingsAutomationHelp")}>
              <div className="panel settings-automation-card"><label className="settings-toggle settings-switch"><span><strong>{t("automaticContactDiscovery")}</strong><small>{t("automationContactHelp")}</small></span><input type="checkbox" role="switch" checked={settings.automaticContactDiscovery} onChange={(event) => onAutomaticDiscoveryChange(event.target.checked)} /></label><p className="settings-detail">{t("persistentQueue")} · {t("concurrentDiscoveries", { count: formatNumber(settings.enrichmentConcurrency, language) })}</p></div>
              <div className="panel settings-automation-card"><label className="settings-toggle settings-switch"><span><strong>{t("automaticHomepageAudits")}</strong><small>{t("automationAuditHelp")}</small></span><input type="checkbox" role="switch" checked={settings.automaticWebsiteAudits} onChange={(event) => onAutomaticWebsiteAuditsChange(event.target.checked)} /></label><p className="settings-detail">{t("browserQueue")}</p></div>
            </SettingsGroup>
          </div>
          <div className="settings-category-panel" hidden={category !== "prospecting"}>
            <SettingsGroup title={t("settingsProspecting")} description={t("settingsProspectingHelp")}>
              <div className="panel settings-preferences"><div className="settings-card-head"><div><h2>{t("outreachPreferences")}</h2><p>{t("emailWritingHelp")}</p></div></div><div className="settings-form-grid">
                <label className="settings-form-wide">{t("emailStructure")}<input value={preferences.structure} onChange={(event) => updatePreference("structure", event.target.value)} placeholder={t("structureExample")} /></label>
                <label className="settings-form-wide">{t("subjectGuidelines")}<textarea value={preferences.subjectGuidelines} onChange={(event) => updatePreference("subjectGuidelines", event.target.value)} rows={2} /></label>
                <label className="settings-form-wide">{t("subjectTemplate")}<input value={preferences.subjectTemplate} onChange={(event) => updatePreference("subjectTemplate", event.target.value)} placeholder={t("subjectIdeaExample")} /><small>{t("templateHint")}</small></label>
              </div></div>
              <div className="panel settings-preferences settings-signature-card"><div className="settings-card-head"><div><h2>{t("signature")}</h2><p>{t("signatureHelp")}</p></div></div><label className="settings-toggle settings-switch"><span><strong>{t("signatureEnabled")}</strong></span><input type="checkbox" role="switch" checked={preferences.signatureEnabled} onChange={(event) => updatePreference("signatureEnabled", event.target.checked)} /></label><details className="settings-signature-details"><summary>{t("signatureEdit")}<ChevronRight size={16} /></summary><div className="signature-workspace"><div className="settings-form-grid signature-fields">{(["name", "role", "company", "website", "contact"] as const).map((key) => <label key={key}>{t(key)}<input value={preferences.signature[key]} onChange={(event) => updateSignature(key, event.target.value)} placeholder={t("optional")} /></label>)}</div><div className="signature-preview"><small>{t("signaturePreview")}</small><pre>{previewSignature || t("signatureEmpty")}</pre></div></div></details></div>
              <div className="settings-save-actions"><button className="primary" onClick={() => onPreferencesChange(preferences)}>{t("savePreferences")}</button></div>
            </SettingsGroup>
          </div>
          <div className="settings-category-panel" hidden={category !== "intelligence"}>
            <SettingsGroup title={t("settingsIntelligence")} description={createTranslator(language)("uiManageSalesKnowledgeAndQualificationProfiles")}>
              <div className="settings-rules-grid"><SkillsSettings /><details className="panel settings-disclosure"><summary><span><strong>{t("icpProfiles")}</strong><small>{t("intelligenceProfilesActive", { active: formatNumber(icpProfiles.filter((profile) => profile.enabled).length, language), total: formatNumber(icpProfiles.length, language) })}</small></span><ChevronRight size={18} /></summary><div className="settings-disclosure-content"><h2>{t("icpProfiles")}</h2><p>{createTranslator(language)("uiVersionedLocalRulesUseOnlyPersistedFactsChangesPreserve")}</p><div className="settings-detail">{icpProfiles.map((profile) => <label className="settings-toggle icp-profile-row" key={profile.profile_key}><input type="checkbox" checked={Boolean(profile.enabled)} onChange={(event) => onIcpProfileEnabledChange(profile, event.target.checked)} /><span><strong data-no-translate>{profile.name}</strong><small>v{profile.version} · {profile.rules.length} {createTranslator(language)("uiRules")}</small></span><em className={profile.enabled ? "is-active" : ""}>{profile.enabled ? (createTranslator(language)("uiActive")) : (createTranslator(language)("uiInactive"))}</em></label>)}</div></div></details></div>
            </SettingsGroup>
          </div>
          <div className="settings-category-panel" hidden={category !== "security"}>
            <SettingsGroup title={t("settingsSecurity")} description={createTranslator(language)("uiLocalStorageCredentialsAndExports")}>
              <details className="panel settings-disclosure data-policy"><summary><span><strong>{t("dataPolicy")}</strong><small>{createTranslator(language)("uiLocalStorageCredentialsAndExports2")}</small></span><ChevronRight size={18} /></summary><div className="settings-disclosure-content"><h2>{t("dataPolicy")}</h2><p>{createTranslator(language)("uiExportsUseYourLocalSQLiteDatabaseEngine")}</p><p className="settings-detail">{createTranslator(language)("uiCredentialsForConnectedAccountsRemainInTheApplicationS")}</p></div></details>
            </SettingsGroup>
          </div>
        </div>
      </div>
    </section>
  );
}
function SettingsGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-group"><header><div><h2>{title}</h2><p>{description}</p></div></header>{children}</section>;
}
type SkillRecord = { slug: string; name: string; source: string; attribution: string; content: string; service_scope: string; enabled: number; editable: number; updated_at: string };
function SkillsSettings() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<SkillRecord | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void api<{ skills: SkillRecord[] }>("/api/skills").then((result) => { setSkills(result.skills); if (result.skills[0]) { setSelected(result.skills[0].slug); setDraft(result.skills[0]); } }); }, []);
  const choose = (slug: string) => { const next = skills.find((skill) => skill.slug === slug); if (next) { setSelected(slug); setDraft(next); setMessage(""); } };
  const save = async () => { if (!draft) return; try { const next = await api<SkillRecord>(`/api/skills/${draft.slug}`, { method: "PATCH", body: JSON.stringify({ content: draft.content, enabled: Boolean(draft.enabled), serviceScope: draft.service_scope }) }); setSkills((current) => current.map((skill) => skill.slug === next.slug ? next : skill)); setDraft(next); setMessage("Saved locally."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save skill."); } };
  return <details className="panel skills-library settings-disclosure"><summary><span><strong>{t("skillsLibrary")}</strong><small>{skills.filter((skill) => skill.enabled).length} {t("enabled").toLowerCase()} · {skills.length} total</small></span><ChevronRight size={18} /></summary><div className="settings-disclosure-content"><div className="settings-card-head"><div><h2>{t("skillsLibrary")}</h2><p>{t("skillGuidance")}</p></div><span className="badge badge-neutral">{skills.length}</span></div>{draft && <div className="skills-editor"><div className="skills-list">{skills.map((skill) => <button key={skill.slug} className={selected === skill.slug ? "active" : ""} onClick={() => choose(skill.slug)}><strong data-no-translate>{skill.name}</strong><small>{skill.source === "harvey" ? "Harvey · MIT" : t("localOverlay")} · {skill.enabled ? t("enabled") : t("disabled")}</small></button>)}</div><div className="skills-form"><label>{t("skillContent")}<textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} rows={14} /></label><label>{t("serviceScope")}<input value={draft.service_scope} onChange={(event) => setDraft({ ...draft, service_scope: event.target.value })} /></label><label className="settings-toggle"><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked ? 1 : 0 })} /><span>{draft.enabled ? t("enabled") : t("disabled")}</span></label><small>{draft.attribution}</small><button className="primary" onClick={() => void save()}>{t("saveSkill")}</button>{message && <p className="settings-detail">{message}</p>}</div></div>}</div></details>;
}
function ChatGptSettings({ status, onChange }: { status: ChatGptStatus; onChange: (status: ChatGptStatus) => void }) {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false); const [models, setModels] = useState<string[]>([]); const [selectedModel, setSelectedModel] = useState(status.selectedModel ?? ""); const [lunaCandidates, setLunaCandidates] = useState<string[]>([]); const [message, setMessage] = useState(""); const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const connect = async (switchAccount = false) => { setBusy(true); setMessage(""); try { const result = await api<{ authUrl: string }>("/api/chatgpt/connect", { method:"POST", body:JSON.stringify({ switchAccount }) }); window.open(result.authUrl, "_blank", "noopener,noreferrer"); setMessage(switchAccount ? t("chatgptSwitchHelp") : "Finish sign-in in the browser, then refresh this page."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start ChatGPT sign-in."); } finally { setBusy(false); } };
  const disconnect = async () => { setBusy(true); await api("/api/chatgpt/disconnect", { method: "POST" }); setModels([]); setSelectedModel(""); setLunaCandidates([]); onChange({ connected: false, email: "", scopes: [], expiresAt: null, provider: "none", selectedModel: "" }); setBusy(false); };
  const loadModels = async () => { setBusy(true); setMessage(""); setCatalogState("loading"); try { const result = await api<{ models: string[]; selected: string; lunaCandidates: string[] }>("/api/chatgpt/models"); setModels(result.models); setLunaCandidates(result.lunaCandidates); setSelectedModel(result.selected); setCatalogState(result.models.length ? "ready" : "empty"); if (!result.selected && result.lunaCandidates.length === 1) { const saved = await api<{ selected: string }>("/api/chatgpt/model", { method: "PATCH", body: JSON.stringify({ model: result.lunaCandidates[0] }) }); setSelectedModel(saved.selected); onChange({ ...status, selectedModel: saved.selected }); } else if (!result.selected && result.lunaCandidates.length !== 1) { setMessage(result.lunaCandidates.length ? "Multiple Luna models are available. Select the exact model manually." : "GPT-5.6 Luna is not available for this account. Select an available model manually."); } } catch (error) { setCatalogState("error"); setMessage(error instanceof Error ? error.message : "Could not load ChatGPT models."); } finally { setBusy(false); } };
  const selectModel = async (model: string) => { setBusy(true); setMessage(""); try { const result = await api<{ selected: string }>("/api/chatgpt/model", { method: "PATCH", body: JSON.stringify({ model }) }); setSelectedModel(result.selected); onChange({ ...status, selectedModel: result.selected }); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the selected model."); } finally { setBusy(false); } };
  return <div className="panel"><div className="settings-card-head"><div><h2>{t("chatgptPlan")}</h2><p>{createTranslator(language)("uiUseYourAuthorizedChatGPTAllowanceForOutreachStudioNo")}</p></div><span className={status.connected ? "badge badge-success" : "badge badge-neutral"}>{status.connected ? t("connected") : t("notConnected")}</span></div>{status.connected ? <><p className="settings-detail">{status.email || (createTranslator(language)("uiConnectedChatGPTAccount"))}</p><div className="settings-actions"><button className="secondary" onClick={() => void loadModels()} disabled={busy}>{catalogState === "loading" ? t("loading") : t("refreshAvailableModels")}</button><button className="secondary" onClick={() => void connect(true)} disabled={busy}>{t("switchChatGPTAccount")}</button><button className="secondary danger" onClick={() => void disconnect()} disabled={busy}>{t("disconnect")}</button></div>{catalogState === "empty" && <p className="settings-warning">{createTranslator(language)("uiTheAuthenticatedAccountReturnedAnEmptyModelCatalogThis")}</p>}{catalogState === "error" && <p className="outreach-error">{t("modelDiscoveryFailed")}</p>}{models.length > 0 && <label className="settings-model-select">{t("activeOutreachModel")}<select value={selectedModel} onChange={(event) => void selectModel(event.target.value)} disabled={busy}><option value="">{t("selectModel")}</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>}{selectedModel && <p className="settings-detail">{t("selectedModel")}: <code>{selectedModel}</code></p>}{catalogState === "ready" && !lunaCandidates.length && <p className="settings-warning">{createTranslator(language)("uiGPT56LunaIsUnavailableForThisAccount")}</p>}{message && <p className="settings-detail">{message}</p>}</> : <button className="primary" onClick={() => void connect(true)} disabled={busy}>{t("continueWithChatGPT")}</button>}{message && !status.connected && <p className="settings-detail">{message}</p>}</div>;
}
function Empty({
  title,
  body,
  action,
  onClick,
}: {
  title: string;
  body: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <MapPin size={20} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button className="secondary" onClick={onClick}>
          {action}
        </button>
      )}
    </div>
  );
}

function AppEntry() {
  const { language } = useI18n();
  const [demoLanguage, setDemoLanguage] = useState(language);
  if (new URLSearchParams(window.location.search).get("design-system") === "1") {
    return <Suspense fallback={<main className="ds-demo" aria-busy="true">{demoLanguage === "pt-BR" ? "Carregando galeria de componentes…" : "Loading component gallery…"}</main>}><DesignSystemDemo language={demoLanguage} onLanguageChange={setDemoLanguage} /></Suspense>;
  }
  return <ScoutApplication />;
}

export default function App() {
  return <I18nProvider><AppEntry /></I18nProvider>;
}
