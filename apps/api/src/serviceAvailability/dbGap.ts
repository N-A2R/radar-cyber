/**
 * Pure classification of database HTTP proofs by UTC day.
 *
 * This proves which service-days a real, dated HTTP proof could add to the
 * availability window. It never extrapolates a day, a status or a service.
 */
import { normalizeExpositionProofUrl } from "./dbProofs.js";
import type { PublicService } from "./perimeter.js";

export type HttpProofGapRow = {
	/** Source table, kept only to make the audit traceable. */
	table: string;
	url: string;
	status: number;
	at: string | Date;
};

export type ProofGapAudit = {
	rowsInWindow: number;
	perimeterRows: number;
	capturableServiceDays: number;
	/** Opaque service/day keys, so callers can subtract already stored days. */
	serviceDayKeys: string[];
	byDay: { day: string; rows: number; perimeterRows: number }[];
};

/** UTC calendar day of a proof, or null when the timestamp is invalid. */
export function proofUtcDay(at: string | Date): string | null {
	const time = new Date(at).getTime();
	if (!Number.isFinite(time)) return null;
	return new Date(time).toISOString().slice(0, 10);
}

/**
 * Count real HTTP proofs in an inclusive UTC window that map to the fixed
 * perimeter. One row shared by several services yields one service-day each;
 * an error status, an out-of-window day or an unknown URL yields none.
 */
export function classifyHttpProofGap(
	rows: readonly HttpProofGapRow[],
	services: readonly PublicService[],
	fromDay: string,
	toDay: string
): ProofGapAudit {
	const byUrl = new Map<string, string[]>();
	for (const service of services) {
		for (const url of [service.url, service.proofUrl]) {
			if (!url) continue;
			const key = normalizeExpositionProofUrl(url);
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
		if (!Number.isInteger(row.status) || row.status < 200 || row.status >= 400) continue;
		const day = proofUtcDay(row.at);
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
