import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("CSV preparation deduplicates only reliable place_id/cid identifiers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "google-capture-extraction-"));
  try {
    const input = join(directory, "input.csv");
    const output = join(directory, "output.csv");
    const summary = join(directory, "summary.json");
    await writeFile(input, [
      "place_id,cid,title,address,complete_address,category,phone,website,link",
      "ChIJvalid123,123456789,Same name,1 Main St,1 Main St,HVAC,,https://a.example,",
      "ChIJvalid123,123456789,Same name,2 Main St,2 Main St,HVAC,,https://b.example,",
      ",,Same name,1 Main St,1 Main St,HVAC,,https://a.example,",
      ",,Same name,1 Main St,1 Main St,HVAC,,https://a.example,",
      ",null,Another business,1 Main St,1 Main St,HVAC,,https://c.example,",
    ].join("\n"));
    await run(process.execPath, ["scripts/prepare-leads.mjs", input, output, summary, "100"], { cwd: process.cwd() });
    const rows = (await readFile(output, "utf8")).trim().split(/\r?\n/);
    const report = JSON.parse(await readFile(summary, "utf8"));
    // Two rows with the same valid place_id collapse. Rows without reliable
    // identifiers remain separate because composite fields do not prove identity.
    assert.equal(rows.length, 5);
    assert.equal(report.duplicates_removed, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
