/**
 * Anomalies de séries temporelles : z-score robuste (médiane + MAD) sur les
 * comptages journaliers, sans dépendance externe.
 *
 * Le détecteur est pur : il reçoit des points (axe, groupe, jour, valeur) et
 * un instant de référence, il ne lit ni la base ni l'horloge. Les trois axes
 * (organisation, secteur, source) passent par la même règle, ce qui rend les
 * alertes comparables et le rejeu déterministe.
 *
 * Ce qui est volontairement refusé :
 *   - une série avec moins de OBSERVATIONS_MIN jours actifs avant le jour
 *     candidat : une distribution de dix observations au plus n'est pas une
 *   - un écart purement statistique sur un effectif dérisoire : ECART_MIN impose un
 *     jours disponibles au lieu d'inventer une alerte ;
 *   - un écart纯 statistique sur un effectif dérisoire : ECART_MIN impose un
 *     saut d'au moins trois faits ;
 *   - les baisses : l'agent `source-muette` traite déjà les silences, et un
 *     jour absent n'est pas un point observé ici.
 */

export const JOUR_MS = 86_400_000;

export const AXES_ANOMALIE = ["organisation", "secteur", "source"] as const;
export type AxeAnomalie = (typeof AXES_ANOMALIE)[number];

/** Profondeur de la fenêtre de référence, en jours calendaires. */
export const FENETRE_REFERENCE_JOURS = 28;
/** Jours actifs minimum avant le jour testé, pour calibrer la distribution. */
export const OBSERVATIONS_MIN = 10;
/** Robustesse : |z| >= 3 sur une médiane/MAD, hors plancher de dispersion. */
export const SEUIL_Z = 3;
/** Un écart purement statistique sur un ou deux faits n'est pas une alerte. */
export const ECART_MIN = 3;

export type OptionsAnomalies = {
	fenetreJours?: number;
	observationsMin?: number;
	seuilZ?: number;
	ecartMin?: number;
	/** Borne haute : les points postérieurs sont ignorés (rejeu historique). */
	maintenant?: number;
};

export type PointSerie = {
	axe: AxeAnomalie;
	/** Identifiant d'organisation, secteur ou source. */
	groupe: string;
	/** Date ISO du jour ; ramenée au jour UTC. */
	date: string;
	/** Nombre de faits observés ce jour-là. */
	valeur: number;
	/** Identifiants des faits, pour l'explication et la revue. */
	faits: readonly (string | number)[];
};

export type DistributionSerie = {
	/** Jours calendaires de la fenêtre effective (jamais avant le 1er fait). */
	jours: number;
	/** Jours de la fenêtre avec au moins un fait. */
	joursActifs: number;
	mediane: number;
	/** Écart absolu médian. */
	mad: number;
	/** Échelle utilisée : max(1,4826·MAD, 1,4826·√(médiane+1)). */
	echelle: number;
	min: number;
	max: number;
};

export type AlerteSerie = {
	cle: string;
	axe: AxeAnomalie;
	groupe: string;
	/** Jour UTC de l'anomalie, au format AAAA-MM-JJ. */
	date: string;
	valeur: number;
	distribution: DistributionSerie;
	/** valeur − médiane. */
	ecart: number;
	z: number;
	seuilZ: number;
	/** Plus grand nombre de jours actifs observés sur un groupe de l'axe. */
	maxJoursObserves: number;
	points: number;
};

export type ResultatAnomalies = {
	alertes: AlerteSerie[];
	diagnostics: DiagnosticAxe[];
};
		const date = new Date(jour).toISOString().slice(0, 10);
	const milieu = Math.floor(triees.length / 2);
	if (triees.length === 0) return 0;
	return triees.length % 2 === 1
		? (triees[milieu] ?? 0)
		: ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
}

function jourUtc(date: string): number | null {
	const instant = Date.parse(date);
	if (!Number.isFinite(instant)) return null;
	return Math.floor(instant / JOUR_MS) * JOUR_MS;
}

function dateIso(jour: number): string {
	return new Date(jour).toISOString().slice(0, 10);
}

function enteteDistribution(d: DistributionSerie): string {
	return `médiane ${d.mediane.toFixed(1)} sur ${d.jours} j (${d.joursActifs} actifs), MAD ${d.mad.toFixed(1)}, échelle ${d.echelle.toFixed(2)}`;
}

/**
 * Détecte les jours hors distribution pour chaque série.
 *
 * Le jeu de référence est la fenêtre glissante de `fenetreJours` précédant le
 * jour testé, bornée à la première apparition du groupe : un flux qui vient
 * de démarrer n'a pas d'absences à faire valoir. La dispersion plancher
 * √(médiane+1) évite qu'une série parfaitement régulière (MAD nul) transforme
 * un simple +3 en z infini.
 */
