/**
 * Agent de bascule sectorielle : la répartition des événements par secteur a-t-elle
 * changé dans les 7 derniers jours par rapport aux 90 jours qui les précèdent ?
 *
 * Détecteur déterministe, sans LLM : z-score binomial par secteur. Pour chaque
 * secteur, on compare l'effectif observé dans la fenêtre récente à l'effectif
 * attendu sous la répartition de référence ; le plus grand |z| porte l'alerte
 * et son signe dit le sens de la bascule. Un lissage add-one évite l'attendu
 * nul d'un secteur jamais vu dans la référence.
 *
 * Les seuils sont explicitement calibrés par la mesure du taux de fausses
 * alertes (`scripts/mesure-agents-cpu.mts`, publiée dans docs/agents-cpu.md),
 * pas choisis pour qu'une jolie alerte apparaisse sur un jeu synthétique.
 */

const JOUR_MS = 86_400_000;

/** 7 j : la fenêtre de la revue hebdomadaire, déjà utilisée par l'agent « rafale ». */
export const FENETRE_RECENTE_JOURS = 7;
/** 90 j : les 90 jours *précédents* la fenêtre récente, pas les 90 derniers jours. */
export const FENETRE_REFERENCE_JOURS = 90;
/** z ≈ 3 écarts-types sous l'hypothèse d'une répartition inchangée. */
export const SEUIL_Z = 3;
/** En dessous, un z sur quelques faits ne prouve rien : on ne publie pas d'alerte. */
export const EFFECTIF_MIN = 10;
/** Un fait isolé dans un secteur rare n'est pas une bascule de distribution. */
export const OBSERVES_MIN_SECTEUR = 3;

export const AGENT_BASCULE_SECTEUR = "bascule-secteur" as const;

export type DistributionSecteurs = Readonly<Record<string, number>>;

export type EvenementSecteur = {
	secteur: string;
	/** Date ISO 8601. */
	date: string;
};

export type FenetresSecteurs = {
	recente: DistributionSecteurs;
	reference: DistributionSecteurs;
};

export type ContributionSecteur = {
	secteur: string;
	observe: number;
	attendu: number;
	/** Part du secteur dans la distribution de référence (après lissage). */
	proportionReference: number;
	/** (observé − attendu) / √(attendu × (1 − p)) : le signe dit le sens de la bascule. */
	z: number;
	/** z² : la part de ce secteur dans l'écart global. */
	contribution: number;
};

export type ResultatRuptureSecteur = {
	/** z signé du secteur porteur, ou null si aucune fenêtre n'est exploitable. */
	zCritique: number | null;
	/** Secteur porteur de l'alerte, ou null en état vide. */
	secteurCritique: string | null;
	seuil: number;
	alerte: boolean;
	/** Faux si une fenêtre est trop pauvre : le score existe mais n'est pas publié. */
	fiable: boolean;
	effectifs: { recent: number; reference: number };
	/** Trié par |z| décroissante : le premier secteur explique l'écart global. */
	parSecteur: ContributionSecteur[];
};

/** Copie une distribution en objet sans prototype, en écartant les comptages invalides. */
function nettoyer(distribution: DistributionSecteurs): Record<string, number> {
	const propre: Record<string, number> = Object.create(null);
	for (const [secteur, n] of Object.entries(distribution)) {
		if (!secteur.trim()) continue;
		if (typeof n === "number" && Number.isFinite(n) && n > 0) {
			propre[secteur] = (propre[secteur] ?? 0) + n;
		}
	}
	return propre;
}

function total(distribution: Record<string, number>): number {
	let somme = 0;
	for (const n of Object.values(distribution)) somme += n;
	return somme;
}

/**
 * Répartit des événements datés entre les 7 derniers jours et les 90 jours qui
 * les précèdent. Les dates invalides, futures ou plus anciennes sont ignorées.
 */
export function repartirEnFenetres(
	evenements: readonly EvenementSecteur[],
	maintenant: number = Date.now(),
): FenetresSecteurs {
	const limiteRecente = maintenant - FENETRE_RECENTE_JOURS * JOUR_MS;
	const limiteReference = maintenant - (FENETRE_RECENTE_JOURS + FENETRE_REFERENCE_JOURS) * JOUR_MS;
	const recente: Record<string, number> = Object.create(null);
	const reference: Record<string, number> = Object.create(null);

	for (const { secteur, date } of evenements) {
		const t = Date.parse(date);
		if (!Number.isFinite(t)) continue;
		if (t >= limiteRecente && t <= maintenant) {
			recente[secteur] = (recente[secteur] ?? 0) + 1;
		} else if (t >= limiteReference && t < limiteRecente) {
			reference[secteur] = (reference[secteur] ?? 0) + 1;
		}
	}
	return { recente, reference };
}

/**
 * Compare deux distributions de secteurs et décide d'alerter.
 *
 * La variance binomiale `n·p·(1−p)` est calculée sur la probabilité lissée de
 * la référence. Un secteur qui monopolise la fenêtre récente est détecté, un
 * secteur qui disparaît l'est aussi — c'est le même test, avec un z négatif.
 */
export function detecterRuptureSecteur(input: {
	recente: DistributionSecteurs;
	reference: DistributionSecteurs;
	/** Seuil de |z| au-delà duquel on alerte ; remplace SEUIL_Z. */
	seuil?: number;
}): ResultatRuptureSecteur {
	const seuil = input.seuil ?? SEUIL_Z;
	const recente = nettoyer(input.recente);
	const reference = nettoyer(input.reference);
	const secteurs = [...new Set([...Object.keys(recente), ...Object.keys(reference)])].sort();
	const effectifs = { recent: total(recente), reference: total(reference) };

	const vide: ResultatRuptureSecteur = {
		zCritique: null,
		secteurCritique: null,
		seuil,
		alerte: false,
		fiable: false,
		effectifs,
		parSecteur: [],
	};
	if (effectifs.recent === 0 || effectifs.reference === 0 || secteurs.length === 0) return vide;

	const taille = secteurs.length;
	const parSecteur = secteurs.map((secteur) => {
		const observe = recente[secteur] ?? 0;
		const proportionReference = ((reference[secteur] ?? 0) + 1) / (effectifs.reference + taille);
		const attendu = proportionReference * effectifs.recent;
		const variance = attendu * (1 - proportionReference);
		const z = variance > 0 ? (observe - attendu) / Math.sqrt(variance) : 0;
		return { secteur, observe, attendu, proportionReference, z, contribution: z * z };
	});
	parSecteur.sort((a, b) => b.contribution - a.contribution || a.secteur.localeCompare(b.secteur));

	// Le secteur porteur doit avoir assez de faits pour qu'on parle de
	// distribution : un secteur rare avec un z énorme sur un fait isolé ne
	// doit pas masquer une bascule réelle portée par un secteur fréquent.
	const porteur = parSecteur.find((p) => p.observe >= OBSERVES_MIN_SECTEUR);
	const critique = porteur ?? parSecteur[0];
	const fiable = effectifs.recent >= EFFECTIF_MIN && effectifs.reference >= EFFECTIF_MIN;
	const alerte = fiable && porteur !== undefined && Math.abs(porteur.z) > seuil;
	return {
		zCritique: critique?.z ?? null,
		secteurCritique: critique?.secteur ?? null,
		seuil,
		alerte,
		fiable,
		effectifs,
		parSecteur,
	};
}
