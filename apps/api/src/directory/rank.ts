/**
 * Classement de la recherche d'annuaire — pur, sans base de données.
 *
 * Pourquoi : la recherche existante faisait trois `ILIKE` et rendait les
 * 20 premiers dans l'ordre physique. Avec 4 462 organisations territoriales,
 * « pessac » doit remonter la commune, pas les dix-sept organisations qui
 * contiennent la chaîne. Et « mairie de pessac » doit la trouver **par son
 * alias**, puisque son nom est « Commune de Pessac ».
 *
 * Ordre des forces, du plus fort au plus faible :
 *   égalité exacte > préfixe > couverture de jetons > sous-chaîne > flou.
 * Le flou n'arrive qu'en dernier et reste plafonné : une faute de frappe ne
 * doit jamais passer devant une correspondance exacte.
 *
 * Départage à score égal : nombre d'événements, puis population, puis nom.
 * Une commune touchée par un incident passe avant son homonyme endormi.
 */
import { ratio } from "rapidfuzz-js/fuzz";
import { normalize } from "../match/core.js";

/** Mots qui ne discriminent pas : présents dans des milliers d'alias. */
const STOPWORDS = new Set([
	"de", "du", "des", "d", "l", "la", "le", "les", "a", "au", "aux", "et", "en", "sur",
	"commune", "communaute", "mairie", "ville", "conseil", "departement", "departemental",
	"region", "regional", "metropole", "agglomeration", "intercommunalite", "syndicat",
]);

export type RankCandidate = {
	id: number;
	name: string;
	kind: string;
	sector: string | null;
	city: string | null;
	dept: string | null;
	domain: string | null;
	eventCount: number;
	/** Alias de l'organisation, tels que stockés. Facultatif selon la requête. */
	aliases?: readonly string[];
};

export type RankReason = "exact" | "exact-alias" | "prefix" | "prefix-alias" | "tokens" | "substring" | "fuzzy";

export type RankedOrg<T extends RankCandidate> = T & {
	score: number;
	reason: RankReason;
	/** Alias qui a porté la correspondance, pour l'afficher dans la liste. */
	matchedAlias: string | null;
};

/** Seuil du filet flou. En dessous, on ne propose pas. */
const FUZZY_MIN = 88;

const REASON_BASE: Record<RankReason, number> = {
	exact: 1000,
	"exact-alias": 940,
	prefix: 860,
	"prefix-alias": 820,
	tokens: 700,
	substring: 600,
	fuzzy: 400,
};

function tokensOf(value: string): string[] {
	return normalize(value).split(" ").filter((token) => token !== "");
}

function discriminatingTokens(query: string): string[] {
	const tokens = tokensOf(query);
	const kept = tokens.filter((token) => !STOPWORDS.has(token));
	// Requête entièrement institutionnelle (« mairie de ») : on retombe sur
	// les jetons bruts plutôt que de ne rien chercher.
	return kept.length > 0 ? kept : tokens;
}

type Hit = { score: number; reason: RankReason; alias: string | null };

function scoreText(text: string, key: string, tokens: string[], alias: string | null, isAlias: boolean): Hit | null {
	const candidate = normalize(text);
	if (candidate === "") return null;

	if (candidate === key) {
		return { score: REASON_BASE[isAlias ? "exact-alias" : "exact"], reason: isAlias ? "exact-alias" : "exact", alias };
	}
	if (candidate.startsWith(`${key} `) || candidate.startsWith(key)) {
		return { score: REASON_BASE[isAlias ? "prefix-alias" : "prefix"], reason: isAlias ? "prefix-alias" : "prefix", alias };
	}
	const candidateTokens = new Set(tokensOf(text));
	const covered = tokens.filter((token) => candidateTokens.has(token)).length;
	if (tokens.length > 0 && covered === tokens.length) {
		// Bonus de compacité : « Pessac » seul bat « Commune de Pessac » à
		// couverture égale, parce qu'il n'a pas de mots superflus.
		const compactness = Math.max(0, 40 - (candidateTokens.size - tokens.length) * 8);
		return { score: REASON_BASE.tokens + compactness, reason: "tokens", alias };
	}
	if (key.length >= 3 && candidate.includes(key)) {
		return { score: REASON_BASE.substring, reason: "substring", alias };
	}
	if (key.length >= 4 && Math.abs(candidate.length - key.length) <= Math.max(3, key.length * 0.25)) {
		const similarity = ratio(candidate, key);
		if (similarity >= FUZZY_MIN) {
			return { score: REASON_BASE.fuzzy + (similarity - FUZZY_MIN), reason: "fuzzy", alias };
		}
	}
	return null;
}

/** Meilleure correspondance d'une organisation, tous textes confondus. */
function bestHit(org: RankCandidate, key: string, tokens: string[]): Hit | null {
	let best: Hit | null = null;
	const consider = (hit: Hit | null) => {
		if (hit && (!best || hit.score > best.score)) best = hit;
	};
	consider(scoreText(org.name, key, tokens, null, false));
	consider(scoreText(org.city ?? "", key, tokens, null, false));
	consider(scoreText(org.domain ?? "", key, tokens, null, false));
	for (const alias of org.aliases ?? []) {
		consider(scoreText(alias, key, tokens, alias, true));
	}
	return best;
}

/**
 * Classe les candidats. Une requête vide rend l'ordre fourni (le serveur a
 * déjà trié) ; une requête non vide ne rend que les organisations qui ont une
 * correspondance, la meilleure d'abord.
 */
export function rankOrgs<T extends RankCandidate>(candidates: readonly T[], query: string): Array<RankedOrg<T>> {
	const key = normalize(query);
	if (key === "") {
		return candidates.map((org) => ({ ...org, score: 0, reason: "exact" as RankReason, matchedAlias: null }));
	}
	const tokens = discriminatingTokens(query);
	const out: Array<RankedOrg<T>> = [];
	for (const org of candidates) {
		const hit = bestHit(org, key, tokens) as Hit | null;
		if (!hit) continue;
		out.push({ ...org, score: hit.score, reason: hit.reason, matchedAlias: hit.alias });
	}
	out.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
		const cmp = a.name.localeCompare(b.name, "fr");
		if (cmp !== 0) return cmp;
		return a.id - b.id;
	});
	return out;
}

/** Jetons retenus pour la présélection SQL : les mêmes que pour le classement. */
export function searchTokens(query: string): string[] {
	return discriminatingTokens(query).filter((token) => token.length >= 2);
}
