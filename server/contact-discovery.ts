export type PublicLead = { title: string; city: string; region: string; country_code: string; website: string; website_empty: number };
export type ContactStatus = 'verified' | 'possible' | 'not_found';
export type PublicContactStatus = 'verified' | 'possible' | 'unverified';
export type PublicContact = {
  name: string;
  role: string;
  email: string;
  phone: string;
  socialUrl: string;
  socialNetwork: 'instagram' | 'facebook' | 'linkedin' | '';
  status: PublicContactStatus;
  sourceUrl: string;
  evidence: string;
  confidence: number;
  extractionMethod?: 'visible_html' | 'mailto' | 'accessible_attribute' | 'obfuscated_text' | 'search_result';
  sourceType?: 'official_website' | 'directory' | 'public_profile' | 'public_document' | 'search_result';
};
export type ContactDiagnostic = 'found' | 'not_found' | 'search_unavailable' | 'low_confidence' | 'access_restricted' | 'requires_javascript' | 'temporary_failure' | 'timeout' | 'unavailable' | 'uninterpretable';
export type ContactDiscovery = {
  email: string; instagram: string; facebook: string; status: ContactStatus; sourceUrl: string; confidence: number; error: string; origin: 'official_website' | 'public_search' | ''; diagnostic: ContactDiagnostic; contacts: PublicContact[];
};
const publicSearchProvider = () => process.env.CONTACT_SEARCH_PROVIDER ?? 'duckduckgo_html';
const noContacts = (): PublicContact[] => [];

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const mailtoPattern = /\bmailto:([^\s"'<>]+)/gi;
const obfuscatedEmailPattern = /\b([A-Z0-9._%+-]+)\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\})\s*([A-Z0-9.-]+)\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\})\s*([A-Z]{2,})\b/gi;
// Reused from Harvey's Scout company-inbox backfill
// (ethanplusai/harvey, MIT License): only published general inboxes are
// preferred as a commercial fallback; person-name addresses are not guessed.
const PREFERRED_GENERAL_INBOX_LOCALS = ['owner', 'office', 'info', 'contact', 'contactus', 'hello', 'team', 'service', 'sales', 'estimates', 'quotes', 'inquiries', 'enquiries', 'admin', 'support'] as const;
const instagramPattern = /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._-]{1,30})\/?/gi;
const facebookPattern = /https?:\/\/(?:www\.)?(?:facebook\.com|fb\.com)\/([a-zA-Z0-9.\-_/]+)\/?/gi;
const linkedinPattern = /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/([a-zA-Z0-9._%-]+)\/?/gi;
const blockedHosts = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function normalizeEmail(value: string) { return value.trim().toLowerCase().replace(/^mailto:/i, '').split('?')[0]; }
export function normalizeSocial(value: string, network: 'instagram' | 'facebook' | 'linkedin') {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const host = network === 'instagram' ? 'instagram.com' : network === 'facebook' ? 'facebook.com' : 'linkedin.com';
    const path = url.pathname.replace(/\/+$/, '');
    const firstSegment = path.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    if (!path || (network === 'instagram' && ['explore', 'p', 'reel', 'stories', 'accounts'].includes(firstSegment)) || (network === 'facebook' && ['groups', 'events', 'share', 'watch'].includes(firstSegment)) || (network === 'linkedin' && ['feed', 'posts', 'jobs', 'company'].includes(firstSegment))) return '';
    return path ? `https://www.${host}${path}` : '';
  } catch { return ''; }
}
export function normalizeText(value: string) { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function isPublicUrl(value: string) {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) && !blockedHosts.has(url.hostname.toLowerCase());
  } catch { return false; }
}
function privateAddress(value: string) { return isIP(value) === 4 ? /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value) : /^(::1|fc|fd|fe80:)/i.test(value); }
async function assertPublicUrl(value: string) {
  const url = new URL(value);
  if (!isPublicUrl(value) || privateAddress(url.hostname)) throw new Error('Only public HTTP(S) websites are allowed.');
  if (!isIP(url.hostname)) { const records = await lookup(url.hostname, { all: true }); if (!records.length || records.some((record) => privateAddress(record.address))) throw new Error('Website resolves to a private or unavailable address.'); }
}
function firstMatch(pattern: RegExp, text: string) { pattern.lastIndex = 0; return pattern.exec(text)?.[0] ?? ''; }
function decodeHtmlEntities(value: string) {
  return value.replace(/&(?:amp|#38|#x26);/gi, '&').replace(/&(?:quot|#34|#x22);/gi, '"').replace(/&(?:#39|apos);/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}
// Same safety boundary as Harvey's profile collector: executable markup is
// removed before text regexes run, preventing JavaScript/configuration text
// from becoming a false contact.
function stripNonContentMarkup(value: string) { return value.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' '); }
function htmlToText(value: string) { return decodeHtmlEntities(stripNonContentMarkup(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' '); }
function cleanName(value: string) { return value.replace(/\s+/g, ' ').trim().replace(/^[|,:;–—-]+|[|,:;–—-]+$/g, '').trim(); }
function normalizePhone(value: string) { return value.replace(/(?:ext\.?|x)\s*\d+$/i, '').replace(/[^+\d]/g, '').replace(/^00/, '+').slice(0, 24); }
function socialCandidates(html: string) {
  return [
    ...[...html.matchAll(instagramPattern)].map((match) => ({ value: match[0], network: 'instagram' as const })),
    ...[...html.matchAll(facebookPattern)].map((match) => ({ value: match[0], network: 'facebook' as const })),
    ...[...html.matchAll(linkedinPattern)].map((match) => ({ value: match[0], network: 'linkedin' as const })),
  ].map((item) => ({ ...item, value: normalizeSocial(item.value, item.network) })).filter((item) => item.value);
}

function extractNamedRoles(text: string) {
  const roles = /owner|founder|co-founder|president|director|manager|partner|principal|ceo|chief executive officer|head of|leadership|marketing director|operations manager/i;
  const result: Array<{ name: string; role: string; evidence: string }> = [];
  const chunks = text.split(/[.!?\n]+/).map((part) => part.trim()).filter(Boolean);
  for (const chunk of chunks) {
    if (!roles.test(chunk) || chunk.length > 220) continue;
    const match = chunk.match(/\b([A-Z][a-zÀ-ÿ'’-]+(?:\s+[A-Z][a-zÀ-ÿ'’-]+){1,3})\b\s*(?:,|[-–—|])\s*([^,;|]{3,90})/u) ?? chunk.match(/\b(owner|founder|director|manager|partner|principal|ceo|head of)\b\s*[:\-]?\s*([A-Z][a-zÀ-ÿ'’-]+(?:\s+[A-Z][a-zÀ-ÿ'’-]+){1,3})/iu);
    if (!match) continue;
    const firstLooksRole = roles.test(match[1]);
    const name = cleanName(firstLooksRole ? match[2] : match[1]);
    const role = cleanName(firstLooksRole ? match[1] : match[2]);
    if (name.length < 4 || role.length < 3 || /^(about|contact|services|team|careers)$/i.test(name)) continue;
    if (!result.some((item) => normalizeText(item.name) === normalizeText(name) && normalizeText(item.role) === normalizeText(role))) result.push({ name, role, evidence: chunk.slice(0, 300) });
  }
  return result.slice(0, 20);
}
function companySignal(lead: PublicLead, text: string, sourceUrl: string) {
  const tokens = normalizeText(lead.title).split(' ').filter((word) => word.length > 2);
  const context = normalizeText(`${text} ${sourceUrl}`);
  return tokens.filter((token) => context.includes(token)).length >= Math.min(2, Math.max(1, tokens.length));
}

function officialDomain(lead: PublicLead) {
  try { return new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
}
function emailMatchesDomain(email: string, domain: string) {
  const emailDomain = normalizeEmail(email).split('@')[1]?.replace(/^www\./i, '') ?? '';
  const normalizedDomain = domain.replace(/^www\./i, '').toLowerCase();
  return Boolean(normalizedDomain && (emailDomain === normalizedDomain || emailDomain.endsWith(`.${normalizedDomain}`)));
}

export function classifyEmailOwnership(email: string, lead: PublicLead, sourceUrl = '', sourceType?: PublicContact['sourceType']): PublicContactStatus {
  const official = officialDomain(lead);
  // A page can prove that a business is mentioned without proving that an
  // external mailbox belongs to that business. Only the official domain is
  // automatically verified; alternate domains remain usable as Possible until
  // an explicit association is available.
  if (emailMatchesDomain(email, official)) return 'verified';
  void sourceUrl;
  void sourceType;
  return 'possible';
}

export function isThirdPartyAdministrativeContact(contact: PublicContact, officialDomainValue = '') {
  if (!contact.email || contact.sourceType !== 'directory') return false;
  const emailDomain = normalizeEmail(contact.email).split('@')[1]?.replace(/^www\./i, '') ?? '';
  if (!emailDomain || emailMatchesDomain(contact.email, officialDomainValue)) return false;
  let sourceHost = '';
  try { sourceHost = new URL(contact.sourceUrl).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return false; }
  const local = normalizeEmail(contact.email).split('@')[0];
  const administrativeMailbox = /^(help|support|admin|contact|info|hello|team|service|noreply|no-reply)$/i.test(local);
  return sourceHost === emailDomain && administrativeMailbox;
}

/**
 * Persisted contact rows do not retain sourceType. Recover the conservative
 * directory/platform signal from the public URL when selecting a primary
 * recipient; this never rejects an arbitrary alternate company domain.
 */
export function isLikelyThirdPartyAdministrativeContact(email: string, sourceUrl: string, officialDomainValue = '') {
  const normalizedEmail = normalizeEmail(email);
  const emailDomain = normalizedEmail.split('@')[1]?.replace(/^www\./i, '').toLowerCase() ?? '';
  if (!emailDomain || emailMatchesDomain(normalizedEmail, officialDomainValue)) return false;
  const local = normalizedEmail.split('@')[0] ?? '';
  if (!/^(help|support|admin|contact|info|hello|team|service|noreply|no-reply)$/i.test(local)) return false;
  try {
    const source = new URL(sourceUrl);
    const sourceHost = source.hostname.replace(/^www\./i, '').toLowerCase();
    return sourceHost === emailDomain && /(?:directory|directories|listing|listings|profile|profiles|business|companies|vendors?)/i.test(source.pathname);
  } catch {
    return false;
  }
}

function identityMatch(lead: PublicLead, text: string, sourceUrl: string, email = '') {
  const titleTokens = normalizeText(lead.title).split(' ').filter((token) => token.length > 2);
  const locationTokens = normalizeText(`${lead.city} ${lead.region} ${lead.country_code}`).split(' ').filter((token) => token.length > 2);
  const context = normalizeText(`${text} ${sourceUrl}`);
  const titleRatio = titleTokens.length ? titleTokens.filter((token) => context.includes(token)).length / titleTokens.length : 0;
  const locationMatch = locationTokens.length > 0 && locationTokens.some((token) => context.includes(token));
  const domain = officialDomain(lead);
  const emailDomain = email.split('@')[1]?.toLowerCase().replace(/^www\./, '') ?? '';
  const domainMatch = Boolean(domain && (context.includes(normalizeText(domain)) || emailDomain === domain));
  return { score: titleRatio * 0.6 + (locationMatch ? 0.2 : 0) + (domainMatch ? 0.2 : 0), titleRatio, locationMatch, domainMatch };
}

function contactBrowserPath() {
  const configured = process.env.WEBSITE_AUDIT_CHROMIUM_PATH;
  if (configured && existsSync(configured)) return configured;
  const bundled = join(process.cwd(), '.cache', 'playwright-browsers', 'chromium-1228', 'chrome-linux64', 'chrome');
  return existsSync(bundled) ? bundled : undefined;
}

async function fetchHtmlInBrowser(url: string) {
  await assertPublicUrl(url);
  const browser = await chromium.launch({ headless: true, executablePath: contactBrowserPath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ userAgent: 'Google-Capture-ContactDiscovery/0.4 (+local)' });
    await context.route('**/*', async (route) => {
      try { await assertPublicUrl(route.request().url()); await route.continue(); }
      catch { await route.abort(); }
    });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const status = response?.status() ?? 0;
    if (status >= 400) throw new Error(`Public page unavailable (${status}).`);
    const contentType = response?.headers()['content-type'] ?? '';
    if (contentType && !contentType.toLowerCase().includes('text/html')) throw new Error(`Public page content is not HTML (${contentType}).`);
    await assertPublicUrl(page.url());
    const html = await page.content();
    if (/cf-chl|challenge-platform|just a moment|attention required|enable javascript and cookies|captcha/i.test(html)) throw new Error('Public page access challenge detected.');
    return { url: page.url(), html: html.slice(0, 750_000) };
  } finally { await browser.close().catch(() => undefined); }
}

async function fetchHtmlDirect(url: string) {
  let current = url;
  const maxAttempts = Math.max(1, Math.min(3, Number(process.env.CONTACT_DISCOVERY_RETRIES ?? 2) || 2));
  for (let redirect = 0; redirect < 4; redirect += 1) {
    await assertPublicUrl(current);
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await fetch(current, { signal: AbortSignal.timeout(8_000), redirect: 'manual', headers: { 'user-agent': 'Google-Capture-ContactDiscovery/0.4 (+local)' } });
        if (response.status >= 300 && response.status < 400) { const location = response.headers.get('location'); if (!location) throw new Error(`Invalid redirect (${response.status}).`); current = new URL(location, current).toString(); lastError = undefined; break; }
        if (!response.ok) {
          const error = new Error(`Public page unavailable (${response.status}).`);
          if (!([408, 425, 429, 500, 502, 503, 504].includes(response.status)) || attempt === maxAttempts - 1) throw error;
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
          continue;
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.toLowerCase().includes('text/html')) throw new Error(`Public page content is not HTML (${contentType || 'unknown'}).`);
        const text = await response.text();
        if (!text.trim()) throw new Error('Public page returned empty HTML.');
        return { url: response.url, html: text.slice(0, 750_000) };
      } catch (error) {
        lastError = error;
        const diagnostic = classifyContactFetchFailure(error);
        if (!['temporary_failure', 'timeout'].includes(diagnostic) || attempt === maxAttempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    if (lastError) throw lastError;
  }
  throw new Error('Redirect limit exceeded.');
}

async function fetchHtml(url: string, allowBrowser = false) {
  try { return await fetchHtmlDirect(url); }
  catch (error) {
    if (allowBrowser && classifyContactFetchFailure(error) === 'access_restricted') return fetchHtmlInBrowser(url);
    throw error;
  }
}

function parseRobots(text: string) { let applies = false; const disallowed: string[] = []; for (const raw of text.split(/\r?\n/)) { const line = raw.replace(/#.*/, '').trim(); if (!line) continue; const [key, value] = line.split(':', 2).map((part) => part.trim()); if (key?.toLowerCase() === 'user-agent') applies = value === '*' || /googlecapture/i.test(value); if (applies && key?.toLowerCase() === 'disallow' && value) disallowed.push(value); } return disallowed; }
function allowedPath(path: string, disallowed: string[]) { return !disallowed.some((rule) => rule === '/' || path.startsWith(rule.replace(/\*$/, ''))); }
const internalPageHints = /contact|about|in.touch|location|service|booking|book|appointment|team|leadership|career|job/i;
const preferredPaths = ['/contact', '/contact-us', '/about', '/about-us', '/get-in-touch', '/locations'];

export function discoverWebsiteLinks(html: string, base: string, limit = 7) {
  const baseUrl = new URL(base);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
    try {
      const url = new URL(decodeHtmlEntities(match[1]), base);
      if (url.origin !== baseUrl.origin || !/^https?:$/i.test(url.protocol)) return null;
      url.hash = '';
      const text = htmlToText(match[2]);
      const path = `${url.pathname} ${url.search} ${text}`;
      return { url: url.toString(), text, priority: internalPageHints.test(path) ? 2 : 1 };
    } catch { return null; }
  }).filter((item): item is { url: string; text: string; priority: number } => item !== null);
  const candidates = preferredPaths.map((path) => ({ url: new URL(path, baseUrl.origin).toString(), text: path, priority: 3 })).concat(links);
  return candidates
    .sort((a, b) => b.priority - a.priority)
    .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index)
    .slice(0, Math.max(0, limit));
}

type EmailCandidate = { email: string; method: NonNullable<PublicContact['extractionMethod']> };
function validBusinessEmail(email: string) { return Boolean(email) && !/example\.(com|org)|yourdomain|noreply|no-reply/i.test(email); }
function extractEmailCandidates(html: string, visible: string): EmailCandidate[] {
  const candidates: EmailCandidate[] = [];
  const add = (value: string, method: EmailCandidate['method']) => {
    const email = normalizeEmail(decodeHtmlEntities(value).replace(/^mailto:/i, '').trim());
    if (validBusinessEmail(email) && !candidates.some((item) => item.email === email)) candidates.push({ email, method });
  };
  for (const match of visible.matchAll(emailPattern)) add(match[0], 'visible_html');
  for (const match of html.matchAll(mailtoPattern)) {
    try { add(decodeURIComponent(match[1]), 'mailto'); } catch { add(match[1], 'mailto'); }
  }
  for (const match of html.matchAll(/\b(?:aria-label|title|data-email|data-contact|content|value)=["']([^"']+)["']/gi)) {
    const attributeText = htmlToText(match[1]);
    for (const email of attributeText.match(emailPattern) ?? []) add(email, 'accessible_attribute');
    for (const obfuscated of attributeText.matchAll(obfuscatedEmailPattern)) add(`${obfuscated[1]}@${obfuscated[2]}.${obfuscated[3]}`, 'obfuscated_text');
  }
  for (const match of visible.matchAll(obfuscatedEmailPattern)) add(`${match[1]}@${match[2]}.${match[3]}`, 'obfuscated_text');
  return candidates;
}

export function extractPublicContacts(html: string) {
  const visible = htmlToText(html);
  const emailCandidates = extractEmailCandidates(html, visible);
  const emails = emailCandidates.map((item) => item.email);
  const phones = [...new Set((visible.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? []).map(normalizePhone).filter((phone) => phone.length >= 10 || (phone.startsWith('+') && phone.length >= 8)))];
  const socials = socialCandidates(html);
  const people = extractNamedRoles(visible);
  const contacts: PublicContact[] = [];
  for (const person of people) contacts.push({ name: person.name, role: person.role, email: '', phone: '', socialUrl: '', socialNetwork: '', status: 'possible', sourceUrl: '', evidence: person.evidence, confidence: 0.72 });
  for (const candidate of emailCandidates) contacts.push({ name: '', role: '', email: candidate.email, phone: '', socialUrl: '', socialNetwork: '', status: 'verified', sourceUrl: '', extractionMethod: candidate.method, evidence: `Public email address found by ${candidate.method.replace('_', ' ')} extraction: ${candidate.email}`, confidence: 0.9 });
  for (const phone of phones) contacts.push({ name: '', role: '', email: '', phone, socialUrl: '', socialNetwork: '', status: 'verified', sourceUrl: '', evidence: `Public phone number found in visible page content: ${phone}`, confidence: 0.82 });
  for (const social of socials) contacts.push({ name: '', role: '', email: '', phone: '', socialUrl: social.value, socialNetwork: social.network, status: 'verified', sourceUrl: '', evidence: `Public ${social.network} profile linked from the page.`, confidence: 0.88 });
  return { email: emails[0] ?? '', instagram: normalizeSocial(firstMatch(instagramPattern, html), 'instagram'), facebook: normalizeSocial(firstMatch(facebookPattern, html), 'facebook'), contacts };
}

export function dedupePublicContacts(contacts: PublicContact[]) {
  const ranking: Record<PublicContactStatus, number> = { verified: 3, possible: 2, unverified: 1 };
  const unique = new Map<string, PublicContact>();
  for (const contact of contacts) {
    const identity = contact.email ? `email:${normalizeEmail(contact.email)}` : contact.phone ? `phone:${normalizePhone(contact.phone)}` : contact.socialUrl && contact.socialNetwork ? `${contact.socialNetwork}:${normalizeSocial(contact.socialUrl, contact.socialNetwork)}` : contact.name ? `person:${normalizeText(contact.name)}:${normalizeText(contact.role)}` : '';
    if (!identity) continue;
    const prior = unique.get(identity);
    if (!prior || ranking[contact.status] > ranking[prior.status] || contact.confidence > prior.confidence) unique.set(identity, contact);
  }
  return [...unique.values()];
}

export function classifyContactFetchFailure(error: unknown, status?: number): ContactDiagnostic {
  const message = String(error instanceof Error ? error.message : error ?? '').toLowerCase();
  if (/enablejs|requires?_javascript|javascript.{0,20}retry|httpservice\/retry/.test(message)) return 'requires_javascript';
  if ([401, 403, 451].includes(status ?? 0) || /(?:http|unavailable)\s*\(?\s*(401|403|451)/.test(message) || /challenge|captcha|cloudflare|attention required/.test(message)) return 'access_restricted';
  if ([408, 425, 429].includes(status ?? 0) || /timeout|timed out|abort/.test(message)) return 'timeout';
  if ([500, 502, 503, 504].includes(status ?? 0) || /eai_again|enotfound|econnreset|fetch failed|dns/.test(message)) return 'temporary_failure';
  if (status && status >= 400) return 'unavailable';
  if (/content-type|html/.test(message)) return 'uninterpretable';
  return 'unavailable';
}

export function mergeWebsiteContactPages(pages: Array<{ url: string; html: string }>, officialDomainValue = '') {
  const merged = pages.reduce((current, page) => {
    const contacts = extractPublicContacts(page.html);
    return {
      email: current.email,
      instagram: current.instagram || contacts.instagram,
      facebook: current.facebook || contacts.facebook,
      contacts: [...current.contacts, ...contacts.contacts.map((contact) => ({
        ...contact,
        status: contact.email && officialDomainValue && !emailMatchesDomain(contact.email, officialDomainValue) ? 'possible' as const : contact.status,
        sourceUrl: page.url,
        sourceType: 'official_website' as const,
        evidence: contact.email && officialDomainValue && !emailMatchesDomain(contact.email, officialDomainValue)
          ? `${contact.evidence} Ownership of the external email domain was not independently confirmed.`
          : contact.evidence,
      }))],
      sourceUrl: current.sourceUrl,
    };
  }, { email: '', instagram: '', facebook: '', sourceUrl: '', contacts: noContacts() });
  const unique = dedupePublicContacts(merged.contacts);
  const best = selectBestContactEmail(unique, officialDomainValue);
  return {
    ...merged,
    email: best?.email ?? '',
    sourceUrl: best?.sourceUrl || merged.sourceUrl || unique[0]?.sourceUrl || '',
    contacts: unique,
  };
}

export async function discoverFromWebsite(lead: PublicLead): Promise<ContactDiscovery> {
  if (lead.website_empty || !lead.website) return { email: '', instagram: '', facebook: '', status: 'not_found', sourceUrl: '', confidence: 0, error: 'No public website is listed.', origin: '', diagnostic: 'not_found', contacts: noContacts() };
  const base = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
  try {
    const first = await fetchHtml(base, true);
    const origin = new URL(first.url).origin;
    let disallowed: string[] = [];
    try { const robots = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(6_000), redirect: 'manual', headers: { 'user-agent': 'Google-Capture-ContactDiscovery/0.4 (+local)' } }); if (robots.ok) disallowed = parseRobots(await robots.text()); } catch { /* robots availability is inconclusive; stay within the fixed page limit */ }
    const maxPages = Math.max(2, Math.min(10, Number(process.env.CONTACT_DISCOVERY_MAX_PAGES ?? 8) || 8));
    const candidates = discoverWebsiteLinks(first.html, first.url, maxPages - 1).filter((item) => allowedPath(new URL(item.url).pathname, disallowed));
    const failures: Array<{ url: string; diagnostic: ContactDiagnostic; error: string }> = [];
    const pages = [first, ...await Promise.all(candidates.map(async (candidate) => {
      try { return await fetchHtml(candidate.url, true); }
      catch (error) { failures.push({ url: candidate.url, diagnostic: classifyContactFetchFailure(error), error: error instanceof Error ? error.message : 'Public page unavailable.' }); return null; }
    }))].filter(Boolean) as Array<{ url: string; html: string }>;
    const result = mergeWebsiteContactPages(pages, officialDomain(lead));
    const failureText = failures.length ? failures.map((failure) => `${failure.url}: ${failure.error}`).join(' | ').slice(0, 1_500) : '';
    if (!result.email && !result.instagram && !result.facebook && !result.contacts.length) {
      const diagnostic = failures[0]?.diagnostic ?? 'not_found';
      return { ...result, status: 'not_found', confidence: 0, error: failureText, origin: 'official_website', diagnostic };
    }
    const verified = pages.some((page) => companySignal(lead, htmlToText(page.html), page.url));
    const selectedEmail = result.email ? result.contacts.find((contact) => contact.email === result.email) : undefined;
    const status = result.email ? (verified && selectedEmail?.status === 'verified' ? 'verified' : 'possible') : (verified ? 'verified' : 'possible');
    return { ...result, status, confidence: status === 'verified' ? 90 : 55, error: failureText, origin: 'official_website', diagnostic: 'found' };
  } catch (error) {
    return { email: '', instagram: '', facebook: '', status: 'not_found', sourceUrl: '', confidence: 0, error: error instanceof Error ? error.message : 'Public website could not be read.', origin: 'official_website', diagnostic: classifyContactFetchFailure(error), contacts: noContacts() };
  }
}

type SearchResult = { url: string; title: string; snippet: string };
const publicSearchCache = new Map<string, { expiresAt: number; result: ContactDiscovery }>();
const publicSearchTtlMs = 6 * 60 * 60 * 1000;

export function publicSearchQueries(lead: PublicLead) {
  const domain = officialDomain(lead);
  return [...new Set([
    `"${lead.title}" email`,
    `"${lead.title}" contact ${lead.city || lead.region || ''}`.trim(),
    `"${lead.title}" "${domain}" email`.replace(/""/g, '').trim(),
    `"${lead.title}" "${lead.city || lead.region || lead.country_code}" email`.trim(),
  ])].slice(0, 4);
}

type PublicSearchResult = { url: string; title: string; snippet: string };
type PublicSearchResponse = { queries: Array<{ query: string; provider: string; results: PublicSearchResult[] }>; attempts: Array<{ provider: string; url?: string; error?: string }>; providers?: Array<{ provider: string; rawResults: number; validUrls: number; relevantSources: number; accepted: boolean; error?: string }> };

export function resolveContactSearchBridgePath(configuredPath?: string, workingDirectory = process.cwd()) {
  const defaultPath = join(workingDirectory, 'scripts', 'contact-search-bridge.py');
  const previousBundledPath = join(workingDirectory, 'scripts', 'harvey-search-bridge.py');
  if (!configuredPath) return defaultPath;
  if (resolve(workingDirectory, configuredPath) === resolve(previousBundledPath) && !existsSync(resolve(workingDirectory, configuredPath))) return defaultPath;
  return configuredPath;
}

async function searchWithContactBridge(lead: PublicLead): Promise<PublicSearchResponse> {
  const bridge = resolveContactSearchBridgePath(process.env.HARVEY_SEARCH_BRIDGE);
  const python = process.env.HARVEY_PYTHON ?? 'python3';
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = execFile(python, [bridge], { timeout: 90_000, maxBuffer: 2_000_000, env: process.env }, (error, output) => error ? reject(error) : resolve({ stdout: output }));
      child.stdin?.end(JSON.stringify({ queries: publicSearchQueries(lead).slice(0, 3), context: { name: lead.title, city: lead.city, region: lead.region, domain: officialDomain(lead) } }));
    });
    const parsed = JSON.parse(stdout) as PublicSearchResponse;
    return { queries: Array.isArray(parsed.queries) ? parsed.queries : [], attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [], providers: Array.isArray(parsed.providers) ? parsed.providers : [] };
  } catch (error) {
    return { queries: [], attempts: [{ provider: 'bridge', error: error instanceof Error ? error.message : 'Harvey search bridge failed.' }], providers: [] };
  }
}

