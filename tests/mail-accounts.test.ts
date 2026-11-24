import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EncryptedMailAccountStore } from "../server/mail-account-store.js";
import { PendingOAuthState, zohoCallbackFailure } from "../server/mail-oauth-state.js";
import { exchangeGmailCode, exchangeZohoCode, formatOutreachEmailHtml, GmailProviderError, GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE, gmailAuthorizationUrl, sendGmailMessage, sendZohoMessage, testGmail, testZoho, testZohoOAuth, validateZohoConfig, zohoAuthorizationUrl, ZOHO_MAIL_ACCOUNTS_SCOPE, ZOHO_MAIL_SEND_SCOPE } from "../server/mail-providers.js";

test("mail credentials are encrypted and round-trip without plaintext", async () => {
  const dir = await mkdtemp(join(tmpdir(), "google-capture-mail-")); const path = join(dir, "accounts.enc");
  try {
    const store = new EncryptedMailAccountStore(path, Buffer.alloc(32, 7).toString("base64"));
    await store.upsert("account-1", { provider: "zoho", email: "owner@example.com", password: "super-secret-app-password" });
    const raw = await readFile(path, "utf8");
    assert.equal(raw.includes("super-secret-app-password"), false);
    assert.deepEqual(await store.get("account-1"), { provider: "zoho", email: "owner@example.com", password: "super-secret-app-password" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("mail store refuses to persist without an encryption key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "google-capture-mail-"));
  try { const store = new EncryptedMailAccountStore(join(dir, "accounts.enc"), ""); await assert.rejects(() => store.upsert("x", { provider: "zoho", email: "a@example.com", password: "secret" }), /ENCRYPTION_KEY/); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test("sender display name persists with encrypted OAuth credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "google-capture-mail-")); const path = join(dir, "accounts.enc");
  try {
    const store = new EncryptedMailAccountStore(path, Buffer.alloc(32, 9).toString("base64"));
    await store.upsert("gmail-1", { provider: "gmail", email: "sender@example.com", accessToken: "access", refreshToken: "refresh", displayName: "Luan Oliveira" });
    const raw = await readFile(path, "utf8");
    assert.equal(raw.includes("Luan Oliveira"), false);
    assert.equal((await store.get("gmail-1"))?.displayName, "Luan Oliveira");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Zoho OAuth secrets are encrypted after a successful account identification", async () => {
  const dir = await mkdtemp(join(tmpdir(), "google-capture-mail-")); const path = join(dir, "accounts.enc");
  try {
    const store = new EncryptedMailAccountStore(path, Buffer.alloc(32, 3).toString("base64"));
    await store.upsert("zoho-oauth", { provider: "zoho", email: "owner@zoho.eu", accessToken: "access-token", refreshToken: "refresh-token", expiresAt: 123, apiDomain: "https://mail.zoho.eu" });
    const raw = await readFile(path, "utf8");
    assert.equal(raw.includes("access-token"), false); assert.equal(raw.includes("refresh-token"), false);
    assert.deepEqual(await store.get("zoho-oauth"), { provider: "zoho", email: "owner@zoho.eu", accessToken: "access-token", refreshToken: "refresh-token", expiresAt: 123, apiDomain: "https://mail.zoho.eu" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Zoho popup callback state is server-side, one-time, and does not invalidate another attempt", () => {
  const attempts = new PendingOAuthState<{ accountId: string }>();
  attempts.create("valid-state", { accountId: "account-1" }, 1_000);
  attempts.create("other-state", { accountId: "account-2" }, 1_000);
  assert.equal(attempts.consume("invalid-state", 1_100), null);
  assert.deepEqual(attempts.consume("valid-state", 1_100), { accountId: "account-1" });
  assert.equal(attempts.consume("valid-state", 1_100), null);
  assert.deepEqual(attempts.consume("other-state", 1_100), { accountId: "account-2" });
});

test("Zoho callback state expires after ten minutes", () => {
  const attempts = new PendingOAuthState<{ accountId: string }>();
  attempts.create("state", { accountId: "account-1" }, 1_000);
  assert.equal(attempts.consume("state", 601_001), null);
});

test("Gmail authorization requests profile and send scopes", () => {
  const url = new URL(gmailAuthorizationUrl({ clientId: "client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback" }, "state"));
  assert.equal(url.searchParams.get("scope"), `${GMAIL_READONLY_SCOPE} ${GMAIL_SEND_SCOPE}`); assert.equal(url.searchParams.get("client_secret"), null); assert.equal(url.searchParams.get("state"), "state");
  assert.equal(url.searchParams.get("prompt"), "select_account consent");
});

test("Gmail code exchange verifies the account profile and does not expose the client secret", async () => {
  const calls: Request[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Request(input, init));
    if (String(input).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify({ emailAddress: "owner@gmail.com" }), { status: 200 });
  }) as typeof fetch;
  const token = await exchangeGmailCode({ clientId: "client", clientSecret: "do-not-return", redirectUri: "http://127.0.0.1/callback" }, "code", fetchMock);
  assert.equal(token.email, "owner@gmail.com"); assert.equal(token.refreshToken, "refresh-token");
  assert.equal(calls[0].url.includes("do-not-return"), false); assert.equal(calls[1].headers.get("authorization"), "Bearer access-token");
});

test("Gmail exposes a safe profile-stage diagnosis for a forbidden Gmail API", async () => {
  const fetchMock = (async (input: RequestInfo | URL) => String(input).includes("oauth2.googleapis.com")
    ? new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 })
    : new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "do not retain this detail" } }), { status: 403 })) as typeof fetch;
  await assert.rejects(
    () => exchangeGmailCode({ clientId: "client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback" }, "code", fetchMock),
    (error: unknown) => {
      assert.ok(error instanceof GmailProviderError);
      assert.equal(error.stage, "profile_lookup");
      assert.equal(error.category, "provider_rejected");
      assert.equal(error.status, 403);
      assert.equal(error.message.includes("do not retain"), false);
      return true;
    },
  );
});

test("Gmail exposes a safe redirect mismatch diagnosis without retaining OAuth data", async () => {
  const fetchMock = (async () => new Response(JSON.stringify({ error: "redirect_uri_mismatch", error_description: "secret authorization code" }), { status: 400 })) as typeof fetch;
  await assert.rejects(
    () => exchangeGmailCode({ clientId: "client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback" }, "authorization-code", fetchMock),
    (error: unknown) => {
      assert.ok(error instanceof GmailProviderError);
      assert.equal(error.stage, "token_exchange");
      assert.equal(error.providerCode, "redirect_uri_mismatch");
      assert.equal(error.status, 400);
      assert.equal(error.message.includes("secret authorization code"), false);
      return true;
    },
  );
});

test("Zoho connection rejects malformed credentials before touching SMTP or IMAP", () => {
  assert.equal(validateZohoConfig({ email: "not-an-email", password: "app-password" }), false);
  assert.equal(validateZohoConfig({ email: "owner@zoho.com", password: "" }), false);
  assert.equal(validateZohoConfig({ email: "owner@zoho.com", password: "app-password" }), true);
});

test("Zoho reports the SMTP TCP failure before attempting credentials", async () => {
  await assert.rejects(() => testZoho({ email: "owner@example.com", password: "not-sent", smtpHost: "127.0.0.1", smtpPort: 1, imapHost: "127.0.0.1", imapPort: 1 }), /Zoho SMTP (TCP connection failed|server refused the connection)/);
});

test("Zoho OAuth requests account and send scopes and verifies the returned mailbox", async () => {
  const config = { clientId: "zoho-client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback", accountsDomain: "https://accounts.zoho.eu" };
  const url = new URL(zohoAuthorizationUrl(config, "state"));
  assert.equal(url.hostname, "accounts.zoho.eu"); assert.equal(url.searchParams.get("scope"), `${ZOHO_MAIL_ACCOUNTS_SCOPE},${ZOHO_MAIL_SEND_SCOPE}`); assert.equal(url.searchParams.get("client_secret"), null);
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => { if (String(input).includes("/token")) return new Response(JSON.stringify({ access_token: "zoho-access", refresh_token: "zoho-refresh", expires_in: 3600, api_domain: "https://mail.zoho.eu" }), { status: 200 }); assert.equal(new Headers(init?.headers).get("authorization"), "Zoho-oauthtoken zoho-access"); return new Response(JSON.stringify({ data: [{ primaryEmailAddress: "owner@zoho.eu" }] }), { status: 200 }); }) as typeof fetch;
  const token = await exchangeZohoCode(config, "code", fetchMock);
  assert.equal(token.email, "owner@zoho.eu"); assert.equal(token.apiDomain, "https://mail.zoho.eu");
});

test("Zoho parses the documented emailAddress array and ignores IMAP-only records", async () => {
  const requests: Request[] = [];
  const config = { clientId: "zoho-client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback", accountsDomain: "https://accounts.zoho.com" };
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); requests.push(request);
    if (String(input).includes("/token")) return new Response(JSON.stringify({ access_token: "zoho-access", refresh_token: "zoho-refresh", expires_in: 3600, api_domain: "https://www.zohoapis.com" }));
    return new Response(JSON.stringify({ status: { code: 200, description: "success" }, data: [
      { type: "ZOHO_ACCOUNT", emailAddress: [{ isAlias: true, isPrimary: false, mailId: "alias@example.com" }, { isAlias: false, isPrimary: true, mailId: "owner@zoho.com" }], sendMailDetails: [{ fromAddress: "owner@zoho.com", displayName: "Owner Creative", status: true }] },
      { type: "IMAP_ACCOUNT", incomingUserName: "imap@example.com" },
    ] }));
  }) as typeof fetch;
  const token = await exchangeZohoCode(config, "code", fetchMock);
  assert.equal(token.email, "owner@zoho.com");
  assert.equal(token.displayName, "Owner Creative");
  assert.equal(token.apiDomain, "https://mail.zoho.com");
  assert.equal(requests[1]?.url, "https://mail.zoho.com/api/accounts");
  assert.equal(requests[1]?.headers.get("accept"), "application/json");
  assert.equal(requests[1]?.headers.get("authorization"), "Zoho-oauthtoken zoho-access");
});

