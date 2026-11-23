/**
 * Reproducible audit of group-agnostic sector waves for the six-month
 * victim-forecast backtest.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-sector-wave.mts \
 *     --as-of=2026-11-22 \
 *     --json=bench/results/sector-wave-2026-11-22.json
 *
 * Read only. Selects organisation ids, scope codes and dates: no victim name,
 * claim description or evidence URL is read.
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
	scoreCandidate,
	summariseBacktest,
	victimsInWindow,
	walkForwardCutoffs,
	type ClaimRecord,
	type EventRecord,
	type OrgMeta,
} from "../apps/api/src/prediction/victim-forecast.js";
import {
	measureWaveSource,
	summariseWaveCoverage,
	waveBonus,
	waveCountsAtCutoff,
	type WaveScope,
	type WaveSubject,
} from "../apps/api/src/prediction/sector-wave.js";

type OrgRow = { id: number; sector: string | null; dept: string; secteurGroupe: string | null };
type ClaimRow = {
	orgId: number;
	publishedAt: string;
	groupName: string;
	sector: string | null;
	dept: string;
	secteurGroupe: string | null;
};
type EventRow = { orgId: number; validAt: string; sourceId: string };
type ScaleRow = { sources: number; events: number };

const arg = (name: string): string | undefined =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
	const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
	const jsonPath = arg("json");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
		throw new Error(`Invalid --as-of date: ${asOf}`);
	}
	const lookbackArg = arg("lookback");
	const lookbackDays = lookbackArg === undefined ? HORIZON_DAYS : Number(lookbackArg);
	if (!Number.isInteger(lookbackDays) || lookbackDays <= 0) {
		throw new Error(`Invalid --lookback: ${lookbackArg}`);
	}

	const cutoffs = walkForwardCutoffs(asOf, BACKTEST_MONTHS, HORIZON_DAYS);
	const windowStart = cutoffs[0]!;
	const windowEnd = addDays(cutoffs.at(-1)!, HORIZON_DAYS);

	const { rows: orgRows } = await query<OrgRow>(
		`SELECT id, sector, dept, secteur_groupe AS "secteurGroupe"
		   FROM org WHERE dept = ANY($1::text[])`,
		[NA_DEPARTMENTS],
	);
	const { rows: claimRows } = await query<ClaimRow>(
		`SELECT c.org_id AS "orgId",
		        to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "publishedAt",
		        c.group_name AS "groupName", o.sector, o.dept,
		        o.secteur_groupe AS "secteurGroupe"
		   FROM leak_claim c JOIN org o ON o.id = c.org_id
		  WHERE c.na AND c.org_id IS NOT NULL AND c.published_at IS NOT NULL
		    AND o.dept = ANY($1::text[])`,
		[NA_DEPARTMENTS],
	);
	const { rows: eventRows } = await query<EventRow>(
		`SELECT e.org_id AS "orgId",
		        to_char(e.valid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "validAt",
		        e.source_id AS "sourceId"
		   FROM event e
		  WHERE e.org_id IN (SELECT id FROM org WHERE dept = ANY($1::text[]))`,
		[NA_DEPARTMENTS],
	);
	const { rows: scaleRows } = await query<ScaleRow>(
		`SELECT (SELECT count(*) FROM source)::int AS sources,
		        (SELECT count(*) FROM event)::int AS events`,
	);

	const orgs: OrgMeta[] = orgRows.map((o) => ({
		orgId: o.id,
		name: "",
		sector: o.sector,
		dept: o.dept,
	}));
	const claims: ClaimRecord[] = claimRows.map((c) => ({
		orgId: c.orgId,
		publishedAt: c.publishedAt,
		groupName: c.groupName,
	}));
	const events: EventRecord[] = eventRows.map((e) => ({
		orgId: e.orgId,
		validAt: e.validAt,
		sourceId: e.sourceId,
	}));
	const subjects: WaveSubject[] = claimRows.map((c) => ({
		orgId: c.orgId,
		publishedAt: c.publishedAt,
		sectorGroup: c.secteurGroupe,
		sector: c.sector,
		dept: c.dept,
	}));
	const victims = subjects.filter(
		(subject) => subject.publishedAt >= windowStart && subject.publishedAt < windowEnd,
	);
	const scopes: readonly WaveScope[] = ["secteur_groupe", "secteur", "departement"];
	const coverage = summariseWaveCoverage(
		scopes.map((scope) => measureWaveSource(scope, victims, subjects, lookbackDays)),
	);

	const groups = new Map<number, string | null>(
		orgRows.map((org) => [org.id, org.secteurGroupe]),
	);
	const baselineWindows = cutoffs.map((cutoff) =>
		evaluateWindow(
			cutoff,
			rankCandidates(buildCandidates(orgs, claims, events, cutoff)).map((entry) => entry.orgId),
			victimsInWindow(claims, cutoff),
		),
	);
	const injectedWindows = cutoffs.map((cutoff) => {
		const counts = waveCountsAtCutoff(subjects, cutoff, "secteur_groupe", lookbackDays);
		const ranked = buildCandidates(orgs, claims, events, cutoff)
			.map((candidate) => ({
				orgId: candidate.orgId,
				score: scoreCandidate(candidate) + waveBonus(candidate.orgId, groups, counts),
			}))
			.sort((a, b) => b.score - a.score || a.orgId - b.orgId)
			.slice(0, TOP_N)
			.map((entry) => entry.orgId);
		return evaluateWindow(cutoff, ranked, victimsInWindow(claims, cutoff));
	});
	const baseline = summariseBacktest(baselineWindows);
	const injected = summariseBacktest(injectedWindows);
	const lastCounts = waveCountsAtCutoff(subjects, asOf, "secteur_groupe", lookbackDays);
	const activeGroups = [...lastCounts.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);

	const result = {
		generatedAt: new Date().toISOString(),
		asOf,
		windowStart,
		windowEnd,
		windows: cutoffs.length,
		horizonDays: HORIZON_DAYS,
		lookbackDays,
		victims: coverage.victims,
		sources: coverage.sources,
		pairs: coverage.pairs,
		priorSignalPairs: coverage.priorSignalPairs,
		victimsWithAnyPriorSignal: coverage.victimsWithAnyPriorSignal,
		coverage: coverage.coverage,
		claimsRead: subjects.length,
		perSource: coverage.perSource,
		activeSectorGroupsAtAsOf: activeGroups.map(([key, count]) => ({ key, count })),
		baseline: { predictions: baseline.predictions, hits: baseline.hits, victims: baseline.victims },
		injected: { predictions: injected.predictions, hits: injected.hits, victims: injected.victims },
		dataset: {
			organisationsNA: orgs.length,
			sources: scaleRows[0]?.sources ?? 0,
			events: scaleRows[0]?.events ?? 0,
		},
		caveat:
			`A wave signal is a claim by another NA organisation in the same scope within ${lookbackDays} days, strictly before the victim's claim. No group label of the future claim is used. The injected ranking adds a bounded sector-group bonus to the published score; it is an audit, not a change to the published forecast.`,
	};

	console.log(`Sector-wave precursors — ${cutoffs.length} windows ${windowStart} → ${windowEnd}`);
	console.log(`Lookback: ${lookbackDays} days`);
	console.log(
		`Victims: ${coverage.victims} NA organisations x ${coverage.sources} scopes = ${coverage.pairs} pairs (${subjects.length} NA claims read)`,
	);
	for (const source of coverage.perSource) {
		console.log(
			`  ${source.scope.padEnd(15)} ${source.victimsWithPriorSignal}/${source.victims} victims, ${source.priorSignals} prior signals`,
		);
	}
	console.log(
		`Prior signals: ${coverage.priorSignalPairs}/${coverage.pairs} pairs, victims covered ${coverage.victimsWithAnyPriorSignal}/${coverage.victims} (${coverage.coverage.toFixed(4)})`,
	);
	console.log(
		`Active sector groups at ${asOf}: ${activeGroups.map(([key, count]) => `${key}=${count}`).join(", ") || "none"}`,
	);
	console.log(
		`Backtest hits: baseline ${baseline.hits}/${baseline.predictions}, wave-injected ${injected.hits}/${injected.predictions} (${injected.victims} victims)`,
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
