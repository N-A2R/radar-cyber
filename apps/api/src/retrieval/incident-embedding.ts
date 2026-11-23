/**
 * Embedding local et déterministe des événements incidents.
 *
 * Pas d'appel réseau ni de modèle propriétaire : le vecteur est une
 * projection de hachage d'un sac de mots TF-IDF, pondérée par les champs
 * structurés déjà présents dans l'événement (acteur, famille, organisation,
 * CVE). Les vecteurs sont L2-normalisés à 100 dimensions, ce qui permet à
 * `cube <->` de classer les voisins par similarité cosinus.
 *
 * Le hachage FNV-1a est volatil mais stable dans le temps : une même entrée
 * produit toujours le même vecteur, condition nécessaire pour réindexer sans
 * faire varier les scores.
 */

export const EMBEDDING_DIM = 100;
export const EMBEDDING_MODEL = "tfidf-hash-cube@3";
export const ANNOTATION_RULE = "ransomware-actor@1";

export type EmbeddingRow = {
	id: number;
	title: string;
	summary: string | null;
	family: string;
	assertionType: string;
	orgId: number | null;
	actor: string | null;
	mispTitle: string | null;
	description: string | null;
	rattachement: string | null;
	orgHint: string | null;
	via: string | null;
};
export type TokenCounts = Map<string, number>;

const STOPWORDS: Record<string, true> = {
	le: true, la: true, les: true, l: true, un: true, une: true, des: true, du: true, de: true,
	d: true, et: true, en: true, au: true, aux: true, a: true, sur: true, pour: true, par: true,
	avec: true, dans: true, chez: true, vers: true, the: true, of: true, and: true, to: true,
	in: true, on: true, by: true, at: true, from: true, is: true, are: true, was: true,
	were: true, this: true, that: true, selon: true, indique: true, annonce: true,
};

/** Normalise sans dépendance de locale : accent et ligatures repliés. */
export function normalizeText(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/œ/g, "oe")
		.replace(/æ/g, "ae");
}

/** Tokens alphanumériques simples, sans stopwords. */
export function tokenize(text: string): string[] {
	return normalizeText(text)
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 3 && STOPWORDS[token] !== true);
}

function pushPrefixed(target: string[], prefix: string, value: string | null): void {
	if (!value) return;
	for (const token of tokenize(value)) target.push(`${prefix}:${token}`);
}

/**
 * Vocabulaire d'un événement : texte libre + champs structurés préfixés.
 *
 * Le préfixe garde les signaux rares (acteur, CVE, organisation) distincts
 * des mots génériques du titre, tout en restant dans le même espace vectoriel.
 */
export function embeddingTokens(row: EmbeddingRow): string[] {
	const tokens = tokenize(`${row.title} ${row.summary ?? ""}`);
	pushPrefixed(tokens, "family", row.family);
	pushPrefixed(tokens, "kind", row.assertionType);
	pushPrefixed(tokens, "actor", row.actor);
	pushPrefixed(tokens, "meta", row.mispTitle);
	pushPrefixed(tokens, "meta", row.description);
	pushPrefixed(tokens, "meta", row.rattachement);
	pushPrefixed(tokens, "meta", row.orgHint);
	pushPrefixed(tokens, "via", row.via);
	if (row.orgId !== null) tokens.push(`org:${row.orgId}`);
	const text = normalizeText(`${row.title} ${row.summary ?? ""}`);
	for (const match of text.matchAll(/cve-\d{4}-\d{4,}/g)) tokens.push(`cve:${match[0]}`);
	return tokens;
}

export function countTokens(rows: EmbeddingRow[]): TokenCounts {
	const counts: TokenCounts = new Map();
	for (const row of rows) {
		for (const token of new Set(embeddingTokens(row))) {
			counts.set(token, (counts.get(token) ?? 0) + 1);
		}
	}
	return counts;
}

function fnv1a(value: string, seed: number): number {
	let hash = seed >>> 0;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

/** L'acteur et la vulnérabilité sont des signaux d'analogie plus forts que le titre. */
const TOKEN_WEIGHT: Record<string, number> = {
	actor: 16,
	cve: 3,
	family: 2,
	kind: 1.5,
	org: 2,
	meta: 1.5,
	via: 1.5,
};
const MAX_IDF = 6.5;

function tokenWeight(token: string): number {
	const colon = token.indexOf(":");
	return colon < 0 ? 1 : (TOKEN_WEIGHT[token.slice(0, colon)] ?? 1);
}

/** Vecteur unitaire 100d : TF-IDF projeté par double hachage signé. */
export function embed(tokens: string[], documentFrequency: TokenCounts, documents: number): number[] {
	const vector = new Float64Array(EMBEDDING_DIM);
	if (documents <= 0) return Array.from(vector);

	const termFrequency = new Map<string, number>();
	for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);

	for (const [token, count] of termFrequency) {
		const df = documentFrequency.get(token) ?? 0;
		const idf = Math.min(MAX_IDF, Math.log((documents + 1) / (df + 1)) + 1);
		const weight = (1 + Math.log(count)) * idf * tokenWeight(token);
		const h1 = fnv1a(token, 0x811c9dc5);
		const h2 = fnv1a(token, 0x9e3779b9);
		vector[h1 % EMBEDDING_DIM] += (h1 & 0x100 ? 1 : -1) * weight;
		vector[h2 % EMBEDDING_DIM] += (h2 & 0x100 ? 1 : -1) * weight;
	}

	let norm = 0;
	for (let i = 0; i < EMBEDDING_DIM; i += 1) norm += vector[i]! * vector[i]!;
	norm = Math.sqrt(norm);
	if (norm === 0) return Array.from(vector);
	for (let i = 0; i < EMBEDDING_DIM; i += 1) vector[i] = vector[i]! / norm;
	return Array.from(vector);
}

/** Littéral accepté par le type `cube` de PostgreSQL. */
export function cubeLiteral(vector: number[]): string {
	if (vector.length !== EMBEDDING_DIM) {
		throw new Error(`vecteur de dimension ${vector.length}, attendu ${EMBEDDING_DIM}`);
	}
	return `(${vector.map((value) => value.toFixed(8)).join(",")})`;
}

