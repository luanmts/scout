#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [inputPath, outputPath, summaryPath, limitArgument = "100"] =
  process.argv.slice(2);
const limit = Number.parseInt(limitArgument, 10);

if (
  !inputPath ||
  !outputPath ||
  !summaryPath ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  limit > 1000
) {
  console.error(
    "Usage: node scripts/prepare-leads.mjs <input.csv> <output.csv> <summary.json> [limit=100, max=1000]",
  );
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePhone(value, country) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const countryKey = normalizeText(country)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (["br", "brazil", "brasil"].includes(countryKey)) {
    // Brazilian local numbers contain DDD + subscriber number (10 or 11 digits).
    // Keep phone_raw untouched for carrier prefixes or incomplete values that
    // cannot be converted safely.
    if (digits.startsWith("0055")) return `+${digits.slice(2)}`;
    if (
      digits.startsWith("55") &&
      (digits.length === 12 || digits.length === 13)
    )
      return `+${digits}`;
    if (
      (digits.length === 10 || digits.length === 11) &&
      !digits.startsWith("0")
    )
      return `+55${digits}`;
    return `+${digits}`;
  }
  return digits.length === 11 && digits.startsWith("1")
    ? `+${digits}`
    : `+${digits}`;
}

function normalizeWebsite(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    return `${hostname}${path}`.toLowerCase();
  } catch {
    return raw
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\/$/, "");
  }
}

function addressParts(value) {
  try {
    const address = JSON.parse(value || "{}");
    return {
      city: normalizeText(address.city),
      province: normalizeText(address.state),
      country: normalizeText(address.country),
    };
  } catch {
    return { city: "", province: "", country: "" };
  }
}

function dedupKey(lead) {
  if (lead.place_id) return `place:${lead.place_id}`;
  if (lead.cid) return `cid:${lead.cid}`;
  // Without a stable Google identifier, retain the row. Composite business
  // fields are not strong enough to prove identity and can merge unrelated
  // businesses that share a name, phone, website, or address.
  return "";
}

function normalizePlaceId(value) {
  const text = normalizeText(value);
  return text && !["null", "undefined", "n/a", "na", "0"].includes(text.toLowerCase()) && /^[A-Za-z0-9_-]{5,}$/.test(text) ? text : "";
}

function normalizeCid(value) {
  const text = normalizeText(value);
  return /^\d{5,}$/.test(text) ? text : "";
}

const source = await readFile(inputPath, "utf8");
const [headers = [], ...rows] = parseCsv(source);
const index = new Map(headers.map((header, position) => [header, position]));
const get = (row, name) => row[index.get(name)] ?? "";
const seen = new Set();
const normalized = [];
let duplicatesRemoved = 0;

for (const row of rows) {
  if (!row.some((value) => value.trim())) continue;
  const websiteRaw = normalizeText(get(row, "website"));
  const parts = addressParts(get(row, "complete_address"));
  const lead = {
    source_input_id: get(row, "input_id"),
    place_id: normalizePlaceId(get(row, "place_id")),
    cid: normalizeCid(get(row, "cid")),
    title: normalizeText(get(row, "title")),
    category: normalizeText(get(row, "category")),
    address: normalizeText(get(row, "address")),
    city: parts.city,
    province: parts.province,
    country: parts.country,
    phone_raw: normalizeText(get(row, "phone")),
    phone_normalized: normalizePhone(get(row, "phone"), parts.country),
    website_raw: websiteRaw,
    website_normalized: normalizeWebsite(websiteRaw),
    website_empty: "false",
    review_count: get(row, "review_count"),
    review_rating: get(row, "review_rating"),
    google_maps_url: get(row, "link"),
    latitude: get(row, "latitude"),
    longitude: get(row, "longitude"),
  };
  lead.website_empty = websiteRaw === "" ? "true" : "false";
  lead.title_normalized = lead.title.toLowerCase();
  lead.address_normalized = lead.address.toLowerCase();
  lead.dedup_key = dedupKey(lead);

  if (lead.dedup_key && seen.has(lead.dedup_key)) {
    duplicatesRemoved += 1;
    continue;
  }
  if (lead.dedup_key) seen.add(lead.dedup_key);
  normalized.push(lead);
}

const selected = normalized.slice(0, limit);
const columns = [
  "source_input_id",
  "place_id",
  "cid",
  "title",
  "category",
  "address",
  "city",
  "province",
  "country",
  "phone_raw",
  "phone_normalized",
  "website_raw",
  "website_normalized",
  "website_empty",
  "review_count",
  "review_rating",
  "google_maps_url",
  "latitude",
  "longitude",
  "dedup_key",
];
const output =
  [
    columns.join(","),
    ...selected.map((lead) =>
      columns.map((column) => csvEscape(lead[column])).join(","),
    ),
  ].join("\n") + "\n";
const summary = {
  generated_at: new Date().toISOString(),
  source: inputPath,
  input_rows: rows.filter((row) => row.some((value) => value.trim())).length,
  unique_rows: normalized.length,
  output_rows: selected.length,
  limit,
  duplicates_removed: duplicatesRemoved,
  websites_empty: selected.filter((lead) => lead.website_empty === "true")
    .length,
  deduplication_priority: ["place_id", "cid"],
};

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(summaryPath), { recursive: true });
await writeFile(outputPath, output, "utf8");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
