/**
 * Reproducible audit of collective group precursors for the six-month
 * victim-forecast backtest.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-group-precursors.mts \
 *     --as-of=2026-11-22 \
 *     --json=bench/results/group-precursors-2026-11-22.json
 *
 * Read only. Selects organisation ids, group labels, sector/department codes
 * and dates: no victim name, claim description or evidence URL is read.
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
	measureGroupSource,
	summariseGroupCoverage,
	type ClaimRecord,
} from "../apps/api/src/prediction/group-precursors.js";

type ClaimRow = {
	orgId: number;
	publishedAt: string;
	group: string | null;
	sector: string | null;
	dept: string;
};

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

	const { rows: claimRows } = await query<ClaimRow>(
		`SELECT c.org_id AS "orgId",
		        to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "publishedAt",
		        c.group_name AS "group", o.sector, o.dept
		   FROM leak_claim c
		   JOIN org o ON o.id = c.org_id
		  WHERE c.na AND c.org_id IS NOT NULL AND c.group_name IS NOT NULL
		    AND c.published_at IS NOT NULL AND o.dept = ANY($1::text[])`,
		[NA_DEPARTMENTS],
	);
	const claims: ClaimRecord[] = claimRows.map((row) => ({ ...row }));
	const victims = claims.filter(
		(claim) => claim.publishedAt >= windowStart && claim.publishedAt < windowEnd,
	);

	const summary = summariseGroupCoverage([
		measureGroupSource("secteur", victims, claims),
		measureGroupSource("departement", victims, claims),
	]);

	const result = {
		generatedAt: new Date().toISOString(),
		asOf,
		windowStart,
		windowEnd,
		windows: cutoffs.length,
		horizonDays: HORIZON_DAYS,
		victims: summary.victims,
		sources: summary.sources,
		pairs: summary.pairs,
		priorSignalPairs: summary.priorSignalPairs,
		victimsWithAnyPriorSignal: summary.victimsWithAnyPriorSignal,
		coverage: summary.coverage,
		claimsRead: claims.length,
		perSource: summary.perSource,
		caveat:
			"A collective signal is a claim by another organisation, same normalised group and same sector or department, strictly before the victim's own claim. Group labels are matched exactly after normalisation, never by substring.",
	};

	console.log(`Group precursors — ${cutoffs.length} windows ${windowStart} → ${windowEnd}`);
	console.log(
		`Victims: ${summary.victims} NA organisations x ${summary.sources} collective sources = ${summary.pairs} pairs (${claims.length} NA claims read)`,
	);
	for (const source of summary.perSource) {
		console.log(
			`  ${source.scope.padEnd(12)} ${source.victimsWithPriorSignal}/${source.victims} victims, ${source.priorSignals} prior signals`,
		);
	}
	console.log(
		`Prior signals: ${summary.priorSignalPairs}/${summary.pairs} pairs, victims covered ${summary.victimsWithAnyPriorSignal}/${summary.victims} (${summary.coverage.toFixed(4)})`,
	);
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
