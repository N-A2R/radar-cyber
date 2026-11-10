/**
 * Rattachement des événements aux organisations par alias.
 *
 * Le rattachement historique comparait le titre à `org.name` à l'identique :
 * « ENGIE ENERGIE SERVICES » ne rencontrait jamais « Engie ». Ici on compare
 * des jetons entiers normalisés (minuscules, sans accents) aux alias de
 * `org_alias`, ce qui neutralise la casse, l'accentuation, la ponctuation et
 * les formes juridiques (SAS, SARL, …).
 *
 * Pas de sous-chaîne nue : `orange` ne doit pas matcher `orangeade`, donc un
 * alias n'est retenu que s'il forme une suite contiguë de jetons entiers.
 *
 * Deux garde-fous contre les faux positifs :
 *  - un alias court (un seul jeton, ou moins de 8 caractères) n'est retenu que
 *    si le texte porte un marqueur institutionnel (« Université de Limoges »,
 *    « mairie de … »). « le maire d'Orange » ne désigne pas l'opérateur ;
 *  - la confiance d'un alias mono-jeton est plafonnée, pour rester sous le
 *    seuil d'application même si le contexte est présent.
 *
 * Les alias dérivés d'un nom d'établissement après retrait du préfixe
 * (`limoges` depuis « Université de Limoges ») sont marqués `city-rejected` en
 * base et donc jamais chargés : c'est une ville, pas une organisation.
 */

import { pool } from "../db.js";
import { chooseOrganization } from "./decide.js";

export type Match = { orgId: number; alias: string; confidence: number };

/**
 * Motif d'issue d'un rapprochement, pour la mesure du script de rattachement :
 *  - `matched` : une organisation a été trouvée ;
 *  - `empty-text` : le texte ne contient aucun jeton exploitable ;
 *  - `no-alias` : aucun alias de l'index ne figure dans le texte ;
 *  - `short-only` : seuls des alias courts ont été vus, sans contexte
 *    institutionnel pour les autoriser (villes, sigles nus) ;
 *  - `ambiguous` : deux organisations différentes à égalité de force.
 */
export type MatchReason = "matched" | "empty-text" | "no-alias" | "short-only" | "ambiguous";
export type MatchDiagnosis = { match: Match | null; reason: MatchReason };

const MIN_ALIAS_LENGTH = 4;
const MAX_CACHED_TEXTS = 20_000;
/** En deçà, un alias est trop générique pour se passer de contexte. */
const SHORT_ALIAS_LENGTH = 8;
/** Plafond de confiance d'un alias mono-jeton : reste sous le seuil 0.7. */
const SINGLE_TOKEN_CAP = 0.4;

type AliasEntry = { orgId: number; name: string; alias: string; confidence: number; tokens: number; short: boolean };

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

type AliasIndex = {
	/** clé = alias normalisé (jetons séparés par une espace) */
	byKey: Map<string, AliasEntry[]>;
	minTokens: number;
	maxTokens: number;
};

let indexPromise: Promise<AliasIndex> | null = null;
const resultCache = new Map<string, Match | null>();

/**
 * Minuscules, accents retirés, ponctuation et espaces réduits.
 * `œ`/`æ` ne se décomposent pas en NFD : traités explicitement.
 */