test("Zoho selects the first usable mailbox when multiple account records are returned", async () => {
  const config = { clientId: "zoho-client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback", accountsDomain: "https://accounts.zoho.eu" };
  const fetchMock = (async (input: RequestInfo | URL) => String(input).includes("/token")
    ? new Response(JSON.stringify({ access_token: "zoho-access", expires_in: 3600 }))
    : new Response(JSON.stringify({ data: [{ type: "ZOHO_ACCOUNT", primaryEmailAddress: "first@zoho.eu" }, { type: "ZOHO_ACCOUNT", primaryEmailAddress: "second@zoho.eu" }] }))) as typeof fetch;
  const token = await exchangeZohoCode(config, "code", fetchMock);
  assert.equal(token.email, "first@zoho.eu");
  assert.equal(token.apiDomain, "https://mail.zoho.eu");
});

test("Zoho rejects an empty account response with a safe lookup error", async () => {
  const config = { clientId: "zoho-client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback", accountsDomain: "https://accounts.zoho.com" };
  const fetchMock = (async (input: RequestInfo | URL) => String(input).includes("/token")
    ? new Response(JSON.stringify({ access_token: "zoho-access", expires_in: 3600 }))
    : new Response(JSON.stringify({ status: { code: 200, description: "success" }, data: [] }))) as typeof fetch;
  await assert.rejects(() => exchangeZohoCode(config, "code", fetchMock), /Zoho returned no account address/);
});

