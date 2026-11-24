export type SignalGroup =
  "technology" | "marketing" | "contact" | "booking" | "website_opportunities" | "discovery" | "profile" | "people" | "verification";
export type VerificationStatus = "verified" | "possible" | "inconclusive";

export type HomepageSignal = {
  code: string;
  label: string;
  group: SignalGroup;
  value: string;
  confidence: number;
  evidenceExcerpt: string;
  evidenceUrl?: string;
  verificationStatus?: VerificationStatus;
};

type Fingerprint = Omit<HomepageSignal, "value" | "evidenceExcerpt"> & {
  patterns: RegExp[];
};

const fingerprints: Fingerprint[] = [
  {
    code: "TECH_WORDPRESS",
    label: "WordPress",
    group: "technology",
    confidence: 0.98,
    patterns: [/wp-content\//i, /wp-includes\//i],
  },
  {
    code: "TECH_SHOPIFY",
    label: "Shopify",
    group: "technology",
    confidence: 0.98,
    patterns: [/cdn\.shopify\.com/i, /myshopify\.com/i],
  },
  {
    code: "TECH_WEBFLOW",
    label: "Webflow",
    group: "technology",
    confidence: 0.98,
    patterns: [/assets\.website-files\.com/i, /data-wf-domain/i],
  },
  {
    code: "TECH_FRAMER",
    label: "Framer",
    group: "technology",
    confidence: 0.95,
    patterns: [/framerusercontent\.com/i, /framer\.app/i],
  },
  {
    code: "TECH_SQUARESPACE",
    label: "Squarespace",
    group: "technology",
    confidence: 0.98,
    patterns: [/static1\.squarespace\.com/i, /<!--\s*this is squarespace/i],
  },
  {
    code: "GOOGLE_ADS",
    label: "Google Ads tag",
    group: "marketing",
    confidence: 0.98,
    patterns: [
      /googleadservices\.com/i,
      /gtag\/js\?id=AW-/i,
      /google_conversion/i,
    ],
  },
  {
    code: "GOOGLE_TAG_MANAGER",
    label: "Google Tag Manager",
    group: "marketing",
    confidence: 0.98,
    patterns: [/googletagmanager\.com\/gtm\.js/i, /GTM-[A-Z0-9]+/i],
  },
  {
    code: "META_PIXEL",
    label: "Meta Pixel",
    group: "marketing",
    confidence: 0.98,
    patterns: [
      /connect\.facebook\.net\/[^"']*fbevents\.js/i,
      /fbq\s*\(\s*["']init/i,
    ],
  },
  {
    code: "ONLINE_BOOKING",
    label: "Online booking",
    group: "booking",
    confidence: 0.9,
    patterns: [
      /calendly\.com/i,
      /acuityscheduling/i,
      /squareup\.com\/appointments/i,
      /setmore/i,
      /getjobber\.com/i,
      /servicetitan/i,
      /book(?:ing)?[-_ ]?now/i,
    ],
  },
];

function excerpt(html: string, match: RegExpMatchArray | null) {
  if (!match || match.index === undefined)
    return "Homepage markup matched a conservative fingerprint.";
  return html
    .slice(Math.max(0, match.index - 80), match.index + match[0].length + 120)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function detectHomepageSignals(html: string): HomepageSignal[] {
  const source = html.slice(0, 500_000);
  const detected: HomepageSignal[] = [];
  for (const item of fingerprints) {
    const match =
      item.patterns.map((pattern) => source.match(pattern)).find(Boolean) ??
      null;
    if (match)
      detected.push({
        ...item,
        value: "detected",
        evidenceExcerpt: excerpt(source, match),
        verificationStatus: "verified",
      });
  }
  const technologies = detected.filter((item) => item.group === "technology").map((item) => item.label);
  if (technologies.length)
    detected.push({ code: "TECH_STACK", label: "Website technology stack", group: "technology", value: technologies.join(", "), confidence: 0.95, evidenceExcerpt: `Detected technology fingerprints: ${technologies.join(", ")}.`, verificationStatus: "verified" });
  const schema = source.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i,
  );
  if (schema)
    detected.push({
      code: "SCHEMA_ORG",
      label: "Schema.org structured data",
      group: "website_opportunities",
      value: "present",
      confidence: 0.98,
      evidenceExcerpt: excerpt(source, schema),
      verificationStatus: "verified",
    });
  const form = source.match(/<form\b[^>]*>/i);
  if (form)
    detected.push({
      code: "CONTACT_FORM",
      label: "Contact form",
      group: "contact",
      value: "present",
      confidence: 0.95,
      evidenceExcerpt: excerpt(source, form),
      verificationStatus: "verified",
    });
  const formAction = source.match(/<form\b[^>]*\baction=["']([^"']+)["']/i);
  if (formAction)
    detected.push({ code: "CONTACT_FORM_URL", label: "Contact form URL", group: "contact", value: formAction[1], confidence: 0.9, evidenceExcerpt: excerpt(source, formAction), verificationStatus: "verified" });
  const cta = source.match(
    /<(?:a|button)\b[^>]*>[^<]{0,100}\b(contact us|contact|request (?:a )?(?:quote|estimate)|get (?:a )?quote|call us)\b[^<]{0,100}<\/(?:a|button)>/i,
  );
  if (cta)
    detected.push({
      code: "CONTACT_CTA",
      label: "Visible contact CTA",
      group: "contact",
      value: "present",
      confidence: 0.85,
      evidenceExcerpt: excerpt(source, cta),
      verificationStatus: "verified",
    });
  const footer =
    source.match(/<footer\b[\s\S]{0,20000}?<\/footer>/i)?.[0] ??
    source.slice(-16000);
  const agency = footer.match(
    /(?:website|web\s*design|designed|developed|marketing)\s+(?:by|&)[\s\S]{0,220}?<a\b[^>]*href=["']([^"']+)["'][^>]*>([^<]{2,80})<\/a>/i,
  );
  if (agency)
    detected.push({
      code: "AGENCY_CREDIT",
      label: "Explicit agency credit",
      group: "website_opportunities",
      value: agency[2].trim(),
      confidence: 0.9,
      evidenceExcerpt: excerpt(footer, agency),
      verificationStatus: "verified",
    });
  return detected;
}

export const signalCatalog = [
  ...fingerprints.map(({ patterns: _patterns, ...item }) => ({
    ...item,
    valueType: "text",
  })),
  {
    code: "SCHEMA_ORG",
    label: "Schema.org structured data",
    group: "website_opportunities",
    confidence: 0.98,
    valueType: "text",
  },
  {
    code: "ONLINE_BOOKING",
    label: "Online booking",
    group: "booking",
    confidence: 0.9,
    valueType: "text",
  },
  {
    code: "CONTACT_FORM",
    label: "Contact form",
    group: "contact",
    confidence: 0.95,
    valueType: "text",
  },
  {
    code: "CONTACT_FORM_URL",
    label: "Contact form URL",
    group: "contact",
    confidence: 0.9,
    valueType: "text",
  },
  {
    code: "CONTACT_CTA",
    label: "Visible contact CTA",
    group: "contact",
    confidence: 0.85,
    valueType: "text",
  },
  {
    code: "AGENCY_CREDIT",
    label: "Explicit agency credit",
    group: "website_opportunities",
    confidence: 0.9,
    valueType: "text",
  },
  {
    code: "TECH_STACK",
    label: "Website technology stack",
    group: "technology",
    confidence: 0.95,
    valueType: "text",
  },
  { code: "SERP_RANK", label: "Search rank position", group: "discovery", confidence: 0, valueType: "number" },
  { code: "FOUND_IN_SERP", label: "Discovered via search", group: "discovery", confidence: 0.9, valueType: "text" },
  { code: "NO_WEBSITE", label: "No website recorded", group: "discovery", confidence: 0.9, valueType: "text" },
  { code: "UNCLAIMED_LISTING", label: "Unclaimed listing", group: "discovery", confidence: 0, valueType: "text" },
  { code: "REVIEW_RATING", label: "Review rating", group: "discovery", confidence: 1, valueType: "number" },
  { code: "REVIEW_COUNT", label: "Review count", group: "discovery", confidence: 1, valueType: "number" },
  { code: "RUNNING_GOOGLE_ADS", label: "Running Google Ads", group: "marketing", confidence: 0.98, valueType: "text" },
  { code: "RUNNING_META_ADS", label: "Running Meta Ads", group: "marketing", confidence: 0.98, valueType: "text" },
  { code: "NO_SCHEMA_MARKUP", label: "Missing structured data on inspected homepage", group: "website_opportunities", confidence: 0.9, valueType: "text" },
  { code: "NO_ONLINE_BOOKING", label: "No known booking fingerprint on inspected homepage", group: "booking", confidence: 0.6, valueType: "text" },
  { code: "SITE_PAGE_COUNT", label: "Site page count", group: "profile", confidence: 0.9, valueType: "number" },
  { code: "BLOG_STALE", label: "Stale content", group: "profile", confidence: 0.8, valueType: "text" },
  { code: "BLOCKS_AI_CRAWLERS", label: "Robots blocks AI crawlers", group: "profile", confidence: 0.95, valueType: "text" },
  { code: "HIRING_ROLE", label: "Relevant hiring role", group: "profile", confidence: 0.8, valueType: "text" },
  { code: "CONTACT_FOUND", label: "Named contact found", group: "people", confidence: 0.8, valueType: "text" },
  { code: "DECISION_MAKER_TITLE", label: "Decision-maker title", group: "people", confidence: 0.85, valueType: "text" },
  { code: "REGISTRY_VERIFIED", label: "Public registry verification", group: "people", confidence: 0.95, valueType: "text" },
  { code: "LIKELY_OWNER", label: "Likely owner", group: "people", confidence: 0.7, valueType: "text" },
  { code: "EMAIL_PATTERN", label: "Company email pattern", group: "verification", confidence: 0.75, valueType: "text" },
  { code: "EMAIL_STATUS", label: "Email deliverability status", group: "verification", confidence: 0, valueType: "text" },
  { code: "BROKEN_CONTACT_LINK", label: "Broken contact link", group: "contact", confidence: 0.95, valueType: "text" },
  { code: "BROKEN_BOOKING_LINK", label: "Broken booking link", group: "booking", confidence: 0.95, valueType: "text" },
  { code: "NONFUNCTIONAL_CTA", label: "Nonfunctional CTA", group: "contact", confidence: 0.9, valueType: "text" },
  { code: "HOMEPAGE_NAV_FAILURE", label: "Homepage navigation failure", group: "website_opportunities", confidence: 0.95, valueType: "text" },
  { code: "TECHNICAL_SEO_ISSUE", label: "Technical SEO issue", group: "website_opportunities", confidence: 0.9, valueType: "text" },
  { code: "MOBILE_USABILITY_ISSUE", label: "Mobile usability issue", group: "website_opportunities", confidence: 0.9, valueType: "text" },
  { code: "PERFORMANCE_ISSUE", label: "Performance issue", group: "website_opportunities", confidence: 0.9, valueType: "text" },
].filter(
  (item, index, all) =>
    all.findIndex((other) => other.code === item.code) === index,
);
