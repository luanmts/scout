export type OutreachEvidenceRecord = { id?: string; source?: string; category?: string; label?: string; detail?: unknown; excerpt?: unknown; verificationStatus?: string; subjective?: boolean; priority?: number };
export type CommercialFocusSignal = {
  id: string;
  category: string;
  severity?: string;
  verificationStatus?: string;
  evidence?: string;
  subjective?: boolean;
  redesignPotential?: string;
};
export type CommercialFocus = {
  key: "seo" | "redesign" | "performance" | "mobile" | "accessibility" | "conversion" | "booking" | "neutral";
  label: string;
  confidence: "high" | "medium" | "low";
  evidenceIds: string[];
  secondary: Array<{ key: string; label: string }>;
  reason: string;
};

export const outreachWritingStandards = {
  subject: "Use a short, natural subject that creates commercial curiosity without explaining the diagnosis, solution, metric, device, service, or benefit. Vary ideas such as ‘An idea for your business’, ‘One idea for your website’, ‘Something worth sharing’, or ‘An opportunity worth exploring’ without repeating them mechanically. Reject audit titles, keyword strings, technical explanations, promises, urgency, emojis, and excessive punctuation.",
  body: "Write a human one-to-one B2B sales note inspired by the Swokei-style examples. Follow a natural progression: approachable reason for writing, conversational introduction of one grounded observation, a realistic buyer scenario, restrained commercial value, Luan’s strategic website-development positioning, and one easy question. Do not sell a technical correction by itself. Explain how resolving the verified obstacle could make it easier for someone already interested to call, request a quote, book, or choose the business. Position Luan as a Web Developer & SEO Specialist who designs and develops strategic websites around UX, conversion, and acquisition. The opportunity guides the argument but never narrows his identity into mobile optimization, speed work, button fixes, form fixes, navigation fixes, or booking-flow specialization. Never open the first substantive sentence with a flaw, audit result, raw website diagnosis, button/link failure, or an ‘automated review’ claim. Use natural American English, short paragraphs, plain words, and genuinely varied openings and transitions. Do not use em dashes or en dashes as an AI-style writing device; use ordinary sentences, commas, or periods instead. Keep legitimate hyphens inside names, compound words, and URLs. Do not turn the email into an audit summary, list of services, or rigid template. Keep raw diagnostics, Lighthouse, scores, rule names, measurements, and implementation details internal. Do not claim that Luan personally visited a website unless a verified human observation supports it.",
  evidence: "Only verified lead facts, selected verified evidence, and explicitly confirmed user observations may become factual claims. Possible, partial, blocked, failed, stale, or subjective evidence cannot become a defect, customer loss, ranking claim, conversion claim, or guaranteed result. A buyer scenario is allowed only as a conditional, evidence-matched possibility: say someone may abandon, choose another provider, or fail to complete contact, never that this has happened. Match the offer to the evidence: SEO, performance, mobile, contact/booking, accessibility, conversion, or redesign only when supported.",
  cta: "End with one simple, low-pressure conversational question that fits the verified opportunity. Vary the invitation and avoid formulaic phrases such as ‘a couple of ideas,’ ‘a focused improvement to that path,’ ‘practical ideas for that path,’ or ‘making the booking path dependable.’ Do not force a meeting, free draft, proposal, or immediate commitment unless that offer is explicitly configured.",
} as const;

export const outreachSubjectPolicy = "SUBJECT POLICY: Use commercial curiosity. Present an idea, opportunity, or natural reason to talk. Do not explain the problem, solution, technical detail, metric, device, diagnostic, or benefit in the subject. Approved style anchors: An idea for your business; One idea for your website; An opportunity for your business; Something worth sharing; A genuine thought about your work; An opportunity worth exploring. Reject abstract or explanatory constructions, including helping people find their way, making the next step clearer, improving the customer journey, making navigation easier, mobile layout notes, and contact or conversion explanations.";

export type SubjectEditorialAssessment = { acceptable: boolean; reasons: string[] };

const prohibitedCommercialExplanationSubjects = [
  /\bhelping people find their way\b/,
  /\bmaking the next step clearer\b/,
  /\bimproving the customer journey\b/,
  /\bmaking navigation easier\b/,
  /\bmobile layout\b/,
  /\bmobile experience\b/,
  /\bcontact(?: form| path)? improvement\b/,
  /\bconversion optimization\b/,
  /\bcustomer experience\b/,
] as const;