test("Zoho code exchange posts the exact regional endpoint and redirect URI", async () => {
  const requests: Request[] = [];
  const config = { clientId: "zoho-client", clientSecret: "server-only", redirectUri: "http://127.0.0.1:8787/auth/mail/zoho/callback", accountsDomain: "https://accounts.zoho.in" };
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => { const request = new Request(input, init); requests.push(request); if (String(input).includes("/token")) return new Response(JSON.stringify({ access_token: "zoho-access", refresh_token: "zoho-refresh", expires_in: 3600, api_domain: "https://mail.zoho.in" })); return new Response(JSON.stringify({ data: [{ primaryEmailAddress: "owner@zoho.in" }] })); }) as typeof fetch;
  await exchangeZohoCode(config, "authorization-code", fetchMock);
  assert.equal(requests[0]?.url, "https://accounts.zoho.in/oauth/v2/token");
  assert.equal(requests[0]?.method, "POST");
  assert.equal(await requests[0]?.text(), "code=authorization-code&client_id=zoho-client&client_secret=server-only&redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Fauth%2Fmail%2Fzoho%2Fcallback&grant_type=authorization_code");
  assert.equal(requests[1]?.url, "https://mail.zoho.in/api/accounts");
  assert.equal(requests[1]?.headers.get("authorization"), "Zoho-oauthtoken zoho-access");
});

