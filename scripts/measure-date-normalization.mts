/**
 * Reproducible measurement of the normalized-date rate for Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-date-normalization.mts \
 *     --json=bench/results/date-normalization-na.json
 *
 * Add --apply to write the minimal, NA-only normalization plan (idempotent).
 * The output contains counts only: no title, organisation or victim data.
 */
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
import { writeFileSync } from "node:fs";
import type { EventDateInput } from "../apps/api/src/dates/normalize.js";

// Dynamic imports: db.ts reads DATABASE_URL at module evaluation time.
const { closePools, query, withClient } = await import("../apps/api/src/db.js");
const { classifyDate, NA_DEPARTMENTS, planDateNormalization } = await import("../apps/api/src/dates/normalize.js");
const APPLY = process.argv.includes("--apply");
const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
	?? "bench/results/date-normalization-na.json";

interface EventRow extends EventDateInput {
	id: string;
}

async function loadRows(): Promise<EventRow[]> {
	const { rows } = await query<EventRow>(
		`SELECT e.id::text AS id, e.observed_at::text AS "observedAt",
		        e.collected_at::text AS "collectedAt", e.date_source AS "dateSource",
		        e.date_confidence AS "dateConfidence", e.evidence, e.regional,
		        o.dept AS "orgDept"
		   FROM event e
		   LEFT JOIN org o ON o.id = e.org_id
		  WHERE e.regional = true OR o.dept = ANY($1::text[])`,
		[Object.keys(NA_DEPARTMENTS)],
	);
	return rows;
}

function summarize(rows: EventRow[]) {
	const byKind: Record<string, number> = {};
	let normalized = 0;
	for (const row of rows) {
		const status = classifyDate(row);
		byKind[status.kind] = (byKind[status.kind] ?? 0) + 1;
		if (status.normalized) normalized++;
	}
	return {
		events: rows.length,
		normalized,
		ratePercent: rows.length === 0 ? 0 : Math.round((normalized / rows.length) * 10_000) / 100,
		byKind,
	};
}

async function apply(rows: EventRow[]): Promise<{ claims: number; provenance: number }> {
	const plans = rows.map((row) => ({ row, plan: planDateNormalization(row) }));
	const claims = plans.filter((p) => p.plan.action === "claim");
	const provenance = plans.filter((p) => p.plan.action === "source");
	let claimsWritten = 0;
	let provenanceWritten = 0;

	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			for (const { row, plan } of claims) {
				if (plan.action !== "claim") continue;
				const r = await client.query(
					`UPDATE event
					    SET evidence = evidence || $2::jsonb,
					        date_source = 'claim',
					        date_confidence = 'medium'
					  WHERE id = $1::bigint AND date_source IS DISTINCT FROM 'claim'`,
					[row.id, JSON.stringify({ claimDate: plan.claimDate })],
				);
				claimsWritten += r.rowCount ?? 0;
			}
			for (const { row } of provenance) {
				const r = await client.query(
					`UPDATE event
					    SET date_source = 'feed', date_confidence = 'high'
					  WHERE id = $1::bigint AND date_source IS NULL`,
					[row.id],
				);
				provenanceWritten += r.rowCount ?? 0;
			}
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	});
	return { claims: claimsWritten, provenance: provenanceWritten };
}

async function datasetScale() {
	const { rows } = await query<{ sources: string; events: string }>(
		`SELECT (SELECT count(*) FROM source)::text AS sources,
		        (SELECT count(*) FROM event)::text AS events`,
	);
	let organisations: number;
	let exact = true;
	try {
		const exactCount = await query<{ count: string }>("SELECT count(*)::text AS count FROM org");
		organisations = Number(exactCount.rows[0].count);
	} catch {
		const estimate = await query<{ estimate: string }>(
			"SELECT reltuples::bigint::text AS estimate FROM pg_class WHERE relname = 'org'",
		);
		organisations = Number(estimate.rows[0].estimate);
		exact = false;
	}
	return {
		organisations,
		organisationsExact: exact,
		sources: Number(rows[0].sources),
		events: Number(rows[0].events),
	};
}

try {
	const beforeRows = await loadRows();
	const before = summarize(beforeRows);
	const planned = beforeRows
		.map((row) => planDateNormalization(row))
		.filter((plan) => plan.action !== "none").length;
	const changes = APPLY ? await apply(beforeRows) : { claims: 0, provenance: 0 };
	const after = APPLY ? summarize(await loadRows()) : before;
	const report = {
		generatedAt: new Date().toISOString(),
		metric: {
			definition: "NA events with an ISO date and explicit non-fallback provenance (feed, inferred or claim) / all NA events",
			scope: "Nouvelle-Aquitaine regional flag or an organisation in one of the 13 NA departments",
			excluded: "collection-time fallback (fetched) is never counted as a normalized date",
			privacy: "counts and reason codes only; no title, organisation or victim data exported",
		},
		dataset: await datasetScale(),
		before,
		after,
		plannedChanges: planned,
		changesApplied: changes,
	};
	writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	console.log(`NA dates before: ${before.normalized}/${before.events} normalized (${before.ratePercent}%)`);
	if (APPLY) {
		console.log(`Applied: ${changes.claims} claim dates, ${changes.provenance} provenance labels`);
		console.log(`NA dates after:  ${after.normalized}/${after.events} normalized (${after.ratePercent}%)`);
	} else {
		console.log(`Planned changes: ${planned} (dry run; add --apply to write NA-only changes)`);
	}
	console.log(`Report written to ${JSON_PATH}`);
} finally {
	await closePools();
}
