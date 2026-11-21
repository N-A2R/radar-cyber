/**
 * Agent « rupture organisation » : une organisation absente depuis 90 jours
 * qui réapparaît au moins trois fois dans les sept derniers jours.
 *
 * Détecteur pur et déterministe : il ne lit pas la base, il reçoit les
 * événements et un instant de référence. On peut donc le rejouer sur une série
 * synthétique ou sur une date passée sans dépendre de l'horloge du serveur.
 *
 * Les deux fenêtres sont jointes, pas superposées : les 90 jours d'absence
 * précèdent immédiatement les 7 jours de réapparition. Comparer les 90 jours
 * écoulés depuis maintenant inclurait les événements déclencheurs eux-mêmes,
 * et aucune organisation ne pourrait jamais être déclarée absente.
 */

const JOUR_MS = 86_400_000;

/** 7 j : une semaine, la fenêtre où la réapparition est considérée brute. */
export const FENETRE_RECENTE_JOURS = 7;
/** 3 faits : en dessous, une mention isolée ne caractérise pas une rupture. */
export const SEUIL_EVENEMENTS_RECENTS = 3;
/** 90 j : la période sans aucune apparition qui précède la fenêtre récente. */
export const FENETRE_ABSENCE_JOURS = 90;

export type EvenementOrganisation = {
	/** Identifiant de l'événement, renvoyé tel quel dans l'alerte. */
	id: number | string;
	orgId: number;
	/** Date ISO de l'événement. */
	date: string;
};

export type AlerteRuptureOrg = {
	orgId: number;
	/** Événements de la fenêtre récente, du plus ancien au plus récent. */
	evenementsDeclencheurs: EvenementOrganisation[];
};

/**
 * Renvoie une alerte par organisation satisfaisant les deux conditions.
 *
 * Une date invalide est ignorée : elle ne peut ni prouver une présence dans
 * la fenêtre d'absence, ni servir de déclencheur. Le résultat est trié par
 * identifiant d'organisation pour être reproductible, quels que soient
 * l'ordre et la provenance des événements en entrée.
 */
export function detecterRupturesOrg(
	evenements: readonly EvenementOrganisation[],
	maintenant: number = Date.now(),
): AlerteRuptureOrg[] {
	const debutRecents = maintenant - FENETRE_RECENTE_JOURS * JOUR_MS;
	const debutAbsence = debutRecents - FENETRE_ABSENCE_JOURS * JOUR_MS;

	const parOrg = new Map<number, { recents: EvenementOrganisation[]; vuPendantAbsence: boolean }>();
	for (const evenement of evenements) {
		const instant = Date.parse(evenement.date);
		if (!Number.isFinite(instant)) continue;

		const presence =
			instant >= debutRecents && instant <= maintenant
				? "recent"
				: instant >= debutAbsence && instant < debutRecents
					? "absence"
					: null;
		if (presence === null) continue;

		const etat = parOrg.get(evenement.orgId) ?? { recents: [], vuPendantAbsence: false };
		if (presence === "absence") etat.vuPendantAbsence = true;
		else etat.recents.push(evenement);
		parOrg.set(evenement.orgId, etat);
	}

	return [...parOrg.entries()]
		.filter(([, etat]) => !etat.vuPendantAbsence && etat.recents.length >= SEUIL_EVENEMENTS_RECENTS)
		.map(([orgId, etat]) => ({
			orgId,
			evenementsDeclencheurs: etat.recents.toSorted(
				(a, b) => Date.parse(a.date) - Date.parse(b.date),
			),
		}))
		.sort((a, b) => a.orgId - b.orgId);
}