async function discoverFromSearchResults(lead: PublicLead, search: PublicSearchResponse): Promise<ContactDiscovery> {
  const rankedResults = search.queries.flatMap((item) => item.results)
    .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index)
    .map((item) => ({ ...item, match: identityMatch(lead, `${item.title} ${item.snippet}`, item.url) }))
    .filter((item) => item.match.titleRatio >= 0.5)
    .sort((a, b) => b.match.score + searchResultPagePriority(b) - (a.match.score + searchResultPagePriority(a)));
  const officialHost = (() => { try { return new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; } })();
  const selectedHosts = new Set<string>();
  const results = rankedResults.filter((item) => {
    let host = '';
    try { host = new URL(item.url).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return false; }
    if (!host || selectedHosts.has(host)) return false;
    selectedHosts.add(host);
    return true;
  }).sort((a, b) => Number(new URL(a.url).hostname.replace(/^www\./i, '').toLowerCase() === officialHost) - Number(new URL(b.url).hostname.replace(/^www\./i, '').toLowerCase() === officialHost) || b.match.score - a.match.score).slice(0, 3);
  const contacts: PublicContact[] = [];
  for (const result of results.slice(0, 3)) {
    for (const email of [...new Set((`${result.title} ${result.snippet}`.match(emailPattern) ?? []).map(normalizeEmail))]) contacts.push({ name: '', role: '', email, phone: '', socialUrl: '', socialNetwork: '', status: 'possible', sourceUrl: result.url, sourceType: 'search_result', extractionMethod: 'search_result', evidence: 'Harvey search snippet only; source page not yet confirmed.', confidence: 0.55 });
    try {
      const source = await fetchHtml(result.url);
      const text = htmlToText(source.html);
      const match = identityMatch(lead, text, source.url);
      if (match.titleRatio < 0.5 || (!match.locationMatch && !match.domainMatch)) continue;
      for (const contact of extractPublicContacts(source.html).contacts.filter((item) => item.email)) {
        const emailMatch = identityMatch(lead, text, source.url, contact.email);
        const sourceType = externalSourceType(source.url);
        const identityConfirmed = emailMatch.titleRatio >= 0.5 && (emailMatch.locationMatch || emailMatch.domainMatch);
        const ownership = classifyEmailOwnership(contact.email, lead, source.url, sourceType);
        const verified = identityConfirmed && ownership === 'verified';
        contacts.push({ ...contact, status: verified ? 'verified' : 'possible', sourceUrl: source.url, sourceType, evidence: `Harvey search source contained a public email; company identity matched by ${emailMatch.domainMatch ? 'official-domain context' : 'location'}. Email ownership is ${ownership === 'verified' ? 'the official company domain' : 'not independently confirmed'}.`, confidence: verified ? Math.min(0.86, 0.65 + emailMatch.score * 0.3) : 0.58 });
      }
    } catch { /* one inaccessible candidate must not cancel other results */ }
  }
  const unique = dedupePublicContacts(contacts);
  const best = selectBestContactEmail(unique, officialDomain(lead));
  const providers = [...new Set(search.queries.map((item) => item.provider).filter(Boolean))].join(', ') || 'none';
  const attempts = search.attempts.map((item) => `${item.provider}: ${item.error ?? 'unavailable'}`).join(' | ');
  const metrics = (search.providers ?? []).map((item) => `${item.provider} raw=${item.rawResults} valid=${item.validUrls} relevant=${item.relevantSources}${item.accepted ? ' accepted' : ''}`).join(' | ');
  const hasResults = search.queries.some((item) => item.results.length > 0);
  const diagnostic: ContactDiagnostic = best ? 'found' : hasResults ? 'low_confidence' : 'search_unavailable';
  return { email: best?.email ?? '', instagram: unique.find((item) => item.socialNetwork === 'instagram')?.socialUrl ?? '', facebook: unique.find((item) => item.socialNetwork === 'facebook')?.socialUrl ?? '', status: best?.status === 'verified' ? 'verified' : best ? 'possible' : 'not_found', sourceUrl: best?.sourceUrl ?? unique[0]?.sourceUrl ?? '', confidence: best ? Math.round(best.confidence * 100) : 0, error: [attempts, metrics, `Harvey providers: ${providers}.`].filter(Boolean).join(' | '), origin: 'public_search', diagnostic, contacts: unique };
}

