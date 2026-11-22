/**
 * Reproducible victim forecast and six-month walk-forward backtest.
 *
 * One command reads the real local database and produces both deliverables:
 *   - the ten Nouvelle-Aquitaine organisations most likely to be named as
 *     victims in the next 30 days;
 *   - micro-averaged precision and recall over six non-overlapping 30-day
 *     windows, so the published rate is measured rather than asserted.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-victim-forecast.mts \
 *     --as-of=2026-11-22 --json=bench/results/victim-forecast-2026-11-22.json
 *
 * Read only. Every selected column is organisation-level: the victim name,
 * the claim description and the evidence URL are never read.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_DEPARTMENTS } from "../apps/api/src/geo/commune-index.js";
import {
	BACKTEST_MONTHS,
	HORIZON_DAYS,
	TOP_N,
	addDays,
	buildCandidates,
	evaluateWindow,
	rankCandidates,
	summariseBacktest,
	victimsInWindow,
	walkForwardCutoffs,
	type ClaimRecord,
	type EventRecord,
	type OrgMeta,
} from "../apps/api/src/prediction/victim-forecast.js";

type OrgRow = { id: number; name: string; sector: string | null; dept: string };
type ClaimRow = { org_id: number; published_at: string; group_name: string };
type EventRow = { org_id: number; valid_at: string; source_id: string };
type ScaleRow = { sources: number; events: number };

const arg = (name: string): string | undefined =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
	const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
	const topN = Number(arg("top") ?? TOP_N);
	const jsonPath = arg("json");

	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
		throw new Error(`Invalid --as-of date: ${asOf}`);
	}

	const { rows: orgRows } = await query<OrgRow>(
		`SELECT id, name, sector, dept FROM org WHERE dept = ANY($1::text[])`,
		[NA_DEPARTMENTS],
	);
	const { rows: claimRows } = await query<ClaimRow>(
		`SELECT org_id, to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS published_at, group_name
		   FROM leak_claim
		  WHERE na AND org_id IS NOT NULL AND published_at IS NOT NULL`,
	);
	const { rows: eventRows } = await query<EventRow>(
		`SELECT e.org_id, to_char(e.valid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS valid_at, e.source_id
		   FROM event e
		  WHERE e.org_id IN (SELECT id FROM org WHERE dept = ANY($1::text[]))`,
		[NA_DEPARTMENTS],
	);
	const { rows: scaleRows } = await query<ScaleRow>(
		`SELECT (SELECT count(*) FROM source)::int AS sources, (SELECT count(*) FROM event)::int AS events`,
	);

	const orgs: OrgMeta[] = orgRows.map((o) => ({
		orgId: o.id,
		name: o.name,
		sector: o.sector,
		dept: o.dept,
	}));
	const claims: ClaimRecord[] = claimRows.map((c) => ({
		orgId: c.org_id,
		publishedAt: c.published_at,
		groupName: c.group_name,
	}));
	const events: EventRecord[] = eventRows.map((e) => ({
		orgId: e.org_id,
		validAt: e.valid_at,
		sourceId: e.source_id,
	}));

	const cutoffs = walkForwardCutoffs(asOf, BACKTEST_MONTHS, HORIZON_DAYS);
	const windows = cutoffs.map((cutoff) => {
		const entries = rankCandidates(buildCandidates(orgs, claims, events, cutoff), topN);
		return evaluateWindow(
			cutoff,
			entries.map((entry) => entry.orgId),
			victimsInWindow(claims, cutoff),
		);
	});
	const backtest = summariseBacktest(windows);
	const forecast = rankCandidates(buildCandidates(orgs, claims, events, asOf), topN).map(
		(entry) => ({
			rank: entry.rank,
			orgId: entry.orgId,
			name: entry.name,
			sector: entry.sector,
			dept: entry.dept,
			score: entry.score,
		}),
	);

	const result = {
		generatedAt: new Date().toISOString(),
		asOf,
		horizonDays: HORIZON_DAYS,
		horizonEnd: addDays(asOf, HORIZON_DAYS),
		topN,
		backtestMonths: BACKTEST_MONTHS,
		cutoffs,
		dataset: {
			organisationsNA: orgs.length,
			sources: scaleRows[0]?.sources ?? 0,
			events: scaleRows[0]?.events ?? 0,
			naClaims: claims.length,
			naOrganisationEvents: events.length,
		},
		backtest: {
			predictions: backtest.predictions,
			hits: backtest.hits,
			victims: backtest.victims,
			precision: backtest.precision,
			recall: backtest.recall,
			recallInterval: backtest.recallInterval,
			perWindow: windows.map((w) => ({
				cutoff: w.cutoff,
				horizonEnd: w.horizonEnd,
				predicted: w.predicted.length,
				victims: w.actual.length,
				hits: w.hits.length,
				precision: w.precision,
				recall: w.recall,
			})),
		},
		forecast,
		caveat:
			"Retrospective evaluation: a claim published in a window is a victim even if the radar learned of it later. Features use only facts dated before the cutoff.",
	};

	console.log(`Victim forecast — as of ${asOf}, horizon ${HORIZON_DAYS} days`);
	console.log(
		`Universe: ${orgs.length.toLocaleString("en-US")} NA organisations, ${claims.length} NA claims, ${events.length} NA organisation events, ${scaleRows[0]?.sources ?? 0} sources`,
	);
	console.log(
		`Backtest: ${windows.length} windows x ${topN} predictions = ${backtest.predictions}, ${backtest.victims} victims, ${backtest.hits} hits`,
	);
	console.log(
		`Precision: ${backtest.precision.toFixed(4)}  Recall: ${backtest.recall === null ? "n/a" : backtest.recall.toFixed(4)}  Wilson 95%: ${backtest.recallInterval === null ? "n/a" : `[${backtest.recallInterval[0].toFixed(4)}, ${backtest.recallInterval[1].toFixed(4)}]`}`,
	);
	console.log(`\nTop ${topN} for ${asOf} -> ${result.horizonEnd}:`);
	for (const entry of forecast) {
		console.log(
			`  ${String(entry.rank).padStart(2)}. org=${entry.orgId} score=${entry.score.toFixed(2)} dept=${entry.dept} sector=${entry.sector ?? "-"}`,
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
