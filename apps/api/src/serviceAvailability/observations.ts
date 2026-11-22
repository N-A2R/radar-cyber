/**
 * Storage and replay rules for daily availability observations.
 *
 * One observation per service and UTC day is kept. Merging is commutative and
 * idempotent: a successful probe wins over a failed one, then the earliest
 * observation wins. Replaying a batch twice therefore never changes the result.
 */
import type { DailyObservation } from "./probe.js";

const DAY_MS = 86_400_000;

/** Seven consecutive UTC days ending on the anchor, oldest first. */
export function dayKeys(anchor: string, days = 7): string[] {
	const end = Date.parse(`${anchor}T00:00:00.000Z`);
	if (!Number.isFinite(end)) throw new RangeError(`Invalid anchor day: ${anchor}`);
	const keys: string[] = [];
	for (let offset = days - 1; offset >= 0; offset -= 1) {
		keys.push(new Date(end - offset * DAY_MS).toISOString().slice(0, 10));
	}
	return keys;
}

function preferred(left: DailyObservation, right: DailyObservation): DailyObservation {
	if (left.ok !== right.ok) return left.ok ? left : right;
	if (left.observedAt !== right.observedAt) return left.observedAt < right.observedAt ? left : right;
	return left;
}

export function mergeDaily(observations: DailyObservation[]): DailyObservation[] {
	const byKey = new Map<string, DailyObservation>();
	for (const observation of observations) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.day)) continue;
		const key = `${observation.serviceId}\u0000${observation.day}`;
		const current = byKey.get(key);
		byKey.set(key, current === undefined ? observation : preferred(current, observation));
	}
	return [...byKey.values()].sort((a, b) => {
		if (a.serviceId !== b.serviceId) return a.serviceId < b.serviceId ? -1 : 1;
		return a.day < b.day ? -1 : a.day > b.day ? 1 : 0;
	});
}

export function parseObservations(contents: string): DailyObservation[] {
	const rows: DailyObservation[] = [];
	for (const line of contents.split(/\r?\n/)) {
		if (line.trim().length === 0) continue;
		try {
			rows.push(JSON.parse(line) as DailyObservation);
		} catch {
			continue;
		}
	}
	return mergeDaily(rows);
}

export function serializeObservations(observations: DailyObservation[]): string {
	const lines = mergeDaily(observations).map((row) => JSON.stringify(row));
	return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
