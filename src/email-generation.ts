const activeGenerationRunStatuses = new Set(["queued", "running", "cancelling"]);
const terminalGenerationItemStatuses = new Set(["completed", "failed", "cancelled"]);

export function isTerminalGenerationRun(run: { status?: string; total?: number; items?: Array<{ status?: string }> } | null | undefined) {
  if (!run) return false;
  if (!activeGenerationRunStatuses.has(String(run.status))) return true;
  const items = Array.isArray(run.items) ? run.items : [];
  return Number(run.total ?? 0) > 0 && items.length >= Number(run.total) && items.every((item) => terminalGenerationItemStatuses.has(String(item.status)));
}
