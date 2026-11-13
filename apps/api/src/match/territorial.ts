/**
 * Verdict territorial : ce texte parle-t-il de la Nouvelle-Aquitaine ?
 *
 * Pourquoi ce module existe alors que le gazetteer (`collectors/relevance.ts`)
 * sait déjà démêler les homonymes : `collectors/correlate.ts` a son **propre**
 * résolveur, qui ne consulte jamais le gazetteer et n'a aucune notion de
 * territoire. C'est par cette porte que 2 464 rattachements faux sont entrés
 * en base — un CVE Microsoft rattaché à « CODE 202 », un incident de Humboldt
 * rattaché à une société de Gironde.
 *
 * La règle est volontairement étroite : **un département de la région nommé
 * dans le texte**. Pas de commune, pas de fleuve, pas de région administrative
 * « Nouvelle-Aquitaine » seule — ces indices sont trop ambigus (« Vienne » est
 * une ville, un département et une rivière) et produiraient exactement le type
 * d'erreur qu'on cherche à supprimer.
 *
 * Ce que ça coûte : un incident régional qui ne nomme pas son département ne
 * sera pas rattaché. C'est un manque **mesuré** (voir `scripts/mesure-territorial.mts`),
 * pas un angle mort silencieux — et un rattachement manqué se corrige, un
 * rattachement faux se propage.
 */
import { DEPT_LABELS, admitsDepartment } from "../collectors/relevance.js";

/** Libellés normalisés des douze départements de la région. */
export const DEPARTEMENTS_NA: readonly string[] = Object.values(DEPT_LABELS);

export type VerdictTerritorial =
	| { regional: true; motif: "departement" }
	| { regional: false; motif: "aucun-indice-territorial" };

/**
 * `admitsDepartment` applique déjà les garde-fous nécessaires : frontières de
 * mots, formes composées (`lot-et-garonne` vs `lot`), lieux ambigus
 * (`vienne`) départagés par une amorce locative. On ne réimplémente rien.
 */
export function verifierTerritorial(
	texte: string,
	departements: readonly string[] = DEPARTEMENTS_NA,
): VerdictTerritorial {
	if (admitsDepartment(texte, departements)) return { regional: true, motif: "departement" };
	return { regional: false, motif: "aucun-indice-territorial" };
}
