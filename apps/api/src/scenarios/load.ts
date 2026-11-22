/**
 * Read-only loader for the crisis scenario generator.
 *
 * All figures come from the live database: no fixture, no network call, no
 * paid service. Source titles and summaries are loaded only so the pure model
 * can screen out victim personal data; they are never returned to callers.
 */
import { query } from "../db.js";
import { NA_DEPARTMENTS, type RawSignal } from "./model.js";

export type Baseline = {
	organizations: number;
	sources: number;
	events: number;
};

type BaselineRow = { organizations: string | number; sources: string | number; events: string | number };

export async function loadBaseline(): Promise<Baseline> {
	const { rows } = await query<BaselineRow>(
		`SELECT (SELECT count(*) FROM org) AS organizations,
		        (SELECT count(*) FROM source) AS sources,
		        (SELECT count(*) FROM event) AS events`,
	);
	const row = rows[0];
	return {
		organizations: Number(row?.organizations ?? 0),
		sources: Number(row?.sources ?? 0),
		events: Number(row?.events ?? 0),
	};
}

type SignalRow = {
	eventId: number | string;
	orgId: number | string | null;
	family: string;
	assertionType: string;
	sourceId: string;
	sourceFamily: string | null;
	observedAt: string | null;
	severity: number | string | null;
	department: string | null;
	orgKind: string | null;
	orgSector: string | null;
	title: string | null;
	summary: string | null;
};

export async function loadRawSignals(): Promise<RawSignal[]> {
	const { rows } = await query<SignalRow>(
		`SELECT e.id AS "eventId",
		        o.id AS "orgId",
		        e.family,
		        e.assertion_type AS "assertionType",
		        e.source_id AS "sourceId",
		        s.family AS "sourceFamily",
		        COALESCE(e.observed_at, e.valid_at, e.collected_at)::text AS "observedAt",
		        COALESCE(e.severity, 0)::int AS severity,
		        o.dept AS department,
		        COALESCE(o.kind, 'autre') AS "orgKind",
		        o.sector AS "orgSector",
		        e.title,
		        e.summary
		   FROM event e
		   JOIN org o ON o.id = e.org_id
		   LEFT JOIN source s ON s.id = e.source_id
		  WHERE o.dept = ANY($1::text[])
		  ORDER BY e.id`,
		[[...NA_DEPARTMENTS]],
	);

	return rows.map((row) => ({
		eventId: Number(row.eventId),
		orgId: row.orgId === null ? null : Number(row.orgId),
		family: row.family,
		assertionType: row.assertionType,
		sourceId: row.sourceId,
		sourceFamily: row.sourceFamily ?? "unknown",
		observedAt: (row.observedAt ?? "").slice(0, 10),
		severity: Number(row.severity ?? 0),
		department: row.department,
		orgKind: row.orgKind ?? "autre",
		orgSector: row.orgSector,
		title: row.title,
		summary: row.summary,
	}));
}

/** Every source id accepted in a scenario must exist in the local source table. */
export async function loadKnownSourceIds(): Promise<Set<string>> {
	const { rows } = await query<{ id: string }>("SELECT id FROM source");
	return new Set(rows.map((row) => row.id));
}
