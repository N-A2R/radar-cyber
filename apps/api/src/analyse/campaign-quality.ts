/**
 * Mesure au niveau campagne, sur un jeu annoté, du regroupement multi-organismes.
 *
 * Une détection n'est comptée que si elle porte sur au moins deux victimes
 * distinctes. Elle est vraie positif seulement si son ensemble exact
 * d'incidents correspond à une campagne annotée non encore revendiquée ;
 * sinon c'est un faux positif. Toute annotation non revendiquée est un faux
 * négatif. Aucune correspondance approximative : un regroupement qui fusionne
 * deux campagnes annotées est compté à la fois comme faux positif et faux
 * négatif.
 */
import { victimeDe, type Campagne, type EvenementCampagne } from "./campagnes.js";

export type AnnotationCampagne = {
	acteur: string;
	mois: string;
	incidents: number[];
	organisations: number;
	famille: string;
};

export type ResultatQualite = {
	annotees: number;
	detectees: number;
	tp: number;
	fp: number;
	fn: number;
	precision: number;
	rappel: number;
};

const cleCampagne = (incidents: readonly number[]): string =>
	[...incidents].sort((a, b) => a - b).join(",");

export function evaluerCampagnes(
	evenements: readonly EvenementCampagne[],
	campagnes: readonly Campagne[],
	annotations: readonly AnnotationCampagne[],
): ResultatQualite {
	const parId = new Map<number, EvenementCampagne>(evenements.map((e) => [e.id, e]));
	const attendues = new Map<string, number>();
	for (const [index, annotation] of annotations.entries()) {
		attendues.set(cleCampagne(annotation.incidents), index);
	}

	const revendiquees = new Set<number>();
	let tp = 0;
	let fp = 0;
	let detectees = 0;
	for (const campagne of campagnes) {
		const victimes = new Set<string>();
		for (const id of campagne.incidents) {
			const evenement = parId.get(id);
			if (evenement === undefined) continue;
			const victime = victimeDe(evenement);
			if (victime !== null) victimes.add(victime);
		}
		if (victimes.size < 2) continue;
		detectees += 1;
		const index = attendues.get(cleCampagne(campagne.incidents));
		if (index !== undefined && !revendiquees.has(index)) {
			revendiquees.add(index);
			tp += 1;
		} else {
			fp += 1;
		}
	}

	const fn = annotations.length - revendiquees.size;
	return {
		annotees: annotations.length,
		detectees,
		tp,
		fp,
		fn,
		precision: detectees === 0 ? 0 : tp / detectees,
		rappel: annotations.length === 0 ? 0 : tp / annotations.length,
	};
}
