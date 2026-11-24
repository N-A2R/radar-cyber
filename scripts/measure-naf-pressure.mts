/**
 * Reproducible audit of a group-agnostic NAF2 pressure signal for the
 * six-month victim-forecast backtest.
 *
 *   DATABASE_URL=... npm run measure:naf-pressure -- --as-of=2026-11-22 \
 *     --json=bench/results/naf-pressure-2026-11-22.json
 *
 * Read only. Organisation ids, NAF codes and dates only: no claim text,
 * evidence URL, personal detail or future group label is read or emitted.
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
	scoreCandidate,
	summariseBacktest,
	victimsInWindow,
	walkForwardCutoffs,
	type ClaimRecord,
	type EventRecord,
	type OrgMeta,
} from "../apps/api/src/prediction/victim-forecast.js";
import {
	NAF_BONUS_CAP,
	NAF_BONUS_WEIGHT,
	NAF_LOOKBACK_DAYS,
	nafKeysByOrg,
	nafPressureAtCutoff,
	nafPressureBonus,
	nafPressureForOrg,
	type NafClaim,
	type NafOrg,
} from "../apps/api/src/prediction/naf-precursors.js";

type OrgRow = {
	id: number;
	sector: string | null;
	dept: string;
	naf: string | null;
};
type ClaimRow = { orgId: number; publishedAt: string; groupName: string };
type EventRow = { orgId: number; validAt: string; sourceId: string };

const arg = (name: string): string | undefined =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/** Pre-registered sensitivity sweep: no weight is picked from observed hits. */
const WEIGHTS = [0, 10, NAF_BONUS_WEIGHT, 100] as const;

