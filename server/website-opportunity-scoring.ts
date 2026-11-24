export type WebsiteOpportunityIssue = {
  id: string;
  category: string;
  severity: string;
  verificationStatus?: string | null;
  evidence?: string | null;
  confidence?: number | null;
};

export type WebsiteOpportunityResult = {
  status: "completed" | "insufficient";
  level: "high" | "medium" | "low" | "insufficient_evidence";
  score: number | null;
  issueCount: number;
  evidenceCoverage: number;
  reason: string;
  evidence: Array<{ id: string; weight: number }>;
};

const supportedCategories = new Set(["links", "mobile", "performance", "seo", "content", "accessibility"]);
const weights: Record<string, number> = { high: 32, medium: 16, low: 7 };
const categoryCaps: Record<string, number> = {
  accessibility: 18,
  content: 16,
  links: 24,
  mobile: 24,
  performance: 24,
  seo: 24,
};

function normalizedRule(issue: WebsiteOpportunityIssue) {
  const evidence = String(issue.evidence ?? "").trim().toLowerCase();
  const rule = evidence.match(/rule:\s*(.+)$/)?.[1] ?? evidence;
  return `${issue.category}|${rule.replace(/\s+/g, " ").replace(/\b\d+(?:\.\d+)?\s*(?:px|x|%|ms|kb|mb)\b/g, "<measurement>")}`;
}

/**
 * Commercial opportunity is evidence-gated. Lighthouse scores are signals,
 * not commercial classifications, and subjective Visual & UX opinions do not
 * become technical defects here.
 */
export function calculateWebsiteOpportunity(issues: WebsiteOpportunityIssue[]): WebsiteOpportunityResult {
  const supported = issues.filter((issue) => {
    const confidence = issue.confidence == null ? 1 : issue.confidence;
    return issue.verificationStatus === "verified" && supportedCategories.has(issue.category) && Boolean(String(issue.evidence ?? "").trim()) && confidence >= 0.8;
  });
  // Audit tools often report the same rule once per element. Keep the most
  // severe concrete instance of each rule so repeated selectors do not turn
  // one problem into an artificial 100/100 opportunity.
  const unique = new Map<string, WebsiteOpportunityIssue>();
  for (const issue of supported) {
    const key = normalizedRule(issue);
    const previous = unique.get(key);
    if (!previous || (weights[issue.severity] ?? 0) > (weights[previous.severity] ?? 0)) unique.set(key, issue);
  }
  const selectedByCategory = new Map<string, WebsiteOpportunityIssue[]>();
  for (const issue of [...unique.values()].sort((a, b) => (weights[b.severity] ?? 0) - (weights[a.severity] ?? 0))) {
    const selected = selectedByCategory.get(issue.category) ?? [];
    const current = selected.reduce((total, item) => total + (weights[item.severity] ?? 0), 0);
    if (current < (categoryCaps[issue.category] ?? 0)) {
      selected.push(issue);
      selectedByCategory.set(issue.category, selected);
    }
  }
  const selected = [...selectedByCategory.values()].flat();
  const evidence = selected
    .map((issue) => ({ id: issue.id, weight: weights[issue.severity] ?? 0 }))
    .filter((item) => item.weight > 0);
  const score = Math.min(100, evidence.reduce((total, item) => total + item.weight, 0));
  const evidenceCoverage = Math.min(100, selected.length * 25);
  const hasSingleSevereFinding = selected.length === 1 && selected[0].severity === "high" && evidence.length === 1;
  const enoughEvidence = hasSingleSevereFinding || selected.length >= 2;
  if (!enoughEvidence) {
    return {
      status: "insufficient",
      level: "insufficient_evidence",
      score: null,
      issueCount: selected.length,
      evidenceCoverage,
      reason: "At least two verified, evidenced homepage issues or one verified high-severity issue are required before opportunity is classified.",
      evidence,
    };
  }
  const level = score >= 65 ? "high" : score >= 35 ? "medium" : "low";
  return {
    status: "completed",
    level,
    score,
    issueCount: evidence.length,
    evidenceCoverage,
      reason: `Weighted verified homepage issues after deduplication and category caps (${selected.length} distinct findings across ${selectedByCategory.size} categories). No financial impact is inferred.`,
    evidence,
  };
}
