/**
 * Rattachement des événements aux organisations par alias.
 *
 * Le moteur en ligne charge les alias actifs depuis PostgreSQL, puis applique
 * le cœur déterministe partagé avec les benches (`core.ts`).
 *
 * Règles produit conservées :
 *  - pas de sous-chaîne nue : un alias doit former une suite contiguë de
 *    jetons entiers normalisés ;
 *  - un alias court ou mono-jeton exige un contexte institutionnel ;
 *  - la confiance d'un alias mono-jeton est plafonnée sous le seuil
 *    d'application ;
 *  - une ambiguïté à force égale rend `null`, sauf arbitrage explicite.
 */

import { pool } from "../db.js";
import { chooseOrganization } from "./decide.js";
import { fuzzyMatchAlias } from "./fuzzy.js";
import {
	MIN_ALIAS_LENGTH,
	analyzeAliasIndex,
	buildAliasIndex,
	normalize,
	type AliasIndex,
	type Match,
	type MatchDiagnosis,
	type MatchReason,
} from "./core.js";

export {
	deriveAliases,
	hasInstitutionalContext,
	normalize,
	selectUnambiguousAliases,
	type Match,
	type MatchDiagnosis,
	type MatchReason,
} from "./core.js";

const MAX_CACHED_TEXTS = 20_000;

let indexPromise: Promise<AliasIndex> | null = null;
const resultCache = new Map<string, MatchDiagnosis>();

async function loadIndex(): Promise<AliasIndex> {
	const { rows } = await pool.query<{
		org_id: number;
		name: string;
		alias: string;
		dept: string | null;
	}>(
		"SELECT a.org_id, o.name, a.alias, o.dept FROM org_alias a JOIN org o ON o.id = a.org_id WHERE a.status = 'active' AND length(btrim(a.alias)) >= $1",
		[MIN_ALIAS_LENGTH],
	);
	return buildAliasIndex(rows);
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
	// Volontairement strict : `reconcile-orgs` s'en sert pour vérifier que des
	// rattachements existants sont bien justifiés par le texte. Un nom
	// approchant n'y est pas une preuve.
	return (await matchOrgDetailed(text, { fuzzy: false })).match;
}

/**
 * Même recherche que `matchOrg`, mais dit **pourquoi** il n'y a pas de
 * correspondance. Sert à la mesure du script de rattachement : sans le motif,
 * on ne sait pas s'il faut ajouter un alias, lever une ambiguïté ou accepter
 * que le texte ne nomme personne.
 */
export async function matchOrgDetailed(
	text: string,
	opts?: { arbitrate?: boolean; fuzzy?: boolean },
): Promise<MatchDiagnosis> {
	const key = normalize(text);
	if (key === "") return { match: null, reason: "empty-text" };

	const useFuzzy = opts?.fuzzy !== false;
	const cacheKey = useFuzzy ? key : `strict\u0000${key}`;
	const cached = resultCache.get(cacheKey);
	if (cached !== undefined && !opts?.arbitrate) return cached;

	const index = await getIndex();
	const analysis = analyzeAliasIndex(index, text);
	let diagnosis: MatchDiagnosis = { match: analysis.match, reason: analysis.reason };

	// Filet flou : seulement quand le cœur ne trouve aucun alias. Jamais sur
	// une ambiguïté ni sur un refus `short-only` — ce serait défaire les
	// garde-fous qui font la précision du cœur. La confiance rendue reste
	// sous le seuil d'application : ces rattachements se relisent.
	if (analysis.reason === "no-alias" && useFuzzy) {
		const fallback = fuzzyMatchAlias(index, text);
		if (fallback.match) {
			diagnosis = { match: fallback.match, reason: "fuzzy" };
		}
	}

	// Second étage, seulement sur demande : le modèle de décision tranche
	// entre des candidats à égalité, et ne rend la main que s'il est sûr.
	if (analysis.reason === "ambiguous" && opts?.arbitrate && analysis.tied.length >= 2) {
		const chosen = await chooseOrganization(
			text,
			analysis.tied.map(({ id, name }) => ({ id, name })),
		);
		if (chosen !== null) {
			const entry = analysis.tied.find((candidate) => candidate.id === chosen);
			if (entry) {
				diagnosis = {
					match: { orgId: chosen, alias: entry.alias, confidence: entry.confidence },
					reason: "matched",
				};
			}
		}
	}

	if (resultCache.size >= MAX_CACHED_TEXTS) resultCache.clear();
	resultCache.set(cacheKey, diagnosis);
	return diagnosis;
}
