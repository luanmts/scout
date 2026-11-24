export type IcpRule = {
  code: string;
  label: string;
  weight: number;
  minConfidence: number;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type IcpEvidence = {
  id?: string;
  source: "lead" | "website_audit" | "observation";
  code: string;
  confidence: number;
  observedAt?: string;
  url?: string;
  detail: string;
};

export type IcpScoreInput = {
  website: string;
  category: string;
  industry: string;
  audit?: { status: string; updatedAt: string; issues: Array<{ id?: string; category: string; severity: string; url: string; evidence: string }> };
  observations: Array<{ id?: string; signalCode: string; confidence: number; observedAt: string; evidenceUrl: string; evidenceExcerpt: string; verificationStatus?: "verified" | "possible" | "inconclusive" }>;
  now?: Date;
};

export type IcpRuleResult = {
  code: string;
  label: string;
  status: "matched" | "not_matched" | "unsupported" | "stale";
  contribution: number;
  evidence: IcpEvidence[];
  reason: string;
};

export type IcpScoreResult = {
  score: number;
  commercialFit: number;
  evidenceCoverage: number;
  evidenceConfidence: number;
  evaluationStatus: "evaluated" | "insufficient_evidence";
  rules: IcpRuleResult[];
};

const ageInDays = (value: string, now: Date) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? (now.getTime() - time) / 86_400_000 : Infinity;
};

/**
 * Deterministic scoring over evidence already held by Scout. Positive
 * observations can contribute; an absent observation never does. This keeps
 * "not detected" distinct from a verified negative fact.
 */
export function calculateIcpScore(rules: IcpRule[], input: IcpScoreInput): IcpScoreResult {
  const now = input.now ?? new Date();
  let totalWeight = 0;
  let supportedWeight = 0;
  const results: IcpRuleResult[] = [];
  for (const rule of rules.filter((rule) => rule.enabled !== false)) {
    const weight = Math.max(0, Math.min(100, Number(rule.weight) || 0));
    totalWeight += weight;
    const config = rule.config ?? {};
    const maxAgeDays = Number(config.maxAgeDays ?? 90);
    const confidenceFloor = Math.max(0, Math.min(1, Number(rule.minConfidence) || 0));
    let evidence: IcpEvidence[] = [];
    let supported = false;
    let stale = false;
    if (rule.code === "maps_no_website_recorded") {
      supported = true;
      if (!input.website.trim()) evidence = [{ source: "lead", code: rule.code, confidence: 0.65, detail: "Google Maps listing has no website URL recorded." }];
    } else if (rule.code === "industry_match") {
      supported = Boolean(input.category || input.industry);
      const keywords = (Array.isArray(config.keywords) ? config.keywords : []).map((item) => String(item).toLowerCase());
      const source = `${input.category} ${input.industry}`.toLowerCase();
      if (keywords.some((keyword) => source.includes(keyword))) evidence = [{ source: "lead", code: rule.code, confidence: 1, detail: `Listed category: ${input.category || input.industry}` }];
    } else if (rule.code === "audit_issue_category") {
      const audit = input.audit;
      supported = Boolean(audit && ["completed", "partial"].includes(audit.status));
      if (audit && ageInDays(audit.updatedAt, now) > maxAgeDays) stale = true;
      const categories = (Array.isArray(config.categories) ? config.categories : []).map((item) => String(item));
      if (audit && !stale) evidence = audit.issues.filter((issue) => categories.includes(issue.category)).map((issue) => ({ id: issue.id, source: "website_audit", code: rule.code, confidence: 0.98, observedAt: audit.updatedAt, url: issue.url, detail: issue.evidence }));
    } else if (rule.code === "observation_present") {
      const codes = (Array.isArray(config.codes) ? config.codes : []).map(String);
      const latest = new Map<string, typeof input.observations[number]>();
      for (const observation of input.observations) {
        const prior = latest.get(observation.signalCode);
        if (!prior || observation.observedAt > prior.observedAt) latest.set(observation.signalCode, observation);
      }
      const candidates = [...latest.values()].filter((item) => codes.includes(item.signalCode) && item.verificationStatus !== "possible" && item.verificationStatus !== "inconclusive");
      if (candidates.length && candidates.every((item) => ageInDays(item.observedAt, now) > maxAgeDays)) stale = true;
      evidence = candidates.filter((item) => ageInDays(item.observedAt, now) <= maxAgeDays).map((item) => ({ id: item.id, source: "observation", code: item.signalCode, confidence: item.confidence, observedAt: item.observedAt, url: item.evidenceUrl, detail: item.evidenceExcerpt }));
      // A positive observation is proof; its absence is intentionally unsupported.
      supported = evidence.length > 0;
    }
    if (supported) supportedWeight += weight;
    const qualifying = evidence.filter((item) => item.confidence >= confidenceFloor);
    const status: IcpRuleResult["status"] = stale ? "stale" : qualifying.length ? "matched" : supported ? "not_matched" : "unsupported";
    results.push({
      code: rule.code, label: rule.label, status,
      contribution: status === "matched" ? weight : 0,
      evidence: qualifying,
      reason: status === "matched" ? "Supported by persisted evidence." : status === "stale" ? "The available evidence is older than this rule permits." : status === "not_matched" ? "Relevant evidence was checked but did not match this rule." : "No positive, current evidence supports this rule.",
    });
  }
  const matched = results.filter((item) => item.status === "matched");
  // Profiles are configurable, so normalize against their enabled weights
  // instead of relying on every custom profile adding up to 100.
  const rawScore = totalWeight
    ? Math.round((matched.reduce((sum, item) => sum + item.contribution, 0) / totalWeight) * 100)
    : 0;
  const evidence = matched.flatMap((item) => item.evidence);
  // A listing category is commercial context, not proof of a website or UX
  // opportunity. It may refine a supported assessment but cannot by itself
  // produce a confident service recommendation.
  const websiteEvidence = evidence.filter((item) => item.source !== "lead");
  const evaluationStatus = totalWeight && supportedWeight / totalWeight >= 0.5 && websiteEvidence.length > 0
    ? "evaluated"
    : "insufficient_evidence";
  return {
    score: evaluationStatus === "evaluated" ? rawScore : 0,
    commercialFit: evaluationStatus === "evaluated" ? rawScore : 0,
    evidenceCoverage: totalWeight ? Math.round((supportedWeight / totalWeight) * 100) : 0,
    evidenceConfidence: evidence.length ? Math.round((evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length) * 100) : 0,
    evaluationStatus,
    rules: results,
  };
}