test("Zoho reports a safe token exchange failure without retaining response details", async () => {
  const config = { clientId: "zoho-client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback", accountsDomain: "https://accounts.zoho.eu" };
  const fetchMock = (async () => new Response(JSON.stringify({ error: "invalid_code", error_description: "sensitive provider detail" }), { status: 400 })) as typeof fetch;
  await assert.rejects(() => exchangeZohoCode(config, "authorization-code", fetchMock), /Zoho OAuth exchange failed \(400\)/);
  const failure = zohoCallbackFailure(new Error("Zoho OAuth exchange failed (400)."));
  assert.deepEqual(failure, { code: "ZOHO_TOKEN_EXCHANGE_FAILED", message: "O Zoho não aceitou a troca da autorização na região configurada. Verifique o callback e tente novamente." });
  assert.equal(JSON.stringify(failure).includes("authorization-code"), false);
});

test("Zoho reports a safe account lookup failure after a valid token exchange", async () => {
  const config = { clientId: "zoho-client", clientSecret: "server-only", redirectUri: "http://127.0.0.1/callback", accountsDomain: "https://accounts.zoho.eu" };
  const fetchMock = (async (input: RequestInfo | URL) => String(input).includes("/token") ? new Response(JSON.stringify({ access_token: "zoho-access", expires_in: 3600, api_domain: "https://mail.zoho.eu" })) : new Response("", { status: 403 })) as typeof fetch;
  await assert.rejects(() => exchangeZohoCode(config, "authorization-code", fetchMock), /Zoho account lookup failed \(403\)/);
  assert.deepEqual(zohoCallbackFailure(new Error("Zoho account lookup failed (403).")), { code: "ZOHO_ACCOUNT_LOOKUP_FAILED", message: "O Zoho autorizou a conexão, mas não foi possível identificar uma caixa postal na resposta de contas. Verifique o escopo ZohoMail.accounts.READ e a região da conta." });
});

