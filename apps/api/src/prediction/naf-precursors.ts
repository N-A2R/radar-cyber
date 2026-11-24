/**
 * Group-agnostic precursor signal based on the two-digit NAF activity code.
 *
 * The only facts read are organisation ids, NAF codes and claim publication
 * dates. No claim description, evidence URL, personal detail, or group label
 * of a future claim is used. Every count is computed from claims published
 * strictly before a cutoff.
 */
import { dayNumber } from "./victim-forecast.js";

export const NAF_LOOKBACK_DAYS = 365;
export const NAF_BONUS_WEIGHT = 30;
export const NAF_BONUS_CAP = 3;

export type NafClaim = { orgId: number; publishedAt: string };
export type NafOrg = { orgId: number; naf: string | null };

/** Exact two-character prefix; no fuzzy or substring organisation matching. */
export function nafKey(naf: string | null): string | null {
	if (naf === null) return null;
	const cleaned = naf.trim().toUpperCase();
	return /^[A-Z0-9]{2}/.test(cleaned) ? cleaned.slice(0, 2) : null;
}

export type NafPressureEntry = {
	/** Distinct organisation/day pairs, so repeated claim rows do not inflate. */
	claims: number;
	byOrg: Map<number, number>;
};

export type NafPressure = ReadonlyMap<string, NafPressureEntry>;

export function nafKeysByOrg(orgs: readonly NafOrg[]): Map<number, string | null> {
	return new Map(orgs.map((org) => [org.orgId, nafKey(org.naf)]));
}

/**
 * Claims in `[cutoff - lookbackDays, cutoff)` by NAF2 key of the claimed
 * organisation. Claims on organisations without a usable NAF code are skipped.
 */
export function nafPressureAtCutoff(
	claims: readonly NafClaim[],
	keysByOrg: ReadonlyMap<number, string | null>,
	cutoff: string,
	lookbackDays = NAF_LOOKBACK_DAYS,
): Map<string, NafPressureEntry> {
	const boundary = dayNumber(cutoff);
	const seen = new Set<string>();
	const pressure = new Map<string, NafPressureEntry>();
	for (const claim of claims) {
		const day = dayNumber(claim.publishedAt);
		if (day >= boundary || day < boundary - lookbackDays) continue;
		const key = keysByOrg.get(claim.orgId);
		if (key === null || key === undefined) continue;
		const identity = `${claim.orgId}:${claim.publishedAt.slice(0, 10)}`;
		if (seen.has(identity)) continue;
		seen.add(identity);
		let entry = pressure.get(key);
		if (entry === undefined) {
			entry = { claims: 0, byOrg: new Map<number, number>() };
			pressure.set(key, entry);
		}
		entry.claims += 1;
		entry.byOrg.set(claim.orgId, (entry.byOrg.get(claim.orgId) ?? 0) + 1);
	}
	return pressure;
}

/** Bounded bonus from claims on *other* organisations with the same NAF2 key. */
export function nafPressureBonus(
	orgId: number,
	keysByOrg: ReadonlyMap<number, string | null>,
	pressure: NafPressure,
	weight = NAF_BONUS_WEIGHT,
	cap = NAF_BONUS_CAP,
): number {
	const key = keysByOrg.get(orgId);
	if (key === null || key === undefined) return 0;
	const entry = pressure.get(key);
	if (entry === undefined) return 0;
	const others = entry.claims - (entry.byOrg.get(orgId) ?? 0);
	return weight * Math.min(others, cap);
}

/** Count used by the bonus, for audit output only. */
export function nafPressureForOrg(
	orgId: number,
	keysByOrg: ReadonlyMap<number, string | null>,
	pressure: NafPressure,
): number {
	const key = keysByOrg.get(orgId);
	if (key === null || key === undefined) return 0;
	const entry = pressure.get(key);
	if (entry === undefined) return 0;
	return entry.claims - (entry.byOrg.get(orgId) ?? 0);
}
