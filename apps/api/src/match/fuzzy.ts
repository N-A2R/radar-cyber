/**
 * Filet de rattachement flou — deuxième étage, borné.
 *
 * Pourquoi : le cœur déterministe (`core.ts`) rate les fautes de frappe
 * (« CHU de Bordeau », « université de Poitier »). Le bench A le mesure :
 * 2/6 sur ce cas, contre 6/6 pour un rapprochement flou. Mais le flou seul
 * produit trois fois plus de rattachements hors-sujet.
 *
 * D'où ce module : le flou n'est jamais décisionnaire, seulement filet.
 *  - appelé uniquement quand le cœur rend `no-alias` (jamais sur `ambiguous`
 *    ni `short-only` : ce serait annuler les garde-fous) ;
 *  - même règle d'alias court que le cœur : contexte institutionnel exigé ;
 *  - confiance plafonnée sous le seuil d'application automatique : ces
 *    rattachements partent en revue, ils ne s'écrivent pas tout seuls ;
 *  - égalité de score entre deux organisations : on rend null.
 *
 * Métrique : `ratio` de rapidfuzz-js (MIT), port JS de RapidFuzz. Parité
 * vérifiée avec la version Python sur 1 500 paires : zéro divergence, ce qui
 * rend les chiffres du bench transposables à ce code.
 */
import { ratio } from "rapidfuzz-js/fuzz";
import {
	SINGLE_TOKEN_CAP,
	hasInstitutionalContext,
	normalize,
	type AliasIndex,
	type Match,
} from "./core.js";

/** Seuil de similarité retenu par le bench (85, 90 et 95 comparés). */
export const FUZZY_THRESHOLD = 90;

/**
 * Plafond de confiance d'un rattachement flou. Volontairement sous le seuil
 * `--min-confidence=0.7` du script de rattachement : un nom approchant n'est
 * pas une preuve, il doit être revu.
 */
export const FUZZY_CONFIDENCE_CAP = 0.6;

export type FuzzyDiagnosis = {
	match: Match | null;
	/** Meilleur score rencontré, même sous le seuil — utile au diagnostic. */
	bestScore: number;
	/** Organisations à égalité au-dessus du seuil : revue plutôt que choix. */
	tied: number[];
};

/**
 * Borne supérieure exacte du ratio indoù le LCS dépasse la plus courte des
 * deux chaînes : `ratio <= 200 * min(l1, l2) / (l1 + l2)`. Sert à écarter un
 * alias sans calculer la distance — l'index réel compte des milliers d'alias,
 * pas les 102 du jeu de bench.
 */
function ratioUpperBound(aLength: number, bLength: number): number {
	const total = aLength + bLength;
	if (total === 0) return 100;
	return (200 * Math.min(aLength, bLength)) / total;
}

/**
 * Cherche un alias approchant dans `text`. Ne décide rien : rend la meilleure
 * correspondance au-dessus du seuil, ou null en cas d'égalité ou de doute.
 */
export function fuzzyMatchAlias(
	index: AliasIndex,
	text: string,
	opts?: { threshold?: number },
): FuzzyDiagnosis {
	const threshold = opts?.threshold ?? FUZZY_THRESHOLD;
	const key = normalize(text);
	if (key === "") return { match: null, bestScore: 0, tied: [] };

	const tokens = key.split(" ");
	const allowShort = hasInstitutionalContext(text);
	let bestScore = 0;
	const hits = new Map<number, { score: number; alias: string; tokens: number }>();

	for (const [aliasKey, entries] of index.byKey) {
		const aliasTokens = aliasKey.split(" ").length;
		// Fenêtres de la taille de l'alias, et taille + 1 : une faute de frappe
		// qui colle deux mots (« saintjean ») se retrouve ainsi quand même.
		let aliasBest = 0;
		for (const size of aliasTokens === 1 ? [1, 2] : [aliasTokens, aliasTokens + 1]) {
			for (let start = 0; start + size <= tokens.length; start++) {
				const window = tokens.slice(start, start + size).join(" ");
				if (ratioUpperBound(aliasKey.length, window.length) < threshold) continue;
				const score = ratio(aliasKey, window);
				if (score > aliasBest) aliasBest = score;
			}
		}
		if (aliasBest > bestScore) bestScore = aliasBest;
		if (aliasBest < threshold) continue;

		for (const entry of entries) {
			// Même garde-fou que le cœur : sans marqueur d'organisation, un
			// alias court ou mono-jeton ne rattache pas, même approchant.
			if (entry.short && !allowShort) continue;
			const previous = hits.get(entry.orgId);
			if (!previous || aliasBest > previous.score) {
				hits.set(entry.orgId, { score: aliasBest, alias: entry.alias, tokens: entry.tokens });
			}
		}
	}

	if (hits.size === 0) return { match: null, bestScore, tied: [] };

	const ranked = [...hits.entries()].sort(
		(a, b) => b[1].score - a[1].score || b[1].tokens - a[1].tokens || a[0] - b[0],
	);
	const [bestId, best] = ranked[0];
	const tied = ranked.filter(([, hit]) => hit.score === best.score).map(([id]) => id);
	if (tied.length > 1) return { match: null, bestScore, tied };

	const ceiling = best.tokens === 1 ? Math.min(FUZZY_CONFIDENCE_CAP, SINGLE_TOKEN_CAP) : FUZZY_CONFIDENCE_CAP;
	return {
		match: {
			orgId: bestId,
			alias: best.alias,
			confidence: Math.min(best.score / 100, ceiling),
		},
		bestScore,
		tied: [],
	};
}
