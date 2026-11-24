import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");

test("Global Emails keeps one rich message preview and no duplicate read-only body field", () => {
  const draftArea = source.slice(source.indexOf('email-subject-section'), source.indexOf('{Array.isArray(draft?.evidence)'));
  assert.equal((draftArea.match(/email-rich-preview/g) ?? []).length, 1);
  assert.doesNotMatch(draftArea, /<label>\{copy\.message\}<textarea readOnly/);
  assert.match(draftArea, /editing \? <textarea className="email-message-editor"/);
});

test("Global Emails keeps separate subject and formatted-message copy actions with temporary feedback", () => {
  assert.match(source, /copySubject\(draft\.subject\)/);
  assert.match(source, /copyEmail\(draft\.body\)/);
  assert.match(source, /setCopiedTarget\("subject"\)/);
  assert.match(source, /setCopiedTarget\("message"\)/);
  assert.match(source, /setTimeout\(\(\) => setCopiedTarget\(null\), 2400\)/);
  assert.match(source, /"text\/html": new Blob\(\[emailDraftHtml\(body\)\]/);
  assert.match(source, /"text\/plain": new Blob\(\[plain\]/);
});
