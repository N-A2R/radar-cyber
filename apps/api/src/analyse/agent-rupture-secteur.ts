/**
 * Agent de rupture sectorielle : la répartition des événements par secteur a-t-elle
 * changé dans les 7 derniers jours par rapport aux 90 jours qui les précèdent ?
 *
 * Détecteur déterministe, sans LLM : χ² de conformité simplifié. La répartition
 * de référence donne les probabilités attendues, ramenées à l'effectif récent ;
 * on mesure l'écart global, puis on ne lève l'alerte que s'il dépasse le seuil.
 * Comme les autres agents de `rupture.ts`, chaque constante porte sa justification.
 */

const JOUR_MS = 86_400_000;

/** 7 j : la fenêtre de la revue hebdomadaire, déjà utilisée par l'agent « rafale ». */
export const FENETRE_RECENTE_JOURS = 7;
/** 90 j : les 90 jours *précédents* la fenêtre récente, pas les 90 derniers jours. */
export const FENETRE_REFERENCE_JOURS = 90;
/** χ² à 4 ddl, p ≈ 0,05 (quatre secteurs éditoriaux). Non mesuré sur nos données. */
export const SEUIL_CHI2 = 9.488;
/** En dessous, un χ² sur quelques faits ne prouve rien : on ne publie pas d'alerte. Non mesuré. */
export const EFFECTIF_MIN = 10;

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
	/** (observé − attendu) / √attendu : le signe dit le sens de la rupture. */
	residu: number;
	/** residu² : la part de ce secteur dans le χ² total. */
	contribution: number;
};

export type ResultatRuptureSecteur = {
	/** χ² calculé, ou null si une des deux fenêtres est vide. */
	chi2: number | null;
	seuil: number;
	alerte: boolean;
	/** Faux si une fenêtre est trop pauvre : le score existe mais n'est pas publié. */
	fiable: boolean;
	effectifs: { recent: number; reference: number };
	/** Trié par contribution décroissante : le premier secteur explique l'alerte. */
	parSecteur: ContributionSecteur[];
};

/** Copie une distribution en objet sans prototype, en écartant les comptages invalides. */
function nettoyer(distribution: DistributionSecteurs): Record<string, number> {
	const propre: Record<string, number> = Object.create(null);
	for (const [secteur, n] of Object.entries(distribution)) {
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
 * Lissage add-one sur la référence : un secteur apparu récemment mais absent
 * de la référence aurait un attendu nul, donc un χ² infini. Le prior évite le
 * déni de division par zéro sans inventer d'alerte sur un effectif trop faible.
 */
export function detecterRuptureSecteur(input: {
	recente: DistributionSecteurs;
	reference: DistributionSecteurs;
	/** Seuil de χ² au-delà duquel on alerte ; remplace SEUIL_CHI2. */
	seuil?: number;
}): ResultatRuptureSecteur {
	const seuil = input.seuil ?? SEUIL_CHI2;
	const recente = nettoyer(input.recente);
	const reference = nettoyer(input.reference);
	const secteurs = [...new Set([...Object.keys(recente), ...Object.keys(reference)])].sort();
	const effectifs = { recent: total(recente), reference: total(reference) };

	const vide: ResultatRuptureSecteur = {
		chi2: null,
		seuil,
		alerte: false,
		fiable: false,
		effectifs,
		parSecteur: [],
	};
	if (effectifs.recent === 0 || effectifs.reference === 0 || secteurs.length === 0) return vide;

	const taille = secteurs.length;
	let chi2 = 0;
	const parSecteur = secteurs.map((secteur) => {
		const observe = recente[secteur] ?? 0;
		const attendu = ((reference[secteur] ?? 0) + 1) * effectifs.recent / (effectifs.reference + taille);
		const residu = (observe - attendu) / Math.sqrt(attendu);
		const contribution = residu * residu;
		chi2 += contribution;
		return { secteur, observe, attendu, residu, contribution };
	});
	parSecteur.sort((a, b) => b.contribution - a.contribution);

	const fiable = effectifs.recent >= EFFECTIF_MIN && effectifs.reference >= EFFECTIF_MIN;
	return {
		chi2,
		seuil,
		alerte: fiable && chi2 > seuil,
		fiable,
		effectifs,
		parSecteur,
	};
}
