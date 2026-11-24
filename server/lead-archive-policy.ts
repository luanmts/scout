export type TechnicalAuditStatus =
  | "completed"
  | "partial"
  | "failed"
  | "access_restricted"
  | "not_analyzed"
  | "queued"
  | "analyzing"
  | "running"
  | "processing"
  | "cancelled"
  | "exhausted"
  | string;

export type LeadArchiveInput = {
  auditStatus?: TechnicalAuditStatus | null;
  taskStatus?: string | null;
  inCrm: boolean;
  archived: boolean;
};

export type LeadArchiveDecision =
  | { action: "retain"; reason: "completed" | "already_archived" }
  | { action: "protected"; reason: "in_crm" }
  | { action: "defer"; reason: "audit_active" }
  | { action: "archive"; reason: "partial" | "failed" | "access_restricted" | "not_analyzed" | "cancelled" | "exhausted" | "other_incomplete" };

const activeAuditStatuses = new Set(["queued", "analyzing", "running", "processing"]);

/**
 * This policy intentionally knows nothing about opportunity/ICP scores. A lead
 * is retained only for a completed technical audit, while CRM membership always
 * wins. Active jobs are deferred so a running worker is never archived under it.
 */
export function decideLeadArchive(input: LeadArchiveInput): LeadArchiveDecision {
  if (input.archived) return { action: "retain", reason: "already_archived" };
  if (input.inCrm) return { action: "protected", reason: "in_crm" };
  const auditStatus = String(input.auditStatus || "not_analyzed");
  const taskStatus = String(input.taskStatus || "");
  if (activeAuditStatuses.has(auditStatus) || activeAuditStatuses.has(taskStatus))
    return { action: "defer", reason: "audit_active" };
  if (auditStatus === "completed") return { action: "retain", reason: "completed" };
  if (auditStatus === "partial") return { action: "archive", reason: "partial" };
  if (auditStatus === "failed") return { action: "archive", reason: "failed" };
  if (auditStatus === "access_restricted") return { action: "archive", reason: "access_restricted" };
  if (auditStatus === "cancelled") return { action: "archive", reason: "cancelled" };
  if (auditStatus === "exhausted") return { action: "archive", reason: "exhausted" };
  if (auditStatus === "not_analyzed" || !input.auditStatus)
    return { action: "archive", reason: "not_analyzed" };
  return { action: "archive", reason: "other_incomplete" };
}
