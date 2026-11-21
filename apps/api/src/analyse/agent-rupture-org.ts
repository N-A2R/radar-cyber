/**
 * Agent « rupture organisation » : une organisation déjà suivie, silencieuse
 * depuis 90 jours, qui réapparaît avec au moins trois faits en sept jours,
 * corroborés par au moins deux sources distinctes.
 *
 * Le silence seul confondait deux situations : une organisation connue qui
 * se tait puis refait surface (une rupture) et une organisation qui apparaît
 * pour la première fois parce que le référentiel vient de l'ajouter (une
 * arrivée). Les huit alertes mesurées le 21 novembre 2026 étaient du second
 * cas. Exiger au moins un fait *antérieur* au silence prouve que l'organisation
 * existait déjà dans le radar ; exiger deux sources écarte une revendication
 * unique répétée par un seul flux.
 *
 * Détecteur pur et déterministe : il ne lit pas la base, il reçoit les
 * événements et un instant de référence. On peut donc le rejouer sur une série
 * synthétique ou sur une date passée sans dépendre de l'horloge du serveur.
 *
 * Les fenêtres sont jointes, pas superposées : les 90 jours d'absence
 * précèdent immédiatement les 7 jours de réapparition. Un fait plus ancien
 * encore est une preuve d'histoire, pas une présence pendant le silence.
 */

const JOUR_MS = 86_400_000;

/** 7 j : une semaine, la fenêtre où la réapparition est considérée brute. */
export const FENETRE_RECENTE_JOURS = 7;
/** 3 faits : en dessous, une mention isolée ne caractérise pas une rupture. */
export const SEUIL_EVENEMENTS_RECENTS = 3;
/** 90 j : la période sans aucune apparition qui précède la fenêtre récente. */
export const FENETRE_ABSENCE_JOURS = 90;
/** 1 fait antérieur au silence suffit à prouver que l'organisation était déjà suivie. */
export const HISTORIQUE_ANCIEN_MIN = 1;
/** 2 sources : une revendication répétée par un seul flux n'est pas une corroboration. */
export const SOURCES_DISTINCTES_MIN = 2;

export const AGENT_ORGANISATION_SURGISSANTE = "organisation-surgissante" as const;

export type EvenementOrganisation = {
	/** Identifiant de l'événement, renvoyé tel quel dans l'alerte. */
	id: number | string;
	orgId: number;
	/** Date ISO de l'événement. */
	date: string;
	/** Source productrice : la rupture doit être corroborée par plusieurs sources. */
	sourceId: string;
};

export type AlerteRuptureOrg = {
	orgId: number;
	/** Événements de la fenêtre récente, du plus ancien au plus récent. */
	evenementsDeclencheurs: EvenementOrganisation[];
	/** Faits antérieurs à la fenêtre d'absence : l'organisation était déjà connue. */
	evenementsAnciens: number;
	/** Sources distinctes ayant produit les faits récents. */
	sourcesDistinctes: number;
};

type EtatOrganisation = {
	recents: EvenementOrganisation[];
	sourcesRecentes: Set<string>;
	vuPendantAbsence: boolean;
	evenementsAnciens: number;
};

/**
 * Renvoie une alerte par organisation satisfaisant toutes les conditions.
 *
 * Une date invalide est ignorée : elle ne peut ni prouver une histoire
 * ancienne, ni une présence pendant le silence, ni servir de déclencheur.
 * Une date future est ignorée de la même façon. Le résultat est trié par
 * identifiant d'organisation pour être reproductible, quels que soient
 * l'ordre et la provenance des événements en entrée.
 */
export function detecterRupturesOrg(
	evenements: readonly EvenementOrganisation[],
	maintenant: number = Date.now(),
): AlerteRuptureOrg[] {
	const debutRecents = maintenant - FENETRE_RECENTE_JOURS * JOUR_MS;
	const debutAbsence = debutRecents - FENETRE_ABSENCE_JOURS * JOUR_MS;

	const parOrg = new Map<number, EtatOrganisation>();
	for (const evenement of evenements) {
		const instant = Date.parse(evenement.date);
		if (!Number.isFinite(instant)) continue;

		const presence =
			instant > maintenant
				? null
				: instant < debutAbsence
					? "ancien"
					: instant < debutRecents
						? "absence"
						: "recent";
		if (presence === null) continue;

		const etat = parOrg.get(evenement.orgId) ?? {
			recents: [],
			sourcesRecentes: new Set<string>(),
			vuPendantAbsence: false,
			evenementsAnciens: 0,
		};
		if (presence === "ancien") etat.evenementsAnciens++;
		else if (presence === "absence") etat.vuPendantAbsence = true;
		else {
			etat.recents.push(evenement);
			if (evenement.sourceId) etat.sourcesRecentes.add(evenement.sourceId);
		}
		parOrg.set(evenement.orgId, etat);
	}

	return [...parOrg.entries()]
		.filter(([, etat]) =>
			etat.evenementsAnciens >= HISTORIQUE_ANCIEN_MIN &&
			!etat.vuPendantAbsence &&
			etat.recents.length >= SEUIL_EVENEMENTS_RECENTS &&
			etat.sourcesRecentes.size >= SOURCES_DISTINCTES_MIN)
		.map(([orgId, etat]) => ({
			orgId,
			evenementsDeclencheurs: etat.recents.toSorted(
				(a, b) => Date.parse(a.date) - Date.parse(b.date) || String(a.id).localeCompare(String(b.id)),
			),
			evenementsAnciens: etat.evenementsAnciens,
			sourcesDistinctes: etat.sourcesRecentes.size,
		}))
		.sort((a, b) => a.orgId - b.orgId);
}
