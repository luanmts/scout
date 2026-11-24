#!/usr/bin/env node

/**
 * Recover rows that were retained in an existing Gosom CSV but omitted by an
 * older local import limit. This deliberately reads local CSVs only: it never
 * creates a Gosom job, downloads data, or starts contact enrichment.
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const [searchId, ...jobIds] = process.argv.slice(2);
const requestedLimit = Number.parseInt(process.env.IMPORT_LEAD_LIMIT ?? '100', 10);
const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 100;

if (!searchId || !jobIds.length) {
  console.error('Usage: node scripts/recover-limited-import.mjs <search-id> <gosom-job-id> [...gosom-job-id]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function normalizeIndustry(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase().replace(/\b(shops|shop|services|service|companies|company|providers|provider)\b/g, '').replace(/\s+/g, ' ').trim() || 'uncategorized';
}

const db = new DatabaseSync(join(root, 'storage', 'capture.db'));
const search = db.prepare('SELECT id FROM saved_searches WHERE id = ?').get(searchId);
if (!search) throw new Error(`Saved search ${searchId} was not found.`);

const insert = db.prepare(`INSERT OR IGNORE INTO leads (
  id, search_id, place_id, cid, title, category, address, city, region, country_code, phone, website,
  website_empty, review_count, review_rating, maps_url, latitude, longitude, dedup_key, industry_normalized, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const lookupLead = db.prepare('SELECT id FROM leads WHERE (place_id != \'\' AND place_id = ?) OR (cid != \'\' AND cid = ?) LIMIT 1');
const addSource = db.prepare('INSERT OR IGNORE INTO lead_sources (lead_id, search_id, search_job_id, discovered_at) VALUES (?, ?, ?, ?)');
const addRegion = db.prepare('INSERT OR IGNORE INTO regions (country_code, name, normalized_name) VALUES (?, ?, ?)');
const findJob = db.prepare('SELECT id FROM search_jobs WHERE search_id = ? AND gosom_job_id = ?');

const prepared = [];
for (const gosomJobId of jobIds) {
  const job = findJob.get(searchId, gosomJobId);
  if (!job) throw new Error(`Gosom job ${gosomJobId} does not belong to saved search ${searchId}.`);
  const rawPath = join(root, 'data', 'raw', `${gosomJobId}.csv`);
  const normalizedPath = join(root, 'data', 'processed', `${gosomJobId}.normalized.csv`);
  const summaryPath = join(root, 'data', 'processed', `${gosomJobId}.summary.json`);
  if (!existsSync(rawPath)) throw new Error(`Local raw CSV is missing: ${rawPath}`);
  execFileSync(process.execPath, [join(root, 'scripts', 'prepare-leads.mjs'), rawPath, normalizedPath, summaryPath, String(limit)], { stdio: 'inherit' });
  const [headers, ...rows] = parseCsv(readFileSync(normalizedPath, 'utf8'));
  const index = new Map(headers.map((header, position) => [header, position]));
  prepared.push({ gosomJobId, localJobId: job.id, rows, get: (row, key) => row[index.get(key) ?? -1] ?? '' });
}

const totals = { input: 0, inserted: 0, linkedExisting: 0, unresolved: 0 };
db.exec('BEGIN IMMEDIATE');
try {
  for (const source of prepared) {
    for (const row of source.rows) {
      totals.input += 1;
      const get = source.get;
      const now = new Date().toISOString();
      const leadId = randomUUID();
      const inserted = insert.run(
        leadId, searchId, get(row, 'place_id') || null, get(row, 'cid') || null, get(row, 'title'), get(row, 'category'),
        get(row, 'address'), get(row, 'city'), get(row, 'province'), get(row, 'country'), get(row, 'phone_normalized'),
        get(row, 'website_normalized'), get(row, 'website_empty') === 'true' ? 1 : 0, Number(get(row, 'review_count')) || 0,
        Number(get(row, 'review_rating')) || 0, get(row, 'google_maps_url'), Number(get(row, 'latitude')) || null,
        Number(get(row, 'longitude')) || null, get(row, 'dedup_key'), normalizeIndustry(get(row, 'category')), now, now,
      );
      const resolvedLeadId = inserted.changes ? leadId : lookupLead.get(get(row, 'place_id'), get(row, 'cid'))?.id;
      if (inserted.changes) totals.inserted += 1;
      else if (resolvedLeadId) totals.linkedExisting += 1;
      else totals.unresolved += 1;
      if (resolvedLeadId) addSource.run(resolvedLeadId, searchId, source.localJobId, now);
      if (get(row, 'country') && get(row, 'province')) addRegion.run(get(row, 'country'), get(row, 'province'), get(row, 'province').toLocaleLowerCase());
    }
    db.prepare('UPDATE search_jobs SET result_count = ?, imported = 1, updated_at = ? WHERE id = ?')
      .run(source.rows.length, new Date().toISOString(), source.localJobId);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(JSON.stringify({ searchId, limit, jobs: prepared.map(({ gosomJobId, rows }) => ({ gosomJobId, recoveredRows: rows.length })), ...totals }, null, 2));
