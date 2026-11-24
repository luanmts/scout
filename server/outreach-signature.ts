export const OUTREACH_SIGNATURE = {
  signoff: "Best,",
  name: "Luan Oliveira",
  title: "Web Developer & SEO Specialist",
  instagramLabel: "Instagram",
  instagramUrl: "https://www.instagram.com/iamluancreative/",
  portfolioLabel: "My Portfolio",
  portfolioUrl: "https://www.luancreative.work/",
} as const;

export const fixedOutreachSignaturePlain = `${OUTREACH_SIGNATURE.signoff}\n${OUTREACH_SIGNATURE.name}\n${OUTREACH_SIGNATURE.title}`;

const fixedSignaturePattern = new RegExp(`\\n?${OUTREACH_SIGNATURE.signoff.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n${OUTREACH_SIGNATURE.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n${OUTREACH_SIGNATURE.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n(?:${OUTREACH_SIGNATURE.instagramLabel}(?:: )?${OUTREACH_SIGNATURE.instagramUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\| ${OUTREACH_SIGNATURE.portfolioLabel}(?:: )?${OUTREACH_SIGNATURE.portfolioUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${OUTREACH_SIGNATURE.instagramLabel} \\| ${OUTREACH_SIGNATURE.portfolioLabel})\\s*$`, "i");

const shortSignaturePattern = /\n?Best,\nLuan Oliveira\nWeb Developer & SEO Specialist\s*$/i;

/** Remove an earlier application-owned signature, retaining the authored body. */
export function stripFixedOutreachSignature(value: string) {
  return value.replace(/\r\n?/g, "\n").trim().replace(fixedSignaturePattern, "").replace(shortSignaturePattern, "").trim();
}

/** Generated and newly saved drafts always carry exactly one fixed signature. */
export function applyFixedOutreachSignature(value: string) {
  const body = stripFixedOutreachSignature(value);
  return body ? `${body}\n\n${fixedOutreachSignaturePlain}` : fixedOutreachSignaturePlain;
}
