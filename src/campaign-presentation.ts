export type CampaignPresentation = {
  id?: string;
  status?: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  metrics?: {
    lead_count?: number | null;
    contact_count?: number | null;
    audit_count?: number | null;
  } | null;
  progress?: {
    collected?: number | null;
  } | null;
  qualification_progress?: {
    extracted?: number | null;
    qualified?: number | null;
  } | null;
};

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting_for_service", "qualifying"]);

export function campaignIsActive(campaign: CampaignPresentation) {
  return !campaign.archived_at && ACTIVE_STATUSES.has(String(campaign.status ?? ""));
}

export function campaignHasUsefulResults(campaign: CampaignPresentation) {
  return [
    campaign.progress?.collected,
    campaign.qualification_progress?.extracted,
    campaign.qualification_progress?.qualified,
    campaign.metrics?.lead_count,
    campaign.metrics?.contact_count,
  ].some((value) => Number(value ?? 0) > 0);
}

/** Main campaign index visibility. Technical empty runs stay queryable through history. */
export function campaignShouldAppear(campaign: CampaignPresentation) {
  if (campaign.archived_at) return false;
  return campaignIsActive(campaign) || campaignHasUsefulResults(campaign);
}

export function compareCampaignsForIndex(a: CampaignPresentation, b: CampaignPresentation) {
  const activeOrder = Number(campaignIsActive(b)) - Number(campaignIsActive(a));
  if (activeOrder !== 0) return activeOrder;
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}
