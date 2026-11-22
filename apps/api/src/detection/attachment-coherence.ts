/**
 * Graph coherence check for event -> organisation attachments.
 *
 * An attachment is kept only when the event and the organisation share a node
 * in the coherence graph: a victim domain, a DNS/IP/ASN neighbour, or a
 * distinctive name. A publisher domain (the host of the feed that reported
 * the event) is deliberately NOT a shared node: feeds attach themselves to
 * every event they carry, so a publisher-domain match proves nothing about
 * the victim.
 *
 * Pure module: no database, no network, no personal data.
 */
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "../match/generique.js";

const GENERIC_TOKENS: ReadonlySet<string> = new Set<string>([
	...MOTS_GENERIQUES,
	...MOTS_GENERIQUES_ENTREPRISE,
	// Common French/English words that occur inside genuine organisation
	// names but cannot identify one on their own.
	"agence", "nationale", "national", "open", "source", "bureau", "origine",
	"vue", "partie", "gain", "temps", "controle", "technique", "vallee",
	"aspe", "hydravion", "instances", "connections", "actualites",
]);

/** Directory-style labels made only of sector words ("DATA STORAGE", "GREEN ENERGY"). */
const SECTOR_TOKENS: Record<string, true> = {
	data: true, donnees: true, stockage: true, storage: true, green: true, energy: true,
	energie: true, video: true, production: true, produce: true, private: true,
	equity: true, major: true, construction: true, new: true, nouveau: true,
	generation: true, good: true, job: true, process: true, communication: true,
	communications: true, real: true, estate: true, immobilier: true, diagnostic: true,
	service: true, services: true, graphic: true, design: true, thirty: true,
	three: true, family: true, trust: true, quality: true, control: true, news: true,
	media: true, they: true,
};

const DOMAIN_RE = /(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}/gi;

export type CoherenceEntity = {
	id: number;
	name: string;
	domains: readonly string[];
	aliases: readonly string[];
	department: string | null;
};

export type CoherenceEvent = {
	id: number;
	title: string | null;
	summary: string | null;
	hint: string | null;
	evidenceAlias: string | null;
	/** Structured department from a claim's provenance, not a place name in prose. */
	department: string | null;
	publisherRoots: readonly string[];
};

export type CoherenceInput = {
	event: CoherenceEvent;
	org: CoherenceEntity;
};

export type NetworkLink = { victimRoot: string; orgRoot: string };

export type CoherenceReason =
	| "shared-domain"
	| "shared-network"
	| "shared-department"
	| "distinctive-name"
	| "body-only-name"
	| "sector-only-name"
	| "publisher-domain-only"
	| "no-shared-node"
	| "domain-mismatch";

export type CoherenceVerdict = {
	coherent: boolean;
	reason: CoherenceReason;
	victimRoots: string[];
};

export function normalize(text: string): string {
	return text
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

/** Registrable-looking root: enough to compare `www.x.fr` with `x.fr`. */
export function domainRoot(value: string): string {
	const flat = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const noScheme = flat.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
	const host = noScheme.split(/[:/?#\\$\s]/, 1)[0] ?? "";
	const parts = host.split(".").filter((part) => /^[a-z0-9-]+$/.test(part));
	if (parts.length < 2) return "";
	return parts.slice(-2).join(".");
}

/** Domains named by the victim hint or by the event text, never publisher hosts. */
export function extractVictimRoots(event: CoherenceEvent): string[] {
	const publishers = new Set(event.publisherRoots.map(domainRoot));
	const candidates = [
		event.hint ?? "",
		event.title ?? "",
		event.summary ?? "",
	];
	const roots = new Set<string>();
	for (const candidate of candidates) {
		for (const match of candidate.matchAll(DOMAIN_RE)) {
			const root = domainRoot(match[0]);
			if (root && !publishers.has(root)) roots.add(root);
		}
	}
	return [...roots].sort();
}

/** A name node needs a non-generic token plus a second token to identify an entity. */
export function isDistinctiveName(name: string): boolean {
	const tokens = normalize(name).split(" ").filter(Boolean);
	if (tokens.length < 2) return false;
	const distinctive = tokens.filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token));
	return distinctive.length >= 1;
}

/**
 * A directory label built only from sector words names a category, not an
 * entity. Claim descriptions use such words for the victim's business, so a
 * textual match on them cannot identify the organisation.
 */
export function isSectorOnlyName(name: string): boolean {
	const tokens = normalize(name).split(" ").filter(Boolean);
	if (tokens.length === 0) return false;
	return !tokens.some((token) => token.length >= 4
		&& !GENERIC_TOKENS.has(token) && !SECTOR_TOKENS[token]);
}

function nameInText(
	input: CoherenceInput,
	names: readonly string[],
	text = normalize(`${input.event.title ?? ""} ${input.event.summary ?? ""}`),
): boolean {
	return names.some((name) => {
		const normalized = normalize(name);
		return normalized.length >= 5 && isDistinctiveName(normalized) && text.includes(normalized);
	});
}


/**
 * Decide whether an existing attachment is supported by the graph.
 * Network links are supplied by the caller: each entry is a victim domain
 * root and an organisation domain root that resolve to a common IP/ASN node.
 */
export function evaluateCoherence(
	input: CoherenceInput,
	networkLinks: readonly NetworkLink[] = [],
): CoherenceVerdict {
	const victimRoots = extractVictimRoots(input.event);
	const orgRoots = new Set(input.org.domains.map(domainRoot).filter(Boolean));
	const publishers = new Set(input.event.publisherRoots.map(domainRoot));

	if (victimRoots.some((root) => orgRoots.has(root))) {
		return { coherent: true, reason: "shared-domain", victimRoots };
	}
	if (networkLinks.some((link) => victimRoots.includes(link.victimRoot) && orgRoots.has(link.orgRoot))) {
		return { coherent: true, reason: "shared-network", victimRoots };
	}
	if (input.event.department && input.event.department === input.org.department) {
		return { coherent: true, reason: "shared-department", victimRoots };
	}
	const publisherOnly = victimRoots.length === 0
		&& [...orgRoots].some((root) => publishers.has(root));
	const aliasNodes = [...input.org.aliases, input.event.evidenceAlias ?? ""]
		.filter((value) => !isSectorOnlyName(value));
	if (isSectorOnlyName(input.org.name) && !nameInText(input, aliasNodes) && !publisherOnly) {
		return { coherent: false, reason: "sector-only-name", victimRoots };
	}
	const titleText = normalize(input.event.title ?? "");
	const summaryText = normalize(input.event.summary ?? "");
	const supportedNames = [input.org.name, ...aliasNodes];
	if (nameInText(input, supportedNames, titleText)) {
		return { coherent: true, reason: "distinctive-name", victimRoots };
	}
	// A name mentioned only in the article body is an incidental topic word,
	// not proof that this particular organisation is the victim.
	if (nameInText(input, supportedNames, summaryText)) {
		return { coherent: false, reason: "body-only-name", victimRoots };
	}

	return {
		coherent: false,
		reason: publisherOnly ? "publisher-domain-only" : victimRoots.length > 0 ? "domain-mismatch" : "no-shared-node",
		victimRoots,
	};
}
