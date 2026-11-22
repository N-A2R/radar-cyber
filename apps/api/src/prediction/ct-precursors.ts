/**
 * Domain-based retro-attachment of certificate-transparency observations to
 * Nouvelle-Aquitaine organisations, for the victim-forecast precursor audit.
 *
 * Pure module: the measurement script supplies rows read from the local
 * database. Only organisation ids, domain roots and UTC days are used; no
 * victim name, certificate text or claim description is ever read or emitted.
 */
import { domaineRacine } from "../match/domaine.js";
import {
	measureSource,
	type SignalRecord,
	type SourceCoverage,
	type VictimRecord,
} from "./precursor-coverage.js";

export type OrganizationDomain = {
	orgId: number;
	domain: string | null;
	website: string | null;
};

export type CtObservation = {
	domain: string;
	firstSeen: string;
};

export type CtAttachment = SignalRecord & {
	root: string;
};

export type AttachmentResult = {
	attachments: CtAttachment[];
	ambiguousRoots: number;
	unmatched: number;
};

function rootsOf(org: OrganizationDomain): string[] {
	const roots = new Set<string>();
	for (const value of [org.domain, org.website]) {
		const root = domaineRacine(value);
		if (root !== null) roots.add(root);
	}
	return [...roots];
}

/**
 * Attaches one observation to at most one organisation by exact registrable
 * root. Roots shared by two organisations are ambiguous and are skipped: a
 * guess would create a false precursor. Output is sorted for reproducible runs.
 */
export function attachCtByDomain(
	observations: readonly CtObservation[],
	organizations: readonly OrganizationDomain[],
): AttachmentResult {
	const owners = new Map<string, number | null>();
	for (const org of organizations) {
		for (const root of rootsOf(org)) {
			owners.set(root, owners.has(root) ? null : org.orgId);
		}
	}

	const attachments: CtAttachment[] = [];
	let ambiguousRoots = 0;
	let unmatched = 0;
	for (const observation of observations) {
		const root = domaineRacine(observation.domain);
		if (root === null) {
			unmatched++;
			continue;
		}
		const owner = owners.get(root);
		if (owner === undefined) {
			unmatched++;
		} else if (owner === null) {
			ambiguousRoots++;
		} else {
			attachments.push({ orgId: owner, observedAt: observation.firstSeen, root });
		}
	}
	attachments.sort(
		(a, b) => a.orgId - b.orgId || a.observedAt.localeCompare(b.observedAt) || a.root.localeCompare(b.root),
	);
	return { attachments, ambiguousRoots, unmatched };
}

/** Counts each victim at most once per CT source, strictly before its claim. */
export function measureCtSource(
	source: string,
	victims: readonly VictimRecord[],
	attachments: readonly CtAttachment[],
): SourceCoverage {
	return measureSource(source, victims, attachments);
}
