import { query, ingestQuery } from "../db.js";
import { classifyScope, isConfident, isScopeGateEnabled, SCOPE_CONFIDENCE_THRESHOLD } from "./scope.js";
import { REVIEW_THRESHOLD, scoreAlert } from "./confidence.js";
import { calibratedScore } from "./calibration.js";
import { discardIfFalse } from "./false-events.js";
import { DEDUP_RULE_VERSION, findCrossFlowDuplicates } from "../dedup/event-pairs.js";
import { recordDetectionDecision } from "./decision-log.js";

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

let cachedRuleThresholds: Map<string, number> | null = null;

/**
 * Seuils calibrés par règle (table `rule_calibration`, holdout 30 jours).
 *
 * Chargés une fois puis gardés en mémoire : les relire à chaque événement
 * ferait payer une requête par évaluation. `force` recharge après une mesure.
 */
export async function loadRuleThresholds(force = false): Promise<Map<string, number>> {
  if (cachedRuleThresholds && !force) return cachedRuleThresholds;
  const r = await query<{ rule_id: string; threshold: string }>(
    "SELECT rule_id, threshold FROM rule_calibration"
  );
  cachedRuleThresholds = new Map(r.rows.map((row) => [row.rule_id, Number(row.threshold)]));
  return cachedRuleThresholds;
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
/**
 * Une ligne d'événement suffisante pour décider si deux flux décrivent le
 * même fait : identité, organisation, source, titre et jour.
 */
export type CorroborationRow = {
  id: number;
  org_id: number;
  source_id: string;
  title: string;
  day: string;
};

/**
 * Corroboration pré-calculée pour une passe de détection.
 *
 * `sourcesByOrg` compte les sources **indépendantes** : un incident republié
 * par deux flux n'en ajoute pas une seconde. `groupByEvent` donne, pour un
 * événement membre d'un fait repris plusieurs fois, tous les événements du
 * groupe — la détection n'ouvre alors qu'une alerte par règle pour ce fait.
 */
export type CorroborationContext = {
  sourcesByOrg: Map<number, number>;
  groupByEvent: Map<number, number[]>;
};

/**
 * Réduit des événements aux faits distincts, par organisation, avec la règle
 * `cross-flow@1`. Fonction pure : elle ne lit ni n'écrit en base.
 */
export function buildCorroborationContext(rows: readonly CorroborationRow[]): CorroborationContext {
  const byOrg = new Map<number, CorroborationRow[]>();
  for (const row of rows) {
    const orgId = Number(row.org_id);
    const list = byOrg.get(orgId);
    if (list) list.push(row);
    else byOrg.set(orgId, [row]);
  }
  const sourcesByOrg = new Map<number, number>();
  const groupByEvent = new Map<number, number[]>();
  for (const [orgId, list] of byOrg) {
    const groups = findCrossFlowDuplicates(
      list.map((row) => ({ id: Number(row.id), title: row.title, day: row.day })),
    );
    const duplicates = new Set<number>();
    for (const group of groups) {
      for (const id of group.memberIds) groupByEvent.set(id, group.memberIds);
      for (const id of group.duplicateIds) duplicates.add(id);
    }
    const sources = new Set<string>();
    for (const row of list) {
      if (!duplicates.has(Number(row.id))) sources.add(row.source_id);
    }
    sourcesByOrg.set(orgId, sources.size);
  }
  return { sourcesByOrg, groupByEvent };
}

/**
 * Charge les événements de la fenêtre (30 jours par défaut) et les réduit aux
 * faits distincts. Sans `orgIds`, la passe globale couvre toutes les
 * organisations en une requête ; avec `at`, la fenêtre se termine à cet
 * instant, comme le comptage historique par événement.
 */
export async function loadCorroborationContext(
  orgIds?: readonly number[],
  at?: Date,
): Promise<CorroborationContext> {
  const params: unknown[] = [];
  const where: string[] = ["org_id IS NOT NULL"];
  if (orgIds !== undefined) {
    params.push(orgIds);
    where.push(`org_id = ANY($${params.length}::int[])`);
  }
  if (at) {
    params.push(at);
    where.push(`COALESCE(observed_at, collected_at) >= $${params.length}::timestamptz - interval '30 days'`);
  } else {
    where.push("COALESCE(observed_at, collected_at) >= now() - interval '30 days'");
  }
  const r = await query<CorroborationRow>(
    `SELECT id::int AS id, org_id::int AS org_id, source_id, title,
            to_char(COALESCE(observed_at, collected_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
       FROM event
      WHERE ${where.join(" AND ")}`,
    params,
  );
  return buildCorroborationContext(r.rows);
}

export async function evaluateEvent(
  eventId: number,
  ctx?: { corroboration?: CorroborationContext; force?: boolean },
): Promise<number> {
  const rules = await loadRules();
  const er = await query<Record<string, unknown>>("SELECT * FROM event WHERE id=$1", [eventId]);
  const e = er.rows[0];
  if (!e) return 0;
  // Faux événements : bruit sans ancrage régional, écarté avant toute règle.
  // Une promotion humaine (`force`) conserve son alerte.
  if (await discardIfFalse(e, { force: ctx?.force })) return 0;
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
  // A human promotion outranks automatic gates, including the scope gate.
  if (e.org_id == null && isScopeGateEnabled() && !ctx?.force) {
    const decision = await classifyScope(`${String(e.title ?? "")} ${String(e.summary ?? "")}`);
    if (!isConfident(decision) || decision.scope !== "REGIONAL") {
      const reason = decision === null
        ? "modèle de portée indisponible"
        : decision.scope !== "REGIONAL"
          ? `portée ${decision.scope}`
          : `confiance ${decision.confidence} < ${SCOPE_CONFIDENCE_THRESHOLD}`;
      await recordDetectionDecision({
        stage: "scope_gate",
        reason,
        verdict: decision === null ? "indisponible" : "refuse",
        eventId: Number(e.id),
        ...(decision ? { model: decision.model, scope: decision.scope } : {}),
      });
      return 0;
    }
    regionalVerdict = decision;
  }

  const matched = rules.filter((rule) => !rule.match.indicator_type && matchesEvent(rule, e, org));
  if (matched.length === 0) return 0;

  const at = (e.observed_at ?? e.collected_at ?? new Date()) as Date;
  const orgId = e.org_id == null ? null : Number(e.org_id);
  // Le comptage préchargé couvre toutes les organisations ; sans lui (appel
  // unitaire), on charge la seule organisation de l'événement. Dans les deux
  // cas, les reprises inter-flux du même fait ne comptent qu'une source.
  let factGroup: number[] | null = null;
  let distinctSources = 0;
  if (orgId != null) {
    const local = ctx?.corroboration ?? (await loadCorroborationContext([orgId], at));
    distinctSources = local.sourcesByOrg.get(orgId) ?? 0;
    factGroup = local.groupByEvent.get(Number(e.id)) ?? null;
  }

  const confidence = scoreAlert({
    sourceConfidence: typeof e.confidence === "string" ? e.confidence : null,
    assertionType: typeof e.assertion_type === "string" ? e.assertion_type : null,
    orgId,
    orgDept: org && typeof org.dept === "string" ? org.dept : null,
    distinctSources,
  });

  // Une seule échelle décisionnelle : la note de confiance non majorée.
  // L'ancrage Nouvelle-Aquitaine est tracé dans `globalScore`, mais ne doit
  // ni ouvrir la porte globale ni assouplir un seuil de règle.
  const anchored = orgId != null || e.regional === true;
  const globalScore = calibratedScore(confidence.score, anchored);
  const confidenceEvidence = {
    score: confidence.score,
    globalScore,
    status: confidence.status,
    threshold: REVIEW_THRESHOLD,
    anchored,
    components: confidence.components,
    distinct_sources: distinctSources,
  };

  // `force` : une promotion de quarantaine est un acte humain explicite.
  // L'analyste a choisi ce fait ; la porte de confiance ne s'applique qu'aux
  // alertes automatiques, sur la note de confiance d'origine.
  if (!ctx?.force && confidence.score < REVIEW_THRESHOLD) {
    await recordDetectionDecision({
      stage: "global_threshold",
      reason: `score ${confidence.score} < ${REVIEW_THRESHOLD}`,
      verdict: "refuse",
      eventId: Number(e.id),
      score: confidence.score,
      threshold: REVIEW_THRESHOLD,
    });
    return 0;
  }
  const ruleThresholds = await loadRuleThresholds();

  let created = 0;
  for (const rule of matched) {
    // Un seuil calibré ne peut que resserrer : il porte sur la note de base,
    // jamais majorée, et une promotion humaine (`force`) le conserve.
    const threshold = ruleThresholds.get(rule.id);
    if (!ctx?.force && threshold != null && confidence.score < threshold) {
      await recordDetectionDecision({
        stage: "rule_threshold",
        reason: `score ${confidence.score} < ${threshold}${anchored ? " (ancrage NA exclu du seuil calibré)" : ""}`,
        verdict: "refuse",
        eventId: Number(e.id),
        ruleId: rule.id,
        score: confidence.score,
        threshold,
      });
      continue;
    }
    const scope = orgId != null ? "organization_incident" : "regional_advisory";
    // Un fait repris par plusieurs flux ne produit qu'une alerte par règle :
    // le premier membre évalué l'ouvre, les suivants s'y rattachent. Une
    // promotion humaine (`force`) reste un acte explicite et n'est pas filtrée.
    if (!ctx?.force && factGroup !== null && factGroup.length > 1) {
      const already = await query<{ id: number }>(
        `SELECT id FROM alert WHERE rule_id=$1 AND event_id = ANY($2::int[]) AND status IN ('open','ack') LIMIT 1`,
        [rule.id, factGroup]
      );
      if (already.rows.length > 0) {
        await recordDetectionDecision({
          stage: "cross_flow_dedup",
          reason: `alerte ${DEDUP_RULE_VERSION} déjà ouverte sur le fait`,
          verdict: "refuse",
          eventId: Number(e.id),
          ruleId: rule.id,
          scope,
        });
        continue;
      }
    }
    const evidence = {
      event_title: e.title,
      confidence: confidenceEvidence,
      ...(factGroup !== null && factGroup.length > 1
        ? { cross_flow: { rule_version: DEDUP_RULE_VERSION, event_ids: factGroup } }
        : {}),
      ...(threshold != null ? { calibration: { score: confidence.score, globalScore, threshold, anchored } } : {}),
      ...(regionalVerdict ? { scope_decision: regionalVerdict } : {}),
    };
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
  // Les indicateurs techniques n'ont ni rattachement d'organisation, ni
  // assertion, ni corroboration : leur note de confiance structurelle reste
  // sous le seuil de revue. Le seuil d'admission porte ici sur les événements
  // (revendications) ; on conserve la création d'alerte sur indicateur.
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
  const corroboration = await loadCorroborationContext();
  let alerts = 0;
  for (const e of events.rows) alerts += await evaluateEvent(e.id, { corroboration });
  for (const i of inds.rows) alerts += await evaluateIndicator(i.id);
  return { events: events.rows.length, indicators: inds.rows.length, alerts };
}
