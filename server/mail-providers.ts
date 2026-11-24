import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { lookup } from "node:dns";
import { request as httpsRequest } from "node:https";

// Provider boundaries follow Harvey's MIT-licensed MailProvider,
// GmailProvider and SmtpImapProvider contracts:
// https://github.com/ethanplusai/harvey/tree/main/harvey/integrations

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const gmailTokenUrl = "https://oauth2.googleapis.com/token";
const gmailProfileUrl = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

export type GmailToken = { accessToken: string; refreshToken?: string; expiresAt: number; email: string; displayName?: string; scopes?: string[] };
export type GmailConfig = { clientId: string; clientSecret: string; redirectUri: string };

export type GmailFailureStage = "token_exchange" | "profile_lookup" | "token_refresh" | "send";
export type GmailFailureCategory = "provider_rejected" | "access_denied" | "missing_token" | "missing_account" | "network";

/** Safe, structured provider failure. It intentionally does not retain response bodies. */
export class GmailProviderError extends Error {
  constructor(
    message: string,
    readonly stage: GmailFailureStage,
    readonly category: GmailFailureCategory,
    readonly status?: number,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "GmailProviderError";
  }
}

function providerError(message: string): Error { return new Error(message.replace(/[\r\n].*$/s, "")); }
function safeProviderCode(value: unknown): string | undefined {
  const code = typeof value === "string" ? value : "";
  return /^[a-z][a-z0-9_.-]{1,63}$/i.test(code) ? code : undefined;
}
async function providerBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = await response.json() as unknown;
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch { return {}; }
}
function gmailTokenFailure(response: Response, body: Record<string, unknown>): GmailProviderError {
  const providerCode = safeProviderCode(body.error);
  const category: GmailFailureCategory = providerCode === "access_denied" ? "access_denied" : "provider_rejected";
  return new GmailProviderError("Gmail authorization was rejected by Google.", "token_exchange", category, response.status, providerCode);
}

/**
 * Zoho endpoints are reachable from this local runtime over IPv4, while the
 * Node/Undici resolver can otherwise select an unreachable IPv6 address. Keep
 * this narrowly scoped to Zoho instead of changing DNS behavior globally.
 */
async function zohoFetch(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Response> {
  if (fetchImpl !== fetch) return fetchImpl(url, init);
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: init.method,
      headers: init.headers as Record<string, string> | undefined,
      lookup: (hostname, options, callback) => lookup(hostname, { ...options, family: 4 }, callback),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 502, headers }));
      });
    });
    request.once("error", reject);
    if (init.body) request.write(init.body instanceof URLSearchParams ? init.body.toString() : String(init.body));
    request.end();
  });
}

export function gmailAuthorizationUrl(config: GmailConfig, state: string): string {
  // This app supports more than one Gmail sender. Force the Google account
  // picker instead of silently reusing the browser's last Google session.
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", access_type: "offline", prompt: "select_account consent", scope: `${GMAIL_READONLY_SCOPE} ${GMAIL_SEND_SCOPE}`, state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(config: GmailConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<GmailToken> {
  const response = await fetchImpl(gmailTokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }) });
  const body = await providerBody(response);
  if (!response.ok) throw gmailTokenFailure(response, body);
  const accessToken = String(body.access_token ?? "");
  if (!accessToken) throw new GmailProviderError("Gmail did not return an access token.", "token_exchange", "missing_token", response.status);
  const profile = await gmailProfile(accessToken, fetchImpl);
  return { accessToken, refreshToken: body.refresh_token ? String(body.refresh_token) : undefined, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000, email: profile.email, scopes: typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE] };
}

async function gmailProfile(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ email: string }> {
  const response = await fetchImpl(gmailProfileUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await providerBody(response);
  if (!response.ok) {
    const providerCode = safeProviderCode((body.error as Record<string, unknown> | undefined)?.status) ?? safeProviderCode(body.error);
    throw new GmailProviderError(
      response.status === 401 ? "Gmail authorization expired." : "Google authorized the connection, but the Gmail profile could not be read.",
      "profile_lookup",
      response.status === 401 ? "access_denied" : "provider_rejected",
      response.status,
      providerCode,
    );
  }
  const email = typeof body.emailAddress === "string" ? body.emailAddress : "";
  if (!email) throw new GmailProviderError("Gmail returned no account address.", "profile_lookup", "missing_account", response.status);
  return { email };
}

export async function testGmail(token: GmailToken, config: GmailConfig, fetchImpl: typeof fetch = fetch): Promise<GmailToken> {
  if (token.expiresAt <= Date.now() + 60_000 && token.refreshToken) {
    const response = await fetchImpl(gmailTokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: token.refreshToken, grant_type: "refresh_token" }) });
    const body = await providerBody(response);
    if (!response.ok) {
      const providerCode = safeProviderCode(body.error);
      throw new GmailProviderError("Gmail authorization expired; reconnect the account.", "token_refresh", "access_denied", response.status, providerCode);
    }
    token = { ...token, accessToken: String(body.access_token ?? ""), expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  }
  const profile = await gmailProfile(token.accessToken, fetchImpl);
  return { ...token, email: profile.email };
}

