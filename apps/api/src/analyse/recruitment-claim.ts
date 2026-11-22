/**
 * Pure analysis of the link between a public RSSI recruitment signal and a
 * later third-party claim. The module never reads a database, a clock or the
 * network: the caller supplies already filtered, organisation-level records.
 * No victim name, title or url is part of the result.
 */
import { NA_DEPARTMENTS } from "../filiation/siret.js";
import { monthKey, trendWindow } from "./trend-12m.js";

export const RECRUITMENT_WINDOW_MONTHS = 12;

/** Titles that actually designate a security leader, not generic IT security. */
const RSSI_TITLE =
	/\b(rssi|ciso|chief information security officer|information security officer|responsable\s+(?:de\s+la\s+)?s[ée]curit[ée]\s+(?:des\s+)?syst[eè]mes?\s+d['’]?information|responsable\s+s[ée]curit[ée]\s+si|directeur\s+(?:de\s+la\s+)?s[ée]curit[ée]\s+(?:des\s+)?syst[eè]mes?\s+d['’]?information)\b/i;

/** Staffing firms publish on behalf of unidentified clients: not an employer signal. */
const INTERMEDIARY =
	/\b(randstad|externatic|adecco|manpower|michael page|hays|robert half|page personnel|cabinet de recrutement|agence d'emploi|agence de recrutement|int[ée]rim)\b/i;

const OFFER_FIELDS: Record<string, true> = {
	id: true, organisation: true, department: true, title: true,
	publishedAt: true, url: true, source: true, query: true,
};

export type RecruitmentOffer = {
	id: string;
	organisation: string;
	department: string;
	title: string;
	/** ISO date at day precision (the public board only exposes relative days). */
	publishedAt: string;
	url: string;
	source: string;
	query: string;
};

export type ClaimRecord = {
	id: string;
	orgId: string;
	orgName: string;
	kind: string;
	at: string;
	isNa: boolean;
};

export type RecruitmentClaimInput = {
	asOf: string;
	offers: readonly RecruitmentOffer[];
	claims: readonly ClaimRecord[];
	/** Size of the Nouvelle-Aquitaine organisation referential, for the 2x2 table. */
	population: number;
};

export type MonthlyCount = { month: string; claims: number; offers: number };

export type RecruitmentClaimResult = {
	window: string[];
	counts: {
		claims: number;
		victimOrganisations: number;
		recruitmentOffers: number;
		recruitingOrganisations: number;
		exposedVictims: number;
		population: number;
	};
	table: { exposedCases: number; exposedControls: number; unexposedCases: number; unexposedControls: number };
	statistics: { oddsRatio: number | null; pValue: number; verdict: "positive_association" | "no_positive_association" };
	monthly: MonthlyCount[];
	checks: {
		naOnly: boolean;
		windowHas12Months: boolean;
		thirdPartyClaimsOnly: boolean;
		offersDatedInWindow: boolean;
		noPersonalDataFields: boolean;
	};
};

/** Accepts a real RSSI/CISO title, rejects generic "network and security" jobs. */
export function isRssiTitle(title: string): boolean {
	return RSSI_TITLE.test(title);
}

/** A staffing agency is not the organisation that will hire the RSSI. */
export function isIntermediaryEmployer(organisation: string): boolean {
	return INTERMEDIARY.test(organisation);
}

/** Deterministic, locale-free key used to join a job offer to an organisation. */
export function normaliseOrganisationName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function dateOf(value: string): number {
	const instant = Date.parse(value);
	if (!Number.isFinite(instant)) throw new RangeError(`invalid date: ${value}`);
	return instant;
}

// Lanczos approximation, sufficient for the log binomial coefficients below.
const LANCZOS = [
	676.5203681218851, -1259.1392167224028, 771.3234287776531,
	-176.6150291621406, 12.507343278686905, -0.13857109526572012,
	9.984369578019572e-6, 1.5056327351493116e-7,
];

function logGamma(z: number): number {
	if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
	const x = z - 1;
	let sum = 0.9999999999998099;
	for (let i = 0; i < LANCZOS.length; i += 1) sum += LANCZOS[i]! / (x + i + 1);
	const t = x + LANCZOS.length - 0.5;
	return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

function logChoose(n: number, k: number): number {
	if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
	return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** One-sided Fisher exact p-value for a positive association (hypergeometric tail). */
export function fisherOneSidedP(a: number, b: number, c: number, d: number): number {
	const total = a + b + c + d;
	const row = a + b;
	const col = a + c;
	const supportMax = Math.min(row, col);
	if (a < 0 || a > supportMax || b < 0 || c < 0 || d < 0) throw new RangeError("invalid 2x2 table");
	const logP = (x: number): number =>
		logChoose(row, x) + logChoose(total - row, col - x) - logChoose(total, col);
	let tail = 0;
	for (let x = a; x <= supportMax; x += 1) tail += Math.exp(logP(x));
	if (tail >= 1 - 1e-6) return 1;
	return Math.max(0, tail);
}

/**
 * Cohort test over twelve calendar months. An organisation is exposed only if
 * its RSSI offer predates its first claim; claims without an organisation,
 * non-NA records and staffing-agency offers are ignored.
 */
export function analyseRecruitmentClaims(input: RecruitmentClaimInput): RecruitmentClaimResult {
	const window = trendWindow(input.asOf, RECRUITMENT_WINDOW_MONTHS);
	const start = dateOf(`${window[0]}-01T00:00:00Z`);
	const end = dateOf(input.asOf);
	const monthIndex = new Map(window.map((month, i) => [month, i]));

	const claims = input.claims.filter(
		(c) => c.kind === "third_party_claim" && c.isNa && c.orgId !== "" &&
			dateOf(c.at) >= start && dateOf(c.at) <= end,
	).sort((a, b) => dateOf(a.at) - dateOf(b.at) || a.id.localeCompare(b.id));

	const firstClaim = new Map<string, ClaimRecord>();
	for (const claim of claims) if (!firstClaim.has(claim.orgId)) firstClaim.set(claim.orgId, claim);

	const offers = input.offers.filter((o) =>
		NA_DEPARTMENTS[o.department] === true &&
		isRssiTitle(o.title) &&
		!isIntermediaryEmployer(o.organisation) &&
		dateOf(o.publishedAt) >= start &&
		dateOf(o.publishedAt) <= end,
	).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));

	const firstOfferByOrg = new Map<string, RecruitmentOffer>();
	for (const offer of offers) {
		const key = normaliseOrganisationName(offer.organisation);
		if (key && !firstOfferByOrg.has(key)) firstOfferByOrg.set(key, offer);
	}

	const monthly: MonthlyCount[] = window.map((month) => ({ month, claims: 0, offers: 0 }));
	for (const claim of claims) {
		const i = monthIndex.get(monthKey(claim.at));
		if (i !== undefined) monthly[i]!.claims += 1;
	}
	for (const offer of offers) {
		const i = monthIndex.get(monthKey(offer.publishedAt));
		if (i !== undefined) monthly[i]!.offers += 1;
	}

	let exposedCases = 0;
	for (const claim of firstClaim.values()) {
		const offer = firstOfferByOrg.get(normaliseOrganisationName(claim.orgName));
		if (offer && dateOf(offer.publishedAt) <= dateOf(claim.at)) exposedCases += 1;
	}

	const recruitingOrganisations = firstOfferByOrg.size;
	const victimOrganisations = firstClaim.size;
	const exposedControls = Math.max(0, recruitingOrganisations - exposedCases);
	const unexposedCases = Math.max(0, victimOrganisations - exposedCases);
	const unexposedControls = Math.max(0, input.population - victimOrganisations - exposedControls);
	const oddsRatio = exposedCases === 0 ? 0 : exposedControls === 0 || unexposedCases === 0
		? null
		: (exposedCases * unexposedControls) / (exposedControls * unexposedCases);
	const pValue = fisherOneSidedP(exposedCases, exposedControls, unexposedCases, unexposedControls);

	return {
		window,
		counts: {
			claims: claims.length,
			victimOrganisations,
			recruitmentOffers: offers.length,
			recruitingOrganisations,
			exposedVictims: exposedCases,
			population: input.population,
		},
		table: { exposedCases, exposedControls, unexposedCases, unexposedControls },
		statistics: {
			oddsRatio,
			pValue,
			verdict: pValue < 0.05 && oddsRatio !== null && oddsRatio > 1
				? "positive_association"
				: "no_positive_association",
		},
		monthly,
		checks: {
			naOnly: claims.every((c) => c.isNa) && offers.every((o) => NA_DEPARTMENTS[o.department] === true),
			windowHas12Months: window.length === RECRUITMENT_WINDOW_MONTHS,
			thirdPartyClaimsOnly: claims.every((c) => c.kind === "third_party_claim"),
			offersDatedInWindow: offers.every((o) => dateOf(o.publishedAt) >= start && dateOf(o.publishedAt) <= end),
			noPersonalDataFields: input.offers.every((o) =>
				Object.keys(o).every((field) => OFFER_FIELDS[field] === true) &&
				typeof o.organisation === "string" && typeof o.title === "string",
			),
		},
	};
}
