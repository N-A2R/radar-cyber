/**
 * Cross-flow identity of radar events.
 *
 * The feed fingerprint (`normalizeTitle | UTC day | source`, migration 045)
 * already stops the same article from being written twice by one source. It
 * cannot see the same real-world event republished by a second source: the
 * source part of the key differs. Left alone, one incident counted twice
 * inflates severity, corroboration and alert volume.
 *
 * This module classifies a *pair* of events as the same event or not, using
 * only what the event itself carries: normalized title tokens, the
 * organisation marker and the place it names, an explicit identifier (CVE,
 * domain, IP) and the observation day. The exact same rule is implemented in
 * SQL (`dedup_is_duplicate`, migration 205) so a stored prediction and a
 * runtime decision can never disagree; `test/dedup-pairs.test.ts` proves the
 * two implementations agree on all annotated pairs.
 *
 * Code and interface are English. The measurement report is French.
 */

/** Rule version stored with every prediction so a change stays auditable. */
export const DEDUP_RULE_VERSION = "cross-flow@1";

/** Two copies of one event may be dated one calendar day apart by their sources. */
export const MAX_DAY_GAP = 1;

/** Minimum Jaccard similarity, when at least two content tokens are shared. */
export const JACCARD_MIN = 0.55;

/** A Jaccard match needs at least this many shared content tokens. */
export const MIN_SHARED_CONTENT = 2;

/** A Jaccard match needs at least this many tokens in the union (no 1/1 flukes). */
export const MIN_UNION_TOKENS = 3;

export type EventSide = {
	title: string;
	/** UTC calendar day, `YYYY-MM-DD`. */
	day: string;
};

export type EventPairVerdict = {
	duplicate: boolean;
	reason: "same-title" | "similar-title" | "same-entity" | "different" | "different-day";
	sharedContent: string[];
	sharedMarkers: string[];
	sharedIdentifiers: string[];
	dayGap: number;
};

const STOPWORDS: Readonly<Record<string, true>> = {
	le: true, la: true, les: true, l: true, un: true, une: true, des: true,
	du: true, de: true, d: true, et: true, en: true, au: true, aux: true,
	a: true, sur: true, pour: true, par: true, avec: true, dans: true,
	chez: true, vers: true, the: true, of: true, and: true, to: true,
	in: true, on: true, by: true, at: true,
};

/**
 * Words that describe an event without identifying it. They are removed from
 * the content set so two different incidents in the same town cannot look
 * alike just because both say "cyberattaque" and "victime".
 */
