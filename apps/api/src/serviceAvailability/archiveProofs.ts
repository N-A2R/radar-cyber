/**
 * Pure helpers for auditing open web archives as a grey-source fallback.
 * Only public URLs, HTTP status codes and UTC timestamps are considered:
 * no capture is ever turned into an observation by extrapolation.
 */

export type ArchiveCapture = {
	timestamp: string;
	original: string;
	status: number;
};

/** Parse a Wayback CDX JSON matrix into dated captures. */
export function parseArchiveCaptures(rows: unknown): ArchiveCapture[] {
	if (!Array.isArray(rows) || rows.length < 2) return [];
	const header = rows[0];
	if (!Array.isArray(header)) return [];
	const timestampIndex = header.indexOf("timestamp");
	const originalIndex = header.indexOf("original");
	const statusIndex = header.indexOf("statuscode");
	if (timestampIndex < 0 || originalIndex < 0 || statusIndex < 0) return [];
	const captures: ArchiveCapture[] = [];
	for (const row of rows.slice(1)) {
		if (!Array.isArray(row)) continue;
		const timestamp = row[timestampIndex];
		const original = row[originalIndex];
		const status = Number(row[statusIndex]);
		if (typeof timestamp !== "string" || !/^\d{14}$/.test(timestamp)) continue;
		if (typeof original !== "string" || !Number.isInteger(status)) continue;
		captures.push({ timestamp, original, status });
	}
	return captures;
}

/** Host of a capture URL, without scheme, port or leading `www.`. */
export function captureHost(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return "";
	}
}

/** UTC day of a 14-digit Wayback timestamp. */
export function captureDay(timestamp: string): string {
	return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

/**
 * Count (service, day) pairs an archived successful capture could supply in an
 * inclusive UTC window. Error captures and captures outside the window never
 * count, and a host with no perimeter service yields no service-day.
 */
export function capturableServiceDays(
	captures: readonly ArchiveCapture[],
	services: readonly { id: string; url: string }[],
	from: string,
	to: string
): Set<string> {
	const byHost = new Map<string, string[]>();
	for (const service of services) {
		const host = captureHost(service.url);
		if (!host) continue;
		const ids = byHost.get(host) ?? [];
		if (!ids.includes(service.id)) ids.push(service.id);
		byHost.set(host, ids);
	}
	const keys = new Set<string>();
	for (const capture of captures) {
		if (capture.status < 200 || capture.status >= 400) continue;
		const day = captureDay(capture.timestamp);
		if (day < from || day > to) continue;
		for (const id of byHost.get(captureHost(capture.original)) ?? []) {
			keys.add(`${id}\u0000${day}`);
		}
	}
	return keys;
}

/**
 * A sweep with any unreachable host is indeterminate: zero captures cannot be
 * read as proof of absence when the archive did not answer for every host.
 */
export function archiveAuditVerdict(
	unavailableHosts: number,
	capturable: number
): "indeterminate" | "no_captures" | "captures_found" {
	if (unavailableHosts > 0) return "indeterminate";
	return capturable > 0 ? "captures_found" : "no_captures";
}
