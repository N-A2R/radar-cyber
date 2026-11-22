/**
 * Pre-claim detection for Nouvelle-Aquitaine incidents.
 *
 * Pure, deterministic and offline. An incident is considered detected before
 * its public claim when an earlier dated signal exists for the same entity
 * (gray-source raw listing) or for the same ransomware group (earlier claim on
 * another victim). Only identifiers, group names, source ids and timestamps
 * cross this boundary: victim names, titles and raw evidence are never
 * returned by this module.
 */
import { naDepartmentCode } from "../geo/na-departments.js";

/** Default upper bound for a usable warning, in days. */
export const DEFAULT_MAX_LEAD_DAYS = 30;

/** Below this length a normalised entity key is too short to identify anyone. */
const MIN_ENTITY_KEY_LENGTH = 6;

export type Claim = {
	id: number;
	orgId: number | null;
	sourceId: string;
	victim: string;
	group: string;
	publishedAt: string;
	regional: boolean;
	department: string | null;
};

export type EarlySignal = {
	id: number;
	origin: "claim" | "quarantine";
	sourceId: string;
	victim: string;
	group: string;
	publishedAt: string;
	gray: boolean;
};

export type SignalKind = "entity" | "group";

export type PreClaimDetection = {
	claimId: number;
	orgId: number | null;
	department: string | null;
	detectedAt: string;
	claimAt: string;
	leadDays: number;
	kind: SignalKind;
	entityDetectedAt: string | null;
	groupDetectedAt: string | null;
	sourceId: string;
};

export type DetectionSummary = {
	claims: number;
	detected: number;
	entitySignals: number;
	groupSignals: number;
	medianLeadDays: number;
	meanLeadDays: number;
	minLeadDays: number;
	maxLeadDays: number;
	totalLeadDays: number;
};

/**
 * Accent-insensitive, case-insensitive alphanumeric key.
 * Returns an empty string for missing or unusable values.
 */
export function normaliseKey(value: string | null | undefined): string {
	if (typeof value !== "string") return "";
	return value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

function validDate(value: string): boolean {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Whole and fractional days between two ISO timestamps, rounded to 0.01 day. */
export function leadDays(detectedAt: string, claimAt: string): number {
	const from = Date.parse(detectedAt);
	const to = Date.parse(claimAt);
	if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.NaN;
	return Math.round(((to - from) / 86_400_000) * 100) / 100;
}

function median(values: readonly number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[middle] as number)
		: ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Detect NA incidents before their public claim.
 *
 * Two independent signal families are considered:
 *   - `entity`: a gray raw listing naming the same victim;
 *   - `group`: an earlier claim by the same ransomware group on any victim.
 *
 * The earliest admissible signal wins. A signal must be strictly earlier than
 * the claim and no older than `maxLeadDays`. Results carry no free text from
 * victims, and are sorted by claim id for byte-stable output.
 */
export function detectPreClaim(
	claims: readonly Claim[],
	signals: readonly EarlySignal[],
	maxLeadDays = DEFAULT_MAX_LEAD_DAYS,
): PreClaimDetection[] {
	if (!Number.isFinite(maxLeadDays) || maxLeadDays <= 0) {
		throw new RangeError("maxLeadDays must be a positive number");
	}

	const entityIndex = new Map<string, EarlySignal[]>();
	const groupIndex = new Map<string, EarlySignal[]>();
	for (const signal of signals) {
		if (!validDate(signal.publishedAt)) continue;
		if (signal.gray) {
			const key = normaliseKey(signal.victim);
			if (key.length >= MIN_ENTITY_KEY_LENGTH) {
				const bucket = entityIndex.get(key) ?? [];
				bucket.push(signal);
				entityIndex.set(key, bucket);
			}
		}
		const groupKey = normaliseKey(signal.group);
		if (groupKey) {
			const bucket = groupIndex.get(groupKey) ?? [];
			bucket.push(signal);
			groupIndex.set(groupKey, bucket);
		}
	}

	const detections: PreClaimDetection[] = [];
	for (const claim of claims) {
		if (!claim.regional || naDepartmentCode(claim.department) === null) continue;
		if (!validDate(claim.publishedAt)) continue;
		const claimAt = Date.parse(claim.publishedAt);
		let best: { signal: EarlySignal; kind: SignalKind; at: number } | null = null;
		let bestEntity: EarlySignal | null = null;
		let bestGroup: EarlySignal | null = null;

		const remember = (signal: EarlySignal, kind: SignalKind): void => {
			if (signal.origin === "claim" && signal.id === claim.id) return;
			const at = Date.parse(signal.publishedAt);
			if (!Number.isFinite(at) || at >= claimAt) return;
			if ((claimAt - at) / 86_400_000 > maxLeadDays) return;
			if (kind === "entity" && (bestEntity === null || at < Date.parse(bestEntity.publishedAt))) {
				bestEntity = signal;
			}
			if (kind === "group" && (bestGroup === null || at < Date.parse(bestGroup.publishedAt))) {
				bestGroup = signal;
			}
			if (best === null || at < best.at || (at === best.at && kind === "entity" && best.kind === "group")) {
				best = { signal, kind, at };
			}
		};

		const victimKey = normaliseKey(claim.victim);
		if (victimKey.length >= MIN_ENTITY_KEY_LENGTH) {
			for (const signal of entityIndex.get(victimKey) ?? []) remember(signal, "entity");
		}
		const groupKey = normaliseKey(claim.group);
		if (groupKey) {
			for (const signal of groupIndex.get(groupKey) ?? []) remember(signal, "group");
		}

		if (best === null) continue;
		const chosen = best as { signal: EarlySignal; kind: SignalKind; at: number };
		detections.push({
			claimId: claim.id,
			orgId: claim.orgId,
			department: claim.department,
			detectedAt: chosen.signal.publishedAt,
			claimAt: claim.publishedAt,
			leadDays: leadDays(chosen.signal.publishedAt, claim.publishedAt),
			kind: chosen.kind,
			entityDetectedAt: (bestEntity as EarlySignal | null)?.publishedAt ?? null,
			groupDetectedAt: (bestGroup as EarlySignal | null)?.publishedAt ?? null,
			sourceId: chosen.signal.sourceId,
		});
	}

	return detections.sort((a, b) => a.claimId - b.claimId);
}

/** Aggregate counts and lead-time statistics for a detection set. */
export function summariseDetections(detections: readonly PreClaimDetection[]): DetectionSummary {
	const leads = detections.map((detection) => detection.leadDays);
	const total = leads.reduce((sum, value) => sum + value, 0);
	return {
		claims: detections.length,
		detected: detections.length,
		entitySignals: detections.filter((detection) => detection.entityDetectedAt !== null).length,
		groupSignals: detections.filter((detection) => detection.groupDetectedAt !== null).length,
		medianLeadDays: round(median(leads)),
		meanLeadDays: leads.length ? round(total / leads.length) : 0,
		minLeadDays: leads.length ? round(Math.min(...leads)) : 0,
		maxLeadDays: leads.length ? round(Math.max(...leads)) : 0,
		totalLeadDays: round(total),
	};
}

/** French objective declaration included in generated reports. */
export function objectiveStatement(detected: number, target: number): string {
	if (detected >= target) return `OBJECTIF : atteint — ${detected} / ${target}`;
	return `OBJECTIF : partiel — ${detected} / ${target}, manque ${target - detected}`;
}
