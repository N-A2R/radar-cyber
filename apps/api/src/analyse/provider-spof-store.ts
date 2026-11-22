/**
 * Reads the smallest possible slice of the database for the SPOF report.
 *
 * The only organization column used is `dept`, as a regional filter; neither
 * names nor websites nor event contents are selected. The regional predicate
 * is applied in SQL before the pure aggregator sees any identifier.
 */
import { query } from "../db.js";
import { chargerCatalogue } from "../dns/store.js";
import {
	analyzeProviderSpof,
	SPOF_THRESHOLD,
	type ProviderObservation,
	type SpofAnalysis,
} from "./provider-spof.js";

export const NA_DEPARTMENTS: readonly string[] = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "65", "79", "86", "87",
];

export const SQL = {
	observations: `SELECT pd.domain,
	                      ARRAY(
	                        SELECT DISTINCT o.id
	                          FROM unnest(pd.org_ids) AS u(id)
	                          JOIN org o ON o.id = u.id
	                         WHERE o.dept = ANY($1::text[])
	                      )::int[] AS "orgIds",
	                      pd.ns, pd.mx
	                 FROM provider_domain pd
	                WHERE pd.last_state <> 'erreur'
	                ORDER BY pd.domain`,
	baseline: `SELECT (SELECT reltuples::bigint FROM pg_class WHERE oid = 'org'::regclass) AS organizations,
	                  (SELECT count(*) FROM source) AS sources,
	                  (SELECT count(*) FROM event) AS events`,
} as const;

interface ObservationRow {
	domain: string;
	orgIds: number[] | null;
	ns: string[] | null;
	mx: string[] | null;
}

export interface ProviderSpofMeasurement extends SpofAnalysis {
	baseline: { organizations: number; sources: number; events: number };
	measuredAt: string;
}

/** Measure the providers whose outage would affect more than `threshold` NA organizations. */
export async function measureProviderSpof(threshold = SPOF_THRESHOLD): Promise<ProviderSpofMeasurement> {
	const [observations, catalogue, totals] = await Promise.all([
		query<ObservationRow>(SQL.observations, [[...NA_DEPARTMENTS]]),
		chargerCatalogue(),
		query<{ organizations: string | number; sources: string | number; events: string | number }>(SQL.baseline),
	]);

	const rows: ProviderObservation[] = observations.rows.map((row) => ({
		domain: row.domain,
		orgIds: row.orgIds ?? [],
		ns: row.ns ?? [],
		mx: row.mx ?? [],
	}));
	const analysis = analyzeProviderSpof(rows, catalogue, { threshold });
	const baseline = totals.rows[0] ?? { organizations: 0, sources: 0, events: 0 };
	return {
		...analysis,
		baseline: {
			organizations: Number(baseline.organizations),
			sources: Number(baseline.sources),
			events: Number(baseline.events),
		},
		measuredAt: new Date().toISOString(),
	};
}
