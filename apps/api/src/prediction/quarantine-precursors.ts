/**
 * Retro-attachment of quarantine claim hints to Nouvelle-Aquitaine
 * organisations, for the victim-forecast precursor audit.
 *
 * Pure module: the caller supplies read-only rows. A hint is attached only
 * when its exact domain root or exact normalised name resolves to one
 * organisation; ambiguous keys are skipped rather than guessed. No claim
 * body, evidence URL or personal detail is read or emitted.
 */
import { normalize } from "../match/core.js";
import { domaineRacine } from "../match/domaine.js";
import {
	measureSource,
	type SignalRecord,
	type SourceCoverage,
	type VictimRecord,
} from "./precursor-coverage.js";

export type OrganizationIdentity = {
	orgId: number;
	name: string;
	domain: string | null;
	website: string | null;
	aliases: readonly string[];
};

export type QuarantineMention = {
	hint: string;
	receivedAt: string;
};

export type MentionAttachmentResult = {
	attachments: SignalRecord[];
	ambiguous: number;
	unmatched: number;
};

function register(owners: Map<string, number | null>, key: string, orgId: number): void {
	const current = owners.get(key);
	if (current === undefined) owners.set(key, orgId);
	else if (current !== orgId) owners.set(key, null);
}

/**
 * Builds an exact domain/name index, then resolves each hint at most once.
 * Domain hints never fall back to a name match: that would create a false
 * precursor from an unrelated organisation sharing a word in its name.
 */
export function attachQuarantineMentions(
	mentions: readonly QuarantineMention[],
	organizations: readonly OrganizationIdentity[],
): MentionAttachmentResult {
	const owners = new Map<string, number | null>();
	for (const org of organizations) {
		for (const value of [org.domain, org.website, ...org.aliases]) {
			const root = domaineRacine(value);
			if (root !== null) register(owners, `d:${root}`, org.orgId);
		}
		const name = normalize(org.name);
		if (name !== "") register(owners, `n:${name}`, org.orgId);
		for (const alias of org.aliases) {
			if (domaineRacine(alias) !== null) continue;
			const normalized = normalize(alias);
			if (normalized !== "") register(owners, `n:${normalized}`, org.orgId);
		}
	}

	const attachments: SignalRecord[] = [];
	let ambiguous = 0;
	let unmatched = 0;
	for (const mention of mentions) {
		const root = domaineRacine(mention.hint);
		const key = root === null ? `n:${normalize(mention.hint)}` : `d:${root}`;
		const owner = owners.get(key);
		if (owner === undefined) unmatched++;
		else if (owner === null) ambiguous++;
		else attachments.push({ orgId: owner, observedAt: mention.receivedAt });
	}
	attachments.sort(
		(a, b) => a.orgId - b.orgId || a.observedAt.localeCompare(b.observedAt),
	);
	return { attachments, ambiguous, unmatched };
}

/** Counts each victim at most once per source, strictly before its claim. */
export function measureQuarantineSource(
	victims: readonly VictimRecord[],
	attachments: readonly SignalRecord[],
): SourceCoverage {
	return measureSource("quarantine_raw", victims, attachments);
}