/**
 * This is deliberately a narrow editorial guard, not a keyword blacklist.
 * It rejects report-like titles only when technical wording is doing the work
 * of the subject instead of a conversational framing.
 */
export function assessOutreachSubject(subject: string, company = ""): SubjectEditorialAssessment {
  const normalized = subject.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const business = company.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const businessWords = business.split(" ").filter(Boolean);
  const reasons: string[] = [];
  if (!normalized || normalized.length < 4 || words.length < 2) reasons.push("too_short");
  const first = subject.trim().slice(0, 1);
  if (first && first !== first.toLocaleUpperCase()) reasons.push("initial_lowercase");
  const serviceOnly = /\b(seo|redesign|website|web|performance|optimization|marketing)\b/.test(normalized);
  if (serviceOnly && words.length <= businessWords.length + 2 && businessWords.some((word) => words.includes(word))) reasons.push("company_service");
  const technicalTerms = /\b(audit|report|ticket|finding|issue|error|bug|fix|lighthouse|seo|meta|viewport|pixel|mobile|layout|performance|optimization|canonical|schema|conversion)\b/.test(normalized);
  const conversationalFrame = /\b(thought|idea|share|sharing|question|message|hello|note|your work|your business|online presence)\b/.test(normalized);
  if (technicalTerms && !conversationalFrame) reasons.push("technical_report_style");
  if (/\b(audit|report|ticket|finding|issue|error|bug|fix|lighthouse|viewport|pixel|meta description|mobile layout|contact form|booking flow|conversion optimization|next step clearer)\b/.test(normalized)) reasons.push("direct_technical_issue");
  if (prohibitedCommercialExplanationSubjects.some((pattern) => pattern.test(normalized))) reasons.push("commercial_explanation");
  return { acceptable: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function isPoorOutreachSubject(subject: string, company = "") {
  return !assessOutreachSubject(subject, company).acceptable;
}

const variationDirections = [
  "Start with a calm, business-relevant reason for reaching out, then transition naturally to one grounded opportunity.",
  "Begin with a thoughtful, conversational context before introducing the verified observation in plain American English.",
  "Use a restrained, human opening, one relevant commercial implication, and a brief introduction to the matching expertise.",
  "Use a compact, human context–observation–expertise flow with short paragraphs and a natural question, never leading with the finding itself.",
  "Lead with a confirmed business detail only when it reads naturally; then make a conversational transition to the opportunity without generic praise.",
  "Use a warm but professional opening and let the evidence shape the offer without presenting it as an audit result.",
  "Keep the message concise and varied: an approachable reason for writing, one practical observation, a relevant service, and an easy question.",
] as const;

export function outreachVariationDirection(seed: string) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return variationDirections[hash % variationDirections.length];
}

/**
 * User-entered direction can make a draft more useful, but it is never
 * evidence about a business. Keep it deliberately short so it remains a
 * framing note instead of an unbounded second prompt.
 */
export function safeOutreachGuidance(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

const focusLabels: Record<CommercialFocus["key"], string> = {
  seo: "SEO optimization",
  redesign: "Website redesign",
  performance: "Performance optimization",
  mobile: "Mobile optimization",
  accessibility: "Accessibility improvements",
  conversion: "Conversion-path improvements",
  booking: "Booking and customer-flow improvements",
  neutral: "Website improvement review",
};

const severityWeight: Record<string, number> = { high: 42, medium: 25, low: 10 };

/**
 * Select an offer from durable audit evidence, never from a business category
 * or a bare Lighthouse total. Redesign is deliberately available only when a
 * reviewed Visual & UX assessment supports it.
 */
export function selectCommercialFocus(signals: CommercialFocusSignal[]): CommercialFocus {
  const candidates = new Map<CommercialFocus["key"], { score: number; ids: string[]; subjective?: boolean }>();
  const add = (key: CommercialFocus["key"], signal: CommercialFocusSignal, multiplier = 1) => {
    if (signal.verificationStatus !== "verified" && !signal.subjective) return;
    const score = (severityWeight[String(signal.severity ?? "medium").toLowerCase()] ?? 0) * multiplier;
    if (!score) return;
    const current = candidates.get(key) ?? { score: 0, ids: [], subjective: signal.subjective };
    current.score += score;
    current.ids.push(signal.id);
    current.subjective = current.subjective && signal.subjective;
    candidates.set(key, current);
  };

  for (const signal of signals) {
    const category = signal.category.toLowerCase();
    const evidence = String(signal.evidence ?? "").toLowerCase();
    if (category === "seo" || category === "metadata") add("seo", signal, 1.25);
    if (category === "performance") add("performance", signal, 1.1);
    if (category === "mobile") add("mobile", signal, 1.15);
    // Accessibility findings remain available when explicitly selected, but
    // they are not a default commercial focus. Generic accessibility copy was
    // previously winning over more persuasive SEO, performance and journey
    // evidence.
    if (category === "links" || category === "content") {
      if (/booking|appointment|reservation/.test(evidence)) add("booking", signal, 1.2);
      else if (/contact|cta|form|navigation|destination/.test(evidence)) add("conversion", signal, 1.05);
    }
    if (signal.subjective && ["high", "medium"].includes(String(signal.redesignPotential ?? "").toLowerCase()))
      add("redesign", { ...signal, severity: signal.redesignPotential === "high" ? "high" : "medium" }, 0.8);
  }

  const ranked = [...candidates.entries()]
    .filter(([, candidate]) => candidate.score >= 25)
    .sort((a, b) => b[1].score - a[1].score);
  const primary = ranked[0];
  if (!primary)
    return { key: "neutral", label: focusLabels.neutral, confidence: "low", evidenceIds: [], secondary: [], reason: "No verified audit evidence supports a specific commercial focus." };
  const [key, candidate] = primary;
  const confidence: CommercialFocus["confidence"] = candidate.subjective ? "low" : candidate.score >= 60 ? "high" : "medium";
  return {
    key,
    label: focusLabels[key],
    confidence,
    evidenceIds: candidate.ids,
    secondary: ranked.slice(1, 3).map(([secondaryKey]) => ({ key: secondaryKey, label: focusLabels[secondaryKey] })),
    reason: candidate.subjective
      ? "Based on an approved subjective Visual & UX assessment; it is not a verified technical defect."
      : `Based on ${candidate.ids.length} verified homepage finding${candidate.ids.length === 1 ? "" : "s"}.`,
  };
}

export function selectOutreachEvidence(evidence: OutreachEvidenceRecord[], selectedIds: string[]) {
  const chosen = !selectedIds.length ? evidence : evidence.filter((item) => item.id && new Set(selectedIds).has(item.id));
  // A concise email should carry one main opportunity, never an audit dump.
  // Verified functional evidence outranks approved subjective visual context.
  const categoryPriority: Record<string, number> = { links: 140, content: 135, seo: 135, metadata: 135, mobile: 130, performance: 125, accessibility: 25 };
  return chosen
    .filter((item) => item.verificationStatus === "verified" || item.subjective)
    .sort((a, b) => {
      const aScore = Number(a.priority ?? (a.subjective ? 10 : 100)) + (categoryPriority[String(a.category ?? "").toLowerCase()] ?? 80);
      const bScore = Number(b.priority ?? (b.subjective ? 10 : 100)) + (categoryPriority[String(b.category ?? "").toLowerCase()] ?? 80);
      return bScore - aScore;
    })
    .slice(0, 2);
}

/**
 * Keep raw audit evidence for persistence and diagnostics, but give the
 * writer only a grounded, reader-friendly interpretation. This prevents a
 * rule name (for example, a meta tag or viewport measurement) from becoming
 * accidental cold-email prose.
 */
export function commercialBuyerLens(category: unknown) {
  const normalized = String(category ?? "").toLocaleLowerCase();
  if (/hvac|air conditioning|heating|cooling|air\s*&\s*energy/.test(normalized))
    return "For HVAC, a prospective customer may be dealing with a comfort or equipment problem, comparing local providers, and looking for a fast, low-effort way to call, request a quote, or schedule. This is a buyer scenario, not evidence that this company’s customers are currently doing so.";
  return "A prospective customer may be comparing providers and looking for a clear, low-effort way to understand the service, get in touch, request a quote, or book. This is a buyer scenario, not evidence that this business has already lost anyone.";
}

export function commercialEvidenceContext(evidence: Array<Record<string, unknown>>, buyerLens = commercialBuyerLens("")) {
  const cleanDetail = (item: Record<string, unknown>) => String(item.detail ?? item.excerpt ?? "")
    .replace(/\s*Selector:\s*[^;]+;?/gi, " ")
    .replace(/\s*property:\s*[^;]+;?/gi, " ")
    .replace(/\s*rule:\s*.*$/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
  const specific = (item: Record<string, unknown>) => {
    const category = String(item.category ?? item.label ?? "").toLowerCase();
    const detail = cleanDetail(item);
    if (/performance|speed|render/.test(category)) return detail || "The homepage has a verified performance issue.";
    if (/mobile|viewport|overflow|responsive/.test(category)) return detail || "The homepage has a verified mobile usability issue.";
    if (/seo|metadata|canonical|title|description|search/.test(category)) return detail || "The website has a verified search presentation issue.";
    if (/links|content|contact|booking|form|cta|destination/.test(category)) return detail || "The website has a verified visitor journey issue.";
    return detail;
  };
  const framing = (item: Record<string, unknown>) => {
    const text = `${item.category ?? ""} ${item.label ?? ""} ${item.detail ?? ""}`.toLocaleLowerCase();
    if (/booking|appointment|schedule|reservation/.test(text)) return "A verified scheduling obstacle supports this conditional scenario: someone ready to arrange service may select the visible booking option, fail to complete it, and decide to contact another provider instead of looking for a workaround. Present that as a possibility, never as a recorded lost booking.";
    if (/contact|form/.test(text)) return "A verified contact-path obstacle supports this conditional scenario: someone comparing providers may try to request a quote or reach the team, run into the observed obstacle, and leave before completing the request. Present that as a possibility, never as a recorded lost lead.";
    if (/mobile|viewport|overflow|responsive/.test(text)) return "A verified mobile usability obstacle supports this conditional scenario: someone checking services from a phone may have more trouble finding information, calling, or reaching the contact option, which could make choosing another provider easier. Present that as a possibility, never as a measured conversion loss.";
    if (/seo|metadata|canonical|title|description|search/.test(text)) return "A verified search-presentation obstacle supports this conditional scenario: a person comparing local options may see a less clear or less compelling result and choose another listing before visiting the site. Present that as a possibility, never as a measured ranking or traffic loss.";
    if (/cta|navigation|link/.test(text)) return "A verified journey obstacle supports this conditional scenario: someone interested in the service may reach the observed action, be unable to continue as expected, and choose another way to solve the problem. Present that as a possibility, never as a recorded abandonment.";
    if (item.subjective) return "An approved subjective Visual & UX assessment suggests there may be room for a clearer, more cohesive presentation; phrase this only as a respectful impression.";
    if (/performance|speed|render/.test(text)) return "A verified performance obstacle supports this conditional scenario: someone looking for help may leave before reaching the useful information or contact option, particularly on a phone. Present that as a possibility, never as a recorded lost customer.";
    return "A verified website observation supports a specific buyer scenario and improvement conversation. Explain what was observed, how it could interrupt an interested visitor, and the commercial value of removing that obstacle without claiming an outcome that was not measured.";
  };
  return evidence.map((item) => ({ id: item.id, source: item.source, category: item.category, verificationStatus: item.verificationStatus, subjective: Boolean(item.subjective), buyerLens, specificObservation: specific(item), commercialContext: framing(item) }));
}

export function hasConcreteCommercialEvidence(evidence: Array<Record<string, unknown>>) {
  return evidence.some((item) => {
    if (item.subjective === true) return Boolean(String(item.detail ?? item.excerpt ?? "").trim());
    if (item.verificationStatus !== "verified") return false;
    const category = String(item.category ?? "").toLowerCase();
    return ["seo", "metadata", "performance", "mobile", "links", "content", "contact", "booking", "form", "cta"].some((key) => category.includes(key)) && Boolean(String(item.detail ?? item.excerpt ?? "").trim());
  });
}

export function shouldSkipBatchDraft(hasExistingDraft: boolean, hasPriorOutreach: boolean, allowRepeat = false) {
  return !allowRepeat && (hasExistingDraft || hasPriorOutreach);
}

export function outreachModeGuidance(mode: "smart" | "general") {
  return mode === "smart"
    ? "Prioritize the strongest selected, verified commercial opportunity in this order when present: functional contact or booking flow issue, mobile usability, navigation, performance, or technical SEO. Mention a problem only when selected evidence explicitly documents it, and use neutral impact language. If no strong verified opportunity exists, stop and report insufficient evidence instead of writing a generic personalized email."
    : "Use verified business context without requiring or implying a website problem. Do not pretend that a website review or audit occurred when Website Intelligence is missing.";
}
