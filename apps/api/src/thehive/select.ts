/**
 * Shared selection of alerts eligible for TheHive case creation.
 *
 * One SQL statement, used by the API route and by the reproducible measurement.
 * Review-only scopes are excluded, Nouvelle-Aquitaine is the sole region, and
 * source relevance is deliberately not a filter (gray sources are allowed).
 */
import type { TheHiveAlert } from "./cases.js";
import { ALERT_SCOPES_REVUE } from "../alert-scope.js";
import { NA_DEPARTMENTS } from "../filiation/siret.js";

/** Scopes produced by internal agents: never exported to an external tool. */
export const EXCLUDED_SCOPES: readonly string[] = [
	...ALERT_SCOPES_REVUE,
	"rupture",
	"supervision-silent-source",
];

export const SELECT_NA_ALERTS = `
SELECT a.id,
       a.rule_id AS "ruleId",
       a.severity,
       a.scope,
       e.regional,
       e.family AS "eventFamily",
       e.observed_at AS "observedAt",
       COALESCE(a.org_id, e.org_id) AS "organizationId",
       o.name AS "organizationName",
       o.dept AS "organizationDept",
       s.name AS "sourceName",
       s.url AS "sourceUrl"
FROM alert a
JOIN event e ON e.id = a.event_id
LEFT JOIN org o ON o.id = COALESCE(a.org_id, e.org_id)
LEFT JOIN source s ON s.id = e.source_id
WHERE a.scope <> ALL($1::text[])
  AND (e.regional = true OR o.dept = ANY($2::text[]))
ORDER BY a.id ASC
LIMIT $3`;

export function selectParams(limit: number): unknown[] {
	return [[...EXCLUDED_SCOPES], Object.keys(NA_DEPARTMENTS), limit];
}

/** Translate a database row into the connector's input type. */
export function mapAlertRow(row: Record<string, unknown>): TheHiveAlert {
	return {
		id: Number(row.id),
		ruleId: String(row.ruleId ?? ""),
		severity: Number(row.severity),
		scope: String(row.scope ?? ""),
		regional: row.regional === true,
		organizationName: typeof row.organizationName === "string" ? row.organizationName : null,
		organizationDept: typeof row.organizationDept === "string" ? row.organizationDept : null,
		eventFamily: typeof row.eventFamily === "string" ? row.eventFamily : null,
		sourceName: typeof row.sourceName === "string" ? row.sourceName : null,
		sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
		observedAt: row.observedAt instanceof Date
			? row.observedAt.toISOString()
			: typeof row.observedAt === "string" ? row.observedAt : null,
	};
}
