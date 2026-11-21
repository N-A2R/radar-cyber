/**
 * Familles d'`org_hint` de la file de quarantaine.
 *
 * Le moteur de revue ne change pas : ce module seulement **découpe** la file
 * en quatre familles exploitables, à partir des normalisations déjà utilisées
 * par le moteur (`domaine.ts`, `sigles.ts`, `generique.ts`). Il est pur : aucune
 * base, aucun état, aucune écriture.
 *
 *   - `domaine` : un domaine est reconnaissable après normalisation ;
 *   - `sigle` : un seul jeton court en majuscules, pas un mot courant ;
 *   - `nom` : le reste (noms, phrases, casse mixte) ;
 *   - `vide` : indice absent ou blanc.
 */
import { domainFromHint } from "./domaine.js";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "./generique.js";
import { estMotCourant, estSigle, normaliseSigle } from "./sigles.js";

export type FamilleIndice = "domaine" | "sigle" | "nom" | "vide";

/** Forme brute d'un sigle : 2 à 6 lettres majuscules, points et espaces tolérés. */
const SIGLE_RE = /^[A-Z]{2,6}$/;

/**
 * Classe un indice. L'ordre est celui de la fiabilité : un domaine l'emporte
 * sur un sigle, et un mot génératif (`SNC`, `EHPAD`…) n'est pas un sigle.
 */
export function classifierIndice(hint: string): FamilleIndice {
	if (!hint || hint.trim() === "") return "vide";
	if (domainFromHint(hint)) return "domaine";

	const compact = hint.trim().replace(/[.\s]+/g, "");
	if (SIGLE_RE.test(compact)) {
		const normalise = normaliseSigle(compact);
		const mot = normalise.toLowerCase();
		if (
			estSigle(normalise) &&
			!estMotCourant(normalise) &&
			!MOTS_GENERIQUES.has(mot) &&
			!MOTS_GENERIQUES_ENTREPRISE.has(mot)
		) {
			return "sigle";
		}
	}
	return "nom";
}
