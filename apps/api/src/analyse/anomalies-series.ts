/**
 * Anomalies de séries temporelles : z-score robuste (médiane + MAD) sur les
 * comptages journaliers, publié par un contrôle FDR en ligne.
 *
 * Le z robuste reste la preuve portée par chaque hypothèse, mais il ne décide
 * plus seul : chaque fenêtre éligible devient un test dont la p-value alimente
 * `ControleFdrEnLigne`. Une alerte n'est publiée que si le budget d'erreur
 * séquentiel (LOND) accepte le test, ce qui borne le taux de fausses
 * découvertes sur le flux à `fdrCible` (5 % par défaut).
 *
 * Le détecteur est pur : il reçoit des points (axe, groupe, jour, valeur) et
 * une borne temporelle, il ne lit ni la base ni l'horloge. Les trois axes
 * (organisation, secteur, source) passent par la même règle, ce qui rend les
 * alertes comparables et le rejeu déterministe.
 *
 * Ce qui est volontairement refusé :
 *   - une fenêtre avec moins de OBSERVATIONS_MIN jours actifs : une
 *     distribution calibrée sur des souvenirs lointains n'est pas une
 *     distribution habituelle ;
 *   - une fenêtre incomplète : un flux qui vient de démarrer n'a pas
 *     d'absences à faire valoir ;
 *   - un écart purement statistique sur un effectif dérisoire : ECART_MIN
 *     impose un saut d'au moins trois faits, même quand le FDR accepte ;
 *   - les baisses : l'agent `source-muette` traite déjà les silences, et un
 *     jour absent n'est pas un point observé ici. Elles restent dans le flux
 *     de tests (p-value à queue droite proche de 1) pour ne pas fausser le rang.
 */
import { mediane } from "./mediane.js";
import {
	ControleFdrEnLigne,
	FDR_CIBLE,
	pValueZ,
	type DecisionFdr,
} from "./online-fdr.js";

export const JOUR_MS = 86_400_000;
export const AXES_ANOMALIE = ["organisation", "secteur", "source"] as const;
export type AxeAnomalie = (typeof AXES_ANOMALIE)[number];

/** Profondeur de la fenêtre de référence, en jours calendaires. */
export const FENETRE_REFERENCE_JOURS = 28;
/** Jours actifs minimum dans la fenêtre de référence, pour calibrer la distribution. */
export const OBSERVATIONS_MIN = 10;
/** Un écart purement statistique sur un ou deux faits n'est pas une alerte. */
export const ECART_MIN = 3;

export type OptionsAnomalies = {
	fenetreJours?: number;
	observationsMin?: number;
	ecartMin?: number;
	/** Taux de fausses découvertes visé sur le flux (défaut : 5 %). */
	fdrCible?: number;
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
	/** Échelle utilisée : max(1.4826·MAD, 1.4826·√(médiane+1)). */
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
	/** Décision du contrôle FDR en ligne qui a publié cette alerte. */
	fdr: DecisionFdr;
	/** Plus grand nombre de jours actifs observés sur un groupe de l'axe. */
	maxJoursObserves: number;
	/** Nombre de jours actifs observés sur l'axe entier. */
	points: number;
	explication: string;
	faits: readonly (string | number)[];
};

export type DiagnosticAxe = {
	axe: AxeAnomalie;
	groupes: number;
	/** Groupes avec au moins une fenêtre complète et assez d'observations pour tester. */
	groupesEligibles: number;
	maxJoursObserves: number;
	points: number;
};

export type ResultatAnomalies = {
	alertes: AlerteSerie[];
	diagnostics: DiagnosticAxe[];
};

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

/** Hypothèse mise dans le flux : tout ce qu'il faut pour décider puis expliquer. */
type Hypothese = {
	cle: string;
	axe: AxeAnomalie;
	groupe: string;
	date: string;
	jour: number;
	valeur: number;
	distribution: DistributionSerie;
	ecart: number;
	z: number;
	p: number;
	maxJoursObserves: number;
	points: number;
	faits: (string | number)[];
};

/**
 * Détecte les jours hors distribution pour chaque série.
 *
 * Le jeu de référence est la fenêtre glissante de `fenetreJours` précédant le
 * jour testé, bornée à la première apparition du groupe. La dispersion
 * plancher √(médiane+1) évite qu'une série parfaitement régulière (MAD nul)
 * transforme un simple +3 en z infini.
 */
