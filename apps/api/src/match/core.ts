import { normalizeNom } from "./normalisation.js";

/**
 * Cœur déterministe du rattachement organisationnel, sans base de données.
 *
 * Ce module existe pour deux raisons :
 *  - le moteur en ligne (`orgs.ts`) reste mince : il charge les alias depuis
 *    PostgreSQL, met en cache, puis applique les règles ci-dessous ;
 *  - les benches et tests peuvent comparer le matcher actuel à d'autres
 *    approaches (RapidFuzz, Splink…) sur un jeu annoté, sans démarrer de base.
 *
 * Règles produit conservées :
 *  - pas de sous-chaîne nue : un alias doit former une suite contiguë de
 *    jetons entiers normalisés ;
 *  - un alias court ou mono-jeton exige un contexte institutionnel ;
 *  - la confiance d'un alias mono-jeton est plafonnée sous le seuil
 *    d'application ;
 *  - une ambiguïté à force égale rend `null`, sauf arbitrage explicite.
 */

export type Match = { orgId: number; alias: string; confidence: number };

export type MatchReason =
	| "matched"
	| "fuzzy"
	| "empty-text"
	| "no-alias"
	| "short-only"
	| "ambiguous";

export type MatchDiagnosis = { match: Match | null; reason: MatchReason };

export type AliasRow = {
	org_id: number;
	name: string;
	alias: string;
	/** Code départemental (NA) de l'organisation, quand il est connu. */
	dept?: string | null;
};

export type AliasEntry = {
	orgId: number;
	name: string;
	alias: string;
	confidence: number;
	tokens: number;
	short: boolean;
	dept: string | null;
};

export type AliasIndex = {
	/** clé = alias normalisé (jetons séparés par une espace) */
	byKey: Map<string, AliasEntry[]>;
	minTokens: number;
	maxTokens: number;
};

export type AliasAnalysis = MatchDiagnosis & {
	/** Candidats à égalité de force, utile pour la file de revue / arbitrage. */
	tied: Array<{ id: number; name: string; alias: string; confidence: number }>;
};

export const MIN_ALIAS_LENGTH = 4;
/** En deçà, un alias est trop générique pour se passer de contexte. */
export const SHORT_ALIAS_LENGTH = 8;
/** Plafond de confiance d'un alias mono-jeton : reste sous le seuil 0.7. */
export const SINGLE_TOKEN_CAP = 0.4;

/**
 * Mots qui signalent une organisation. Un alias court ne matche que si l'un
 * d'eux figure dans le texte : « limoges » seul est une ville.
 */
const INSTITUTIONAL_WORDS: Record<string, true> = {
	universite: true,
	hopital: true,
	chu: true,
	chr: true,
	mairie: true,
	departement: true,
	region: true,
	communaute: true,
	agglomeration: true,
	ecole: true,
	institut: true,
	laboratoire: true,
	societe: true,
	groupe: true,
	entreprise: true,
};

/** Locutions institutionnelles en plusieurs jetons. */
const INSTITUTIONAL_PHRASES: ReadonlyArray<ReadonlyArray<string>> = [["centre", "hospitalier"]];

/**
 * Formes juridiques, exigées en capitales dans le texte d'origine : « sa » est
 * un mot français courant, « SA » est une forme sociale.
 */
const LEGAL_FORM = /\b(SA|SAS|SASU|SARL|EURL|SCI|GIE|SNC|SCA|SCOP|GmbH|Ltd|LLC|Inc|PLC|BV|AG|SpA|Corp)\b/;

/** Minuscules, accents retirés — la normalisation partagée fait foi. */
export function normalize(text: string): string {
	return normalizeNom(text);
}

export function tokenize(text: string): string[] {
	const normalized = normalize(text);
	return normalized === "" ? [] : normalized.split(" ");
}

/**
 * Vrai si le texte porte un marqueur d'organisation (établissement, collectivité
 * ou forme juridique). Sert à autoriser les alias courts.
 */