async function discoverFromPublicSearch(lead: PublicLead): Promise<ContactDiscovery> {
  return discoverFromSearchResults(lead, await searchWithContactBridge(lead));
}

export function parsePublicSearchResults(html: string): SearchResult[] {
  return [...html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
    let url = match[1]; try { url = new URL(url, 'https://html.duckduckgo.com').searchParams.get('uddg') ?? url; } catch { /* keep raw */ }
    const start = match.index ?? 0;
    const nearby = html.slice(start, start + 2_000);
    return { url, title: cleanName(htmlToText(match[2])), snippet: cleanName(htmlToText(nearby.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? '')) };
  }).filter((item, index, all) => isPublicUrl(item.url) && all.findIndex((other) => other.url === item.url) === index).slice(0, 12);
}

export function searchResultPagePriority(result: { url: string; title?: string; snippet?: string }) {
  const corpus = `${result.url} ${result.title ?? ''} ${result.snippet ?? ''}`.toLowerCase();
  if (/\/career(?:s)?(?:\/|$)|\/job(?:s)?(?:\/|$)|\/employment(?:\/|$)|\bcareer(?:s)?\b|\bjob(?:s)?\b|\/privacy(?:-policy)?(?:\/|$)|\/terms(?:-of-service)?(?:\/|$)/.test(corpus)) return -0.1;
  if (/\/contact(?:-us)?(?:\/|$)|\/get-in-touch(?:\/|$)|\bcontact us\b|\bemail us\b/.test(corpus)) return 0.2;
  if (/\/location(?:s)?(?:\/|$)|\/about(?:-us)?(?:\/|$)|\/service(?:s)?(?:\/|$)|\/team(?:\/|$)/.test(corpus)) return 0.1;
  return 0;
}