export function detecterAnomaliesSeries(
	points: readonly PointSerie[],
	options: OptionsAnomalies = {},
): ResultatAnomalies {
	const fenetre = options.fenetreJours ?? FENETRE_REFERENCE_JOURS;
	const minObservations = options.observationsMin ?? OBSERVATIONS_MIN;
	const ecartMin = options.ecartMin ?? ECART_MIN;
	const cible = options.fdrCible ?? FDR_CIBLE;
	const borne = options.maintenant === undefined ? Infinity : jourUtc(new Date(options.maintenant).toISOString());
	if (borne === null) throw new RangeError("maintenant doit être un instant valide");
	if (!Number.isInteger(fenetre) || fenetre < 7) throw new RangeError("fenetreJours doit être un entier >= 7");
	if (!Number.isFinite(minObservations) || minObservations < 2) throw new RangeError("observationsMin doit être >= 2");
	if (!Number.isFinite(ecartMin) || ecartMin <= 0) throw new RangeError("ecartMin doit être > 0");
	if (!Number.isFinite(cible) || cible <= 0 || cible >= 1) throw new RangeError("fdrCible doit être dans (0, 1)");

	const parGroupe = new Map<string, {
		axe: AxeAnomalie;
		groupe: string;
		jours: Map<number, { valeur: number; faits: (string | number)[] }>;
	}>();

	for (const point of points) {
		if (!AXES_ANOMALIE.includes(point.axe)) continue;
		if (!Number.isFinite(point.valeur) || point.valeur <= 0) continue;
		const jour = jourUtc(point.date);
		if (jour === null || jour > borne) continue;
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

	const hypotheses: Hypothese[] = [];
	const diagnostics = new Map<AxeAnomalie, DiagnosticAxe>(
		AXES_ANOMALIE.map((axe) => [axe, { axe, groupes: 0, groupesEligibles: 0, maxJoursObserves: 0, points: 0 }]),
	);

	for (const serie of parGroupe.values()) {
		const diagnostic = diagnostics.get(serie.axe);
		if (!diagnostic) continue;
		diagnostic.groupes++;
		const joursTries = [...serie.jours.keys()].sort((a, b) => a - b);
		const premier = joursTries[0];
		if (premier === undefined) continue;
		diagnostic.points += joursTries.length;
		diagnostic.maxJoursObserves = Math.max(diagnostic.maxJoursObserves, joursTries.length);
		let eligible = false;

		for (let i = 0; i < joursTries.length; i++) {
			const jour = joursTries[i];
			if (jour === undefined) continue;
			const reference: number[] = [];
			for (let decalage = 1; decalage <= fenetre; decalage++) {
				const j = jour - decalage * JOUR_MS;
				if (j < premier) break;
				reference.push(serie.jours.get(j)?.valeur ?? 0);
			}
			if (reference.length < fenetre) continue;
			const joursActifs = reference.filter((v) => v > 0).length;
			if (joursActifs < minObservations) continue;
			if (!eligible) {
				diagnostic.groupesEligibles++;
				eligible = true;
			}
			const med = mediane(reference);
			if (med === null) continue;
			const mad = mediane(reference.map((v) => Math.abs(v - med))) ?? 0;
			const echelle = Math.max(1.4826 * mad, 1.4826 * Math.sqrt(med + 1));
			const observe = serie.jours.get(jour);
			if (!observe) continue;
			const ecart = observe.valeur - med;
			const z = ecart / echelle;
			const date = dateIso(jour);
			hypotheses.push({
				cle: `${serie.axe}:${serie.groupe}:${date}`,
				axe: serie.axe,
				groupe: serie.groupe,
				date,
				jour,
				valeur: observe.valeur,
				distribution: {
					jours: reference.length,
					joursActifs,
					mediane: med,
					mad,
					echelle,
					min: Math.min(...reference),
					max: Math.max(...reference),
				},
				ecart,
				z,
				p: pValueZ(z),
				maxJoursObserves: diagnostic.maxJoursObserves,
				points: diagnostic.points,
				faits: [...observe.faits],
			});
		}
	}

	// Le flux est testé dans l'ordre où il arrive — jour, puis clé stable — et
	// jamais trié par z : le contrôle séquentiel ne voit pas le futur. Les
	// baisses restent dans le flux avec une p-value proche de 1 : elles
	// consomment leur rang sans jamais devenir une découverte.
	hypotheses.sort((a, b) => a.jour - b.jour || a.cle.localeCompare(b.cle));
	const controle = new ControleFdrEnLigne(cible);
	const alertes: AlerteSerie[] = [];
	for (const h of hypotheses) {
		const fdr = controle.tester(h.p);
		if (!fdr.rejette || h.ecart < ecartMin) continue;
		alertes.push({
			cle: h.cle,
			axe: h.axe,
			groupe: h.groupe,
			date: h.date,
			valeur: h.valeur,
			distribution: h.distribution,
			ecart: h.ecart,
			z: h.z,
			fdr,
			maxJoursObserves: h.maxJoursObserves,
			points: h.points,
			explication: `${h.axe} ${h.groupe} : ${h.valeur} faits le ${h.date} contre ${enteteDistribution(h.distribution)} ; écart +${h.ecart.toFixed(1)}, z ${h.z.toFixed(1)}, p ${h.p.toExponential(2)} ≤ seuil ${fdr.seuil.toExponential(2)} (FDR ${(cible * 100).toFixed(0)} %)`,
			faits: h.faits,
		});
	}

	alertes.sort((a, b) => b.z - a.z || a.axe.localeCompare(b.axe) || a.groupe.localeCompare(b.groupe) || a.date.localeCompare(b.date));
	return { alertes, diagnostics: AXES_ANOMALIE.map((axe) => diagnostics.get(axe)!) };
}
