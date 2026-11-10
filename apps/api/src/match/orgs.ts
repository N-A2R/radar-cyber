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

export type Match = { orgId: number; alias: string; confidence: number };

const MIN_ALIAS_LENGTH = 4;
const MAX_CACHED_TEXTS = 20_000;
/** En deçà, un alias est trop générique pour se passer de contexte. */
const SHORT_ALIAS_LENGTH = 8;
/** Plafond de confiance d'un alias mono-jeton : reste sous le seuil 0.7. */
const SINGLE_TOKEN_CAP = 0.4;

type AliasEntry = { orgId: number; alias: string; confidence: number; tokens: number; short: boolean };

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
	const { rows } = await pool.query<{ org_id: number; alias: string }>(
		"SELECT org_id, alias FROM org_alias WHERE status = 'active' AND length(btrim(alias)) >= $1",
		[MIN_ALIAS_LENGTH],
	);
	const byKey = new Map<string, AliasEntry[]>();
	let minTokens = Number.POSITIVE_INFINITY;
	let maxTokens = 0;

	for (const row of rows) {
		const tokens = tokenize(row.alias);
		if (tokens.length === 0) continue;
		const key = tokens.join(" ");
		const base = confidenceFor(key.length);
		if (base === 0) continue;
		const confidence = tokens.length === 1 ? Math.min(base, SINGLE_TOKEN_CAP) : base;
		const short = tokens.length === 1 || key.length < SHORT_ALIAS_LENGTH;
		const entries = byKey.get(key);
		const entry: AliasEntry = { orgId: row.org_id, alias: row.alias, confidence, tokens: tokens.length, short };
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
	const key = normalize(text);
	if (key === "") return null;

	const cached = resultCache.get(key);
	if (cached !== undefined) return cached;

	const index = await getIndex();
	const tokens = key.split(" ");
	const hits = new Map<number, AliasEntry>();
	const allowShort = hasInstitutionalContext(text);

	const largest = Math.min(index.maxTokens, tokens.length);
	for (let size = largest; size >= index.minTokens; size--) {
		for (let start = 0; start + size <= tokens.length; start++) {
			const entries = index.byKey.get(tokens.slice(start, start + size).join(" "));
			if (!entries) continue;
			for (const entry of entries) {
				if (entry.short && !allowShort) continue;
				if (!hits.has(entry.orgId)) hits.set(entry.orgId, entry);
			}
		}
	}

	let match: Match | null = null;
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
		if (!ambiguous) match = { orgId: best.orgId, alias: best.alias, confidence: best.confidence };
	}

	if (resultCache.size >= MAX_CACHED_TEXTS) resultCache.clear();
	resultCache.set(key, match);
	return match;
}