const GENERIC: Readonly<Record<string, true>> = {
	cyberattaque: true, cyberattaques: true, cyber: true, attaque: true,
	attaques: true, victime: true, victimes: true, rancongiciel: true,
	rancongiciels: true, ransomware: true, ransomwares: true, pirate: true,
	pirates: true, piratage: true, intrusion: true, intrusions: true,
	incident: true, incidents: true, securite: true, informatique: true,
	systeme: true, systemes: true, donnees: true, personnelle: true,
	personnelles: true, site: true, sites: true, service: true, services: true,
	entreprise: true, entreprises: true, organisation: true,
	organisations: true, structure: true, structures: true,
	etablissement: true, etablissements: true, activite: true,
	activites: true, suspendu: true, suspendue: true, suspendues: true,
	paralyse: true, paralysee: true, paralysees: true, confirme: true,
	confirmee: true, confirmees: true, selon: true, indique: true,
	annonce: true, revele: true, lance: true, lancee: true, renforce: true,
	renforcement: true, renforcer: true, touche: true, touchee: true,
	touchees: true, affecte: true, affectee: true, affectees: true,
	dossier: true, fichier: true, fichiers: true, acces: true, reseau: true,
	reseaux: true, information: true, informations: true, communique: true,
	rapport: true, enquete: true, plainte: true, justice: true,
	condamne: true, condamnation: true, litige: true, projet: true,
	budget: true, marche: true, contrat: true, appel: true, offre: true,
	recrutement: true, formation: true, sensibilisation: true,
	prevention: true, mois: true, journee: true, semaine: true,
	campagne: true, numerique: true, digital: true, apres: true, avant: true,
	lors: true, alors: true, ainsi: true, egalement: true, toujours: true,
	encore: true, deja: true, plus: true, moins: true, tres: true, tout: true,
	tous: true, toute: true, toutes: true, autre: true, autres: true,
	meme: true, premier: true, premiere: true, nouveau: true, nouvelle: true,
	nouvelles: true, grand: true, grande: true, petit: true, petite: true,
	important: true, importante: true, plusieurs: true, certains: true,
	certaines: true, patients: true, patient: true, usagers: true,
	habitants: true, administres: true, agents: true, salaries: true,
	eleves: true, etudiants: true, clients: true, fournisseurs: true,
	partenaires: true, groupe: true, equipe: true, equipes: true,
	personnel: true, personnels: true, ligne: true, lignes: true,
	interrompu: true, interrompus: true, interrompue: true,
	interrompues: true, bloque: true, bloques: true, bloquee: true,
	bloquees: true, prise: true, charge: true, perturbee: true,
	perturbees: true, perturbe: true, rancon: true, rancons: true,
	exigee: true, exigees: true, comptes: true, compte: true,
	derobe: true, derobes: true, derobee: true, derobees: true,
	publie: true, publies: true, publiee: true, publiees: true,
	diffuse: true, diffuses: true, diffusee: true, diffusees: true,
	expose: true, exposes: true, exposee: true, exposees: true,
	hacker: true, hackers: true, internet: true, identite: true,
	courriel: true, courriels: true, frauduleux: true, frauduleuse: true,
	frauduleuses: true, usurpe: true, usurpent: true, sature: true,
	satures: true, saturee: true, saturees: true, responsable: true,
	annuel: true, annuelle: true, signe: true, cybersecurite: true,
	recrute: true, ddos: true, phishing: true, hameconnage: true,
	hameconnages: true, defacement: true, defigure: true,
	vulnerabilite: true, faille: true, correctif: true, zero: true,
	day: true, cible: true, cibles: true, vise: true, visee: true,
	visees: true, fraude: true, fraudes: true, arnaque: true,
	arnaques: true, escroquerie: true, escroqueries: true,
	prestataire: true, prestataires: true,
};

/**
 * Maps a token to the generic organisation it denotes. "CHU", "CH" and
 * "hôpital" are one kind of entity; "mairie", "ville" and "commune" another.
 * Keeping the marker separate from the place is what tells "mairie de Pau"
 * apart from "hôpital de Pau".
 */
const MARKER_SYNONYMS: Readonly<Record<string, string>> = {
	chu: "hopital", ch: "hopital", hopital: "hopital", hopitaux: "hopital",
	hospitalier: "hopital", hospitaliere: "hopital", clinique: "hopital",
	ehpad: "hopital",
	mairie: "commune", ville: "commune", communes: "commune", commune: "commune",
	departement: "departement", departemental: "departement", departementale: "departement",
	conseil: "departement",
	region: "region", regional: "region", regionale: "region",
	agglo: "agglo", agglomeration: "agglo", communaute: "agglo",
	metropole: "agglo", metropolitain: "agglo",
	sdis: "pompiers", pompiers: "pompiers", pompier: "pompiers",
	universite: "universite", universitaire: "universite", univ: "universite",
	gendarmerie: "gendarmerie", gendarmes: "gendarmerie",
	police: "police", prefecture: "prefecture", prefet: "prefecture",
	ecole: "ecole", college: "ecole", lycee: "ecole",
	tribunal: "tribunal", caf: "caf", cpam: "cpam", urssaf: "urssaf", ars: "ars",
};

const MARKER_WORDS: Readonly<Record<string, true>> = Object.fromEntries(
	Object.keys(MARKER_SYNONYMS).map((word) => [word, true]),
) as Record<string, true>;

