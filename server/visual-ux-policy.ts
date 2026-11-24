export const AI_VISUAL_MODEL = "gpt-5.6-luna";

/** AI visual review is intentionally allow-listed: it is optional and never falls back. */
export function visualUxModelAllowed(model: string | null | undefined) {
  return model === AI_VISUAL_MODEL;
}
