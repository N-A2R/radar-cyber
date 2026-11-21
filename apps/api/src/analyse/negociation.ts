/**
 * Delay from the first private claim in a ransomware negotiation chat to the
 * public leak-site post. Both dates come from independent public sources; a
 * chat identifier alone is never treated as a leak date.
 */
import { mediane } from "./mediane.js";

export type NegotiationChat = {
	group: string;
	victim: string;
	startedAt: string;
	paid: boolean | null;
};

export type LeakClaim = {
	group: string;
	victim: string;
	publishedAt: string;
};

export type NegotiationDelay = NegotiationChat & {
	leakPublishedAt: string;
	delayDays: number;
};

export type NegotiationDistribution = {
	n: number;
	q1: number | null;
	p50: number | null;
	q3: number | null;
	p90: number | null;
	max: number | null;
	paidConfirmed: number;
	paidDenied: number;
	paidUnknown: number;
};

/** Lowercase, unaccented alphanumeric key; punctuation and legal suffixes stay out. */
export function normalizeKey(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** `lockbit3.0`, `lockbit3` and `LockBit 3.0` all resolve to `lockbit`. */
export function groupKey(value: string): string {
	return normalizeKey(value).replace(/\s*\d+(?:\s+\d+)*$/, "").trim();
}

function day(value: string): number {
	const ts = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(ts) ? Number.NaN : Math.floor(ts / 86_400_000);
}

function token(value: string): string {
	return normalizeKey(value).replace(/\s+/g, "");
}

/**
 * Match named victims only. Anonymous chat IDs (dates, UUIDs, phone numbers)
 * cannot identify a victim, so they are dropped rather than guessed.
 * When a victim has several posts, the first one after the chat wins.
 */
export function matchNegotiations(
	chats: readonly NegotiationChat[],
	claims: readonly LeakClaim[],
	maxDelayDays = 366,
): NegotiationDelay[] {
	const byGroup = new Map<string, LeakClaim[]>();
	for (const claim of claims) {
		const key = groupKey(claim.group);
		const list = byGroup.get(key) ?? [];
		list.push(claim);
		byGroup.set(key, list);
	}
	const seen = new Set<string>();
	const delays: NegotiationDelay[] = [];
	for (const chat of chats) {
		const key = token(chat.victim);
		if (key.length < 6 || !/[a-z]{4}/.test(key) || /^\d+$/.test(key)) continue;
		const identity = `${groupKey(chat.group)}|${key}`;
		if (seen.has(identity)) continue;
		const start = day(chat.startedAt);
		if (!Number.isFinite(start)) continue;
		let best: NegotiationDelay | null = null;
		for (const claim of byGroup.get(groupKey(chat.group)) ?? []) {
			const published = token(claim.victim);
			if (published !== key && !(key.length >= 10 && key.length < published.length && published.includes(key))) continue;
			const publishedDay = day(claim.publishedAt);
			if (!Number.isFinite(publishedDay)) continue;
			const delayDays = publishedDay - start;
			if (delayDays < 0 || delayDays > maxDelayDays) continue;
			if (best === null || delayDays < best.delayDays) {
				best = {
					...chat,
					leakPublishedAt: claim.publishedAt.slice(0, 10),
					delayDays,
				};
			}
		}
		if (best !== null) {
			seen.add(identity);
			delays.push(best);
		}
	}
	return delays;
}

/** Linear interpolation on the sorted sample; identical to the median at q=0.5. */
export function quantile(values: readonly number[], q: number): number | null {
	if (q < 0 || q > 1 || !Number.isFinite(q)) return null;
	const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
	if (sorted.length === 0) return null;
	const position = q * (sorted.length - 1);
	const low = Math.floor(position);
	const high = Math.ceil(position);
	const a = sorted[low];
	const b = sorted[high];
	if (a === undefined) return null;
	if (b === undefined || low === high) return a;
	return a + (b - a) * (position - low);
}

export function distribution(delays: readonly NegotiationDelay[]): NegotiationDistribution {
	const values = delays.map((d) => d.delayDays);
	return {
		n: delays.length,
		q1: quantile(values, 0.25),
		p50: mediane(values),
		q3: quantile(values, 0.75),
		p90: quantile(values, 0.9),
		max: values.length > 0 ? Math.max(...values) : null,
		paidConfirmed: delays.filter((d) => d.paid === true).length,
		paidDenied: delays.filter((d) => d.paid === false).length,
		paidUnknown: delays.filter((d) => d.paid === null).length,
	};
}
