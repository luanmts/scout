export type CohortGroup = { type: "group"; operator: "AND" | "OR" | "NOT"; children: CohortNode[]; label?: string };
export type CohortCondition = { type: "condition"; field: string; operator: string; value?: unknown; profileKey?: string; label?: string };
export type CohortNode = CohortGroup | CohortCondition;
export type CompiledCohort = { sql: string; args: Array<string | number>; reasons: Array<{ sql: string; args: Array<string | number>; label: string }> };

const fields = new Set(["industry", "category", "country", "state", "city", "website", "contact", "decision_role", "signal", "signal_status", "signal_confidence", "signal_freshness", "icp_score"]);
const operators: Record<string, Set<string>> = {
  industry: new Set(["eq", "neq", "contains"]), category: new Set(["eq", "neq", "contains"]), country: new Set(["eq", "neq", "contains"]), state: new Set(["eq", "neq", "contains"]), city: new Set(["eq", "neq", "contains"]),
  website: new Set(["eq"]), contact: new Set(["eq"]), decision_role: new Set(["eq", "contains"]), signal: new Set(["exists", "missing"]), signal_status: new Set(["eq"]), signal_confidence: new Set(["gte", "lte"]), signal_freshness: new Set(["within_days"]), icp_score: new Set(["gte", "lte"]),
};
const textFields: Record<string, string> = { industry: "l.industry_normalized", category: "l.category", country: "l.country_code", state: "l.region", city: "l.city" };
const text = (value: unknown) => String(value ?? "").trim();
const signalCode = (value: unknown) => {
  const code = text(value).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) throw new Error("Signal conditions require a valid signal code.");
  return code;
};
const sqlText = (field: string, operator: string, value: string): { sql: string; args: Array<string | number> } => {
  const column = textFields[field];
  const normalized = field === "industry" ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : value.toLowerCase();
  if (operator === "contains") return { sql: `LOWER(COALESCE(${column}, '')) LIKE ?`, args: [`%${normalized}%`] };
  if (operator === "neq") return { sql: `(COALESCE(LOWER(${column}), '') != ? OR ${column} IS NULL)`, args: [normalized] };
  return { sql: `LOWER(COALESCE(${column}, '')) = ?`, args: [normalized] };
};
const signalExists = (extra: string, args: Array<string | number>, negated = false) => ({ sql: `${negated ? "NOT " : ""}EXISTS (SELECT 1 FROM lead_observations lo WHERE lo.lead_id = l.id ${extra})`, args });

export function validateCohortDefinition(input: unknown, depth = 0): CohortNode {
  if (!input || typeof input !== "object" || depth > 6) throw new Error("Cohort conditions are invalid or too deeply nested.");
  const node = input as Record<string, unknown>;
  if (node.type === "group") {
    const operator = node.operator;
    if (operator !== "AND" && operator !== "OR" && operator !== "NOT") throw new Error("Cohort groups must use AND, OR or NOT.");
    if (!Array.isArray(node.children) || node.children.length < 1 || node.children.length > 20 || (operator === "NOT" && node.children.length !== 1)) throw new Error("Cohort groups have invalid child counts.");
    return { type: "group", operator, children: node.children.map((child) => validateCohortDefinition(child, depth + 1)), label: text(node.label) };
  }
  if (node.type !== "condition" || !fields.has(text(node.field))) throw new Error("Unsupported cohort condition field.");
  const field = text(node.field); const operator = text(node.operator);
  if (!operators[field]?.has(operator)) throw new Error(`Unsupported operator for ${field}.`);
  const value = node.value;
  if (["signal", "signal_status", "decision_role", "industry", "category", "country", "state", "city", "website", "contact"].includes(field) && !text(value) && typeof value !== "object") throw new Error(`Condition ${field} requires a value.`);
  if (field === "website" && !["present", "missing"].includes(text(value))) throw new Error("Website conditions must be present or missing.");
  if (field === "contact" && !["present", "missing", "verified"].includes(text(value))) throw new Error("Contact conditions must be present, missing or verified.");
  if (field === "signal") signalCode(value);
  if (field === "signal_status") {
    if (!value || typeof value !== "object") throw new Error("Signal status conditions require a signal and status.");
    const record = value as Record<string, unknown>;
    signalCode(record.signal);
    if (!["verified", "possible", "inconclusive"].includes(text(record.status).toLowerCase())) throw new Error("Signal status must be verified, possible or inconclusive.");
  }
  if (["signal_confidence", "signal_freshness", "icp_score"].includes(field)) {
    if (!value || typeof value !== "object") throw new Error(`Condition ${field} requires an object value.`);
    const record = value as Record<string, unknown>; const number = Number(record.min ?? record.max ?? record.days ?? record.score);
    if (!Number.isFinite(number) || number < 0) throw new Error(`Condition ${field} requires a valid non-negative number.`);
    if (field === "signal_confidence" || field === "signal_freshness") signalCode(record.signal);
    if (field === "icp_score" && !text(record.profile)) throw new Error("ICP score conditions require a profile key.");
  }
  return { type: "condition", field, operator, value, profileKey: text(node.profileKey), label: text(node.label) };
}