export function hasInstitutionalContext(text: string): boolean {
	const tokens = tokenize(text);
	for (const token of tokens) {
		if (INSTITUTIONAL_WORDS[token] === true) return true;
	}
	for (const phrase of INSTITUTIONAL_PHRASES) {
		for (let start = 0; start + phrase.length <= tokens.length; start++) {
			let found = true;
			for (let offset = 0; offset < phrase.length; offset++) {
				if (tokens[start + offset] !== phrase[offset]) {
					found = false;
					break;
				}
			}
			if (found) return true;
		}
	}
	return LEGAL_FORM.test(text);
}

function confidenceFor(length: number): number {
	if (length >= 8) return 1;
	if (length >= 6) return 0.8;
	if (length >= 4) return 0.6;
	return 0;
}

/** Départements de Nouvelle-Aquitaine, du plus long au plus court. */
const DEPARTEMENTS_NA: ReadonlyArray<{ code: string; tokens: readonly string[] }> = [
	{ code: "17", tokens: ["charente", "maritime"] },
	{ code: "87", tokens: ["haute", "vienne"] },
	{ code: "79", tokens: ["deux", "sevres"] },
	{ code: "47", tokens: ["lot", "et", "garonne"] },
	{ code: "64", tokens: ["pyrenees", "atlantiques"] },
	{ code: "16", tokens: ["charente"] },
	{ code: "19", tokens: ["correze"] },
	{ code: "23", tokens: ["creuse"] },
	{ code: "24", tokens: ["dordogne"] },
	{ code: "33", tokens: ["gironde"] },
	{ code: "40", tokens: ["landes"] },
	{ code: "86", tokens: ["vienne"] },
];

/** Alias qui ne sont que le nom d'un département : contexte, pas victime. */
const CLES_DEPARTEMENTS: ReadonlySet<string> = new Set(
	DEPARTEMENTS_NA.map((dept) => dept.tokens.join(" ")),
);

/**
 * Départements explicitement cités dans le texte. Un nom composé est consommé
 * avant son suffixe : « Charente-Maritime » ne cite pas la Charente.
 */
function departementsCites(tokens: readonly string[]): ReadonlySet<string> {
	const cites = new Set<string>();
	const pris = new Array<boolean>(tokens.length).fill(false);
	for (const dept of DEPARTEMENTS_NA) {
		for (let debut = 0; debut + dept.tokens.length <= tokens.length; debut++) {
			let libre = true;
			for (let i = debut; i < debut + dept.tokens.length; i++) {
				if (pris[i]) {
					libre = false;
					break;
				}
			}
			if (!libre || !dept.tokens.every((jeton, i) => tokens[debut + i] === jeton)) continue;
			cites.add(dept.code);
			for (let i = debut; i < debut + dept.tokens.length; i++) pris[i] = true;
			break;
		}
	}
	return cites;
}

/**
 * Étapes de construction de l'index d'alias — générateur, pour que le
 * chargement de fond puisse rendre la main régulièrement sur 1,68 M de lignes.
 */
const PAS_ALIAS = 10_000;

function* etapesAliasIndex(rows: ReadonlyArray<AliasRow>): Generator<void, AliasIndex> {
	const byKey = new Map<string, AliasEntry[]>();
	let minTokens = Number.POSITIVE_INFINITY;
	let maxTokens = 0;
	let vus = 0;

	for (const row of rows) {
		// Un alias qui est un nom de domaine ne sert pas au rapprochement de
		// texte : « nouvelle-aquitaine.fr » se tokenise en « nouvelle aquitaine
		// fr » et attrape alors tout article parlant de la région. Les domaines
		// se comparent en égalité, ailleurs — jamais comme des mots.
		if (row.alias.includes(".")) continue;
		const tokens = tokenize(row.alias);
		if (tokens.length === 0) continue;
		const key = tokens.join(" ");
		if (key.length < MIN_ALIAS_LENGTH) continue;
		const base = confidenceFor(key.length);
		if (base === 0) continue;
		const confidence = tokens.length === 1 ? Math.min(base, SINGLE_TOKEN_CAP) : base;
		const short = tokens.length === 1 || key.length < SHORT_ALIAS_LENGTH;
		const entries = byKey.get(key);
		const entry: AliasEntry = {
			orgId: row.org_id,
			name: row.name,
			alias: row.alias,
			confidence,
			tokens: tokens.length,
			short,
			dept: row.dept ?? null,
		};
		if (entries) entries.push(entry);
		else byKey.set(key, [entry]);
		if (tokens.length < minTokens) minTokens = tokens.length;
		if (tokens.length > maxTokens) maxTokens = tokens.length;
		if (++vus % PAS_ALIAS === 0) yield;
	}

	return {
		byKey,
		minTokens: Number.isFinite(minTokens) ? minTokens : 1,
		maxTokens,
	};
}

