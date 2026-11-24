export type QualificationProcessingState = "active" | "queued" | "partial" | "restricted" | "failed" | "waiting";

type CandidateTask = {
  qualification_status?: string;
  audit_status?: string;
  website_audit_task_status?: string | null;
};

export function qualificationProcessingState(candidate: CandidateTask): QualificationProcessingState {
  const task = candidate.website_audit_task_status ?? "";
  if (["analyzing", "running", "processing"].includes(task) || ["analyzing", "running", "processing"].includes(candidate.audit_status ?? "")) return "active";
  if (task === "queued" || candidate.audit_status === "queued") return "queued";
  if (task === "partial" || candidate.audit_status === "partial") return "partial";
  if (task === "access_restricted" || candidate.audit_status === "access_restricted") return "restricted";
  if (["failed", "exhausted", "cancelled"].includes(task) || ["failed", "cancelled"].includes(candidate.audit_status ?? "")) return "failed";
  return candidate.qualification_status === "running" ? "waiting" : "waiting";
}

export function qualificationStateLabel(language: "en" | "pt-BR", state: QualificationProcessingState) {
  if (language === "en") return ({ active: "Being checked now", queued: "Waiting in queue", partial: "Partial audit — recovery pending", restricted: "Access restricted", failed: "Could not complete", waiting: "Waiting for the next stage" } as Record<QualificationProcessingState, string>)[state];
  return ({ active: "Sendo verificado agora", queued: "Aguardando na fila", partial: "Auditoria parcial — retomada pendente", restricted: "Acesso restrito", failed: "Não foi possível concluir", waiting: "Aguardando a próxima etapa" } as Record<QualificationProcessingState, string>)[state];
}

export function qualificationStateTone(state: QualificationProcessingState) {
  return state === "active" ? "active" : state === "queued" || state === "partial" || state === "waiting" ? "pending" : "blocked";
}
