/**
 * Audits whether the victims of the victim-forecast backtest had any
 * organisation-level signal strictly before their claim.
 *
 * Pure module: the caller supplies rows read from the local database. Only
 * organisation identifiers and timestamps are held here; no name, description
 * or evidence URL is read or emitted.
 */
import { dayNumber } from "./victim-forecast.js";

export type VictimRecord = {
	orgId: number;
	claimedAt: string;
};

export type SignalRecord = {
	orgId: number;
	observedAt: string;
};

export type SourceCoverage = {
	source: string;
	victims: number;
	pairs: number;
	victimsWithPriorSignal: number;
	priorSignals: number;
	coveredOrgIds: number[];
};

export type CoverageResult = {
	victims: number;
	sources: number;
	pairs: number;
	priorSignalPairs: number;
	victimsWithAnyPriorSignal: number;
	coverage: number;
	perSource: readonly Omit<SourceCoverage, "coveredOrgIds">[];
};

/** A signal on the claim day is not a precursor: the boundary is exclusive. */
export function countPriorSignals(
	orgId: number,
	claimedAt: string,
	signals: readonly SignalRecord[],
): number {
	const boundary = dayNumber(claimedAt);
	return signals.filter(
		(signal) => signal.orgId === orgId && dayNumber(signal.observedAt) < boundary,
	).length;
}

/** One victim is counted once per source, even with repeated signal rows. */
export function measureSource(
	source: string,
	victims: readonly VictimRecord[],
	signals: readonly SignalRecord[],
): SourceCoverage {
	const unique = new Map<string, VictimRecord>();
	for (const victim of victims) {
		unique.set(`${victim.orgId}:${dayNumber(victim.claimedAt)}`, victim);
	}
	const counts = [...unique.values()].map((victim) =>
		countPriorSignals(victim.orgId, victim.claimedAt, signals),
	);
	return {
		source,
		victims: counts.length,
		pairs: counts.length,
		victimsWithPriorSignal: counts.filter((count) => count > 0).length,
		priorSignals: counts.reduce((sum, count) => sum + count, 0),
		coveredOrgIds: [...unique.values()]
			.filter((_, index) => counts[index]! > 0)
			.map((victim) => victim.orgId)
			.sort((a, b) => a - b),
	};
}

/** Micro-averaged over victim/source pairs, with the union of covered victims. */
export function summariseCoverage(results: readonly SourceCoverage[]): CoverageResult {
	const perSource = [...results]
		.sort((a, b) => a.source.localeCompare(b.source))
		.map(({ coveredOrgIds: _coveredOrgIds, ...rest }) => rest);
	const victims = perSource[0]?.victims ?? 0;
	const pairs = perSource.reduce((sum, result) => sum + result.pairs, 0);
	const priorSignalPairs = perSource.reduce(
		(sum, result) => sum + result.victimsWithPriorSignal,
		0,
	);
	const covered = new Set(results.flatMap((result) => result.coveredOrgIds));
	const victimsWithAnyPriorSignal = covered.size;
	return {
		victims,
		sources: perSource.length,
		pairs,
		priorSignalPairs,
		victimsWithAnyPriorSignal,
		coverage: victims === 0 ? 0 : Math.round((victimsWithAnyPriorSignal / victims) * 10_000) / 10_000,
		perSource,
	};
}
