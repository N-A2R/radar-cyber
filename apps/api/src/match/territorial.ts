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

/**
 * Mots outils français. Un texte qui n'en contient aucun, et qui n'a pas
 * d'accent, n'est pas un texte français.
 */
const MOTS_FRANCAIS: Record<string, true> = {
	de: true, la: true, le: true, les: true, des: true, du: true, et: true,
	en: true, dans: true, sur: true, pour: true, avec: true, une: true,
	un: true, est: true, sont: true, qui: true, que: true, par: true,
	au: true, aux: true, ce: true, cette: true, son: true, sa: true,
	ses: true, ont: true, été: true, après: true, avant: true, plus: true,
	hors: true, sous: true, vers: true, chez: true, dont: true, où: true,
};

/**
 * Vrai si le texte a une chance d'être français.
 *
 * Ce test existe pour une raison précise : les flux de vulnérabilités sont en
 * anglais, et un référentiel régional contient des raisons sociales composées
 * de mots anglais ordinaires — « PHONE SERVICE », « FIREWALL SERVICES »,
 * « HOST & WORKER ». Chaque mot ajouté à la liste des termes génériques en
 * faisait apparaître un autre : la liste ne pouvait pas gagner.
 *
 * La règle qui gagne est plus haut : **un CVE n'est pas un incident régional**.
 * On ne cherche une organisation que dans un texte français.
 */
export function estTexteFrancais(texte: string): boolean {
	if (/[àâäçéèêëîïôöùûüÿœæ]/i.test(texte)) return true;
	const mots = texte.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
	if (mots.length === 0) return false;
	let outils = 0;
	for (const m of mots) if (MOTS_FRANCAIS[m] === true) outils++;
	// Un mot outil tous les 12 mots : un texte français en contient bien plus,
	// un texte anglais technique beaucoup moins.
	return outils >= Math.max(2, Math.floor(mots.length / 12));
}

/**
 * Portée d'un événement, telle qu'elle est stockée sur la ligne.
 *
 * Deux signaux seulement, dans cet ordre :
 *  1. l'événement est rattaché à une organisation du référentiel — c'est une
 *     preuve, pas un indice ;
 *  2. le texte nomme un département de la région.
 *
 * Le second est plus faible : « la Vienne » est aussi une rivière et une ville
 * de l'Isère. Il suffit pour **trier un fil**, pas pour rattacher une victime.
 * D'où deux colonnes : le drapeau, et le motif qui l'explique.
 */
export function porteeRegionale(
	texte: string,
	orgId: number | null,
	departements: readonly string[] = DEPARTEMENTS_NA,
): { regional: boolean; motif: "rattachement" | "departement" | "aucun" } {
	if (orgId !== null) return { regional: true, motif: "rattachement" };
	const verdict = verifierTerritorial(texte, departements);
	if (verdict.regional) return { regional: true, motif: "departement" };
	return { regional: false, motif: "aucun" };
}
