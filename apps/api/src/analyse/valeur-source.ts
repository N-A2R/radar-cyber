/**
 * Ce que vaut une source — chantier 8.
 *
 * Trois questions différentes, souvent confondues :
 *
 *   — **volume** : combien d'événements ? C'est ce que mesure le rendement, et
 *     c'est la moins intéressante : un agrégateur peut en produire mille sans
 *     apprendre un seul fait nouveau ;
 *   — **utilité régionale** : combien d'événements touchent réellement une
 *     organisation de Nouvelle-Aquitaine ? Un flux mondial de CVE a un volume
 *     énorme et une utilité locale nulle ;
 *   — **unicité** : sur combien de faits est-elle la seule à parler ? C'est la
 *     mesure qui compte : une source qui ne fait que relayer ce que tout le
 *     monde a déjà n'ajoute rien, quelle que soit sa qualité.
 *
 * Ce module calcule les trois, à partir des groupes de `corroboration.ts`. Il
 * ne note pas les sources sur 100 : une note unique de source est un chiffre
 * qu'on ne peut pas contester ni corriger. On rend les composantes.
 */
import type { Groupe } from "./corroboration.js";
import { mediane } from "./mediane.js";

export type ValeurSource = {
	sourceId: string;
	/** Faits distincts où la source apparaît. */
	faits: number;
	/** Faits où elle est la seule à parler : sa contribution propre. */
	faitsUniques: number;
	/** Part de ses faits qu'elle est seule à porter, en pourcentage entier. */
	partUniquesPct: number;
	/**
	 * Heures médianes entre le premier signalement d'un fait et son arrivée,
	 * sur les faits où elle n'est pas première. `null` si elle est toujours
	 * première ou toujours seule.
	 */
	retardMedianHeures: number | null;
	/** Faits où elle a parlé la première — ce qu'elle apporte vraiment. */
	primeurs: number;
};

/** Évalue chaque source sur un ensemble de faits déjà regroupés. */
export function evaluerValeur(groupes: readonly Groupe[]): ValeurSource[] {
	const accumule = new Map<
		string,
		{ faits: number; uniques: number; primeurs: number; retards: number[] }
	>();

	for (const groupe of groupes) {
		for (const source of groupe.sources) {
			const acc = accumule.get(source.sourceId) ?? { faits: 0, uniques: 0, primeurs: 0, retards: [] };
			acc.faits++;
			if (groupe.sourcesDistinctes === 1) acc.uniques++;
			if (source.estPremier && groupe.sourcesDistinctes > 1) acc.primeurs++;
			// Le retard n'a de sens que sur un fait corroboré : arriver après
			// soi-même ne dit rien.
			if (!source.estPremier && groupe.sourcesDistinctes > 1) acc.retards.push(source.delaiHeures);
			accumule.set(source.sourceId, acc);
		}
	}

	return [...accumule.entries()]
		.map(([sourceId, acc]) => {
			return {
				sourceId,
				faits: acc.faits,
				faitsUniques: acc.uniques,
				partUniquesPct: acc.faits === 0 ? 0 : Math.round((acc.uniques / acc.faits) * 100),
				retardMedianHeures: mediane(acc.retards),
				primeurs: acc.primeurs,
			};
		})
		.sort(
			(a, b) =>
				b.faitsUniques - a.faitsUniques ||
				b.primeurs - a.primeurs ||
				b.faits - a.faits ||
				a.sourceId.localeCompare(b.sourceId),
		);
}

/**
 * Verdict lisible. Volontairement qualitatif : il sert à trier une liste, pas
 * à classer des sources entre elles.
 *
 *   `indispensable` — elle porte au moins un fait que personne d'autre ne porte ;
 *   `utile`         — elle n'est jamais seule, mais elle arrive parfois la première ;
 *   `redondante`    — elle ne fait que suivre, sans jamais rien révéler.
 */
export function verdict(valeur: ValeurSource): "indispensable" | "utile" | "redondante" {
	if (valeur.faitsUniques > 0) return "indispensable";
	if (valeur.primeurs > 0) return "utile";
	return "redondante";
}
