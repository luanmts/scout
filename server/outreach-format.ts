export type EmailDraft = { subject: string; body: string };
export type OutreachNarrativeAssessment = { acceptable: boolean; reasons: string[] };

const nonPersonalNameWords = new Set(["at", "team", "company", "business", "service", "services", "air", "hvac", "heating", "cooling", "plumbing", "office", "info", "contact", "sales", "support", "admin", "owner", "manager", "department"]);

/** Return only a first name when the persisted display name is clearly personal. */
export function trustedFirstName(displayName: string, companyName = "") {
  const value = displayName.normalize("NFKC").replace(/\s+/g, " ").trim();
  const words = value.split(" ").filter(Boolean);
  const companyWords = new Set(companyName.normalize("NFKC").toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const normalizedWords = words.map((word) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}'-]/gu, ""));
  if (!words.length || words.length > 4 || normalizedWords.some((word) => !/^[\p{L}][\p{L}'-]*$/u.test(word))) return "";
  if (normalizedWords.some((word) => nonPersonalNameWords.has(word))) return "";
  if (companyWords.size && normalizedWords.every((word) => companyWords.has(word))) return "";
  return words[0];
}

/** Remove the AI-style em/en dash without damaging hyphenated words or URLs. */
export function removeStylisticDashes(value: string) {
  return value.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",").trim();
}

/**
 * Enforce the editorial greeting at the final boundary of generated English
 * drafts. Existing greetings are replaced rather than duplicated, while the
 * rest of the generated message remains untouched.
 */
export function ensureEnglishGreeting(body: string, contactName = "") {
  const normalized = body
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^\s+|\s+$/g, "");
  const dashFree = removeStylisticDashes(normalized);
  const name = trustedFirstName(contactName);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const withoutLeadingGreeting = dashFree.replace(/^(?:hi|hello|dear)\b[^\n]*,?\s*(?:\n+|$)/i, "").trim();
  return withoutLeadingGreeting ? `${greeting}\n\n${withoutLeadingGreeting}` : greeting;
}

/**
 * The final editorial boundary prevents a technically abrupt opening even
 * when a provider follows the evidence too literally. It does not rewrite a
 * draft itself: the caller must ask the writer to repair it with the same
 * evidence, or decline to save it.
 */
export function assessOutreachNarrative(body: string): OutreachNarrativeAssessment {
  const normalized = bodyText(body);
  const withoutGreeting = normalized.replace(/^(?:hi|hello|dear)\b[^\n]*,?\s*(?:\n+|$)/i, "").trim();
  const opening = withoutGreeting.split(/\n\s*\n/)[0] ?? "";
  const reasons: string[] = [];
  if (!opening) reasons.push("missing_opening");
  if (/\b(?:automated check|automated review|audit (?:of|found)|lighthouse)\b/i.test(normalized)) reasons.push("audit_language");
  if (/^(?:an?\s+(?:automated\s+)?(?:check|review)|the\s+(?:homepage|website)|the\s+[“\"][^”\"]+[”\"]\s+(?:link|button|action)|[A-Z][^.]{0,90}\b(?:homepage|website)\b[^.]{0,90}\b(?:has|have|appears|extends|includes|currently))\b/i.test(opening)) reasons.push("technical_opening");
  if (/\ba couple of (?:practical |focused )?ideas\b|\ba focused (?:booking|conversion|customer)?-?flow improvement\b|\ba focused improvement to that path\b|\bbooking (?:option|path) can be made dependable\b|\bmaking the booking path dependable\b/i.test(normalized)) reasons.push("formulaic_sales_copy");
  if (/\b(?:my work focuses on|i focus on|i specialize in|i specialise in)\s+(?:mobile|website speed|performance|booking|buttons?|forms?|navigation)|\bi (?:fix|help businesses fix)\s+(?:booking|buttons?|forms?|navigation|mobile|speed)\b/i.test(normalized)) reasons.push("narrow_professional_positioning");
  return { acceptable: reasons.length === 0, reasons };
}

function subjectText(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function bodyText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function candidateJson(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  return [...new Set([clean, first >= 0 && last > first ? clean.slice(first, last + 1) : ""])].filter(Boolean);
}

/** Parse a subject-only editorial revision without touching an approved body. */
export function parseOutreachSubject(text: string): string | null {
  for (const candidate of candidateJson(text)) {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>;
      const subject = subjectText(value.subject ?? value.email_subject);
      if (subject) return subject;
    } catch { /* Try the next safe JSON extraction. */ }
  }
  return null;
}

/** Accept only recoverable formatting differences; never manufacture subject or body text. */
export function parseOutreachDraft(text: string): EmailDraft | null {
  for (const candidate of candidateJson(text)) {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>;
      const subject = subjectText(value.subject ?? value.email_subject);
      const body = bodyText(value.body ?? value.message ?? value.email_body);
      if (subject && body) return { subject, body };
    } catch { /* Try the next safe JSON extraction. */ }
  }
  const heading = text.trim().match(/^\s*(?:subject|assunto)\s*:\s*(.+?)\n+(?:body|message|mensagem|corpo)\s*:\s*([\s\S]+)$/i);
  if (heading) {
    const subject = subjectText(heading[1]);
    const body = bodyText(heading[2]);
    if (subject && body) return { subject, body };
  }
  return null;
}
