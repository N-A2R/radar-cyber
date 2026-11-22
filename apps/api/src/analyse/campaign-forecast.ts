/**
 * Next-campaign forecast for active ransomware groups in Nouvelle-Aquitaine.
 *
 * The input is one row per leak-site claim already flagged as regional by the
 * collector. Only group, publication date and sector labels are read: victim
 * names, organisation identifiers and free text never enter this module.
 *
 * A campaign is a burst of claims by the same group: no more than 21 days
 * between two claims and no more than 45 days from the first one. The next
 * campaign is projected from the group's own history: its most frequent past
 * sector and the median gap between past campaign starts. Every projection is
 * backtested on held-out campaigns before it is published.
 */
import { SECTEURS_GROUPE } from "./secteur-groupe.js";

export const MIN_CLAIMS_PER_GROUP = 3;
export const ACTIVE_GROUP_LIMIT = 5;
export const CAMPAIGN_GAP_DAYS = 21;
export const CAMPAIGN_MAX_DAYS = 45;
export const FALLBACK_GAP_DAYS = 30;
export const MIN_PERIOD_DAYS = 14;
export const PERIOD_TOLERANCE_DAYS = 30;

const DAY_MS = 86_400_000;

/** Leak-site labels mapped once to the nine sector groups used by the radar. */
const SECTOR_LABELS: Record<string, string> = {
	healthcare: "sante",
	manufacturing: "industrie",
	finance: "services",
	software: "services",
	construction: "construction",
	retail: "commerce",
	education: "enseignement",
	energy: "industrie",
	logistics: "services",
	"public sector": "public",
	agriculture: "agroalimentaire",
};

export type Claim = {
	group: string;
	publishedAt: string;
	claimSector: string | null;
	orgSectorGroup: string | null;
};

export type Campaign = {
	start: string;
	end: string;
	sector: string | null;
	claims: number;
};

export type Forecast = {
	group: string;
	claims: number;
	campaigns: number;
	sector: string | null;
	period: { start: string; end: string };
	expectedGapDays: number;
	lastCampaignEnd: string;
};

export type BacktestFold = {
	group: string;
	cutoff: string;
	actualStart: string;
	predictedStart: string;
	sector: string | null;
	actualSector: string | null;
	sectorHit: boolean;
	periodHit: boolean;
	errorDays: number;
};

export type BacktestReport = {
	folds: number;
	sectorHits: number;
	periodHits: number;
	medianErrorDays: number;
	byGroup: { group: string; folds: number; sectorHits: number; periodHits: number }[];
};

export type DatasetCounts = {
	organizations: number;
	sources: number;
	events: number;
	claims: number;
	naClaims: number;
};

export type ForecastReport = {
	dataset: DatasetCounts;
	activeGroups: number;
	groups: Forecast[];
	backtest: BacktestReport;
};

export function normalizeGroupName(value: string): string {
	return value
		.normalize("NFKD")
		.trim()
		.toLowerCase()
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s-]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/^[\s-]+|[\s-]+$/g, "");
}

/** Map a leak-site label to a sector group. Unknown labels are not guessed. */
export function mapSectorLabel(value: string | null): string | null {
	if (value === null || value.trim().length === 0) return null;
	const key = value.trim().toLowerCase().replace(/\s+/g, " ");
	return SECTOR_LABELS[key] ?? null;
}

function cleanSectorGroup(value: string | null): string | null {
	if (value === null) return null;
	const key = value.trim().toLowerCase();
	return (SECTEURS_GROUPE as readonly string[]).includes(key) ? key : null;
}

function claimSector(claim: Claim): string | null {
	return mapSectorLabel(claim.claimSector) ?? cleanSectorGroup(claim.orgSectorGroup);
}

function toDay(iso: string): number {
	const date = iso.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN;
	const day = Date.parse(`${date}T00:00:00Z`) / DAY_MS;
	const back = fromDay(day);
	return back === date ? day : Number.NaN;
}