const RANSOMWARE: Readonly<Record<string, true>> = {
	rancongiciel: true, rancongiciels: true, ransomware: true, ransomwares: true,
};
const VULN: Readonly<Record<string, true>> = {
	cve: true, vulnerabilite: true, vulnerabilites: true, faille: true,
	failles: true, correctif: true, correctifs: true,
};
const LEAK: Readonly<Record<string, true>> = {
	fuite: true, fuites: true, exfiltration: true, exfiltrations: true,
	divulgation: true, divulgations: true, exfiltre: true, exfiltree: true,
	exfiltrees: true,
};
/** Verbs that turn "données"/"fichiers" into a leak when no "fuite" is named. */
const LEAK_SIGNAL: Readonly<Record<string, true>> = {
	publie: true, publies: true, publiee: true, publiees: true,
	diffuse: true, diffuses: true, diffusee: true, diffusees: true,
	derobe: true, derobes: true, derobee: true, derobees: true,
	expose: true, exposes: true, exposee: true, exposees: true,
	vole: true, voles: true, volee: true, volees: true,
};
const FRAUDE: Readonly<Record<string, true>> = {
	phishing: true, hameconnage: true, hameconnages: true, arnaque: true,
	arnaques: true, escroquerie: true, escroqueries: true, fraude: true,
	fraudes: true,
};
const DEFACEMENT: Readonly<Record<string, true>> = {
	defacement: true, defiguration: true, defigure: true, defiguree: true,
	defigurees: true, defigurent: true, defigures: true, detournee: true,
	detournees: true,
};
const INTRUSION: Readonly<Record<string, true>> = {
	cyberattaque: true, cyberattaques: true, intrusion: true, intrusions: true,
	piratage: true, pirate: true, pirates: true, compromission: true,
	compromissions: true, compromis: true,
};

export type EventKind =
	| "ransomware" | "vuln" | "leak" | "ddos" | "fraude"
	| "defacement" | "incident" | "autre";

/** Lowercase, fold ligatures and diacritics, reduce punctuation to one space. */
export function normalizeEventTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/œ/g, "oe")
		.replace(/æ/g, "ae")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Normalized tokens minus French stop words. */
export function eventTokens(title: string): string[] {
	return normalizeEventTitle(title)
		.split(" ")
		.filter((token) => token.length > 0 && !Object.hasOwn(STOPWORDS, token));
}

/** Tokens that identify the event, without generic event vocabulary or markers. */
export function contentTokens(title: string): string[] {
	const set = new Set<string>();
	for (const token of eventTokens(title)) {
		if (token.length < 3) continue;
		if (Object.hasOwn(GENERIC, token) || Object.hasOwn(MARKER_WORDS, token)) continue;
		set.add(token);
	}
	return [...set].sort();
}

/** Canonical organisation markers present in the title. */
export function organisationMarkers(title: string): string[] {
	const set = new Set<string>();
	for (const token of eventTokens(title)) {
		const marker = MARKER_SYNONYMS[token];
		if (marker !== undefined) set.add(marker);
	}
	return [...set].sort();
}

/** Explicit identifiers: CVE codes, domains and IPv4 addresses. */
export function eventIdentifiers(title: string): string[] {
	const lower = title.toLowerCase();
	const ids = new Set<string>();
	for (const match of lower.matchAll(/cve-\d{4}-\d{4,}/g)) ids.add(match[0]);
	for (const match of lower.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) ids.add(match[0]);
	for (const match of lower.matchAll(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:fr|com|net|org|io|eu|info)\b/g)) {
		ids.add(match[0]);
	}
	return [...ids].sort();
}

function hasAny(tokens: readonly string[], words: Readonly<Record<string, true>>): boolean {
	return tokens.some((token) => Object.hasOwn(words, token));
}

/** Coarse event kind, decided by the first signature that matches. */
export function eventKind(title: string): EventKind {
	const tokens = eventTokens(title);
	if (hasAny(tokens, RANSOMWARE)) return "ransomware";
	if (hasAny(tokens, VULN)) return "vuln";
	if (hasAny(tokens, LEAK)) return "leak";
	if (
		(tokens.includes("donnees") || tokens.includes("fichier") || tokens.includes("fichiers")) &&
		hasAny(tokens, LEAK_SIGNAL)
	) return "leak";
	if (hasAny(tokens, FRAUDE)) return "fraude";
	if (hasAny(tokens, DEFACEMENT)) return "defacement";
	if (tokens.includes("ddos") || (tokens.includes("deni") && tokens.includes("service"))) return "ddos";
	if (hasAny(tokens, INTRUSION) || (tokens.includes("attaque") && tokens.includes("informatique"))) return "incident";
	// A ransomware that leaks data is still one incident; "fuite de données"
	// and "cyberattaque" must not be torn apart by a priority order.
	return "autre";
}

/**
 * Kinds that may describe the same real-world incident. A ransomware is an
 * intrusion, and a leak is often the ransomware's consequence; DDoS, fraud,
 * a vulnerability and a defacement remain distinct.
 */
