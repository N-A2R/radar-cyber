/**
 * Date normalization for Nouvelle-Aquitaine events.
 *
 * A date counts as normalized only when BOTH conditions hold:
 *   1. an ISO-8601 instant is available (observed_at, or a normalized claim date);
 *   2. its provenance is explicit and is not a collection-time fallback.
 *
 * Claim events keep observed_at = promotion time on purpose: the retention
 * window relies on it. Their real date is stored separately as `claimDate`
 */
import { parseDate } from "../collectors/dates.js";
/** PostgreSQL renders timestamptz as "YYYY-MM-DD HH:MM:SS[.ffffff]+00". */
const DB_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?([+-]\d{2}(?::?\d{2})?)?$/;

export const NA_DEPARTMENTS: Record<string, true> = {
	"16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
	"40": true, "47": true, "64": true, "65": true, "79": true, "86": true,
	"87": true,
};

export type DateKind =
	| "source-dated"
	| "claim-dated"
	| "unlabeled-claim"
	| "unlabeled-date"
	| "collection-fallback"
	| "no-date";

export interface EventDateInput {
	id?: string;
	observedAt?: string | Date | null;
	collectedAt?: string | Date | null;
	dateSource?: string | null;
	dateConfidence?: string | null;
	evidence?: Record<string, unknown> | null;
	regional?: boolean;
	orgDept?: string | null;
}

export interface DateStatus {
	kind: DateKind;
	date: string | null;
	normalized: boolean;
	reason: string;
}

export type NormalizationPlan =
	| { action: "none"; reason: string }
	| { action: "claim"; claimDate: string; reason: string }
	| { action: "source"; reason: string };

/** Parse a raw date into a calendar-valid ISO-8601 UTC instant, or null. */
export function normalizeIsoDate(raw: unknown): string | null {
	if (raw === null || raw === undefined) return null;
	if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
	if (typeof raw !== "string") return null;
	const dbTimestamp = raw.match(DB_TIMESTAMP_RE);
	let value = raw;
	if (dbTimestamp) {
		const [, day, clock, fraction = "", offset = "+00"] = dbTimestamp;
		const zone = offset.length === 3 ? `${offset}:00` : offset;
		value = `${day}T${clock}.${(fraction + "000").slice(0, 3)}${zone}`;
	}
	const parsed = parseDate(value);
	return parsed === null || Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** The claim date may already be normalized (`claimDate`) or raw (`claimed_at`). */
export function claimDateOf(evidence: Record<string, unknown> | null | undefined): string | null {
	if (!evidence) return null;
	return normalizeIsoDate(evidence.claimDate) ?? normalizeIsoDate(evidence.claimed_at);
}

/** Region scope: explicit regional flag, or an organisation in a NA department. */
export function isNAEvent(event: EventDateInput): boolean {
	return event.regional === true
		|| (typeof event.orgDept === "string" && NA_DEPARTMENTS[event.orgDept] === true);
}
/**
 * Classify one event without mutating it. Only counts an ISO date with an
 * explicit, non-fallback provenance as normalized.
 */
export function classifyDate(event: EventDateInput): DateStatus {
	const source = typeof event.dateSource === "string" ? event.dateSource.toLowerCase() : null;
	const observed = normalizeIsoDate(event.observedAt);
	const claim = claimDateOf(event.evidence);

	if (source === "claim" && claim !== null) {
		return { kind: "claim-dated", date: claim, normalized: true, reason: "claim-date-with-provenance" };
	}
	if ((source === "feed" || source === "inferred") && observed !== null) {
		return { kind: "source-dated", date: observed, normalized: true, reason: "source-date-with-provenance" };
	}
	if (source === "fetched") {
		return { kind: "collection-fallback", date: observed, normalized: false, reason: "collection-time-only" };
	}
	if (claim !== null) {
		return { kind: "unlabeled-claim", date: claim, normalized: false, reason: "claim-date-without-provenance" };
	}
	if (observed !== null) {
		return { kind: "unlabeled-date", date: observed, normalized: false, reason: "date-without-provenance" };
	}
	return { kind: "no-date", date: null, normalized: false, reason: "no-date-available" };
}

/**
 * Compute the smallest safe normalization for one event.
 * Dates are never invented and observed_at is never rewritten: only missing
 * provenance and an explicit ISO claim date are added.
 */
export function planDateNormalization(event: EventDateInput): NormalizationPlan {
	if (!isNAEvent(event)) return { action: "none", reason: "out-of-scope" };
	const source = typeof event.dateSource === "string" ? event.dateSource.toLowerCase() : null;
	const claim = claimDateOf(event.evidence);
	const observed = normalizeIsoDate(event.observedAt);

	if (source === "claim") {
		if (claim === null) return { action: "none", reason: "claim-date-missing" };
		return event.evidence?.claimDate === claim
			? { action: "none", reason: "already-normalized-claim" }
			: { action: "claim", claimDate: claim, reason: "claim-date-format" };
	}
	if (claim !== null) {
		return { action: "claim", claimDate: claim, reason: "claim-date-without-provenance" };
	}
	if (source === null && observed !== null) {
		return { action: "source", reason: "date-without-provenance" };
	}
	return { action: "none", reason: "no-safe-normalization" };
}
