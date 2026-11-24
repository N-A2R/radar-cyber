/**
 * Reproducible audit of brand-family precursors for the six-month
 * victim-forecast backtest.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-brand-family-precursors.mts \
 *     --as-of=2026-11-22 \
 *     --json=bench/results/brand-family-precursors-2026-11-22.json
 *
 * Read only. Selects organisation ids, organisation names, aliases and dates:
 * no claim description, evidence URL or personal detail is read or emitted.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_DEPARTMENTS } from "../apps/api/src/geo/commune-index.js";
import {
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
	attachBrandFamilyClaims,
	brandFamilyBonus,
	measureBrandFamilySource,
	type BrandClaim,
	type BrandOrganization,
} from "../apps/api/src/prediction/brand-family-precursors.js";
import { summariseCoverage } from "../apps/api/src/prediction/precursor-coverage.js";

type OrgRow = { id: number; name: string; sector: string | null; dept: string };
type AliasRow = { orgId: number; alias: string };
type ClaimRow = {
	id: number;
	orgId: number | null;
	victim: string;
	na: boolean;
	publishedAt: string;
};
type EventRow = { orgId: number; validAt: string; sourceId: string };

const arg = (name: string): string | undefined =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
	const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
	const jsonPath = arg("json");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
		throw new Error(`Invalid --as-of date: ${asOf}`);
	}

	const { rows: orgRows } = await query<OrgRow>(
		`SELECT id, name, sector, dept FROM org WHERE dept = ANY($1::text[])`,
		[NA_DEPARTMENTS],
	);
	const { rows: aliasRows } = await query<AliasRow>(
		`SELECT oa.org_id AS "orgId", oa.alias
		   FROM org_alias oa JOIN org o ON o.id = oa.org_id
		  WHERE o.dept = ANY($1::text[]) AND oa.alias IS NOT NULL AND oa.rejected_at IS NULL`,
		[NA_DEPARTMENTS],
	);
	const { rows: claimRows } = await query<ClaimRow>(
		`SELECT id, org_id AS "orgId", victim, na,
		        to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "publishedAt"
		   FROM leak_claim WHERE published_at IS NOT NULL AND victim IS NOT NULL`,
	);
	const { rows: eventRows } = await query<EventRow>(
		`SELECT e.org_id AS "orgId",
		        to_char(e.valid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "validAt",
		        e.source_id AS "sourceId"
		   FROM event e WHERE e.org_id IN (SELECT id FROM org WHERE dept = ANY($1::text[]))`,
		[NA_DEPARTMENTS],
	);

	const aliases = new Map<number, string[]>();
	for (const row of aliasRows) {
		const list = aliases.get(row.orgId) ?? [];
		list.push(row.alias);
		aliases.set(row.orgId, list);
	}
	const organizations: BrandOrganization[] = orgRows.map((row) => ({
		orgId: row.id,
		name: row.name,
		aliases: aliases.get(row.id) ?? [],
	}));
	const claims: BrandClaim[] = claimRows.map((row) => ({
		claimId: row.id,
		orgId: row.orgId,
		victim: row.victim,
		publishedAt: row.publishedAt,
	}));
	const orgs: OrgMeta[] = orgRows.map((row) => ({
		orgId: row.id,
		name: row.name,
		sector: row.sector,
		dept: row.dept,
	}));
	const claimRecords: ClaimRecord[] = claimRows
		.filter((row) => row.na && row.orgId !== null)
		.map((row) => ({
			orgId: row.orgId!,
			publishedAt: row.publishedAt,
			groupName: "",
		}));
	const events: EventRecord[] = eventRows.map((row) => ({
		orgId: row.orgId,
		validAt: row.validAt,
		sourceId: row.sourceId,
	}));

	const attachment = attachBrandFamilyClaims(claims, organizations);
	const cutoffs = walkForwardCutoffs(asOf);
	const windowStart = cutoffs[0]!;
	const windowEnd = addDays(cutoffs.at(-1)!, HORIZON_DAYS);

	const baselineWindows = cutoffs.map((cutoff) => {
		const ranked = rankCandidates(buildCandidates(orgs, claimRecords, events, cutoff), TOP_N);
		return evaluateWindow(
			cutoff,
			ranked.map((entry) => entry.orgId),
			victimsInWindow(claimRecords, cutoff),
		);
	});
	const baseline = summariseBacktest(baselineWindows);

	const observableSignals = new Map<string, readonly SignalRecord[]>();
	for (const cutoff of cutoffs) {
		observableSignals.set(
			cutoff,
			attachment.attachments.filter((signal) => signal.observedAt < cutoff),
		);
	}

	const naOrgIds = new Set(orgRows.map((row) => row.id));
	const victims: VictimRecord[] = claimRecords
		.filter((row) => naOrgIds.has(row.orgId) && row.publishedAt >= windowStart && row.publishedAt < windowEnd)
		.map((row) => ({ orgId: row.orgId, claimedAt: row.publishedAt }));
	const priorSignals: SignalRecord[] = [];
	for (const victim of victims) {
		const cutoff = cutoffs.find((value) => victim.claimedAt >= value && victim.claimedAt < addDays(value, HORIZON_DAYS));
		if (cutoff === undefined) continue;
		priorSignals.push(
			...(observableSignals.get(cutoff) ?? []).filter((signal) => signal.orgId === victim.orgId),
		);
	}
	const sourceCoverage = measureBrandFamilySource(victims, priorSignals);
	const coverage = summariseCoverage([sourceCoverage]);

	const buildInjectedWindows = (factor: number) =>
		cutoffs.map((cutoff) => {
			const signalsAtCutoff = observableSignals.get(cutoff) ?? [];
			const ranked = buildCandidates(orgs, claimRecords, events, cutoff)
				.map((candidate) => ({
					orgId: candidate.orgId,
					score:
						scoreCandidate(candidate) +
						factor * brandFamilyBonus(candidate.orgId, signalsAtCutoff),
				}))
				.sort((a, b) => b.score - a.score || a.orgId - b.orgId)
				.slice(0, TOP_N)
				.map((entry) => entry.orgId);
			return evaluateWindow(cutoff, ranked, victimsInWindow(claimRecords, cutoff));
		});
	const injectedWindows = buildInjectedWindows(1);
	const injected = summariseBacktest(injectedWindows);
	const bonusSweep = [0.5, 1, 2].map((factor) => ({
		factor,
		hits: summariseBacktest(buildInjectedWindows(factor)).hits,
	}));

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
		coveredOrgIds: sourceCoverage.coveredOrgIds,
		attachments: attachment.attachments.length,
		ambiguousBrands: attachment.ambiguous,
		unmatchedBrands: attachment.unmatched,
		baseline: { predictions: baseline.predictions, hits: baseline.hits, victims: baseline.victims },
		injected: { predictions: injected.predictions, hits: injected.hits, victims: injected.victims },
		perWindow: injectedWindows.map((window, index) => ({
			cutoff: window.cutoff,
			baselineHits: baselineWindows[index]!.hits.length,
			injectedHits: window.hits.length,
			hitOrgIds: window.hits,
			victims: window.actual.length,
			signalOrgs: new Set((observableSignals.get(window.cutoff) ?? []).map((s) => s.orgId)).size,
			signalsAtCutoff: (observableSignals.get(window.cutoff) ?? []).length,
		})),
		bonusSweep,
		caveat:
			"A brand-family signal is a claim against a different organisation whose name shares the exact first two normalised tokens with a single NA organisation. Only claims published before the cutoff are injected; the published victim forecast is not changed.",
	};

	console.log(`Brand-family precursors — ${cutoffs.length} windows ${windowStart} → ${windowEnd}`);
	console.log(
		`Victims: ${coverage.victims} NA organisations x ${coverage.sources} source = ${coverage.pairs} pairs (${claims.length} claims read, ${attachment.attachments.length} brand attachments)`,
	);
	console.log(
		`Prior signals observable at cutoff: ${coverage.priorSignalPairs}/${coverage.pairs} pairs, victims covered ${coverage.victimsWithAnyPriorSignal}/${coverage.victims} (${coverage.coverage.toFixed(4)})`,
	);
	console.log(
		`Backtest hits: baseline ${baseline.hits}/${baseline.predictions}, brand-injected ${injected.hits}/${injected.predictions} (${injected.victims} victims)`,
	);
	console.log(`Bonus sweep hits: ${bonusSweep.map((s) => `${s.hits}@${s.factor}`).join(", ")}`);
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
