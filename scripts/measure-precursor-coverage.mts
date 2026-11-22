/**
 * Reproducible audit of pre-claim organisation signals for the six-month
 * victim-forecast backtest.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-precursor-coverage.mts \
 *     --as-of=2026-11-22 --json=bench/results/signal-coverage-2026-11-22.json
 *
 * Read only. Every query selects an organisation id and a timestamp only: no
 * victim name, claim description or evidence URL is ever read.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_DEPARTMENTS } from "../apps/api/src/geo/commune-index.js";
import {
	HORIZON_DAYS,
	addDays,
	walkForwardCutoffs,
} from "../apps/api/src/prediction/victim-forecast.js";
import {
	measureSource,
	summariseCoverage,
	type SignalRecord,
	type SourceCoverage,
	type VictimRecord,
} from "../apps/api/src/prediction/precursor-coverage.js";

/** Tables holding a dated, organisation-level signal in the local database. */
const SOURCES = [
	{ source: "alert", table: "alert", column: "created_at" },
	{ source: "archive_event", table: "archive_event", column: "valid_at" },
	{ source: "asset", table: "asset", column: "created_at" },
	{ source: "event", table: "event", column: "valid_at" },
	{ source: "event_archive", table: "event_archive", column: "valid_at" },
	{ source: "exposition_service", table: "exposition_service", column: "consulted_at" },
	{ source: "org_alias", table: "org_alias", column: "created_at" },
	{ source: "org_enrichissement", table: "org_enrichissement", column: "verifie_at" },
	{ source: "public_mandate", table: "public_mandate", column: "created_at" },
] as const;

type DatedRow = { orgId: number; observedAt: string };
type VictimRow = { orgId: number; claimedAt: string };

const arg = (name: string): string | undefined =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
	const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
	const jsonPath = arg("json");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
		throw new Error(`Invalid --as-of date: ${asOf}`);
	}

	const cutoffs = walkForwardCutoffs(asOf);
	const windowStart = cutoffs[0]!;
	const windowEnd = addDays(cutoffs.at(-1)!, HORIZON_DAYS);

	const { rows: victimRows } = await query<VictimRow>(
		`SELECT c.org_id AS "orgId",
		        to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "claimedAt"
		   FROM leak_claim c
		   JOIN org o ON o.id = c.org_id
		  WHERE c.na AND c.org_id IS NOT NULL AND o.dept = ANY($1::text[])
		    AND c.published_at >= $2::date AND c.published_at < $3::date`,
		[NA_DEPARTMENTS, windowStart, windowEnd],
	);
	const victims: VictimRecord[] = victimRows.map((row) => ({
		orgId: row.orgId,
		claimedAt: row.claimedAt,
	}));

	const perSource: SourceCoverage[] = [];
	for (const { source, table, column } of SOURCES) {
		const { rows } = await query<DatedRow>(
			`SELECT s.org_id AS "orgId",
			        to_char(s.${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "observedAt"
			   FROM ${table} s
			   JOIN org o ON o.id = s.org_id
			  WHERE o.dept = ANY($1::text[]) AND s.${column} IS NOT NULL`,
			[NA_DEPARTMENTS],
		);
		const signals: SignalRecord[] = rows.map((row) => ({
			orgId: row.orgId,
			observedAt: row.observedAt,
		}));
		perSource.push(measureSource(source, victims, signals));
	}
	const coverage = summariseCoverage(perSource);

	const result = {
		generatedAt: new Date().toISOString(),
		asOf,
		windowStart,
		windowEnd,
		windows: cutoffs.length,
		horizonDays: HORIZON_DAYS,
		victims: coverage.victims,
		sources: coverage.sources,
		pairs: coverage.pairs,
		priorSignalPairs: coverage.priorSignalPairs,
		victimsWithAnyPriorSignal: coverage.victimsWithAnyPriorSignal,
		coverage: coverage.coverage,
		perSource: coverage.perSource,
		caveat:
			"Signals strictly before the organisation's own claim date; a signal on the claim day is excluded.",
	};

	console.log(`Precursor coverage — ${cutoffs.length} windows ${windowStart} → ${windowEnd}`);
	console.log(
		`Victims: ${coverage.victims} NA organisations x ${coverage.sources} dated sources = ${coverage.pairs} pairs`,
	);
	console.log(
		`Prior signals: ${coverage.priorSignalPairs}/${coverage.pairs} pairs, victims covered ${coverage.victimsWithAnyPriorSignal}/${coverage.victims} (${coverage.coverage.toFixed(4)})`,
	);
	for (const row of coverage.perSource) {
		console.log(
			`  ${row.source.padEnd(20)} ${row.victimsWithPriorSignal}/${row.victims} victims, ${row.priorSignals} prior rows`,
		);
	}
	if (jsonPath) {
		writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
		console.log(`\nMeasurement written to ${jsonPath}`);
	}
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
