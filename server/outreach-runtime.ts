export type OutreachTerminalCode = "connection_timeout" | "stream_timeout" | "total_timeout" | "cancelled";

export function boundedTimeout(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

export function terminalCodeFromAbort(reason: unknown): OutreachTerminalCode {
  const value = String(reason ?? "");
  if (value === "connection_timeout" || value === "stream_timeout" || value === "total_timeout") return value;
  return "cancelled";
}
