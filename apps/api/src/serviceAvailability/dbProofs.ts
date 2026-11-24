/**
 * Import real HTTP verifications already stored in the radar database as daily
 * availability observations. Only the public URL, status, timing and UTC day
 * are used: no source payload, user field or personal data is read.
 */
import type { PublicService } from "./perimeter.js";
import type { DailyObservation } from "./probe.js";

export type DbProofRow = {
	url: string;
	code_http: number;
	verifie_at: string | Date;
	ms: number | null;
};

/** Match a proof URL to a perimeter URL regardless of case or trailing slash. */
export function normalizeProofUrl(url: string): string {
	return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Map database verifications onto the fixed perimeter. A row that does not
 * match a perimeter service, or that has no valid UTC timestamp, is skipped:
 * it can never become an observation by extrapolation.
 */
export function observationsFromDbProofs(
	rows: DbProofRow[],
	services: PublicService[]
): DailyObservation[] {
	const byUrl = new Map(services.map((service) => [normalizeProofUrl(service.url), service.id]));
	const observations: DailyObservation[] = [];
	for (const row of rows) {
		const serviceId = byUrl.get(normalizeProofUrl(row.url));
		if (serviceId === undefined) continue;
		const at = new Date(row.verifie_at);
		if (!Number.isFinite(at.getTime())) continue;
		const observedAt = at.toISOString();
		const ok = row.code_http >= 200 && row.code_http < 400;
		observations.push({
			serviceId,
			day: observedAt.slice(0, 10),
			ok,
			status: row.code_http,
			latencyMs: row.ms ?? 0,
			observedAt,
			failure: ok ? null : "http_error",
		});
	}
	return observations;
}

export type ExpositionProofRow = {
	url: string;
	status: number;
	consulted_at: string | Date;
};

/** Match an exposition proof URL regardless of scheme, www or trailing slash. */
export function normalizeExpositionProofUrl(url: string): string {
	return url
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/\/+$/, "");
}

/**
 * Map real HTTP proofs from `exposition_service` onto the fixed perimeter.
 * Several services can share one public URL; each gets its own observation.
 * A row without a perimeter URL or a valid UTC timestamp is skipped: no day
 * or status is ever inferred.
 */
export function observationsFromExpositionProofs(
	rows: ExpositionProofRow[],
	services: PublicService[]
): DailyObservation[] {
	const byUrl = new Map<string, string[]>();
	for (const service of services) {
		const key = normalizeExpositionProofUrl(service.url);
		const ids = byUrl.get(key) ?? [];
		ids.push(service.id);
		byUrl.set(key, ids);
	}
	const observations: DailyObservation[] = [];
	for (const row of rows) {
		const serviceIds = byUrl.get(normalizeExpositionProofUrl(row.url));
		if (serviceIds === undefined) continue;
		const at = new Date(row.consulted_at);
		if (!Number.isFinite(at.getTime())) continue;
		const observedAt = at.toISOString();
		const ok = row.status >= 200 && row.status < 400;
		for (const serviceId of serviceIds) {
			observations.push({
				serviceId,
				day: observedAt.slice(0, 10),
				ok,
				status: row.status,
				latencyMs: 0,
				observedAt,
				failure: ok ? null : "http_error",
			});
		}
	}
	return observations;
}
