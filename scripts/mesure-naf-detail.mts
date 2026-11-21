/**
 * Reproducible measurement of the detailed-NAF classification rate.
 *
 * Reads only the persisted columns written by scripts/backfill-naf-detail.mts:
 * no classification and no network call happens during measurement. Restricted
 * to the twelve departments of Nouvelle-Aquitaine. Prints the baseline from
 * the raw `org.naf` field as well, so the effect of the rules is visible.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/mesure-naf-detail.mts
 */
import { closePools, ingestQuery } from "../apps/api/src/db.js";
import {
	NA_DEPARTMENTS,
	measureNafCoverage,
} from "../apps/api/src/analyse/naf-detail.js";

const MIN_RATE = 0.85;

type Totals = { total: string; detailed: string; raw_detailed: string };
type SourceRow = { source: string | null; count: string };

async function main(): Promise<void> {
	const { rows } = await ingestQuery<Totals>(
		`SELECT count(*)::text AS total,
		        count(*) FILTER (
		          WHERE naf ~ '^[0-9]{2}\\.[0-9]{2}[A-Z]$' OR naf_detail IS NOT NULL
		        )::text AS detailed,
		        count(*) FILTER (
		          WHERE naf ~ '^[0-9]{2}\\.[0-9]{2}[A-Z]$'
		        )::text AS raw_detailed
		   FROM org WHERE dept = ANY($1::text[])`,
		[[...NA_DEPARTMENTS]],
	);
	const { rows: bySource } = await ingestQuery<SourceRow>(
		`SELECT naf_detail_source AS source, count(*)::text AS count
		   FROM org
		  WHERE dept = ANY($1::text[]) AND naf_detail IS NOT NULL
		    AND (naf IS NULL OR naf !~ '^[0-9]{2}\\.[0-9]{2}[A-Z]$')
		  GROUP BY 1 ORDER BY count(*) DESC`,
		[[...NA_DEPARTMENTS]],
	);

	const t = rows[0];
	if (!t) throw new Error("no aggregate row returned");
	const total = Number(t.total);
	const raw = measureNafCoverage(Number(t.raw_detailed), total);
	const final = measureNafCoverage(Number(t.detailed), total);
	const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

	console.log(`Scope: Nouvelle-Aquitaine (${NA_DEPARTMENTS.length} departments)`);
	console.log(`Organisations: ${total.toLocaleString("en-US")}`);
	console.log(`Raw naf field with a valid APE code: ${raw.classified.toLocaleString("en-US")} (${pct(raw.rate)})`);
	console.log(`Detailed NAF classification: ${final.classified.toLocaleString("en-US")} (${pct(final.rate)})`);
	console.log(`Gain: ${(final.classified - raw.classified).toLocaleString("en-US")} organisations, ${((final.rate - raw.rate) * 100).toFixed(2)} points`);
	console.log("By source:");
	for (const row of bySource) {
		console.log(`  ${(row.source ?? "null").padEnd(20)} ${Number(row.count).toLocaleString("en-US")}`);
	}
	if (final.rate < MIN_RATE) {
		console.error(`Detailed NAF rate below ${pct(MIN_RATE)}: ${pct(final.rate)}`);
		process.exitCode = 1;
	}
	await closePools();
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