function compileCondition(node: CohortCondition): { sql: string; args: Array<string | number> } {
  const value = node.value;
  if (textFields[node.field]) return sqlText(node.field, node.operator, text(value));
  if (node.field === "website") return { sql: node.operator === "eq" && text(value) === "missing" ? "COALESCE(TRIM(l.website), '') = ''" : "COALESCE(TRIM(l.website), '') != ''", args: [] };
  if (node.field === "contact") {
    if (text(value) === "missing") return { sql: `NOT EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id) AND COALESCE(l.business_email, '') = '' AND COALESCE(l.phone, '') = '' AND COALESCE(l.instagram, '') = '' AND COALESCE(l.facebook, '') = ''`, args: [] };
    const status = text(value) === "verified" ? " AND lc.verification_status = 'verified'" : "";
    return { sql: `EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id${status}) OR COALESCE(l.business_email, '') != '' OR COALESCE(l.phone, '') != '' OR COALESCE(l.instagram, '') != '' OR COALESCE(l.facebook, '') != ''`, args: [] };
  }
  if (node.field === "decision_role") return { sql: `EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id AND LOWER(COALESCE(lc.role, '')) ${node.operator === "contains" ? "LIKE ?" : "= ?"})`, args: [node.operator === "contains" ? `%${text(value).toLowerCase()}%` : text(value).toLowerCase()] };
  if (node.field === "signal") return signalExists("AND lo.signal_code = ?", [text(value)], node.operator === "missing");
  if (node.field === "signal_status") { const record = (value ?? {}) as Record<string, unknown>; return signalExists("AND lo.signal_code = ? AND COALESCE(lo.verification_status, 'verified') = ?", [text(record.signal), text(record.status)]); }
  if (node.field === "signal_confidence") { const record = (value ?? {}) as Record<string, unknown>; return signalExists(`AND lo.signal_code = ? AND lo.confidence ${node.operator === "gte" ? ">=" : "<="} ?`, [text(record.signal), Number(record.min ?? record.max)]); }
  if (node.field === "signal_freshness") { const record = (value ?? {}) as Record<string, unknown>; return signalExists("AND lo.signal_code = ? AND lo.observed_at >= datetime('now', ?)", [text(record.signal), `-${Math.floor(Number(record.days))} days`]); }
  if (node.field === "icp_score") { const record = (value ?? {}) as Record<string, unknown>; return { sql: `EXISTS (SELECT 1 FROM icp_scores s WHERE s.lead_id = l.id AND s.profile_key = ? AND s.score ${node.operator === "gte" ? ">=" : "<="} ? AND s.calculated_at = (SELECT MAX(s2.calculated_at) FROM icp_scores s2 WHERE s2.lead_id = l.id AND s2.profile_key = ?))`, args: [text(record.profile), Number(record.score), text(record.profile)] }; }
  throw new Error("Unsupported cohort condition.");
}

function collectReasons(node: CohortNode, invert = false): Array<{ sql: string; args: Array<string | number>; label: string }> {
  if (node.type === "condition") { const compiled = compileCondition(node); const label = node.label || `${node.field} ${node.operator}`; return [{ sql: invert ? `NOT (${compiled.sql})` : compiled.sql, args: compiled.args, label: invert ? `Not ${label}` : label }]; }
  return node.children.flatMap((child) => collectReasons(child, node.operator === "NOT" ? !invert : invert));
}

export function compileCohortDefinition(input: unknown): CompiledCohort {
  const node = validateCohortDefinition(input);
  const compile = (current: CohortNode): { sql: string; args: Array<string | number> } => {
    if (current.type === "condition") return compileCondition(current);
    const children = current.children.map(compile);
    const sql = current.operator === "NOT" ? `NOT (${children[0].sql})` : `(${children.map((child) => child.sql).join(` ${current.operator} `)})`;
    return { sql, args: children.flatMap((child) => child.args) };
  };
  const compiled = compile(node);
  return { ...compiled, reasons: collectReasons(node) };
}