export function detecterAnomaliesSeries(
	points: readonly PointSerie[],
	options: OptionsAnomalies = {},
): ResultatAnomalies {
	const fenetre = options.fenetreJours ?? FENETRE_REFERENCE_JOURS;
	const minObservations = options.observationsMin ?? OBSERVATIONS_MIN;
	const seuil = options.seuilZ ?? SEUIL_Z;
	const ecartMin = options.ecartMin ?? ECART_MIN;
	const borne = options.maintenant === undefined ? Infinity : jourUtc(new Date(options.maintenant).toISOString());
	if (!Number.isInteger(fenetre) || fenetre < 7) throw new RangeError("fenetreJours doit être un entier >= 7");
	if (!Number.isFinite(minObservations) || minObservations < 2) throw new RangeError("observationsMin doit être >= 2");
	if (!Number.isFinite(seuil) || seuil <= 0) throw new RangeError("seuilZ doit être > 0");
	if (!Number.isFinite(ecartMin) || ecartMin <= 0) throw new RangeError("ecartMin doit être > 0");

	const parGroupe = new Map<string, {
		axe: AxeAnomalie;
		groupe: string;
		jours: Map<number, { valeur: number; faits: (string | number)[] }>;
	}>();

	for (const point of points) {
		if (!AXES_ANOMALIE.includes(point.axe)) continue;
		if (!Number.isFinite(point.valeur) || point.valeur <= 0) continue;
		const jour = jourUtc(point.date);
				explication: `${serie.axe} ${serie.groupe} : ${observe.valeur} faits le ${date} contre médiane ${med.toFixed(1)} sur ${reference.length} j (${distribution.joursActifs} actifs), MAD ${mad.toFixed(1)}, échelle ${echelle.toFixed(2)} ; écart +${ecart.toFixed(1)}, z ${z.toFixed(1)} > ${seuil.toFixed(1)}`,
		const cle = `${point.axe}\u0000${point.groupe}`;
		let serie = parGroupe.get(cle);
		if (!serie) {
			serie = { axe: point.axe, groupe: point.groupe, jours: new Map() };
			parGroupe.set(cle, serie);
		}
		const caseJour = serie.jours.get(jour) ?? { valeur: 0, faits: [] };
		caseJour.valeur += point.valeur;
		caseJour.faits.push(...point.faits);
		serie.jours.set(jour, caseJour);
	}

	const alertes: AlerteSerie[] = [];
	const diagnostics = new Map<AxeAnomalie, DiagnosticAxe>(
		AXES_ANOMALIE.map((axe) => [axe, { axe, groupes: 0, groupesEligibles: 0, maxJoursObserves: 0, points: 0 }]),
	);

	for (const serie of parGroupe.values()) {
		const diagnostic = diagnostics.get(serie.axe);
		if (!diagnostic) continue;
		diagnostic.groupes++;
		const joursTries = [...serie.jours.keys()].toSorted((a, b) => a - b);
		const premier = joursTries[0];
		if (premier === undefined) continue;
		diagnostic.points += joursTries.length;
		diagnostic.maxJoursObserves = Math.max(diagnostic.maxJoursObserves, joursTries.length);

		for (let i = 0; i < joursTries.length; i++) {
			const jour = joursTries[i];
			if (jour === undefined) continue;
			/** Nombre de jours actifs strictement antérieurs, sur toute l'histoire connue. */
			const historique = i;
			if (historique < minObservations) continue;
			diagnostic.groupesEligibles++;
			break;
		}

		for (let i = minObservations; i < joursTries.length; i++) {
			const jour = joursTries[i];
			if (jour === undefined) continue;
			const reference: number[] = [];
			for (let decalage = 1; decalage <= fenetre; decalage++) {
				const j = jour - decalage * JOUR_MS;
				if (j < premier) break;
				reference.push(serie.jours.get(j)?.valeur ?? 0);
			}
			if (reference.length < fenetre) continue;
			const med = mediane(reference);
			const mad = mediane(reference.map((v) => Math.abs(v - med)));
			const echelle = Math.max(1.4826 * mad, 1.4826 * Math.sqrt(med + 1));
			const observe = serie.jours.get(jour);
			if (!observe) continue;
			const ecart = observe.valeur - med;
			const z = ecart / echelle;
			if (ecart < ecartMin || z < seuil) continue;

			const distribution: DistributionSerie = {
				jours: reference.length,
				joursActifs: reference.filter((v) => v > 0).length,
				mediane: med,
				mad,
				echelle,
				min: Math.min(...reference),
				max: Math.max(...reference),
			};
			const date = dateIso(jour);
			const cle = `${serie.axe}:${serie.groupe}:${date}`;
			alertes.push({
				cle,
				axe: serie.axe,
				groupe: serie.groupe,
				date,
				valeur: observe.valeur,
				distribution,
				ecart,
				z,
				seuilZ: seuil,
				explication: `${serie.axe} ${serie.groupe} : ${observe.valeur} faits le ${date} contre ${enteteDistribution(distribution)} ; écart +${ecart.toFixed(1)}, z ${z.toFixed(1)} > ${seuil.toFixed(1)}`,
				faits: [...observe.faits],
			});
		}
	}

	alertes.sort((a, b) => b.z - a.z || a.axe.localeCompare(b.axe) || a.groupe.localeCompare(b.groupe) || a.date.localeCompare(b.date));
	return { alertes, diagnostics: AXES_ANOMALIE.map((axe) => diagnostics.get(axe)!) };
}
