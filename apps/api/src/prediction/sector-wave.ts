/**
 * Audits group-agnostic sector waves for the victim-forecast backtest: claims
 * by other organisations in the same sector group, sector or department,
 * within a short lookback and strictly before the victim's own claim.
 *
 * Unlike the group-precursors audit, no knowledge of the future claim's
 * ransomware group is needed: every score is observable at the cutoff.
 * Pure module. Only organisation ids, scope codes and dates are held here;
 * no victim name, claim description or evidence URL.
 */
import { dayNumber } from "./victim-forecast.js";

export type WaveSubject = {
	orgId: number;
	publishedAt: string;
	sectorGroup: string | null;
	sector: string | null;
	dept: string;
};

export type WaveScope = "secteur_groupe" | "secteur" | "departement";

export type WaveSignal = {
	orgId: number;
	observedAt: string;
	scope: WaveScope;
};

export type WaveSourceResult = {
	scope: WaveScope;
	victims: number;
	pairs: number;
	victimsWithPriorSignal: number;
	priorSignals: number;
	coveredOrgIds: number[];
};

export type WaveCoverage = {
	victims: number;
	sources: number;
	pairs: number;
	priorSignalPairs: number;
	victimsWithAnyPriorSignal: number;
	coverage: number;
	perSource: readonly Omit<WaveSourceResult, "coveredOrgIds">[];
};

/** Case, whitespace and diacritics are ignored; substring matches are not. */
export function normaliseWaveKey(value: string | null): string | null {
	if (value === null) return null;
	const normalised = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	return normalised === "" ? null : normalised;
}

function scopeKey(subject: WaveSubject, scope: WaveScope): string | null {
	switch (scope) {
		case "secteur_groupe":
			return normaliseWaveKey(subject.sectorGroup);
		case "secteur":
			return normaliseWaveKey(subject.sector);
		case "departement":
			return normaliseWaveKey(subject.dept);
	}
}

/**
 * Claims by another organisation in the same scope, inside the lookback
 * window, strictly before the victim's claim. Repeated rows for one
 * organisation and day are collapsed.
 */
export function priorWaveSignals(
	victim: WaveSubject,
	claimRows: readonly WaveSubject[],
	scope: WaveScope,
	lookbackDays = 30,
): WaveSignal[] {
	const key = scopeKey(victim, scope);
	if (key === null || lookbackDays <= 0) return [];
	const boundary = dayNumber(victim.publishedAt);
	const seen = new Set<string>();
	const signals: WaveSignal[] = [];
	for (const claim of claimRows) {
		if (claim.orgId === victim.orgId) continue;
		if (scopeKey(claim, scope) !== key) continue;
		const day = dayNumber(claim.publishedAt);
		if (day >= boundary || day < boundary - lookbackDays) continue;
		const dedupe = `${claim.orgId}:${day}`;
		if (seen.has(dedupe)) continue;
		seen.add(dedupe);
		signals.push({
			orgId: victim.orgId,
			observedAt: claim.publishedAt.slice(0, 10),
			scope,
		});
	}
	return signals.sort(
		(a, b) => a.observedAt.localeCompare(b.observedAt) || a.orgId - b.orgId,
	);
}

/** One victim is counted once per scope, even with several prior claims. */
export function measureWaveSource(
	scope: WaveScope,
	victims: readonly WaveSubject[],
	claims: readonly WaveSubject[],
	lookbackDays = 30,
): WaveSourceResult {
	const unique = new Map<string, WaveSubject>();
	for (const victim of victims) {
		unique.set(`${victim.orgId}:${dayNumber(victim.publishedAt)}`, victim);
	}
	const rows = [...unique.values()];
	const counts = rows.map(
		(victim) => priorWaveSignals(victim, claims, scope, lookbackDays).length,
	);
	return {
		scope,
		victims: rows.length,
		pairs: rows.length,
		victimsWithPriorSignal: counts.filter((count) => count > 0).length,
		priorSignals: counts.reduce((sum, count) => sum + count, 0),
		coveredOrgIds: rows
			.filter((_, index) => counts[index]! > 0)
			.map((victim) => victim.orgId)
			.sort((a, b) => a - b),
	};
}

/** Micro-averaged over victim/scope pairs, with the union of covered victims. */
export function summariseWaveCoverage(results: readonly WaveSourceResult[]): WaveCoverage {
	const perSource = [...results]
		.sort((a, b) => a.scope.localeCompare(b.scope))
		.map(({ coveredOrgIds: _coveredOrgIds, ...rest }) => rest);
	const victims = perSource[0]?.victims ?? 0;
	const covered = new Set(results.flatMap((result) => result.coveredOrgIds));
	return {
		victims,
		sources: perSource.length,
		pairs: perSource.reduce((sum, result) => sum + result.pairs, 0),
		priorSignalPairs: perSource.reduce(
			(sum, result) => sum + result.victimsWithPriorSignal,
			0,
		),
		victimsWithAnyPriorSignal: covered.size,
		coverage: victims === 0 ? 0 : Math.round((covered.size / victims) * 10_000) / 10_000,
		perSource,
	};
}

/**
 * Prior claim counts per scope key at a cutoff. This is the ranking-time
 * form of the signal: it uses only claims dated strictly before the cutoff.
 */
export function waveCountsAtCutoff(
	claims: readonly WaveSubject[],
	cutoff: string,
	scope: WaveScope,
	lookbackDays = 30,
): Map<string, number> {
	const boundary = dayNumber(cutoff);
	const counts = new Map<string, number>();
	for (const claim of claims) {
		const key = scopeKey(claim, scope);
		if (key === null) continue;
		const day = dayNumber(claim.publishedAt);
		if (day >= boundary || day < boundary - lookbackDays) continue;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/** Bounded bonus for one organisation; zero when its scope key is unknown. */
export function waveBonus(
	orgId: number,
	groups: ReadonlyMap<number, string | null>,
	counts: ReadonlyMap<string, number>,
	weight = 30,
): number {
	const key = normaliseWaveKey(groups.get(orgId) ?? null);
	return key === null ? 0 : weight * Math.min(counts.get(key) ?? 0, 3);
}

export type CompositeWaveScope = "grp_dept" | "secteur_dept" | "grp_secteur_dept";

/** Composite scope key; a blank component makes the whole key unusable. */
export function compositeWaveKey(
	subject: Pick<WaveSubject, "sectorGroup" | "sector" | "dept">,
	scope: CompositeWaveScope,
): string | null {
	const raw =
		scope === "grp_dept"
			? [subject.sectorGroup, subject.dept]
			: scope === "secteur_dept"
				? [subject.sector, subject.dept]
				: [subject.sectorGroup, subject.sector, subject.dept];
	const parts = raw.map(normaliseWaveKey);
	return parts.some((part) => part === null) ? null : parts.join("|");
}

/**
 * Prior claim counts per composite scope key at a cutoff. Only claims strictly
 * before the cutoff and inside the lookback are read; no future group label is
 * needed. Pure module, organisation-level keys only.
 */
export function compositeWaveCounts(
	claims: readonly WaveSubject[],
	cutoff: string,
	scope: CompositeWaveScope,
	lookbackDays = 365,
): Map<string, number> {
	const boundary = dayNumber(cutoff);
	const counts = new Map<string, number>();
	for (const claim of claims) {
		const day = dayNumber(claim.publishedAt);
		if (day >= boundary || day < boundary - lookbackDays) continue;
		const key = compositeWaveKey(claim, scope);
		if (key === null) continue;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}