function fromDay(day: number): string {
	return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Most frequent label, ties won by the most recent one in chronological order. */
function mostFrequent(values: readonly (string | null)[]): string | null {
	const counts = new Map<string, number>();
	for (const value of values) if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
	let best: string | null = null;
	let bestCount = 0;
	for (const value of values) {
		if (value === null) continue;
		const count = counts.get(value) ?? 0;
		if (count >= bestCount) {
			best = value;
			bestCount = count;
		}
	}
	return best;
}

function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? null;
	return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function groupClaims(claims: readonly Claim[]): Map<string, Claim[]> {
	const groups = new Map<string, Claim[]>();
	for (const claim of claims) {
		const group = normalizeGroupName(claim.group);
		if (group.length === 0 || !Number.isFinite(toDay(claim.publishedAt))) continue;
		const list = groups.get(group) ?? [];
		list.push(claim);
		groups.set(group, list);
	}
	return groups;
}

/** Claims within 21 days of each other, capped at 45 days, form one campaign. */
export function buildCampaigns(claims: readonly Claim[]): Campaign[] {
	const sorted = [...claims].sort((a, b) => toDay(a.publishedAt) - toDay(b.publishedAt));
	const clusters: Claim[][] = [];
	for (const claim of sorted) {
		const day = toDay(claim.publishedAt);
		const current = clusters[clusters.length - 1];
		const first = current?.[0];
		const last = current?.[current.length - 1];
		if (current && first && last && day - toDay(last.publishedAt) <= CAMPAIGN_GAP_DAYS && day - toDay(first.publishedAt) <= CAMPAIGN_MAX_DAYS) {
			current.push(claim);
		} else {
			clusters.push([claim]);
		}
	}
	return clusters.map((cluster) => ({
		start: fromDay(toDay(cluster[0]?.publishedAt ?? "")),
		end: fromDay(toDay(cluster[cluster.length - 1]?.publishedAt ?? "")),
		sector: mostFrequent(cluster.map(claimSector)),
		claims: cluster.length,
	}));
}

type Projection = {
	sector: string | null;
	period: { start: string; end: string };
	expectedGapDays: number;
};

function project(history: readonly Campaign[]): Projection {
	const last = history[history.length - 1];
	if (!last) {
		return {
			sector: null,
			period: { start: "", end: "" },
			expectedGapDays: FALLBACK_GAP_DAYS,
		};
	}
	const starts = history.map((campaign) => toDay(campaign.start));
	const gaps = starts.slice(1).map((day, index) => day - (starts[index] ?? day));
	const expectedGap = Math.round(median(gaps) ?? FALLBACK_GAP_DAYS);
	const durations = history.map((campaign) => toDay(campaign.end) - toDay(campaign.start));
	const duration = Math.max(Math.round(median(durations) ?? 0), MIN_PERIOD_DAYS);
	const start = toDay(last.end) + expectedGap;
	return {
		sector: mostFrequent(history.map((campaign) => campaign.sector)),
		period: { start: fromDay(start), end: fromDay(start + duration) },
		expectedGapDays: expectedGap,
	};
}

/** Groups with enough NA history, most active first. */
export function activeGroups(
	groups: Map<string, Claim[]>,
	limit = ACTIVE_GROUP_LIMIT,
): { group: string; claims: Claim[] }[] {
	return [...groups.entries()]
		.filter(([, claims]) => claims.length >= MIN_CLAIMS_PER_GROUP)
		.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([group, claims]) => ({ group, claims }));
}

export function backtest(
	selected: readonly { group: string; campaigns: Campaign[] }[],
): BacktestReport {
	const folds: BacktestFold[] = [];
	for (const { group, campaigns } of selected) {
		for (let index = 1; index < campaigns.length; index++) {
			const history = campaigns.slice(0, index);
			const actual = campaigns[index];
			if (!actual) continue;
			const projection = project(history);
			const predictedStart = toDay(projection.period.start);
			const errorDays = Math.abs(toDay(actual.start) - predictedStart);
			const lower = predictedStart - PERIOD_TOLERANCE_DAYS;
			const upper = toDay(projection.period.end) + PERIOD_TOLERANCE_DAYS;
			folds.push({
				group,
				cutoff: (history[history.length - 1] ?? actual).end,
				actualStart: actual.start,
				predictedStart: projection.period.start,
				sector: projection.sector,
				actualSector: actual.sector,
				sectorHit: projection.sector !== null && projection.sector === actual.sector,
				periodHit: toDay(actual.start) >= lower && toDay(actual.start) <= upper,
				errorDays,
			});
		}
	}
	const byGroup = selected.map(({ group }) => {
		const own = folds.filter((fold) => fold.group === group);
		return {
			group,
			folds: own.length,
			sectorHits: own.filter((fold) => fold.sectorHit).length,
			periodHits: own.filter((fold) => fold.periodHit).length,
		};
	});
	return {
		folds: folds.length,
		sectorHits: folds.filter((fold) => fold.sectorHit).length,
		periodHits: folds.filter((fold) => fold.periodHit).length,
		medianErrorDays: Math.round(median(folds.map((fold) => fold.errorDays)) ?? 0),
		byGroup,
	};
}

export function buildForecastReport(
	claims: readonly Claim[],
	dataset: DatasetCounts,
): ForecastReport {
	const selected = activeGroups(groupClaims(claims));
	const campaignsByGroup = selected.map(({ group, claims: ownClaims }) => ({
		group,
		claims: ownClaims,
		campaigns: buildCampaigns(ownClaims),
	}));
	const groups = campaignsByGroup
		.filter(({ campaigns }) => campaigns.length > 0)
		.map(({ group, claims: ownClaims, campaigns }) => {
			const projection = project(campaigns);
			const last = campaigns[campaigns.length - 1];
			return {
				group,
				claims: ownClaims.length,
				campaigns: campaigns.length,
				sector: projection.sector,
				period: projection.period,
				expectedGapDays: projection.expectedGapDays,
				lastCampaignEnd: last?.end ?? "",
			};
		});
	return {
		dataset,
		activeGroups: groups.length,
		groups,
		backtest: backtest(campaignsByGroup),
	};
}
