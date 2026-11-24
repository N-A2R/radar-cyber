/**
 * Retro-attachment of prior claims to Nouvelle-Aquitaine organisations that
 * share an exact, distinctive brand prefix with the claimed organisation.
 *
 * Pure module: the caller supplies read-only rows. Only organisation names,
 * aliases and dates are used — no claim description, evidence URL or personal
 * detail. A brand is the first two normalised tokens of a claim victim name;
 * it is attached only when it resolves to exactly one NA organisation, so a
 * shared brand is never guessed. A claim on the organisation itself is not a
 * precursor.
 */
import { normalize } from "../match/core.js";
import {
	measureSource,
	type SignalRecord,
	type SourceCoverage,
	type VictimRecord,
} from "./precursor-coverage.js";

export const BRAND_FAMILY_BONUS = 100;
const MAX_BONUS_CLAIMS = 2;

const GENERIC_TOKENS: Readonly<Record<string, true>> = {
	groupe: true,
	societe: true,
	entreprise: true,
	services: true,
	service: true,
	holding: true,
	france: true,
	francais: true,
	international: true,
};

export type BrandOrganization = {
	orgId: number;
	name: string;
	aliases: readonly string[];
};

export type BrandClaim = {
	claimId: number;
	orgId: number | null;
	victim: string;
	publishedAt: string;
};

export type BrandAttachmentResult = {
	attachments: SignalRecord[];
	ambiguous: number;
	unmatched: number;
};

/** Two distinct tokens of at least four characters, from a longer claim name. */
export function brandKeyFromClaim(victim: string): string | null {
	const tokens = normalize(victim).split(" ").filter((token) => token !== "");
	if (tokens.length < 3) return null;
	const brand = tokens.slice(0, 2);
	if (brand.some((token) => token.length < 4 || GENERIC_TOKENS[token] === true)) return null;
	return brand.join(" ");
}

function brandOf(organization: BrandOrganization): string | null {
	for (const value of [organization.name, ...organization.aliases]) {
		const tokens = normalize(value).split(" ").filter((token) => token !== "");
		if (tokens.length < 2) continue;
		if (tokens[0]!.length < 4 || tokens[1]!.length < 4) continue;
		return `${tokens[0]} ${tokens[1]}`;
	}
	return null;
}

/**
 * Resolves each claim brand at most once. Brands shared by two organisations,
 * brands with no NA owner and claims on their own organisation are skipped.
 */
export function attachBrandFamilyClaims(
	claims: readonly BrandClaim[],
	organizations: readonly BrandOrganization[],
): BrandAttachmentResult {
	const owners = new Map<string, number | null>();
	for (const organization of organizations) {
		const key = brandOf(organization);
		if (key === null) continue;
		const current = owners.get(key);
		if (current === undefined) owners.set(key, organization.orgId);
		else if (current !== organization.orgId) owners.set(key, null);
	}

	const attachments: SignalRecord[] = [];
	let ambiguous = 0;
	let unmatched = 0;
	for (const claim of claims) {
		const key = brandKeyFromClaim(claim.victim);
		if (key === null) {
			unmatched++;
			continue;
		}
		const owner = owners.get(key);
		if (owner === undefined) {
			unmatched++;
			continue;
		}
		if (owner === null) {
			ambiguous++;
			continue;
		}
		if (owner === claim.orgId) {
			unmatched++;
			continue;
		}
		attachments.push({ orgId: owner, observedAt: claim.publishedAt });
	}
	attachments.sort(
		(a, b) => a.orgId - b.orgId || a.observedAt.localeCompare(b.observedAt),
	);
	return { attachments, ambiguous, unmatched };
}

/** Counts each victim at most once per source, strictly before its claim. */
export function measureBrandFamilySource(
	victims: readonly VictimRecord[],
	attachments: readonly SignalRecord[],
): SourceCoverage {
	return measureSource("brand_family", victims, attachments);
}

/** Bounded bonus: two prior claims at most, observable at the cutoff. */
export function brandFamilyBonus(
	orgId: number,
	signalsAtCutoff: readonly SignalRecord[],
): number {
	const count = signalsAtCutoff.reduce((sum, signal) => sum + (signal.orgId === orgId ? 1 : 0), 0);
	return Math.min(count, MAX_BONUS_CLAIMS) * BRAND_FAMILY_BONUS;
}