export function kindGroup(kind: EventKind): "incident" | "ddos" | "fraude" | "vuln" | "defacement" | "autre" {
	if (kind === "ransomware" || kind === "leak" || kind === "incident") return "incident";
	return kind;
}

/** UTC calendar-day distance; `NaN` when a side has no valid day. */
export function dayGap(a: string, b: string): number {
	const left = Date.parse(`${a}T00:00:00Z`);
	const right = Date.parse(`${b}T00:00:00Z`);
	if (Number.isNaN(left) || Number.isNaN(right)) return Number.NaN;
	return Math.abs(Math.round((left - right) / 86_400_000));
}

function intersect(left: readonly string[], right: readonly string[]): string[] {
	const set = new Set(right);
	return left.filter((value) => set.has(value));
}

export function jaccard(left: readonly string[], right: readonly string[]): number {
	const a = new Set(left);
	const b = new Set(right);
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	for (const value of a) if (b.has(value)) shared += 1;
	return shared / (a.size + b.size - shared);
}

/** Decide whether two sides describe the same event. Pure and deterministic. */
export function classifyEventPair(a: EventSide, b: EventSide): EventPairVerdict {
	const gap = dayGap(a.day, b.day);
	const sharedContent = intersect(contentTokens(a.title), contentTokens(b.title));
	const sharedMarkers = intersect(organisationMarkers(a.title), organisationMarkers(b.title));
	const sharedIdentifiers = intersect(eventIdentifiers(a.title), eventIdentifiers(b.title));
	const base = { sharedContent, sharedMarkers, sharedIdentifiers, dayGap: gap };

	if (!(gap <= MAX_DAY_GAP)) return { duplicate: false, reason: "different-day", ...base };

	const normA = normalizeEventTitle(a.title);
	const normB = normalizeEventTitle(b.title);
	if (normA.length > 0 && normA === normB) return { duplicate: true, reason: "same-title", ...base };

	const union = new Set([...contentTokens(a.title), ...contentTokens(b.title)]);
	const similarity = jaccard(contentTokens(a.title), contentTokens(b.title));
	if (
		sharedContent.length >= MIN_SHARED_CONTENT &&
		union.size >= MIN_UNION_TOKENS &&
		similarity >= JACCARD_MIN
	) {
		return { duplicate: true, reason: "similar-title", ...base };
	}

	const group = kindGroup(eventKind(a.title));
	if (
		group !== "autre" &&
		group === kindGroup(eventKind(b.title)) &&
		(sharedIdentifiers.length > 0 || (sharedMarkers.length > 0 && sharedContent.length > 0))
	) {
		return { duplicate: true, reason: "same-entity", ...base };
	}

	return { duplicate: false, reason: "different", ...base };
}

export type CrossFlowEvent = {
	id: number;
	title: string;
	day: string;
};

export type DuplicateGroup = {
	key: string;
	memberIds: number[];
	survivorId: number;
	duplicateIds: number[];
};

/**
 * Group events that classify as the same event. The oldest id survives; every
 * later member is a duplicate. Callers use `duplicateIds` to keep scores and
 * alerts from counting one incident several times. O(n²) by design: pair
 * classification is not transitive, so a stable seed pass is clearer than a
 * union-find that would quietly merge A~B and B~C while A and C differ.
 */
export function findCrossFlowDuplicates(events: readonly CrossFlowEvent[]): DuplicateGroup[] {
	const remaining = [...events].sort((x, y) => x.id - y.id);
	const groups: DuplicateGroup[] = [];
	while (remaining.length > 1) {
		const survivor = remaining.shift()!;
		const duplicates: CrossFlowEvent[] = [];
		for (let i = remaining.length - 1; i >= 0; i -= 1) {
			const candidate = remaining[i]!;
			if (classifyEventPair(survivor, candidate).duplicate) duplicates.push(remaining.splice(i, 1)[0]!);
		}
		if (duplicates.length > 0) {
			const memberIds = [survivor.id, ...duplicates.map((event) => event.id)].sort((x, y) => x - y);
			groups.push({
				key: `${DEDUP_RULE_VERSION}|${survivor.id}`,
				memberIds,
				survivorId: survivor.id,
				duplicateIds: duplicates.map((event) => event.id).sort((x, y) => x - y),
			});
		}
	}
	return groups;
}
