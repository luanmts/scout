export type QualificationStatus = "pending" | "running" | "qualified" | "incomplete" | "failed" | "access_restricted";

export type QualificationInput = {
  website?: string | null;
  auditStatus?: string | null;
  stages?: Record<string, { status?: string }> | null;
  hasDesktopScreenshot: boolean;
  hasMobileScreenshot: boolean;
  automatedUxStatus?: string | null;
  visualStatus?: string | null;
  opportunityStatus?: string | null;
};

export type QualificationResult = {
  status: QualificationStatus;
  stage: "website_validation" | "website_audit" | "visual_ux" | "opportunity" | "completed";
  reason: string;
  shouldQueueVisual: boolean;
};

/** Pure, conservative contract for promoting a newly discovered business. */
export function evaluateLeadQualification(input: QualificationInput): QualificationResult {
  if (!String(input.website ?? "").trim())
    return { status: "failed", stage: "website_validation", reason: "No public website is available for qualification.", shouldQueueVisual: false };
  if (input.auditStatus === "access_restricted")
    return { status: "access_restricted", stage: "website_validation", reason: "Public website access is restricted.", shouldQueueVisual: false };
  if (["failed", "cancelled", "exhausted"].includes(String(input.auditStatus)))
    return { status: "failed", stage: "website_audit", reason: "Website Intelligence did not complete.", shouldQueueVisual: false };
  if (input.auditStatus === "partial")
    return { status: "incomplete", stage: "website_audit", reason: "Website Intelligence is partial.", shouldQueueVisual: false };
  if (input.auditStatus !== "completed")
    return { status: "running", stage: "website_audit", reason: "Waiting for Website Intelligence.", shouldQueueVisual: false };

  const stages = input.stages ?? {};
  if (!["profile", "browser", "lighthouse"].every((name) => stages[name]?.status === "completed"))
    return { status: "incomplete", stage: "website_audit", reason: "One or more required Website Intelligence stages are incomplete.", shouldQueueVisual: false };
  if (!input.hasDesktopScreenshot || !input.hasMobileScreenshot)
    return { status: "incomplete", stage: "website_audit", reason: "Both desktop and mobile screenshots are required.", shouldQueueVisual: false };
  if (input.automatedUxStatus !== "completed")
    return {
      status: input.automatedUxStatus === "failed" ? "incomplete" : "running",
      stage: "visual_ux",
      reason: input.automatedUxStatus === "failed" ? "Automated UX checks failed." : "Waiting for Automated UX checks.",
      shouldQueueVisual: false,
    };
  if (!["completed", "insufficient"].includes(String(input.opportunityStatus)))
    return { status: "running", stage: "opportunity", reason: "Waiting for opportunity evaluation.", shouldQueueVisual: false };
  return { status: "qualified", stage: "completed", reason: "All required qualification stages completed.", shouldQueueVisual: false };
}
