/**
 * Anticipation : ce qui, avant un incident, l'annonçait — s'il y avait quelque
 * chose.
 *
 * Le projet ne prétend pas prédire. Il prétend **regarder**. Ce module prend
 * les signaux qu'on avait déjà sur une organisation avant un fait, et les
 * classe par nature, pour répondre à une seule question : *le radar disposait-il
 * de quelque chose, ou de rien ?* Les deux réponses sont publiables ; seule la
 * deuxième est désagréable, et c'est justement pour cela qu'il faut la mesurer.
 *
 * Aucun modèle, aucun réseau : uniquement ce qui était en base. Un signal
 * « prédictif » calculé par un modèle serait impossible à contester ; une règle
 * de classement, elle, se relit.
 */

/** Nature d'un signal antérieur. */
export type NatureSignal = "indicateur" | "revendication" | "ambiance" | "alerte";

export type SignalAnticipation = {
	nature: NatureSignal;
	family: string;
	sourceId: string;
	/** Jours d'avance sur le fait principal. Positif = avant. */
	avanceJours: number;
	resume: string;
};

/**
 * Classe un signal selon ce qu'il prouve.
 *
 * L'ordre importe : un indicateur technique est plus proche d'un avertissement
 * qu'un signal d'ambiance, qui peut n'être qu'un article de presse mentionnant
 * l'organisation pour une tout autre raison. Publier un taux global sans ce
 * détail laisserait croire que « l'ambiance » anticipe.
 */
export function classerSignal(entree: {
	assertionType: string | null;
	kind?: "event" | "alerte";
}): NatureSignal {
	if (entree.kind === "alerte") return "alerte";
	const assertion = entree.assertionType ?? "";
	if (assertion === "technical_indicator") return "indicateur";
	if (assertion === "third_party_claim") return "revendication";
	return "ambiance";
}

export type ResumeAnticipation = {
	faits: number;
	avecSignal: number;
	/** Part des faits précédés d'au moins un signal, en pourcentage entier. */
	partPct: number;
	/** Avance médiane, tous signaux confondus ; `null` sans signal. */
	avanceMedianeJours: number | null;
	parNature: Record<NatureSignal, number>;
	/**
	 * Vrai si la mesure porte sur si peu de faits qu'elle ne prouve rien.
	 * Publier « 67 % » sur trois faits serait une faute de communication.
	 */
	indicative: boolean;
};

/** En deçà, la mesure est publiée avec sa réserve. */
export const SEUIL_INDICATIF = 10;

/** Résume un ensemble de faits et de leurs signaux antérieurs. */
export function resumerAnticipation(
	faits: readonly { signaux: readonly SignalAnticipation[] }[],
): ResumeAnticipation {
	const parNature: Record<NatureSignal, number> = {
		indicateur: 0,
		revendication: 0,
		ambiance: 0,
		alerte: 0,
	};
	let avecSignal = 0;
	const avances: number[] = [];

	for (const fait of faits) {
		if (fait.signaux.length === 0) continue;
		avecSignal++;
		// Un fait compte une fois par nature, même si trois alertes le visaient :
		// on mesure la nature du signal, pas son volume.
		for (const nature of new Set(fait.signaux.map((s) => s.nature))) parNature[nature]++;
		for (const signal of fait.signaux) avances.push(signal.avanceJours);
	}

	avances.sort((a, b) => a - b);
	const mediane = avances.length === 0 ? null : (avances[Math.floor(avances.length / 2)] ?? null);

	return {
		faits: faits.length,
		avecSignal,
		partPct: faits.length === 0 ? 0 : Math.round((avecSignal / faits.length) * 100),
		avanceMedianeJours: mediane,
		parNature,
		indicative: faits.length < SEUIL_INDICATIF,
	};
}
