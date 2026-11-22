/**
 * Audits collective prior signals for the victim-forecast backtest: claims by
 * the same ransomware group, in the same sector or department, strictly before
 * the victim's own claim.
 *
 * Pure module. The caller supplies organisation-level rows read from the local
 * database. Only organisation ids, group labels, sector/department codes and
 * dates are held here; no victim name, claim description or evidence URL.
 */
import { dayNumber } from "./victim-forecast.js";

export type ClaimRecord = {
	orgId: number;
	publishedAt: string;
	group: string | null;
	sector: string | null;
	dept: string;
};

export type GroupScope = "secteur" | "departement";

export type GroupSignal = {
	orgId: number;
	observedAt: string;
	scope: GroupScope;
};

export type GroupSourceResult = {
	scope: GroupScope;
	victims: number;
	pairs: number;
	victimsWithPriorSignal: number;
	priorSignals: number;
	coveredOrgIds: number[];
};

export type GroupCoverage = {
	victims: number;
	sources: number;
	pairs: number;
	priorSignalPairs: number;
	victimsWithAnyPriorSignal: number;
	coverage: number;
	perSource: readonly Omit<GroupSourceResult, "coveredOrgIds">[];
};

/** Case, whitespace and diacritics are ignored; substring matches are not. */
export function normaliseGroup(value: string | null): string | null {
	if (value === null) return null;
	const normalised = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	return normalised === "" ? null : normalised;
}

/**
 * Claims by another organisation, same group and same sector or department,
 * strictly before the victim's claim. One prior claim yields one signal per
 * matching scope; repeated rows for one organisation and day are collapsed.
 */
export function priorGroupSignals(
	victim: ClaimRecord,
	claims: readonly ClaimRecord[],
): GroupSignal[] {
	const group = normaliseGroup(victim.group);
	if (group === null) return [];
	const boundary = dayNumber(victim.publishedAt);
	const seen = new Set<string>();
	const signals: GroupSignal[] = [];
	for (const claim of claims) {
		if (claim.orgId === victim.orgId) continue;
		if (normaliseGroup(claim.group) !== group) continue;
		const day = dayNumber(claim.publishedAt);
		if (day >= boundary) continue;
		const scopes: GroupScope[] = [];
		if (victim.sector !== null && victim.sector !== "" && claim.sector === victim.sector) {
			scopes.push("secteur");
		}
		if (victim.dept !== "" && claim.dept === victim.dept) {
			scopes.push("departement");
		}
		for (const scope of scopes) {
			const key = `${scope}:${claim.orgId}:${day}`;
			if (seen.has(key)) continue;
			seen.add(key);
			signals.push({
				orgId: victim.orgId,
				observedAt: claim.publishedAt.slice(0, 10),
				scope,
			});
		}
	}
	return signals.sort(
		(a, b) =>
			a.orgId - b.orgId ||
			a.observedAt.localeCompare(b.observedAt) ||
			a.scope.localeCompare(b.scope),
	);
}

/** One victim is counted once per scope, even with several prior claims. */
export function measureGroupSource(
	scope: GroupScope,
	victims: readonly ClaimRecord[],
	claims: readonly ClaimRecord[],
): GroupSourceResult {
	const unique = new Map<string, ClaimRecord>();
	for (const victim of victims) {
		unique.set(`${victim.orgId}:${dayNumber(victim.publishedAt)}`, victim);
	}
	const counts = [...unique.values()].map(
		(victim) => priorGroupSignals(victim, claims).filter((signal) => signal.scope === scope).length,
	);
	return {
		scope,
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

/** Micro-averaged over victim/scope pairs, with the union of covered victims. */
export function summariseGroupCoverage(results: readonly GroupSourceResult[]): GroupCoverage {
	const perSource = [...results]
		.sort((a, b) => a.scope.localeCompare(b.scope))
		.map(({ coveredOrgIds: _coveredOrgIds, ...rest }) => rest);
	const victims = perSource[0]?.victims ?? 0;
	const covered = new Set(results.flatMap((result) => result.coveredOrgIds));
	return {
		victims,
		sources: perSource.length,
		pairs: perSource.reduce((sum, result) => sum + result.pairs, 0),
		priorSignalPairs: perSource.reduce((sum, result) => sum + result.victimsWithPriorSignal, 0),
		victimsWithAnyPriorSignal: covered.size,
		coverage: victims === 0 ? 0 : Math.round((covered.size / victims) * 10_000) / 10_000,
		perSource,
	};
}