export function selectBestContactEmail(contacts: PublicContact[], officialDomainValue = '') {
  const normalizedOfficialDomain = officialDomainValue.replace(/^www\./i, '').toLowerCase();
  const inboxRank = (contact: PublicContact) => {
    const local = normalizeEmail(contact.email).split('@')[0];
    const rank = PREFERRED_GENERAL_INBOX_LOCALS.indexOf(local as typeof PREFERRED_GENERAL_INBOX_LOCALS[number]);
    return rank < 0 ? PREFERRED_GENERAL_INBOX_LOCALS.length : rank;
  };
  const score = (contact: PublicContact) => {
    const email = normalizeEmail(contact.email);
    const domain = email.split('@')[1] ?? '';
    const official = Boolean(normalizedOfficialDomain && (domain === normalizedOfficialDomain || domain.endsWith(`.${normalizedOfficialDomain}`)));
    const sourceOfficial = contact.sourceType === 'official_website';
    const thirdParty = !official && /registrar|registry|vendor|supplier|hosting|payments?|bank|provider/i.test(domain);
    return (contact.status === 'verified' ? 40 : contact.status === 'possible' ? 20 : 0)
      + (sourceOfficial ? 35 : 0)
      + (official ? 70 : 0)
      + Math.max(0, PREFERRED_GENERAL_INBOX_LOCALS.length - inboxRank(contact))
      + Math.round(contact.confidence * 20)
      + (thirdParty ? -35 : 0);
  };
  return contacts.filter((item) => item.email && !isThirdPartyAdministrativeContact(item, normalizedOfficialDomain)).sort((a, b) => score(b) - score(a) || b.confidence - a.confidence)[0];
}