test("expired OAuth tokens refresh without exposing secrets", async () => {
  const calls: string[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push(String(input)); if (String(input).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "gmail-new", expires_in: 3600 }), { status: 200 }); if (String(input).includes("accounts.zoho")) return new Response(JSON.stringify({ access_token: "zoho-new", expires_in: 3600 }), { status: 200 }); const auth = new Headers(init?.headers).get("authorization") ?? ""; assert.ok(auth === "Bearer gmail-new" || auth === "Zoho-oauthtoken zoho-new"); return new Response(JSON.stringify({ emailAddress: "gmail@example.com", data: [{ primaryEmailAddress: "zoho@example.com" }] }), { status: 200 }); }) as typeof fetch;
  const gmail = await testGmail({ accessToken: "old", refreshToken: "gmail-refresh", expiresAt: 0, email: "old@example.com" }, { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback" }, fetchMock);
  const zoho = await testZohoOAuth({ accessToken: "old", refreshToken: "zoho-refresh", expiresAt: 0, email: "old@zoho.com", apiDomain: "https://mail.zoho.com" }, { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback", accountsDomain: "https://accounts.zoho.com" }, fetchMock);
  assert.equal(gmail.accessToken, "gmail-new"); assert.equal(zoho.accessToken, "zoho-new"); assert.equal(calls.length, 4);
});

test("Gmail adapter sends HTML through the official API without exposing the token", async () => {
  const requests: Request[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => { requests.push(new Request(input, init)); return new Response(JSON.stringify({ id: "gmail-message", threadId: "thread-1" }), { status: 200 }); }) as typeof fetch;
  const result = await sendGmailMessage({ accessToken: "secret-token", email: "sender@gmail.com", displayName: "Luan Creative", expiresAt: Date.now() + 300_000, scopes: [GMAIL_SEND_SCOPE] }, { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback" }, { toEmail: "lead@example.com", subject: "Olá", htmlBody: "<strong>Mensagem</strong>" }, fetchMock);
  assert.deepEqual(result, { messageId: "gmail-message", threadRef: "thread-1" });
  assert.equal(requests[0]?.url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  const raw = (await requests[0]?.json() as { raw: string }).raw;
  const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/") + "==", "base64").toString("utf8");
  assert.equal(decoded.includes("<strong>Mensagem</strong>"), true);
  assert.match(decoded, /From: =\?UTF-8\?B\?.+\?= <sender@gmail\.com>/);
  assert.equal(JSON.stringify(requests[0]).includes("secret-token"), false);
});

test("Outbox plain-text drafts become escaped paragraphs before provider dispatch", () => {
  const html = formatOutreachEmailHtml("Hi,\n\nFirst paragraph with <unsafe>.\n\nBest,\nLuan Creative");
  assert.match(html, /<p[^>]*>Hi,<\/p>/);
  assert.match(html, /First paragraph with &lt;unsafe&gt;\./);
  assert.match(html, /<p[^>]*>Best,<br>Luan Creative<\/p>/);
  assert.equal(html.includes("<unsafe>"), false);
  assert.equal(html.includes("font-size"), false);
});

test("Zoho adapter sends HTML to the selected mailbox and requires the send scope", async () => {
  const requests: Request[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => { requests.push(new Request(input, init)); return new Response(JSON.stringify({ data: { messageId: "zoho-message" } }), { status: 200 }); }) as typeof fetch;
  const result = await sendZohoMessage({ accessToken: "secret-token", email: "sender@zoho.com", expiresAt: Date.now() + 300_000, apiDomain: "https://mail.zoho.com", accountId: "account-1", scopes: [ZOHO_MAIL_SEND_SCOPE] }, { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback", accountsDomain: "https://accounts.zoho.com", apiDomain: "https://mail.zoho.com" }, { toEmail: "lead@example.com", subject: "Olá", htmlBody: "<p>Mensagem</p>" }, fetchMock);
  assert.deepEqual(result, { messageId: "zoho-message" });
  assert.equal(requests[0]?.url, "https://mail.zoho.com/api/accounts/account-1/messages");
  assert.equal((await requests[0]?.json() as { content: string }).content, "<p>Mensagem</p>");
  await assert.rejects(() => sendZohoMessage({ accessToken: "token", email: "sender@zoho.com", expiresAt: Date.now() + 300_000, apiDomain: "https://mail.zoho.com", accountId: "account-1", scopes: [ZOHO_MAIL_ACCOUNTS_SCOPE] }, { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback", accountsDomain: "https://accounts.zoho.com" }, { toEmail: "lead@example.com", subject: "x", htmlBody: "x" }, fetchMock), /reconectada/);
});

test("Zoho send refreshes an expired OAuth token before posting", async () => {
  const requests: Request[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); requests.push(request);
    if (request.url.includes("/oauth/v2/token")) return new Response(JSON.stringify({ access_token: "fresh-token", expires_in: 3600 }), { status: 200 });
    if (request.url.endsWith("/api/accounts")) return new Response(JSON.stringify({ data: [{ primaryEmailAddress: "sender@zoho.eu", accountId: "account-2" }] }), { status: 200 });
    return new Response(JSON.stringify({ data: { messageId: "sent-after-refresh" } }), { status: 200 });
  }) as typeof fetch;
  const result = await sendZohoMessage({ accessToken: "expired-token", refreshToken: "refresh-token", email: "sender@zoho.eu", expiresAt: 0, apiDomain: "https://mail.zoho.eu", accountId: "account-2", scopes: [ZOHO_MAIL_SEND_SCOPE] }, { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback", accountsDomain: "https://accounts.zoho.eu", apiDomain: "https://mail.zoho.eu" }, { toEmail: "test@example.com", subject: "Teste", htmlBody: "<p>Teste</p>" }, fetchMock);
  assert.equal(result.messageId, "sent-after-refresh");
  assert.equal(result.refreshedToken?.accessToken, "fresh-token");
  assert.equal(requests[2]?.headers.get("authorization"), "Zoho-oauthtoken fresh-token");
  assert.equal(requests[2]?.url, "https://mail.zoho.eu/api/accounts/account-2/messages");
  assert.equal(JSON.stringify(requests).includes("refresh-token"), false);
});

test("Zoho send reports invalid authentication safely without leaking provider details", async () => {
  const fetchMock = (async () => new Response(JSON.stringify({ error: "invalid_oauth_token", description: "private token detail" }), { status: 401 })) as typeof fetch;
  await assert.rejects(() => sendZohoMessage({ accessToken: "bad-token", email: "sender@zoho.com", expiresAt: Date.now() + 300_000, apiDomain: "https://mail.zoho.com", accountId: "account-1", scopes: [ZOHO_MAIL_SEND_SCOPE] }, { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback", accountsDomain: "https://accounts.zoho.com" }, { toEmail: "test@example.com", subject: "Teste", htmlBody: "<p>Teste</p>" }, fetchMock), (error: Error) => {
    assert.equal(error.message, "Zoho rejeitou o envio (401).");
    assert.equal(error.message.includes("private token detail"), false);
    return true;
  });
});
