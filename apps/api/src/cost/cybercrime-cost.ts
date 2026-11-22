/**
 * Annual cost of cybercrime in Nouvelle-Aquitaine — pure estimator.
 *
 * The estimate is deliberately modest: it prices each incident at the median
 * amount actually awarded by a Nouvelle-Aquitaine public buyer for a cyber
 * service over the same twelve months (replacement-cost proxy). It corrects
 * the incident count for the radar's measured detection rate on the reference
 * corpus. Ransoms, business interruption and downstream losses are excluded
 * and must be reported as such: the result is a lower bound, not a census.
 *
 * No personal data about victims enters this module: only aggregate counts,
 * publication dates, detection flags and public contract amounts.
 */

export const NA_DEPARTMENTS = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

export const WINDOW = { from: "2025-11-01", to: "2026-10-31" } as const;
export const EXPECTED_BASELINE = {
	organizations: 1_673_151,
	sources: 312,
	events: 26_259,
	naOrganizations: 1_671_907,
} as const;

export type CoverageIncident = {
	datePublique: string;
	motif: string;
};

export type CostNotice = {
	id: string;
	date: string;
	departments: string[];
	amountEur: number | null;
	amountKind: string | null;
	nature: string;
};

export type Baseline = {
	organizations: number;
	sources: number;
	events: number;
	naOrganizations: number;
};

export type Estimate = {
	knownIncidents: number;
	seenIncidents: number;
	detectionRate: number;
	estimatedIncidents: number;
	unitCostEur: number;
	annualCostEur: number;
	ci95LowEur: number;
	ci95HighEur: number;
	iterations: number;
	seed: number;
};

export function isNADepartment(dept: string): boolean {
	return (NA_DEPARTMENTS as readonly string[]).includes(dept);
}

/** Publication date, not incident date: the corpus coverage measure uses the same key. */
export function inWindow(date: string): boolean {
	return date >= WINDOW.from && date <= WINDOW.to;
}

export function incidentsInWindow(rows: CoverageIncident[]): CoverageIncident[] {
	return rows.filter((row) => inWindow(row.datePublique));
}

export function detectionSample(rows: CoverageIncident[]): {
	total: number;
	seen: number;
	rate: number;
} {
	const total = rows.length;
	const seen = rows.filter((row) => row.motif === "vu").length;
	if (total === 0) throw new Error("detection sample is empty");
	return { total, seen, rate: seen / total };
}

/** Inverse-detection correction: known incidents divided by measured recall. */
export function estimateIncidentCount(sample: { total: number; seen: number }): number {
	if (sample.seen <= 0) throw new Error("detection sample has no matched incident");
	return sample.total / sample.seen * sample.total;
}

export function naNotices(notices: CostNotice[]): CostNotice[] {
	return notices.filter((notice) => notice.departments.some(isNADepartment));
}

/** Only amounts really paid: estimates and ceilings are not observed costs. */
export function awardedAmounts(notices: CostNotice[]): number[] {
	return naNotices(notices)
		.filter((notice) => notice.amountKind === "awarded" && typeof notice.amountEur === "number" && inWindow(notice.date))
		.map((notice) => notice.amountEur as number)
		.filter((amount) => amount > 0);
}

export function publishedAmounts(notices: CostNotice[]): number[] {
	return naNotices(notices)
		.filter((notice) => typeof notice.amountEur === "number" && inWindow(notice.date))
		.map((notice) => notice.amountEur as number)
		.filter((amount) => amount > 0);
}

export function median(values: number[]): number {
	if (values.length === 0) throw new Error("median of empty sample");
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
}

export function makeRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function percentile(sorted: number[], fraction: number): number {
	const position = (sorted.length - 1) * fraction;
	const low = Math.floor(position);
	const high = Math.ceil(position);
	return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * Percentile bootstrap over the two small empirical samples: the corpus
 * detection flags (incident-count uncertainty) and the awarded contract
 * amounts (unit-cost uncertainty). Deterministic for a given seed.
 */
export function bootstrapEstimate(
	rows: CoverageIncident[],
	notices: CostNotice[],
	iterations = 2000,
	seed = 20261122,
): Estimate {
	const sample = detectionSample(rows);
	const costs = awardedAmounts(notices);
	if (costs.length === 0) throw new Error("no awarded cyber contract amount");
	const rng = makeRng(seed);
	const pointIncidents = estimateIncidentCount(sample);
	const unitCostEur = median(costs);
	const values: number[] = [];

	for (let i = 0; i < iterations; i += 1) {
		const drawnFlags = Array.from({ length: sample.total }, () => rows[Math.floor(rng() * rows.length)].motif);
		const drawnSeen = drawnFlags.filter((flag) => flag === "vu").length;
		if (drawnSeen === 0) continue;
		const drawnCosts = Array.from({ length: costs.length }, () => costs[Math.floor(rng() * costs.length)]);
		values.push(estimateIncidentCount({ total: sample.total, seen: drawnSeen }) * median(drawnCosts));
	}
	if (values.length === 0) throw new Error("bootstrap produced no usable replicate");
	values.sort((a, b) => a - b);

	return {
		knownIncidents: sample.total,
		seenIncidents: sample.seen,
		detectionRate: sample.rate,
		estimatedIncidents: pointIncidents,
		unitCostEur,
		annualCostEur: pointIncidents * unitCostEur,
		ci95LowEur: percentile(values, 0.025),
		ci95HighEur: percentile(values, 0.975),
		iterations: values.length,
		seed,
	};
}

export function checkBaseline(actual: Baseline): string[] {
	const problems: string[] = [];
	for (const key of Object.keys(EXPECTED_BASELINE) as (keyof Baseline)[]) {
		if (actual[key] !== EXPECTED_BASELINE[key]) {
			problems.push(`${key}: expected ${EXPECTED_BASELINE[key]}, measured ${actual[key]}`);
		}
	}
	return problems;
}