export type OutboundMail = { toEmail: string; subject: string; htmlBody: string };
export type MailSendResult = { messageId: string; threadRef?: string; refreshedToken?: GmailToken | ZohoToken };
function hasScope(scopes: string[] | undefined, required: string): boolean { return Boolean(scopes?.includes(required)); }
function mimeHeader(value: string): string { return `=?UTF-8?B?${Buffer.from(value.replace(/[\r\n]+/g, " "), "utf8").toString("base64")}?=`; }
// Keep the client application's normal compose font and size. Hard-coding a
// small font makes provider-sent messages look unlike ordinary mail.
const outreachEmailStyle = "line-height: 1.5; color: #202124; text-align: left;";
const outreachParagraphStyle = "margin: 0 0 16px 0; line-height: 1.5; color: #202124; text-align: left;";

/** Converts the plain-text draft stored in the Outbox into safe, paragraph-based HTML. */
export function formatOutreachEmailHtml(body: string): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  const paragraphs = body.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean)
    .map((paragraph) => `<p style="${outreachParagraphStyle}">${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="${outreachEmailStyle}">${paragraphs}</div>`;
}

function gmailRawMessage(input: OutboundMail, from: string, displayName?: string): string {
  const safeName = displayName?.replace(/[\r\n]+/g, " ").trim();
  const fromHeader = safeName ? `${mimeHeader(safeName)} <${from}>` : from;
  return [`From: ${fromHeader}`, `To: ${input.toEmail.replace(/[\r\n]+/g, "")}`, `Subject: ${mimeHeader(input.subject)}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "", input.htmlBody].join("\r\n");
}
function base64Url(value: string): string { return Buffer.from(value, "utf8").toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, ""); }
export async function sendGmailMessage(token: GmailToken, config: GmailConfig, input: OutboundMail, fetchImpl: typeof fetch = fetch): Promise<MailSendResult> {
  if (!hasScope(token.scopes, GMAIL_SEND_SCOPE)) throw new GmailProviderError("A conta Gmail precisa ser reconectada com permissão de envio.", "send", "access_denied");
  if (token.expiresAt <= Date.now() + 60_000) token = await testGmail(token, config, fetchImpl);
  try {
    const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: base64Url(gmailRawMessage(input, token.email, token.displayName)) }) });
    const body = await providerBody(response);
    if (!response.ok) throw new GmailProviderError("Gmail rejeitou o envio.", "send", "provider_rejected", response.status, safeProviderCode(body.error));
    const messageId = typeof body.id === "string" ? body.id : "";
    if (!messageId) throw new GmailProviderError("Gmail não confirmou o envio.", "send", "provider_rejected", response.status);
    return { messageId, threadRef: typeof body.threadId === "string" ? body.threadId : undefined };
  } catch (error) { if (error instanceof GmailProviderError) throw error; throw new GmailProviderError("Não foi possível confirmar o resultado do envio Gmail.", "send", "network"); }
}

type LineConnection = { socket: Socket | TLSSocket; read: (timeoutMs?: number) => Promise<string>; send: (line: string) => Promise<string>; close: () => void };
function lineConnection(socket: Socket | TLSSocket, service: "SMTP" | "IMAP"): LineConnection {
  let buffer = ""; const waiters: Array<(value: string) => void> = []; let error: Error | null = null;
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => { buffer += chunk; let index = buffer.indexOf("\n"); while (index >= 0) { const line = buffer.slice(0, index + 1); buffer = buffer.slice(index + 1); waiters.shift()?.(line); index = buffer.indexOf("\n"); } });
  socket.on("error", (reason) => { error = providerError(`Mail server connection failed: ${reason instanceof Error ? reason.message : "network error"}`); while (waiters.length) waiters.shift()?.(""); });
  const read = (timeoutMs = 12_000) => new Promise<string>((resolve, reject) => { if (error) return reject(error); const timer = setTimeout(() => reject(providerError(`Zoho ${service} server response timed out.`)), timeoutMs); waiters.push((value) => { clearTimeout(timer); if (!value) reject(error ?? providerError(`Zoho ${service} server closed the connection.`)); else resolve(value); }); });
  const send = async (line: string) => { socket.write(`${line}\r\n`); return read(); };
  return { socket, read, send, close: () => socket.destroy() };
}
function connectionError(service: "SMTP" | "IMAP", stage: "TCP" | "TLS", reason: unknown): Error { const code = (reason as NodeJS.ErrnoException | undefined)?.code; if (code === "ETIMEDOUT") return providerError(`Zoho ${service} ${stage} connection timed out.`); if (code === "ECONNREFUSED") return providerError(`Zoho ${service} server refused the connection.`); if (code === "ENETUNREACH" || code === "EHOSTUNREACH") return providerError(`Zoho ${service} network is unreachable.`); return providerError(`Zoho ${service} ${stage} connection failed.`); }
function openTls(host: string, port: number, service: "SMTP" | "IMAP"): Promise<TLSSocket> { return new Promise((resolve, reject) => { const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true }); const timer = setTimeout(() => { socket.destroy(); reject(providerError(`Zoho ${service} TLS connection timed out.`)); }, 12_000); socket.once("secureConnect", () => { clearTimeout(timer); resolve(socket); }); socket.once("error", (error) => { clearTimeout(timer); reject(connectionError(service, "TLS", error)); }); }); }
function openStartTls(host: string, port: number, service: "SMTP" = "SMTP"): Promise<Socket> { return new Promise((resolve, reject) => { const socket = netConnect({ host, port }); const timer = setTimeout(() => { socket.destroy(); reject(providerError(`Zoho ${service} TCP connection timed out.`)); }, 12_000); socket.once("connect", () => { clearTimeout(timer); resolve(socket); }); socket.once("error", (error) => { clearTimeout(timer); reject(connectionError(service, "TCP", error)); }); }); }
function statusCode(line: string): number { return Number.parseInt(line.slice(0, 3), 10); }
function imapQuote(value: string): string { return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`; }

export type ZohoConfig = { email: string; password: string; smtpHost?: string; smtpPort?: number; imapHost?: string; imapPort?: number };
export type ZohoOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string; accountsDomain: string; apiDomain?: string };
export type ZohoToken = { accessToken: string; refreshToken?: string; expiresAt: number; email: string; displayName?: string; apiDomain: string; accountId?: string; scopes?: string[] };
export const ZOHO_MAIL_ACCOUNTS_SCOPE = "ZohoMail.accounts.READ";
export const ZOHO_MAIL_SEND_SCOPE = "ZohoMail.messages.CREATE";
export function zohoAuthorizationUrl(config: ZohoOAuthConfig, state: string): string { const params = new URLSearchParams({ client_id: config.clientId, response_type: "code", redirect_uri: config.redirectUri, scope: `${ZOHO_MAIL_ACCOUNTS_SCOPE},${ZOHO_MAIL_SEND_SCOPE}`, access_type: "offline", prompt: "consent", state }); return `${config.accountsDomain.replace(/\/$/, "")}/oauth/v2/auth?${params.toString()}`; }
function zohoMailDomain(accountsDomain: string, configuredDomain?: string, returnedDomain?: string): string {
  const candidates = [configuredDomain, returnedDomain].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (/^mail\.zoho\./i.test(url.hostname)) return url.origin;
    } catch { /* fall through to the regional accounts domain */ }
  }
  try {
    const url = new URL(accountsDomain);
    if (/^accounts\.zoho\./i.test(url.hostname)) return `${url.protocol}//${url.hostname.replace(/^accounts\./i, "mail.")}`;
  } catch { /* use the documented default below */ }
  return "https://mail.zoho.com";
}
type ZohoSendMailDetail = { fromAddress?: unknown; displayName?: unknown; status?: unknown; validated?: unknown };
type ZohoAccountRecord = { type?: unknown; accountId?: unknown; primaryEmailAddress?: unknown; mailboxAddress?: unknown; incomingUserName?: unknown; emailAddress?: unknown; accountDisplayName?: unknown; displayName?: unknown; sendMailDetails?: unknown };
function accountEmail(record: ZohoAccountRecord): string {
  const direct = [record.primaryEmailAddress, record.mailboxAddress, record.incomingUserName].find((value): value is string => typeof value === "string" && /^\S+@\S+\.\S+$/.test(value));
  if (direct) return direct;
  if (Array.isArray(record.emailAddress)) {
    const addresses = record.emailAddress.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");
    const primary = addresses.find((value) => value.isPrimary === true) ?? addresses[0];
    const mailId = primary?.mailId;
    if (typeof mailId === "string" && /^\S+@\S+\.\S+$/.test(mailId)) return mailId;
  }
  if (typeof record.emailAddress === "string" && /^\S+@\S+\.\S+$/.test(record.emailAddress)) return record.emailAddress;
  return "";
}
function accountDisplayName(record: ZohoAccountRecord, email: string): string {
  const details = Array.isArray(record.sendMailDetails)
    ? record.sendMailDetails.filter((value): value is ZohoSendMailDetail => Boolean(value) && typeof value === "object")
    : [];
  const matching = details.find((detail) => detail.fromAddress === email && typeof detail.displayName === "string" && detail.displayName.trim());
  const configured = matching?.displayName ?? record.accountDisplayName ?? record.displayName;
  return typeof configured === "string" ? configured.trim() : "";
}
export async function exchangeZohoCode(config: ZohoOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<ZohoToken> { const response = await zohoFetch(`${config.accountsDomain.replace(/\/$/, "")}/oauth/v2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }) }, fetchImpl); if (!response.ok) throw providerError(`Zoho OAuth exchange failed (${response.status}).`); const body = await response.json() as Record<string, unknown>; const token = String(body.access_token ?? ""); if (!token) throw providerError("Zoho did not return an access token."); const apiDomain = zohoMailDomain(config.accountsDomain, config.apiDomain, typeof body.api_domain === "string" ? body.api_domain : undefined); const profile = await zohoAccounts(token, apiDomain, fetchImpl); return { accessToken: token, refreshToken: body.refresh_token ? String(body.refresh_token) : undefined, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000, email: profile.email, displayName: profile.displayName, accountId: profile.accountId, apiDomain, scopes: typeof body.scope === "string" ? body.scope.split(/[ ,]+/).filter(Boolean) : [ZOHO_MAIL_ACCOUNTS_SCOPE, ZOHO_MAIL_SEND_SCOPE] }; }
async function zohoAccounts(accessToken: string, apiDomain: string, fetchImpl: typeof fetch = fetch): Promise<{ email: string; displayName?: string; accountId?: string }> { const response = await zohoFetch(`${apiDomain.replace(/\/$/, "")}/api/accounts`, { headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${accessToken}` } }, fetchImpl); if (!response.ok) throw providerError(response.status === 401 ? "Zoho authorization expired." : `Zoho account lookup failed (${response.status}).`); const body = await response.json() as { data?: ZohoAccountRecord[] }; const records = Array.isArray(body.data) ? body.data.filter((record) => record && record.type !== "IMAP_ACCOUNT") : []; const match = records.map((record) => { const email = accountEmail(record); return { email, displayName: email ? accountDisplayName(record, email) : "", accountId: typeof record.accountId === "string" || typeof record.accountId === "number" ? String(record.accountId) : undefined }; }).find((record) => record.email); if (!match) throw providerError("Zoho returned no account address."); return match; }
export async function testZohoOAuth(token: ZohoToken, config: ZohoOAuthConfig, fetchImpl: typeof fetch = fetch): Promise<ZohoToken> { if (token.expiresAt <= Date.now() + 60_000) { if (!token.refreshToken) throw providerError("Zoho authorization expired; reconnect the account."); const response = await zohoFetch(`${config.accountsDomain.replace(/\/$/, "")}/oauth/v2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: token.refreshToken ?? "", client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" }) }, fetchImpl); if (!response.ok) throw providerError("Zoho authorization expired; reconnect the account."); const body = await providerBody(response); const accessToken = String(body.access_token ?? ""); if (!accessToken) throw providerError("Zoho authorization expired; reconnect the account."); token = { ...token, accessToken, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 }; } const profile = await zohoAccounts(token.accessToken, token.apiDomain, fetchImpl); return { ...token, email: profile.email, displayName: profile.displayName, accountId: profile.accountId ?? token.accountId }; }
export async function sendZohoMessage(token: ZohoToken, config: ZohoOAuthConfig, input: OutboundMail, fetchImpl: typeof fetch = fetch): Promise<MailSendResult> { if (!hasScope(token.scopes, ZOHO_MAIL_SEND_SCOPE)) throw providerError("A conta Zoho precisa ser reconectada com permissão de envio."); if (!token.accountId) throw providerError("A conta Zoho não possui identificador de caixa postal."); let activeToken = token; let refreshedToken: ZohoToken | undefined; if (activeToken.expiresAt <= Date.now() + 60_000) { refreshedToken = await testZohoOAuth(activeToken, config, fetchImpl); activeToken = refreshedToken; } const accountId = activeToken.accountId; if (!accountId) throw providerError("A conta Zoho não possui identificador de caixa postal."); let response: Response; try { response = await zohoFetch(`${activeToken.apiDomain.replace(/\/$/, "")}/api/accounts/${encodeURIComponent(accountId)}/messages`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${activeToken.accessToken}` }, body: JSON.stringify({ fromAddress: activeToken.email, toAddress: input.toEmail, subject: input.subject, content: input.htmlBody }) }, fetchImpl); } catch { throw providerError("Não foi possível confirmar o resultado do envio Zoho."); } const body = await providerBody(response); if (!response.ok) throw providerError(`Zoho rejeitou o envio (${response.status}).`); const messageId = typeof body.messageId === "string" ? body.messageId : typeof body.data === "object" && body.data && typeof (body.data as Record<string, unknown>).messageId === "string" ? String((body.data as Record<string, unknown>).messageId) : "zoho-accepted"; return refreshedToken ? { messageId, refreshedToken } : { messageId }; }
export function validateZohoConfig(config: Pick<ZohoConfig, "email" | "password">): boolean { return /^\S+@\S+\.\S+$/.test(config.email.trim()) && config.password.length > 0; }
export async function testZoho(config: ZohoConfig): Promise<{ email: string }> {
  const smtpHost = config.smtpHost || "smtp.zoho.com"; const smtpPort = Number(config.smtpPort || 587); const imapHost = config.imapHost || "imap.zoho.com"; const imapPort = Number(config.imapPort || 993);
  let smtp: LineConnection | undefined; let imap: LineConnection | undefined;
  try {
    smtp = lineConnection(smtpPort === 465 ? await openTls(smtpHost, smtpPort, "SMTP") : await openStartTls(smtpHost, smtpPort), "SMTP");
    if (statusCode(await smtp.read()) >= 400) throw providerError("Zoho SMTP greeting was rejected.");
    let response = await smtp.send("EHLO google-capture");
    if (smtpPort !== 465) { response = await smtp.send("STARTTLS"); if (statusCode(response) >= 400) throw providerError("Zoho SMTP TLS negotiation was rejected."); const rawSocket = smtp.socket; rawSocket.removeAllListeners("data"); rawSocket.removeAllListeners("error"); smtp = lineConnection(await new Promise<TLSSocket>((resolve, reject) => { const socket = tlsConnect({ socket: rawSocket, servername: smtpHost, rejectUnauthorized: true }); const timer = setTimeout(() => { socket.destroy(); reject(providerError("Zoho SMTP TLS connection timed out.")); }, 12_000); socket.once("secureConnect", () => { clearTimeout(timer); resolve(socket); }); socket.once("error", (error) => { clearTimeout(timer); reject(connectionError("SMTP", "TLS", error)); }); }), "SMTP"); response = await smtp.send("EHLO google-capture"); }
    if (statusCode(response) >= 400 || statusCode(await smtp.send("AUTH LOGIN")) >= 400 || statusCode(await smtp.send(Buffer.from(config.email).toString("base64"))) >= 400 || statusCode(await smtp.send(Buffer.from(config.password).toString("base64"))) >= 400) throw providerError("Zoho SMTP authentication failed.");
    await smtp.send("QUIT");
    imap = lineConnection(await openTls(imapHost, imapPort, "IMAP"), "IMAP"); await imap.read(); const login = await imap.send(`A001 LOGIN ${imapQuote(config.email)} ${imapQuote(config.password)}`); if (!/A001\s+OK/i.test(login)) throw providerError("Zoho IMAP authentication failed. Check that IMAP access is enabled for this mailbox and plan."); await imap.send("A002 LOGOUT");
    return { email: config.email };
  } finally { smtp?.close(); imap?.close(); }
}
