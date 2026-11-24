import test from "node:test";
import assert from "node:assert/strict";
import { AI_VISUAL_MODEL, visualUxModelAllowed } from "../server/visual-ux-policy.js";

test("only GPT-5.6 Luna is allowed for optional AI visual review", () => {
  assert.equal(AI_VISUAL_MODEL, "gpt-5.6-luna");
  assert.equal(visualUxModelAllowed("gpt-5.6-luna"), true);
  assert.equal(visualUxModelAllowed("gpt-6.1-sol"), false);
  assert.equal(visualUxModelAllowed("gpt-6-astra"), false);
});