function externalSourceType(url: string): PublicContact['sourceType'] {
  if (/instagram|facebook|linkedin/i.test(url)) return 'public_profile';
  if (/\.pdf(?:$|\?)/i.test(url)) return 'public_document';
  return 'directory';
}

async function discoverFromDuckDuckGoHtml(lead: PublicLead): Promise<ContactDiscovery> {
  const context = [lead.title, lead.city, lead.region, lead.country_code].filter(Boolean).join(' ');
  const domain = officialDomain(lead);
  const queries = publicSearchQueries(lead);
  const cacheKey = normalizeText(`${lead.title}|${lead.city}|${lead.region}|${domain}|${queries.join('|')}`);
  const cached = publicSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  try {
    const pages = await Promise.all(queries.map(async (query) => {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(8_000), headers: { 'user-agent': 'Google-Capture-ContactDiscovery/0.4 (+local)' } });
      if (!response.ok) throw new Error(`Public search unavailable (${response.status}).`);
      return response.text();
    }));
    const results = pages.flatMap(parsePublicSearchResults).filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index).map((item) => ({ ...item, match: identityMatch(lead, `${item.title} ${item.snippet}`, item.url) })).filter((item) => item.match.titleRatio >= 0.5).sort((a, b) => b.match.score - a.match.score).slice(0, 6);
    const searchContacts: PublicContact[] = [];
    for (const result of results.slice(0, 3)) {
      const snippetEmails = [...new Set((`${result.title} ${result.snippet}`.match(emailPattern) ?? []).map(normalizeEmail))];
      for (const email of snippetEmails) {
        const match = identityMatch(lead, `${result.title} ${result.snippet}`, result.url, email);
        searchContacts.push({ name: '', role: '', email, phone: '', socialUrl: '', socialNetwork: '', status: 'possible', sourceUrl: result.url, sourceType: 'search_result', extractionMethod: 'search_result', evidence: `Email appeared in a public search result for “${result.title}”; the snippet is not sufficient to verify ownership.`, confidence: Math.min(0.75, 0.45 + match.score * 0.3) });
      }
      if (/^https?:\/\/(?:www\.)?(?:instagram|facebook|linkedin)\.com/i.test(result.url)) {
        const network = /instagram/i.test(result.url) ? 'instagram' : /facebook/i.test(result.url) ? 'facebook' : 'linkedin';
        const socialUrl = normalizeSocial(result.url, network as 'instagram' | 'facebook' | 'linkedin');
        if (socialUrl) searchContacts.push({ name: '', role: '', email: '', phone: '', socialUrl, socialNetwork: network as PublicContact['socialNetwork'], status: 'possible', sourceUrl: result.url, sourceType: 'public_profile', extractionMethod: 'search_result', evidence: `Public ${network} result matched the business name; external profile ownership remains unconfirmed.`, confidence: Math.min(0.7, 0.45 + result.match.score * 0.25) });
      }
      try {
        const source = await fetchHtml(result.url);
        const text = htmlToText(source.html);
        const match = identityMatch(lead, text, source.url);
        if (match.titleRatio < 0.5 || (!match.locationMatch && !match.domainMatch)) continue;
        for (const contact of extractPublicContacts(source.html).contacts.filter((item) => item.email)) {
          const emailMatch = identityMatch(lead, text, source.url, contact.email);
          const sourceType = externalSourceType(source.url);
          const identityConfirmed = emailMatch.titleRatio >= 0.5 && (emailMatch.locationMatch || emailMatch.domainMatch);
          const ownership = classifyEmailOwnership(contact.email, lead, source.url, sourceType);
          const verified = identityConfirmed && ownership === 'verified';
          searchContacts.push({ ...contact, status: verified ? 'verified' : 'possible', sourceUrl: source.url, sourceType, evidence: `Public email found on ${sourceType?.replace('_', ' ')} page “${source.url}”; business identity matched, but email ownership is ${ownership === 'verified' ? 'the official company domain' : 'not independently confirmed'}.`, confidence: verified ? Math.min(0.86, 0.65 + emailMatch.score * 0.3) : 0.58 });
        }
      } catch { /* one source must not block the remaining candidates */ }
    }
    const unique = dedupePublicContacts(searchContacts);
    const best = selectBestContactEmail(unique, domain);
    const result: ContactDiscovery = { email: best?.email ?? '', instagram: unique.find((item) => item.socialNetwork === 'instagram')?.socialUrl ?? '', facebook: unique.find((item) => item.socialNetwork === 'facebook')?.socialUrl ?? '', status: best?.status === 'verified' ? 'verified' : unique.length ? 'possible' : 'not_found', sourceUrl: best?.sourceUrl ?? unique[0]?.sourceUrl ?? 'https://html.duckduckgo.com/', confidence: best ? Math.round(best.confidence * 100) : unique.length ? 55 : 0, error: '', origin: 'public_search', diagnostic: unique.length ? 'found' : results.length ? 'low_confidence' : 'not_found', contacts: unique };
    publicSearchCache.set(cacheKey, { expiresAt: Date.now() + publicSearchTtlMs, result });
    return result;
  } catch (error) { const result = { email: '', instagram: '', facebook: '', status: 'not_found' as const, sourceUrl: '', confidence: 0, error: error instanceof Error ? error.message : 'Public search provider failed.', origin: 'public_search' as const, diagnostic: 'search_unavailable' as const, contacts: noContacts() }; publicSearchCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, result }); return result; }
}

