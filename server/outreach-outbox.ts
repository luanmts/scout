/**
 * Outbox control rules adapted from Harvey's MIT-licensed approval ladder and
 * deterministic pre-send gate. The actual provider dispatch remains behind
 * an explicit server-side feature flag and is never enabled by default.
 */

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const MERGE_TAG_RE = /\{\{\s*\w+\s*\}\}|\{\s*\w+\s*\}(?!\})/;
const URL_RE = /https?:\/\/\S+/gi;
const FIXED_SIGNATURE_RE = /\n\nBest,\nLuan Oliveira\nWeb Developer & SEO Specialist\nInstagram: https:\/\/www\.instagram\.com\/iamluancreative\/ \| My Portfolio: https:\/\/www\.luancreative\.work\/?\s*$/i;
const BANNED_PHRASES = ["act now", "buy now", "click here", "limited offer", "guaranteed results", "i hope this finds you well", "as an ai", "as a language model"];

export type OutboxStatus = "pending_review" | "approved" | "sending" | "sent" | "rejected" | "cancelled" | "failed";
export type OutboxGateInput = { toEmail: string; subject: string; body: string; recipientStatus: "verified" | "possible"; approvePossible: boolean; thirdParty: boolean; unsubscribed: boolean; alreadyContacted: boolean };

function authoredBodyWithoutFixedSignature(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(FIXED_SIGNATURE_RE, "").trim();
}

export function outboxGate(input: OutboxGateInput): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const email = input.toEmail.trim().toLowerCase();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!EMAIL_RE.test(email)) reasons.push("invalid recipient address");
  if (!subject) reasons.push("empty subject");
  if (!body) reasons.push("empty body");
  if (MERGE_TAG_RE.test(`${subject} ${body}`)) reasons.push("unrendered merge tag");
  if (body.split(/\s+/).filter(Boolean).length > 220) reasons.push("body exceeds 220 words");
  if ((authoredBodyWithoutFixedSignature(body).match(URL_RE) ?? []).length > 1) reasons.push("too many links");
  if (BANNED_PHRASES.some((phrase) => `${subject} ${body}`.toLowerCase().includes(phrase))) reasons.push("blocked commercial phrase");
  if (input.recipientStatus === "possible" && !input.approvePossible) reasons.push("possible contact requires explicit approval");
  if (input.thirdParty) reasons.push("administrative third-party contact");
  if (input.unsubscribed) reasons.push("recipient is unsubscribed");
  if (input.alreadyContacted) reasons.push("recipient was already contacted");
  return { ok: reasons.length === 0, reasons };
}

export function distributeOutboxAccounts(accountIds: string[], count: number): string[] {
  if (!accountIds.length) return [];
  return Array.from({ length: count }, (_, index) => accountIds[index % accountIds.length]);
}

export function scheduledOutboxTime(startAt: Date, sequenceIndex: number, spacingMinutes: number): string {
  return new Date(startAt.getTime() + Math.max(0, sequenceIndex) * Math.max(1, spacingMinutes) * 60_000).toISOString();
}

export function dailyCapReached(sentToday: number, dailyLimit: number): boolean {
  return sentToday >= Math.max(0, dailyLimit);
}

export type OutboxDispatchState = "review" | "waiting_for_activation" | "paused" | "waiting_for_schedule" | "ready" | "processing" | "terminal";
export function outboxDispatchState(status: string, sendAt: string, now: Date, sendingEnabled: boolean, paused: boolean): OutboxDispatchState {
  if (status === "pending_review") return "review";
  if (status === "approved") {
    if (!sendingEnabled) return "waiting_for_activation";
    if (paused) return "paused";
    return new Date(sendAt).getTime() > now.getTime() ? "waiting_for_schedule" : "ready";
  }
  if (status === "sending") return "processing";
  return "terminal";
}

export type OutboxDispatchResult = { status: "sent" | "failed"; uncertain: boolean; error?: string; messageId?: string; threadRef?: string };
export function classifyOutboxDispatchError(error: unknown): OutboxDispatchResult {
  const message = error instanceof Error ? error.message : "Falha desconhecida no provedor.";
  const uncertain = /incerta|confirmar|network|timeout|timed out|fetch/i.test(message);
  return { status: "failed", uncertain, error: uncertain ? "O provedor não confirmou o resultado; verifique a pasta Enviados antes de qualquer nova ação." : message.replace(/[\r\n].*$/s, "") };
}
