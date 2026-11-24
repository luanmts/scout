import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The editorial document is intentionally loaded by the running generator,
 * not merely kept as repository documentation. Keeping the full document in
 * the prompt also preserves its six conditional examples as few-shot style
 * references without treating them as facts about a lead.
 */
export const OUTREACH_WRITING_GUIDELINES_PATH = join(process.cwd(), "docs", "OUTREACH_WRITING_GUIDELINES.md");

export function loadOutreachWritingGuidelines() {
  const content = readFileSync(OUTREACH_WRITING_GUIDELINES_PATH, "utf8").trim();
  if (!content) throw new Error("Outreach writing guidelines are empty.");
  return content;
}

export const officialOutreachWritingGuidelines = loadOutreachWritingGuidelines();

export function officialOutreachGuidelinesPrompt() {
  return `## Official Outreach Writing Guidelines (active source of truth)
The following document governs editorial voice, conditional style examples, source precedence, and the fixed application signature. Follow it over any conflicting sales-skill guidance. The examples are style references only, never evidence about this lead. Generate only subject and body; never include a signature.

${officialOutreachWritingGuidelines}`;
}
