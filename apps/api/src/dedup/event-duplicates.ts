/**
 * Cross-source identity for radar events.
 *
 * The existing feed fingerprint (`normalizeTitle | UTC day | source`) cannot
 * catch the same advisory republished by several catalogue sources: the source
 * part differs. This module defines the wider identity used by the 30-day
 * deduplication measurement and by the merge CLI: same family, same normalized
 * title and same UTC day. Short or dateless texts are left alone on purpose.
 *
 * Code and interface are English. The measurement report is French.
 */

export const DEDUP_RULE_VERSION = "cross-source@1";

/** Nouvelle-Aquitaine departments; the only departments this rule may touch. */
export const NA_DEPARTMENTS = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

/** Below this length a normalized title is too generic to identify an event. */
export const MIN_TITLE_LENGTH = 12;

export type EventForIdentity = {
	id: number;
	family: string;
	title: string;
	observedAt: Date | string | null;
	collectedAt: Date | string;
	sourceId: string;
	orgDepartment: string | null;
	dedupKey: string;
};

export type DuplicateGroup = {
	key: string;
	memberIds: number[];
	survivorId: number;
	duplicateIds: number[];
	sourceIds: string[];
};

/** Lowercase, no diacritics, punctuation reduced to single spaces. */
export function normalizeTitle(title: string): string {
	return title
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** UTC calendar day of the observation, falling back to collection time. */
export function eventDay(observedAt: Date | string | null, collectedAt: Date | string): string | null {
	const date = new Date(observedAt ?? collectedAt);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10);
}

/** Stable identity of an event, or null when the text is too weak to merge. */
export function canonicalEventKey(event: Pick<EventForIdentity, "family" | "title" | "observedAt" | "collectedAt">): string | null {
	const title = normalizeTitle(event.title);
	const day = eventDay(event.observedAt, event.collectedAt);
	if (title.length < MIN_TITLE_LENGTH || day === null || !event.family) return null;
	return `${event.family}|${title}|${day}`;
}

/** Group events sharing an identity, oldest id surviving. Pure function. */
export function findDuplicateGroups(events: readonly EventForIdentity[]): DuplicateGroup[] {
	const byKey = new Map<string, EventForIdentity[]>();
	for (const event of events) {
		const key = canonicalEventKey(event);
		if (key === null) continue;
		const bucket = byKey.get(key);
		if (bucket) bucket.push(event);
		else byKey.set(key, [event]);
	}
	const groups: DuplicateGroup[] = [];
	for (const [key, members] of byKey) {
		if (members.length < 2) continue;
		const sorted = [...members].sort((a, b) => a.id - b.id);
		groups.push({
			key,
			memberIds: sorted.map((member) => member.id),
			survivorId: sorted[0]!.id,
			duplicateIds: sorted.slice(1).map((member) => member.id),
			sourceIds: [...new Set(sorted.map((member) => member.sourceId))].sort(),
		});
	}
	return groups.sort((a, b) => a.key.localeCompare(b.key));
}

/** Events attached to an organization outside Nouvelle-Aquitaine are excluded. */
export function isInScope(event: Pick<EventForIdentity, "orgDepartment">): boolean {
	return event.orgDepartment === null || (NA_DEPARTMENTS as readonly string[]).includes(event.orgDepartment);
}