export async function discoverContacts(lead: PublicLead): Promise<ContactDiscovery> {
  if (!lead.website_empty && lead.website) {
    const official = await discoverFromWebsite(lead);
    // External search is complementary: verified official evidence ends the
    // run; an unavailable or merely possible website result can be enriched.
    if (official.status === 'verified' && official.email) return official;
    if (publicSearchProvider() === 'harvey') {
      const searched = await discoverFromPublicSearch(lead);
      const contacts = dedupePublicContacts([...official.contacts, ...searched.contacts]);
      const best = selectBestContactEmail(contacts, officialDomain(lead));
      if (!best) return { ...official, email: '', status: official.email ? official.status : 'not_found', confidence: official.email ? official.confidence : 0, error: [official.error, searched.error].filter(Boolean).join('; '), diagnostic: searched.diagnostic, contacts };
      return { email: best?.email ?? official.email, instagram: official.instagram || searched.instagram, facebook: official.facebook || searched.facebook, status: best?.status === 'verified' ? 'verified' : official.status === 'verified' ? 'verified' : 'possible', sourceUrl: best?.sourceUrl || official.sourceUrl || searched.sourceUrl, confidence: best ? Math.round(best.confidence * 100) : Math.max(official.confidence, searched.confidence), error: [official.error, searched.error].filter(Boolean).join('; '), origin: best?.sourceType === 'official_website' ? 'official_website' : 'public_search', diagnostic: searched.diagnostic, contacts };
    }
    if (publicSearchProvider() !== 'duckduckgo_html') return official;
    const searched = await discoverFromDuckDuckGoHtml(lead);
    const contacts = dedupePublicContacts([...official.contacts, ...searched.contacts]);
    const best = selectBestContactEmail(contacts, officialDomain(lead));
    const combinedError = official.error && searched.error ? `Official website: ${official.error}; public search: ${searched.error}` : official.error || searched.error;
    if (!best) return { ...official, email: '', status: official.email ? official.status : 'not_found', confidence: official.email ? official.confidence : 0, error: combinedError, diagnostic: searched.diagnostic === 'search_unavailable' ? 'search_unavailable' : official.diagnostic, contacts };
    return { email: best?.email ?? official.email, instagram: official.instagram || searched.instagram, facebook: official.facebook || searched.facebook, status: best?.status === 'verified' ? 'verified' : official.status === 'verified' ? 'verified' : 'possible', sourceUrl: best?.sourceUrl || official.sourceUrl || searched.sourceUrl, confidence: best ? Math.round(best.confidence * 100) : Math.max(official.confidence, searched.confidence), error: combinedError, origin: best?.sourceType === 'official_website' ? 'official_website' : best ? 'public_search' : official.origin, diagnostic: 'found', contacts };
  }
  // External adapters are opt-in. No CAPTCHA handling, account login, or retry circumvention is implemented.
  if (publicSearchProvider() === 'duckduckgo_html') return discoverFromDuckDuckGoHtml(lead);
  return { email: '', instagram: '', facebook: '', status: 'not_found', sourceUrl: '', confidence: 0, error: 'No website is listed. Enable a public search adapter to check external profiles.', origin: '', diagnostic: 'not_found', contacts: noContacts() };
}
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { chromium } from 'playwright';
