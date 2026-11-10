import { query, ingestQuery } from "../db.js";
import { classifyScope, isConfident, isScopeGateEnabled } from "./scope.js";

export type RuleMatch = {
  family?: string;
  assertion_type?: string;
  indicator_type?: string;
  org_kind?: string;
  min_confidence?: number;
  keywords?: { any?: string[]; all?: string[] };
};

export type Rule = {
  id: string;
  name: string;
  description: string | null;
  severity: number;
  enabled: boolean;
  match: RuleMatch;
  action: string;
};
/** Rang de confiance : A1 (meilleur) > A2 > B2 > C3. */
const CONFIDENCE_RANK: Record<string, number> = { A1: 4, A2: 3, B2: 2, C3: 1 };

function confidenceRank(value: unknown): number {
  return CONFIDENCE_RANK[String(value ?? "").toUpperCase()] ?? 0;
}


let cachedRules: Rule[] | null = null;

export async function loadRules(force = false): Promise<Rule[]> {
  if (cachedRules && !force) return cachedRules;
  const r = await query<{ id: string; name: string; description: string | null; severity: number; enabled: boolean; match: unknown; action: string }>("SELECT id, name, description, severity, enabled, match, action FROM detection_rule WHERE enabled = true");
  cachedRules = r.rows.map((row) => ({ id: row.id, name: row.name, description: row.description, severity: row.severity, enabled: row.enabled, match: (typeof row.match === "string" ? JSON.parse(row.match as string) : row.match) as RuleMatch, action: row.action }));
  return cachedRules;
}

function textOf(e: Record<string, unknown>): string {
  return `${String(e.title ?? "")} ${String(e.summary ?? "")}`.toLowerCase();
}

function matchesEvent(rule: Rule, e: Record<string, unknown>, org: Record<string, unknown> | null): boolean {
  const m = rule.match;
  if (m.family && e.family !== m.family) return false;
  if (m.assertion_type && e.assertion_type !== m.assertion_type) return false;
  if (m.min_confidence != null && confidenceRank(e.confidence) < m.min_confidence) return false;
  if (m.org_kind && (!org || org.kind !== m.org_kind)) return false;
  if (m.keywords) {
    const t = textOf(e);
    if (m.keywords.any && !m.keywords.any.some((k) => t.includes(k.toLowerCase()))) return false;
    if (m.keywords.all && !m.keywords.all.every((k) => t.includes(k.toLowerCase()))) return false;
  }
  return true;
}

function matchesIndicator(rule: Rule, ind: Record<string, unknown>): boolean {
  const m = rule.match;
  if (m.indicator_type && ind.type !== m.indicator_type) return false;
  if (m.min_confidence != null && confidenceRank(ind.confidence) < m.min_confidence) return false;
  return true;
}

export async function evaluateEvent(eventId: number): Promise<number> {
  const rules = await loadRules();
  const er = await query<Record<string, unknown>>("SELECT * FROM event WHERE id=$1", [eventId]);
  const e = er.rows[0];
  if (!e) return 0;
  let org: Record<string, unknown> | null = null;
  if (e.org_id) {
    const or = await query<Record<string, unknown>>("SELECT * FROM org WHERE id=$1", [e.org_id as number]);
    org = or.rows[0] ?? null;
  }
  // Porte régionale. Deux chemins :
  //   - une organisation est rattachée → incident d'organisation, sans appel réseau ;
  //   - aucune organisation → le modèle de décision tranche la portée. Tant qu'il
  //     n'a pas répondu avec assez de confiance pour dire « régional », on
  //     n'alerte pas : mieux vaut rater un signal que noyer la file.
  let regionalVerdict: { scope: string; confidence: number; probabilities: Record<string, number>; model: string } | null = null;
  if (e.org_id == null && isScopeGateEnabled()) {
    const decision = await classifyScope(`${String(e.title ?? "")} ${String(e.summary ?? "")}`);
    if (!isConfident(decision) || decision.scope !== "REGIONAL") return 0;
    regionalVerdict = decision;
  }

  let created = 0;
  for (const rule of rules) {
    if (rule.match.indicator_type) continue;
    if (!matchesEvent(rule, e, org)) continue;
    const scope = e.org_id != null ? "organization_incident" : "regional_advisory";
    const evidence = regionalVerdict
      ? { event_title: e.title, scope_decision: regionalVerdict }
      : { event_title: e.title };
    const ins = await ingestQuery(
      `INSERT INTO alert (rule_id, title, severity, event_id, org_id, evidence, scope)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (rule_id, event_id) WHERE event_id IS NOT NULL DO NOTHING`,
      [rule.id, rule.name, rule.severity, e.id as number, e.org_id, JSON.stringify(evidence), scope]
    );
    if (ins.rowCount && ins.rowCount > 0) created++;
  }
  return created;
}

export async function evaluateIndicator(indicatorId: number): Promise<number> {
  const rules = await loadRules();
  const ir = await query<Record<string, unknown>>("SELECT * FROM indicator WHERE id=$1", [indicatorId]);
  const ind = ir.rows[0];
  if (!ind) return 0;
  let created = 0;
  for (const rule of rules) {
    if (!rule.match.indicator_type) continue;
    if (!matchesIndicator(rule, ind)) continue;
    const ins = await ingestQuery(
      `INSERT INTO alert (rule_id, title, severity, indicator_id, evidence)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (rule_id, indicator_id) WHERE indicator_id IS NOT NULL DO NOTHING`,
      [rule.id, rule.name, rule.severity, ind.id as number, JSON.stringify({ indicator: ind.value })]
    );
    if (ins.rowCount && ins.rowCount > 0) created++;
  }
  return created;
}

export async function evaluateAll(): Promise<{ events: number; indicators: number; alerts: number }> {
  const events = await query<{ id: number }>("SELECT id FROM event");
  const inds = await query<{ id: number }>("SELECT id FROM indicator");
  let alerts = 0;
  for (const e of events.rows) alerts += await evaluateEvent(e.id);
  for (const i of inds.rows) alerts += await evaluateIndicator(i.id);
  return { events: events.rows.length, indicators: inds.rows.length, alerts };
}
