import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const projectRoot = process.cwd();
const serverEntry = resolve(projectRoot, "server/index.ts");
const tsxEntry = resolve(projectRoot, "node_modules/tsx/dist/cli.mjs");

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => server.listen(0, "127.0.0.1", () => resolveListen()).once("error", reject));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate an isolated test port.");
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function startIsolated(root: string): Promise<{ stop: () => Promise<void>; port: number }> {
  const port = await unusedPort();
  const child = spawn(process.execPath, [tsxEntry, serverEntry], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${resolve(projectRoot, "tests/fixtures/block-external-fetch.mjs")}`, PORT: String(port), GOSOM_URL: "http://127.0.0.1:1", OUTREACH_SEND_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Isolated API exited during startup: ${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/settings`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return { port, stop: () => new Promise<void>((done) => { child.once("exit", () => done()); child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 1500).unref(); }) };
    } catch { /* API is still starting. */ }
    await delay(100);
  }
  child.kill("SIGKILL");
  throw new Error(`Timed out waiting for isolated API startup: ${output}`);
}

async function withTempRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "scout-db-init-"));
  try {
    await mkdir(join(root, "docs"), { recursive: true });
    await copyFile(join(projectRoot, "docs/OUTREACH_WRITING_GUIDELINES.md"), join(root, "docs/OUTREACH_WRITING_GUIDELINES.md"));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

function assertIndexes(dbPath: string): void {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const columns = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name));
    assert(columns("leads").has("industry_normalized"));
    assert(columns("lead_observations").has("verification_status"));
    const indexes = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>).map((row) => row.name));
    assert(indexes.has("leads_cohort_location_idx"));
    assert(indexes.has("lead_observations_cohort_idx"));
  } finally { db.close(); }
}

test("fresh startup creates storage and an empty database with migrated columns and indexes", async () => {
  await withTempRoot(async (root) => {
    const api = await startIsolated(root);
    try { assertIndexes(join(root, "storage", "capture.db")); }
    finally { await api.stop(); }
  });
});

test("startup migrates a synthetic legacy schema and preserves its row", async () => {
  await withTempRoot(async (root) => {
    const storage = join(root, "storage"); await mkdir(storage, { recursive: true });
    const dbPath = join(storage, "capture.db");
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, country_code TEXT, region TEXT, city TEXT, title TEXT, category TEXT, website TEXT, website_empty INTEGER DEFAULT 0, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '');
      INSERT INTO leads VALUES ('synthetic-1','US','Florida','Orlando','Synthetic Company','Synthetic segment','',0,'2026-01-01','2026-01-01');
      CREATE TABLE lead_observations (id TEXT PRIMARY KEY, lead_id TEXT, signal_code TEXT, observed_at TEXT, confidence REAL, run_id TEXT);`);
    legacy.close();
    const api = await startIsolated(root);
    try {
      assertIndexes(dbPath);
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try { assert.equal((db.prepare("SELECT title FROM leads WHERE id='synthetic-1'").get() as { title: string }).title, "Synthetic Company"); }
      finally { db.close(); }
    } finally { await api.stop(); }
  });
});

test("restarting over an already migrated database is idempotent", async () => {
  await withTempRoot(async (root) => {
    const first = await startIsolated(root); await first.stop();
    const second = await startIsolated(root);
    try { assertIndexes(join(root, "storage", "capture.db")); }
    finally { await second.stop(); }
  });
});
