/**
 * Agent source muette — détecteur déterministe, sans LLM.
 *
 * Une source qui n'a jamais rien rendu n'est pas une source muette : c'est une
 * source sans historique, et la condamner par omission serait une erreur. Pour
 * qu'une alerte parte, deux conditions doivent être réunies et vérifiables :
 *
 *   1. la source avait une cadence quotidienne : au moins un événement dans
 *      chacun des 7 jours précédant le silence ;
 *   2. elle n'a rien produit depuis au moins 3 jours.
 *
 * Les seuils sont explicitement non mesurés : 3 jours est la consigne, 7 jours
 * est la fenêtre minimale pour distinguer une habitude d'un événement isolé.
 * À calibrer sur la base réelle quand elle sera disponible.
 *
 * Le détecteur est pur : `maintenant` est un paramètre, ce qui rend le rejeu
 * historique et le test possible. Aucune écriture en base, aucune journalisation
 * ici — l'alerte est une valeur que l'appelant décide d'exploiter.
 */
export const JOUR_MS = 86_400_000;
/** Consigne : trois jours sans rien rendre. */
export const SEUIL_SILENCE_JOURS = 3;
/** Non mesuré : sept jours pour établir une cadence, à calibrer. */
export const FENETRE_CADENCE_JOURS = 7;

export const AGENT_SOURCE_MUETTE = "source-muette" as const;

export type EvenementSource = { date: string };

export type SourceSurveillee = {
	id: string;
	evenements: readonly EvenementSource[];
};

export type AlerteSourceMuette = {
	agent: typeof AGENT_SOURCE_MUETTE;
	sourceId: string;
	motif: string;
	/** Nombre entier de jours écoulés depuis le dernier événement. */
	silenceJours: number;
	/** Événements rendus pendant la fenêtre de cadence, hors silence. */
	evenementsCadence: number;
	explication: string;
};

/**
 * Une alerte, ou `null` si la source ne remplit pas les deux conditions.
 *
 * Les dates invalides sont écartées : « non mesuré » ne compte pas comme un
 * événement. Un événement pile à la limite des 3 jours ne rompt pas le silence.
 */
export function detecterSourceMuette(
	source: SourceSurveillee,
	maintenant: number = Date.now(),
): AlerteSourceMuette | null {
	const instants = source.evenements
		.map((e) => Date.parse(e.date))
		.filter((t): t is number => Number.isFinite(t));
	if (instants.length === 0) return null;

	const limiteSilence = maintenant - SEUIL_SILENCE_JOURS * JOUR_MS;
	const dernier = Math.max(...instants);
	if (dernier > limiteSilence) return null;

	// Fenêtre de cadence : les 7 jours *avant* le silence, pas les 7 derniers
	// jours (qui sont vides par définition). Une case par tranche de 24 h
	// glissante, numérotée de 1 (la plus récente) à 7 ; il faut les 7 pour
	// parler de production quotidienne.
	const finCadence = limiteSilence;
	const debutCadence = finCadence - FENETRE_CADENCE_JOURS * JOUR_MS;
	const joursActifs = new Set<number>();
	let evenementsCadence = 0;
	for (const instant of instants) {
		if (instant < debutCadence || instant >= finCadence) continue;
		evenementsCadence++;
		joursActifs.add(Math.ceil((finCadence - instant) / JOUR_MS));
	}
	if (joursActifs.size !== FENETRE_CADENCE_JOURS) return null;

	const silenceJours = Math.floor((maintenant - dernier) / JOUR_MS);
	return {
		agent: AGENT_SOURCE_MUETTE,
		sourceId: source.id,
		motif: `source quotidienne muette depuis ${silenceJours} j`,
		silenceJours,
		evenementsCadence,
		explication: `${evenementsCadence} événements sur ${FENETRE_CADENCE_JOURS} jours consécutifs avant le silence ; dernier il y a ${silenceJours} j`,
	};
}

/** Passe la liste de sources et ne rend que les alertes, dans l'ordre reçu. */
export function detecterSourcesMuettes(
	sources: readonly SourceSurveillee[],
	maintenant: number = Date.now(),
): AlerteSourceMuette[] {
	const alertes: AlerteSourceMuette[] = [];
	for (const source of sources) {
		const alerte = detecterSourceMuette(source, maintenant);
		if (alerte) alertes.push(alerte);
	}
	return alertes;
}
