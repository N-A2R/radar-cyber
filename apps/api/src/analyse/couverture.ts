/**
 * Moteur de couverture — classification d'un incident confronté à la collecte.
 *
 * Un incident public n'est pas « vu » parce qu'un texte lui ressemble : il faut
 * qu'il ait été collecté, reconnu comme cyber, rattaché à la bonne organisation,
 * et seulement alors mesure-t-on le délai entre publication et rattachement.
 * Chaque refus porte un motif explicite : un taux de couverture sans répartition
 * des motifs ne dit pas où agir.
 *
 * Ce noyau est pur (aucune base, aucun réseau) pour être testé sur des cas
 * synthétiques et réutilisé par la mesure réelle.
 */

/** Les motifs, figés : les publier sous forme de chaînes littérales évite qu'un
 * simple renommage change silencieusement la signification d'une mesure. */
export const MOTIFS_COUVERTURE = {
	vu: "vu",
	pasCollecte: "pas_collecte",
	pasRattache: "pas_rattache",
	pasJugeCyber: "pas_juge_cyber",
	fauxPositif: "faux_positif",
} as const;

export type MotifCouverture = (typeof MOTIFS_COUVERTURE)[keyof typeof MOTIFS_COUVERTURE];

export type Collecte = {
	/** Date ISO (YYYY-MM-DD) à laquelle le texte de l'incident est entré. */
	date: string;
};

export type Rattachement = {
	orgId: string;
	/** Date ISO (YYYY-MM-DD) du rattachement retenu. */
	date: string;
	/** Un rattachement à la mauvaise organisation n'est pas une couverture. */
	correct: boolean;
};

export type FaitCouverture = {
	id: string;
	/** Date ISO (YYYY-MM-DD) de publication publique de l'incident. */
	datePublication: string;
	collecte: Collecte | null;
	/** Vrai quand la porte de pertinence cyber a admis l'incident. */
	jugeCyber: boolean;
	rattachement: Rattachement | null;
};

export type ResultatCouverture = {
	id: string;
	motif: MotifCouverture;
	/** Jours entre publication et rattachement ; null tant que l'incident n'est pas vu. */
	delaiJours: number | null;
};

function joursEntre(depuis: string, jusqua: string): number {
	const a = Date.parse(`${depuis}T00:00:00Z`);
	const b = Date.parse(`${jusqua}T00:00:00Z`);
	if (Number.isNaN(a) || Number.isNaN(b)) {
		throw new Error(`date de couverture invalide : ${depuis} → ${jusqua}`);
	}
	return Math.round((b - a) / 86_400_000);
}

/** Classifie un incident : un motif, et un délai seulement s'il est vu. */
export function classerCouverture(fait: FaitCouverture): ResultatCouverture {
	const refus = (motif: MotifCouverture): ResultatCouverture => ({
		id: fait.id,
		motif,
		delaiJours: null,
	});

	if (!fait.collecte) return refus(MOTIFS_COUVERTURE.pasCollecte);
	if (!fait.jugeCyber) return refus(MOTIFS_COUVERTURE.pasJugeCyber);
	if (!fait.rattachement) return refus(MOTIFS_COUVERTURE.pasRattache);
	if (!fait.rattachement.correct) return refus(MOTIFS_COUVERTURE.fauxPositif);

	return {
		id: fait.id,
		motif: MOTIFS_COUVERTURE.vu,
		delaiJours: joursEntre(fait.datePublication, fait.rattachement.date),
	};
}
