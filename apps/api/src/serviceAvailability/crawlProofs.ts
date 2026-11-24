/**
 * Pure classification of Common Crawl index rows into UTC service-days.
 *
 * A crawl row is a real, dated HTTP capture. Only the captured URL and UTC
 * timestamp are used: a page sharing a host but not the perimeter URL never
 * counts as an observation of a service.
 */
import { normalizeExpositionProofUrl } from "./dbProofs.js";
import type { PublicService } from "./perimeter.js";

export type CrawlCaptureRow = {
	/** Full captured URL, for example `https://etab.ac-poitiers.fr/coll-aigre/`. */
	url: string;
	/** Common Crawl timestamp: YYYYMMDDhhmmss in UTC. */
	timestamp: string;
};

export type CrawlGapAudit = {
	rowsInWindow: number;
	perimeterRows: number;
	capturableServiceDays: number;
	/** Opaque service/day keys, so callers can subtract already stored days. */
	serviceDayKeys: string[];
	byDay: { day: string; rows: number; perimeterRows: number }[];
};

/** UTC day of a Common Crawl timestamp, or null when it is not a real date. */
export function crawlUtcDay(timestamp: string): string | null {
	if (!/^\d{14}$/.test(timestamp)) return null;
	const year = Number(timestamp.slice(0, 4));
	const month = Number(timestamp.slice(4, 6));
	const day = Number(timestamp.slice(6, 8));
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) return null;
	return date.toISOString().slice(0, 10);
}

/** Normalised public URLs of the fixed perimeter, for bounded index filtering. */
export function perimeterUrls(services: readonly PublicService[]): Set<string> {
	const urls = new Set<string>();
	for (const service of services) {
		for (const url of [service.url, service.proofUrl]) {
			if (!url) continue;
			const key = normalizeExpositionProofUrl(url);
			if (key.length > 0) urls.add(key);
		}
	}
	return urls;
}

/**
 * Count real captures in an inclusive UTC window that map to the perimeter.
 * One URL shared by several services yields one service-day for each, while
 * an out-of-window timestamp or a different path yields none.
 */
export function classifyCrawlCaptures(
	rows: Iterable<CrawlCaptureRow>,
	services: readonly PublicService[],
	fromDay: string,
	toDay: string
): CrawlGapAudit {
	const byUrl = new Map<string, string[]>();
	for (const service of services) {
		for (const url of [service.url, service.proofUrl]) {
			if (!url) continue;
			const key = normalizeExpositionProofUrl(url);
			if (key.length === 0) continue;
			const ids = byUrl.get(key) ?? [];
			if (!ids.includes(service.id)) ids.push(service.id);
			byUrl.set(key, ids);
		}
	}
	const perDay = new Map<string, { rows: number; perimeterRows: number }>();
	const serviceDays = new Set<string>();
	let rowsInWindow = 0;
	let perimeterRows = 0;
	for (const row of rows) {
		const day = crawlUtcDay(row.timestamp);
		if (day === null || day < fromDay || day > toDay) continue;
		rowsInWindow += 1;
		const counts = perDay.get(day) ?? { rows: 0, perimeterRows: 0 };
		counts.rows += 1;
		const ids = byUrl.get(normalizeExpositionProofUrl(row.url)) ?? [];
		if (ids.length > 0) {
			perimeterRows += 1;
			counts.perimeterRows += 1;
			for (const id of ids) serviceDays.add(`${id}\u0000${day}`);
		}
		perDay.set(day, counts);
	}
	return {
		rowsInWindow,
		perimeterRows,
		capturableServiceDays: serviceDays.size,
		serviceDayKeys: [...serviceDays].sort(),
		byDay: [...perDay]
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([day, counts]) => ({ day, ...counts })),
	};
}
