export type SearchStatusJob = {
  status?: string | null;
  stage?: string | null;
};

export type SearchStatusInput = {
  persistedStatus?: string | null;
  executionStatus?: string | null;
  hasExecution: boolean;
  jobs: SearchStatusJob[];
  qualificationPending?: number;
  collected?: number;
  target?: number;
};

const activeStatuses = new Set(["queued", "starting", "running"]);

export function isSearchActiveStatus(status: string | null | undefined) {
  return status === "starting" || status === "running" || status === "waiting_for_service" || status === "qualifying";
}

export function deriveSearchStage(jobs: SearchStatusJob[], status: string) {
  if (status === "failed" || status === "completed_with_errors") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "waiting_for_service") return "waiting_for_service";
  if (status === "qualifying") return "processing";
  if (jobs.some((job) => job.stage === "saving")) return "saving";
  if (jobs.some((job) => job.stage === "deduplicating")) return "deduplicating";
  if (jobs.some((job) => job.stage === "processing")) return "processing";
  if (jobs.some((job) => job.stage === "collecting")) return "collecting";
  if (jobs.some((job) => activeStatuses.has(String(job.status)))) return "starting";
  return "completed";
}

export function deriveSearchStatus(input: SearchStatusInput) {
  const jobs = input.jobs;
  if (input.executionStatus === "waiting_for_service") return "waiting_for_service";
  const hasActiveJob = jobs.some((job) => activeStatuses.has(String(job.status)));
  const hasFailedJob = jobs.some((job) => job.status === "failed");
  const hasCompletedJob = jobs.some((job) => job.status === "completed");
  const hasCancelledJob = jobs.some((job) => job.status === "cancelled");

  // An execution can remain marked active for a short interval after its last
  // job reaches a terminal state. Jobs are the source of truth once present;
  // only an execution without jobs is still considered starting.
  if (hasActiveJob || ((input.executionStatus === "starting" || input.executionStatus === "running") && !jobs.length)) {
    return jobs.some((job) => job.status === "running") || input.executionStatus === "running" ? "running" : "starting";
  }
  if (!input.hasExecution && !jobs.length) {
    return isSearchActiveStatus(input.persistedStatus) ? "failed" : (input.persistedStatus || "saved");
  }
  if (input.executionStatus === "cancelled" || (hasCancelledJob && !hasCompletedJob && !hasFailedJob)) return "cancelled";
  if (input.executionStatus === "failed") return "failed";
  if (hasFailedJob) return hasCompletedJob ? "completed_with_errors" : "failed";
  if (input.executionStatus === "completed_with_errors") return "completed_with_errors";
  // Discovery may be terminal while audits and qualification are still
  // running. Keep that work visible as active until every pending candidate
  // has reached a terminal qualification state.
  if ((input.qualificationPending ?? 0) > 0) return "qualifying";
  if (input.executionStatus === "completed_with_shortfall") return "completed_with_shortfall";
  if (typeof input.target === "number" && typeof input.collected === "number" && input.collected < input.target) return "completed_with_shortfall";
  return "completed";
}