export function normalize(text: string): string {
	return text
		.replace(/œ/g, "oe")
		.replace(/Œ/g, "OE")
		.replace(/æ/g, "ae")
		.replace(/Æ/g, "AE")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function tokenize(text: string): string[] {
	const normalized = normalize(text);
	return normalized === "" ? [] : normalized.split(" ");
}

function confidenceFor(length: number): number {
	if (length >= 8) return 1;
	if (length >= 6) return 0.8;
	if (length >= 4) return 0.6;
	return 0;
}

async function loadIndex(): Promise<AliasIndex> {
	const { rows } = await pool.query<{ org_id: number; name: string; alias: string }>(
		"SELECT a.org_id, o.name, a.alias FROM org_alias a JOIN org o ON o.id = a.org_id WHERE a.status = 'active' AND length(btrim(a.alias)) >= $1",
		[MIN_ALIAS_LENGTH],
	);
	const byKey = new Map<string, AliasEntry[]>();
	let minTokens = Number.POSITIVE_INFINITY;
	let maxTokens = 0;

	for (const row of rows) {
		// Un alias qui est un nom de domaine ne sert pas au rapprochement de
		// texte : « nouvelle-aquitaine.fr » se tokenise en « nouvelle aquitaine
		// fr » et attrape alors tout article parlant de la région (mesuré :
		// festival ornithologique rattaché à la Région). Les domaines se
		// comparent en égalité, ailleurs — jamais comme des mots.
		if (row.alias.includes(".")) continue;
		const tokens = tokenize(row.alias);
		if (tokens.length === 0) continue;
		const key = tokens.join(" ");
		const base = confidenceFor(key.length);
		if (base === 0) continue;
		const confidence = tokens.length === 1 ? Math.min(base, SINGLE_TOKEN_CAP) : base;
		const short = tokens.length === 1 || key.length < SHORT_ALIAS_LENGTH;
		const entries = byKey.get(key);
		const entry: AliasEntry = { orgId: row.org_id, name: row.name, alias: row.alias, confidence, tokens: tokens.length, short };
		if (entries) entries.push(entry);
		else byKey.set(key, [entry]);
		if (tokens.length < minTokens) minTokens = tokens.length;
		if (tokens.length > maxTokens) maxTokens = tokens.length;
	}

	return {
		byKey,
		minTokens: Number.isFinite(minTokens) ? minTokens : 1,
		maxTokens,
	};
}

function getIndex(): Promise<AliasIndex> {
	indexPromise ??= loadIndex().catch((err: unknown) => {
		indexPromise = null;
		throw err;
	});
	return indexPromise;
}

/** Vide les caches mémoire (tests, ou après un changement de `org_alias`). */
export function resetAliasCache(): void {
	indexPromise = null;
	resultCache.clear();
}

/**
 * Cherche l'organisation citée dans `text`.
 * Retourne `null` si aucun alias ne correspond, ou si deux organisations
 * différentes correspondent (ambiguïté : on ne devine pas).
 */
export async function matchOrg(text: string): Promise<Match | null> {
	return (await matchOrgDetailed(text)).match;
}

/**
 * Même recherche que `matchOrg`, mais dit **pourquoi** il n'y a pas de
 * correspondance. Sert à la mesure du script de rattachement : sans le motif,
 * on ne sait pas s'il faut ajouter un alias, lever une ambiguïté ou accepter
 * que le texte ne nomme personne.
 */
export async function matchOrgDetailed(
	text: string,
	opts?: { arbitrate?: boolean },
): Promise<MatchDiagnosis> {
	const key = normalize(text);
	if (key === "") return { match: null, reason: "empty-text" };

	const cached = resultCache.get(key);
	if (cached !== undefined) return { match: cached, reason: cached ? "matched" : "no-alias" };

	const index = await getIndex();
	const tokens = key.split(" ");
	const hits = new Map<number, AliasEntry>();
	const allowShort = hasInstitutionalContext(text);
	let sawShortOnly = false;

	const largest = Math.min(index.maxTokens, tokens.length);
	for (let size = largest; size >= index.minTokens; size--) {
		for (let start = 0; start + size <= tokens.length; start++) {
			const entries = index.byKey.get(tokens.slice(start, start + size).join(" "));
			if (!entries) continue;
			for (const entry of entries) {
				if (entry.short && !allowShort) {
					sawShortOnly = true;
					continue;
				}
				if (!hits.has(entry.orgId)) hits.set(entry.orgId, entry);
			}
		}
	}

	let match: Match | null = null;
	let reason: MatchReason = "no-alias";
	if (hits.size > 0) {
		const ranked = [...hits.values()].sort(
			(a, b) => b.tokens - a.tokens || b.confidence - a.confidence || normalize(b.alias).length - normalize(a.alias).length,
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
			reason = "ambiguous";
			// Second étage, seulement sur demande : le modèle de décision tranche
			// entre des candidats à égalité, et ne rend la main que s'il est sûr.
			if (opts?.arbitrate) {
				const tied = new Map<number, string>();
				for (const entry of ranked) {
					if (
						entry.tokens === best.tokens &&
						entry.confidence === best.confidence &&
						normalize(entry.alias).length === bestLength
					) {
						tied.set(entry.orgId, entry.name);
					}
				}
				const chosen = await chooseOrganization(
					text,
					[...tied].map(([id, name]) => ({ id, name })),
				);
				if (chosen !== null) {
					const entry = ranked.find((candidate) => candidate.orgId === chosen);
					if (entry) {
						match = { orgId: chosen, alias: entry.alias, confidence: entry.confidence };
						reason = "matched";
					}
				}
			}
		} else {
			match = { orgId: best.orgId, alias: best.alias, confidence: best.confidence };
			reason = "matched";
		}
	} else if (sawShortOnly) {
		reason = "short-only";
	}

	if (resultCache.size >= MAX_CACHED_TEXTS) resultCache.clear();
	resultCache.set(key, match);
	return { match, reason };
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