/** Construit l'index en mémoire à partir de lignes `org_alias` actives. */
export function buildAliasIndex(rows: ReadonlyArray<AliasRow>): AliasIndex {
	const etapes = etapesAliasIndex(rows);
	for (;;) {
		const pas = etapes.next();
		if (pas.done) return pas.value;
	}
}

/** Même index, construit sans monopoliser la boucle (chargement de fond). */
export async function buildAliasIndexChunked(rows: ReadonlyArray<AliasRow>): Promise<AliasIndex> {
	const etapes = etapesAliasIndex(rows);
	for (;;) {
		const pas = etapes.next();
		if (pas.done) return pas.value;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/**
 * Applique les règles de rattachement à un texte, sans effet de bord.
 * Rend les candidats à égalité pour permettre une revue humaine ou un
 * arbitrage ultérieur, sans jamais deviner silencieusement.
 */
export function analyzeAliasIndex(index: AliasIndex, text: string): AliasAnalysis {
	const key = normalize(text);
	if (key === "") return { match: null, reason: "empty-text", tied: [] };

	const tokens = key.split(" ");
	const hits = new Map<number, AliasEntry>();
	const territoriaux = new Map<number, AliasEntry>();
	const allowShort = hasInstitutionalContext(text);
	let sawShortOnly = false;

	const largest = Math.min(index.maxTokens, tokens.length);
	for (let size = largest; size >= index.minTokens; size--) {
		for (let start = 0; start + size <= tokens.length; start++) {
			const cle = tokens.slice(start, start + size).join(" ");
			const entries = index.byKey.get(cle);
			if (!entries) continue;
			for (const entry of entries) {
				if (entry.short && !allowShort) {
					sawShortOnly = true;
					continue;
				}
				// « Lot-et-Garonne » seul ne nomme pas une victime quand une
				// organisation est déjà nommée dans la phrase.
				const cible = CLES_DEPARTEMENTS.has(cle) ? territoriaux : hits;
				if (!cible.has(entry.orgId)) cible.set(entry.orgId, entry);
			}
		}
	}
	if (hits.size === 0) {
		for (const [orgId, entry] of territoriaux) hits.set(orgId, entry);
	}

	let match: Match | null = null;
	let reason: MatchReason = "no-alias";
	let tied: AliasAnalysis["tied"] = [];

	if (hits.size > 0) {
		const ranked = [...hits.values()].sort(
			(a, b) =>
				b.tokens - a.tokens ||
				b.confidence - a.confidence ||
				normalize(b.alias).length - normalize(a.alias).length,
		);
		const best = ranked[0];
		const bestLength = normalize(best.alias).length;
		// Ambiguïté = deux organisations différentes avec une correspondance de
		// même force (même nombre de jetons, même longueur). Un alias nettement
		// plus long l'emporte : « la rochelle universite » bat « la rochelle ».
		const ambiguous = ranked.some(
			(entry) =>
				entry.orgId !== best.orgId &&
				entry.tokens === best.tokens &&
				entry.confidence === best.confidence &&
				normalize(entry.alias).length === bestLength,
		);
		if (ambiguous) {
			const exAequo: AliasEntry[] = [];
			const seen = new Set<number>([best.orgId]);
			for (const entry of ranked) {
				if (
					entry.orgId === best.orgId ||
					entry.tokens !== best.tokens ||
					entry.confidence !== best.confidence ||
					normalize(entry.alias).length !== bestLength ||
					seen.has(entry.orgId)
				) {
					continue;
				}
				seen.add(entry.orgId);
				exAequo.push(entry);
			}
			const aEgalite = [best, ...exAequo];
			tied = aEgalite.map((entry) => ({
				id: entry.orgId,
				name: entry.name,
				alias: entry.alias,
				confidence: entry.confidence,
			}));

			// Un département explicitement cité départage des homonymes
			// uniquement s'il désigne un seul des candidats à égalité.
			const cites = departementsCites(tokens);
			const parDepartement = aEgalite.filter(
				(entry) => entry.dept !== null && cites.has(entry.dept),
			);
			if (cites.size > 0 && parDepartement.length === 1) {
				const seul = parDepartement[0] as AliasEntry;
				match = { orgId: seul.orgId, alias: seul.alias, confidence: seul.confidence };
				reason = "matched";
				tied = [];
			} else {
				reason = "ambiguous";
			}
		} else {
			match = { orgId: best.orgId, alias: best.alias, confidence: best.confidence };
			reason = "matched";
		}
	} else if (sawShortOnly) {
		reason = "short-only";
	}

	return { match, reason, tied };
}

// ── Dérivation d'alias ───────────────────────────────────────────────────

/** Mots de liaison ignorés pour construire un sigle. */
const ACRONYM_STOPWORDS: Record<string, true> = {
	de: true,
	du: true,
	des: true,
	la: true,
	le: true,
	les: true,
	et: true,
	au: true,
	aux: true,
	en: true,
	sur: true,
};

const LEGAL_FORMS: Record<string, true> = {
	sa: true,
	sas: true,
	sasu: true,
	sarl: true,
	eurl: true,
	sci: true,
	gie: true,
	snc: true,
	sca: true,
	scop: true,
	scic: true,
	selarl: true,
	selas: true,
	sei: true,
	gem: true,
	gmbh: true,
	ltd: true,
	llc: true,
	inc: true,
	plc: true,
	bv: true,
	ag: true,
	spa: true,
	corp: true,
};

/**
 * Alias candidats dérivés d'un nom d'organisation : nom sans forme juridique,
 * nom sans segment entre parenthèses, et sigle. Aucune de ces formes n'est
 * retenue ici : la dérivation produit des candidats, l'ambiguïté globale est
 * tranchée par `selectUnambiguousAliases`.
 */
export function deriveAliases(name: string): string[] {
	const out = new Set<string>();
	const trimmed = name.replace(/\s+/g, " ").trim();
	if (trimmed === "") return [];

	// Nom sans segment entre parenthèses : « CCI (Chambre de Commerce) ».
	const withoutParens = trimmed.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
	if (withoutParens.length >= MIN_ALIAS_LENGTH) out.add(withoutParens);

	// Nom sans forme juridique finale ou initiale.
	const tokens = withoutParens.split(" ");
	const kept = tokens.filter((token) => LEGAL_FORMS[token.toLowerCase()] !== true);
	if (kept.length > 0 && kept.join(" ") !== withoutParens) out.add(kept.join(" "));

	// Sigle : au moins trois mots significatifs, sinon « CHU » ne dit rien seul.
	const meaningful = kept.filter((token) => ACRONYM_STOPWORDS[token.toLowerCase()] !== true);
	if (meaningful.length >= 3) {
		const acronym = meaningful.map((token) => token[0] ?? "").join("").toUpperCase();
		if (acronym.length >= 3 && acronym.length <= 6) out.add(acronym);
	}

	return [...out].filter((alias) => normalize(alias).length >= MIN_ALIAS_LENGTH);
}

/**
 * Parmi des alias candidats, ne garde que ceux qui ne désignent qu'une seule
 * organisation. Un alias partagé est écarté des deux côtés : c'est la règle
 * « on ne devine pas » appliquée avant l'écriture en base.
 */
export function selectUnambiguousAliases(
	candidates: ReadonlyArray<{ orgId: number; alias: string }>,
	existing: ReadonlyArray<{ orgId: number; alias: string }>,
): { orgId: number; alias: string }[] {
	const owners = new Map<string, Set<number>>();
	const remember = (orgId: number, alias: string) => {
		const key = normalize(alias);
		if (key === "") return;
		const set = owners.get(key);
		if (set) set.add(orgId);
		else owners.set(key, new Set([orgId]));
	};
	for (const row of existing) remember(row.orgId, row.alias);
	for (const row of candidates) remember(row.orgId, row.alias);

	return candidates.filter((row) => {
		const key = normalize(row.alias);
		const set = owners.get(key);
		return set !== undefined && set.size === 1 && set.has(row.orgId);
	});
}
