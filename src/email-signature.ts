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

// Match the delivered message: let the recipient's mail client use its normal
// compose typography instead of imposing a small, artificial-looking font.
const emailInlineStyle = "line-height: 1.5; color: #202124; text-align: left;";
const paragraphInlineStyle = "margin: 0 0 16px 0; line-height: 1.5; color: #202124; text-align: left;";

export function emailDraftHtml(body: string) {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const text = body.replace(/\r\n?/g, "\n").trim();
  const signatureAt = text.lastIndexOf(fixedOutreachSignaturePlain);
  const message = signatureAt >= 0 ? text.slice(0, signatureAt).trim() : text;
  const paragraphs = message.split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p style="${paragraphInlineStyle}">${escape(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  const signature = `<p style="${paragraphInlineStyle}">${escape(OUTREACH_SIGNATURE.signoff)}<br>${escape(OUTREACH_SIGNATURE.name)}<br>${escape(OUTREACH_SIGNATURE.title)}</p>`;
  return `<div style="${emailInlineStyle}">${paragraphs}${signature}</div>`;
}