async function main(): Promise<void> {
	const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
	const jsonPath = arg("json");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
		throw new Error(`Invalid --as-of date: ${asOf}`);
	}

	const cutoffs = walkForwardCutoffs(asOf, BACKTEST_MONTHS, HORIZON_DAYS);
	const windowStart = cutoffs[0]!;
	const windowEnd = addDays(cutoffs.at(-1)!, HORIZON_DAYS);

	const { rows: orgRows } = await query<OrgRow>(
		`SELECT id, sector, dept, naf
		   FROM org WHERE dept = ANY($1::text[])`,
		[NA_DEPARTMENTS],
	);
	const { rows: claimRows } = await query<ClaimRow>(
		`SELECT c.org_id AS "orgId",
		        to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "publishedAt",
		        c.group_name AS "groupName"
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

	const orgs: OrgMeta[] = orgRows.map((row) => ({
		orgId: row.id,
		name: "",
		sector: row.sector,
		dept: row.dept,
	}));
	const nafOrgs: NafOrg[] = orgRows.map((row) => ({ orgId: row.id, naf: row.naf }));
	const keysByOrg = nafKeysByOrg(nafOrgs);
	const claims: ClaimRecord[] = claimRows.map((row) => ({
		orgId: row.orgId,
		publishedAt: row.publishedAt,
		groupName: row.groupName,
	}));
	/** Deliberately narrower than ClaimRecord: no future group label exists here. */
	const nafClaims: NafClaim[] = claimRows.map((row) => ({
		orgId: row.orgId,
		publishedAt: row.publishedAt,
	}));
	const events: EventRecord[] = eventRows.map((row) => ({
		orgId: row.orgId,
		validAt: row.validAt,
		sourceId: row.sourceId,
	}));

	const candidatesByCutoff = cutoffs.map((cutoff) =>
		buildCandidates(orgs, claims, events, cutoff).map((candidate) => ({
			orgId: candidate.orgId,
			score: scoreCandidate(candidate),
		})),
	);
	const pressureByCutoff = cutoffs.map((cutoff) =>
		nafPressureAtCutoff(nafClaims, keysByOrg, cutoff, NAF_LOOKBACK_DAYS),
	);
	const rankAt = (index: number, weight: number) =>
		candidatesByCutoff[index]!
			.map((entry) => ({
				orgId: entry.orgId,
				score:
					entry.score +
					nafPressureBonus(
						entry.orgId,
						keysByOrg,
						pressureByCutoff[index]!,
						weight,
						NAF_BONUS_CAP,
					),
			}))
			.sort((a, b) => b.score - a.score || a.orgId - b.orgId);
	const actualAt = (cutoff: string) => victimsInWindow(claims, cutoff);

	const evaluateWeight = (weight: number) =>
		summariseBacktest(
			cutoffs.map((cutoff, index) =>
				evaluateWindow(
					cutoff,
					rankAt(index, weight)
						.slice(0, TOP_N)
						.map((entry) => entry.orgId),
					actualAt(cutoff),
				),
			),
		);

	const baseline = evaluateWeight(0);
	const injected = evaluateWeight(NAF_BONUS_WEIGHT);
	const sweep = WEIGHTS.map((weight) => {
		const result = evaluateWeight(weight);
		return {
			weight,
			predictions: result.predictions,
			hits: result.hits,
			hitOrgIds: result.windows.flatMap((window) => window.hits),
		};
	});

	const perWindow = cutoffs.map((cutoff, index) => {
		const actual = actualAt(cutoff);
		const ranking = rankAt(index, NAF_BONUS_WEIGHT);
		const strongestRanking = rankAt(index, 100);
		const tenth = ranking[TOP_N - 1]?.score ?? 0;
		const strongestTenth = strongestRanking[TOP_N - 1]?.score ?? 0;
		const boostedAt100 = candidatesByCutoff[index]!.filter(
			(candidate) =>
				nafPressureBonus(
					candidate.orgId,
					keysByOrg,
					pressureByCutoff[index]!,
					100,
					NAF_BONUS_CAP,
				) > 0,
		).length;
		const closestAt100 = actual
			.map((orgId) => {
				const position = strongestRanking.findIndex((entry) => entry.orgId === orgId);
				return {
					orgId,
					rank: position + 1,
					gapToTop10: Math.round((strongestTenth - (strongestRanking[position]?.score ?? 0)) * 100) / 100,
				};
			})
			.sort((a, b) => a.rank - b.rank)[0] ?? null;
		const coverage = actual.filter(
			(orgId) => nafPressureForOrg(orgId, keysByOrg, pressureByCutoff[index]!) > 0,
		);
		return {
			cutoff,
			boostedAt100,
			closestAt100,
			horizonEnd: addDays(cutoff, HORIZON_DAYS),
			actual,
			coveredVictims: coverage,
			missedVictims: actual
				.map((orgId) => {
					const position = ranking.findIndex((entry) => entry.orgId === orgId);
					const score = ranking[position]?.score ?? 0;
					return {
						orgId,
						rank: position + 1,
						gapToTop10: Math.round((tenth - score) * 100) / 100,
						pressure: nafPressureForOrg(orgId, keysByOrg, pressureByCutoff[index]!),
					};
				})
				.filter((entry) => entry.rank > TOP_N),
		};
	});
	const totalCoveredPairs = perWindow.reduce(
		(sum, window) => sum + window.coveredVictims.length,
		0,
	);
	const totalVictimPairs = perWindow.reduce((sum, window) => sum + window.actual.length, 0);
	const activeKeys = [...pressureByCutoff.at(-1)!.entries()]
		.map(([key, entry]) => ({ key, claims: entry.claims }))
		.sort((a, b) => b.claims - a.claims || a.key.localeCompare(b.key));

	const result = {
		generatedAt: new Date().toISOString(),
		asOf,
		windowStart,
		windowEnd,
		windows: cutoffs.length,
		horizonDays: HORIZON_DAYS,
		lookbackDays: NAF_LOOKBACK_DAYS,
		weight: NAF_BONUS_WEIGHT,
		cap: NAF_BONUS_CAP,
		claimsRead: claims.length,
		organisationsNA: orgs.length,
		baseline: { predictions: baseline.predictions, hits: baseline.hits, victims: baseline.victims },
		injected: { predictions: injected.predictions, hits: injected.hits, victims: injected.victims },
		sweep,
		coverage: {
			victimPairs: totalVictimPairs,
			coveredPairs: totalCoveredPairs,
			ratio: totalVictimPairs === 0 ? 0 : totalCoveredPairs / totalVictimPairs,
		},
		activeNafKeysAtAsOf: activeKeys,
		perWindow,
		caveat:
			"NAF2 pressure counts claims published before the cutoff, in the last 365 days, against other organisations sharing the claimant's exact two-character NAF code. The signal never reads the future claim's group, text or date, and the published forecast is unchanged: injection is an audit only. Weights are pre-registered, not fitted to hits.",
	};

	console.log(`NAF2 pressure — ${cutoffs.length} windows ${windowStart} → ${windowEnd}`);
	console.log(
		`Claims: ${claims.length} NA claims, ${orgs.length} NA organisations, ${NAF_LOOKBACK_DAYS}-day lookback, weight ${NAF_BONUS_WEIGHT}/${NAF_BONUS_CAP} claims`,
	);
	console.log(
		`Victim pairs with prior same-NAF2 claim: ${totalCoveredPairs}/${totalVictimPairs} (${(totalCoveredPairs / Math.max(totalVictimPairs, 1)).toFixed(4)})`,
	);
	console.log(
		`Backtest hits: baseline ${baseline.hits}/${baseline.predictions}, injected ${injected.hits}/${injected.predictions}`,
	);
	console.log(
		`Pre-registered weight sweep: ${sweep.map((entry) => `${entry.weight}=>${entry.hits}/${entry.predictions}`).join(", ")}`,
	);
	for (const window of perWindow) {
		console.log(
			`  ${window.cutoff}: covered ${window.coveredVictims.length}/${window.actual.length}, missed ${window.missedVictims.map((v) => `${v.orgId}(rank ${v.rank}, gap ${v.gapToTop10}, pressure ${v.pressure})`).join(", ") || "none"}`,
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
