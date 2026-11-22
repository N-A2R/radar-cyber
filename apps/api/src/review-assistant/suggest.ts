/**
 * Review assistant — deterministic suggestion engine.
 *
 * The assistant reads only non-personal evidence about a queued claim: the
 * organisation hint, the source, the presence of a description, an optional
 * declared country and an optional Nouvelle-Aquitaine department. It emits a
 * decision suggestion, a confidence, and a stable English rule identifier.
 * It never reads or returns victim names, contact details or claim text.
 *
 * Rules are ordered: the first match wins. Ordering is part of the contract.
 * Sources are never excluded: gray feeds are accepted like any other feed.
 * The source field is used only to recognise a domain-shaped feed format.
 */

export type AssistantAction = "promote" | "review" | "reject";
export type AssistantScope = "na" | "out-of-scope" | "unknown";

export type AssistantClaim = {
	claimId: number;
	orgHint: string | null;
	source?: string | null;
	hasDescription?: boolean;
	declaredCountry?: string | null;
	department?: string | null;
};

export type AssistantSuggestion = {
	claimId: number;
	action: AssistantAction;
	confidence: number;
	/** Stable English rule identifier; never a fragment of the input text. */
	reason: string;
	scope: AssistantScope;
	/** Constant: the engine has no access to victim data. */
	personalDataFindings: 0;
};

export const NA_DEPARTMENTS: Record<string, true> = {
	"16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
	"40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

const HOME_COUNTRIES: Record<string, true> = {
	france: true, fr: true, "french republic": true,
};

/** Feeds whose victim identifier is a domain, not a trust list. */
const DOMAIN_IDENTIFIER_FEEDS: Record<string, true> = { "ransomware.live": true, ransomwatch: true };

const DOMAIN = /^(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;
const COUNTRY_SEGMENT = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.-]{1,28}$/;
const NA_SIGNAL = /\b(france|français|francaise|french|paris|lyon|marseille|bordeaux|rennes|nantes|nice|poitiers|limoges|angoul[eê]me|la rochelle|pau|brive|p[ée]rigueux|niort|ch[uû]|h[ôo]pital|universit[eé]|commune|mairie|conseil d[ée]partemental)\b/i;
const DISCLOSURE = /disclosed|leaked|published|updated|sold/i;

/** Country declared by the publisher in a structured title, never verified. */
export function declaredCountryOf(hint: string | null | undefined): string | null {
	if (!hint || !hint.includes("\\")) return null;
	const segments = hint.split("\\").map((part) => part.trim()).filter((part) => part !== "");
	for (const segment of segments.slice(1)) {
		if (/\d|[$%€£<>]/.test(segment)) continue;
		if (DISCLOSURE.test(segment)) continue;
		if (!COUNTRY_SEGMENT.test(segment)) continue;
		return segment;
	}
	return null;
}

export function isDomainHint(hint: string | null | undefined): boolean {
	return DOMAIN.test((hint ?? "").split("\\")[0].trim());
}

export function isDomainIdentifierFeed(source: string | null | undefined): boolean {
	return typeof source === "string" && DOMAIN_IDENTIFIER_FEEDS[source.toLowerCase()] === true;
}

export function isNaDepartment(value: string | null | undefined): boolean {
	return typeof value === "string" && NA_DEPARTMENTS[value.trim()] === true;
}

export function scopeOf(claim: AssistantClaim, country = declaredCountryOf(claim.orgHint)): AssistantScope {
	if (isNaDepartment(claim.department)) return "na";
	if (country && HOME_COUNTRIES[country.toLowerCase()] !== true) return "out-of-scope";
	if (country) return "na";
	if (NA_SIGNAL.test(claim.orgHint ?? "")) return "na";
	return "unknown";
}

/** Suggest a decision. Pure: the same claim always yields the same output. */
export function suggestDecision(claim: AssistantClaim): AssistantSuggestion {
	const hint = (claim.orgHint ?? "").trim();
	const country = claim.declaredCountry ?? declaredCountryOf(hint);
	const scope = scopeOf(claim, country);
	const base = { claimId: claim.claimId, scope, personalDataFindings: 0 as const };

	if (hint === "") {
		return { ...base, action: "reject", confidence: 0.95, reason: "no-usable-hint" };
	}
	if (country && HOME_COUNTRIES[country.toLowerCase()] !== true) {
		return { ...base, action: "reject", confidence: 0.9, reason: "declared-country-outside-scope" };
	}
	if (isNaDepartment(claim.department)) {
		return { ...base, action: "review", confidence: 0.85, reason: "na-department-needs-review" };
	}
	if (scope === "na") {
		return { ...base, action: "review", confidence: 0.8, reason: "na-scope-signal" };
	}
	if (isDomainHint(hint) && claim.hasDescription === true) {
		return { ...base, action: "promote", confidence: 0.7, reason: "domain-hint-with-evidence" };
	}
	if (isDomainHint(hint) && isDomainIdentifierFeed(claim.source)) {
		return { ...base, action: "promote", confidence: 0.65, reason: "domain-identifier-feed" };
	}
	if (isDomainHint(hint)) {
		return { ...base, action: "review", confidence: 0.55, reason: "domain-hint-without-evidence" };
	}
	return { ...base, action: "review", confidence: 0.5, reason: "ambiguous-hint" };
}
