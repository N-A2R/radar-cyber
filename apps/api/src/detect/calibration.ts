/**
 * Courbe précision/rappel et choix de seuil par règle.
 *
 * Fonctions pures : aucune base, aucun réseau. Le holdout est une liste
 * d'observations déjà mesurées (une alerte = un candidat, `positive` vient
 * des verdicts `false_event` enregistrés). Le score observé est la note de
 * confiance **non majorée** : c'est l'échelle comparée aux seuils de règle à
 * l'exécution. La majoration d'ancrage Nouvelle-Aquitaine ne sert qu'à la
 * porte globale.
 *
 * Le seuil retenu est le plus élevé qui satisfait précision >= 0,85 et
 * rappel >= 0,60 — donc le moins d'alertes possible sans perdre plus de
 * 40 % des alertes vraies déjà émises. Une règle observée mais sans seuil
 * qualifiant est signalée, jamais dotée d'un seuil inventé.
 */

export type CalibrationObservation = {
	/** Identifiant de l'alerte, uniquement pour le rapport. */
	id?: string;
	score: number;
	positive: boolean;
};

export type CalibrationPoint = {
	threshold: number;
	precision: number;
	recall: number;
	alerts: number;
	tp: number;
	fp: number;
	fn: number;
};

export const MIN_PRECISION = 0.85;
export const MIN_RECALL = 0.6;

/** Majoration d'un ancrage régional observable (org_id ou regional). */
export const NA_ANCHOR_BONUS = 30;

/** Seuil de revue historique, utilisé quand une règle n'a aucune observation. */
export const DEFAULT_THRESHOLD = 65;

/** Score de la porte globale : note de confiance + majoration d'ancrage. */
export function calibratedScore(baseScore: number | null | undefined, hasNaAnchor: boolean): number {
	const base = Number.isFinite(baseScore) ? Number(baseScore) : 0;
	return base + (hasNaAnchor ? NA_ANCHOR_BONUS : 0);
}

/** Balaye les seuils et calcule précision/rappel/alertes à chaque point. */
export function precisionRecallCurve(
	observations: readonly CalibrationObservation[],
	thresholds: readonly number[],
): CalibrationPoint[] {
	const positives = observations.filter((o) => o.positive);
	const totalPositives = positives.length;
	return thresholds.map((threshold) => {
		let tp = 0;
		let fp = 0;
		for (const o of observations) {
			if (!Number.isFinite(o.score) || o.score < threshold) continue;
			if (o.positive) tp += 1;
			else fp += 1;
		}
		const alerts = tp + fp;
		const fn = totalPositives - tp;
		return {
			threshold,
			precision: alerts === 0 ? 0 : tp / alerts,
			recall: totalPositives === 0 ? 0 : tp / totalPositives,
			alerts,
			tp,
			fp,
			fn,
		};
	});
}

/**
 * Retourne le point de la courbe qui garde le moins d'alertes tout en
 * respectant les deux contraintes. `null` signifie qu'aucun seuil ne qualifie
 * la règle — le script de mesure le signale au lieu d'inventer un chiffre.
 */
export function chooseThreshold(
	curve: readonly CalibrationPoint[],
	minPrecision = MIN_PRECISION,
	minRecall = MIN_RECALL,
): CalibrationPoint | null {
	const eligible = curve
		.filter((p) => p.precision >= minPrecision && p.recall >= minRecall)
		.sort((a, b) => b.threshold - a.threshold || a.alerts - b.alerts);
	return eligible[0] ?? null;
}

/**
 * Règle sans observation sur la fenêtre : seuil inchangé, aucune alerte
 * supprimée, aucune perte d'incident confirmé. Les métriques sont celles
 * d'une décision vacante (1/1), pas une mesure statistique ; le champ `source`
 * de la table SQL porte la mention `sans-observation`.
 */
export function noObservationPoint(threshold = DEFAULT_THRESHOLD): CalibrationPoint {
	return { threshold, precision: 1, recall: 1, alerts: 0, tp: 0, fp: 0, fn: 0 };
}

/**
 * Objectif déclaré du chantier, mesuré depuis l'artefact publié (aucune base,
 * aucun réseau). Le holdout est le nombre réel d'alertes observé lors de la
 * mesure ; l'artefact reste la source de vérité, cette constante n'est qu'un
 * repli.
 */
export const HOLDOUT_INITIAL_ALERTES = 1607;
export const REGLES_ACTIVES = 8;
export const PERTE_MAXIMALE = 0.4;

export type StatutMesureRegle = "mesure" | "sans-seuil-qualifiant" | "sans-observation";

export type MesureRegleObjectif = {
	ruleId: string;
	statut: StatutMesureRegle;
	precision: number | null;
	recall: number | null;
	/** Alertes conservées ; égales aux alertes observées quand aucun seuil n'est appliqué. */
	alerts: number;
	/** Alertes réellement observées pour cette règle sur la fenêtre. */
	observedAlerts: number;
	/** Alertes vraies observées, d'après les verdicts déjà enregistrés. */
	positives: number;
	/** Alertes vraies conservées ; égales à positives sans seuil appliqué. */
	conservedPositives: number;
};

export type ObjectifCalibration = {
	alertes: number;
	holdout: number;
	horsPerimetre: number;
	qualifiantes: number;
	regles: number;
	sansSeuilQualifiant: number;
	sansObservation: number;
	positifs: number;
	conserves: number;
	perte: number;
	partPerte: number;
	atteint: boolean;
	ligne: string;
};

const grouper = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const pourcent = (n: number): string => `${(n * 100).toFixed(2).replace(".", ",")} %`;

/**
 * Mesure l'objectif depuis l'artefact : alertes conservées sur l'ensemble du
 * holdout (y compris les règles hors périmètre, laissées intactes), perte
 * d'alertes vraies sur les seules règles observées, et qualification par règle.
 */
export function mesurerObjectifCalibration(
	mesures: readonly MesureRegleObjectif[],
	holdout = HOLDOUT_INITIAL_ALERTES,
): ObjectifCalibration {
	const observees = mesures.reduce((n, m) => n + m.observedAlerts, 0);
	const horsPerimetre = Math.max(0, holdout - observees);
	const alertes = mesures.reduce((n, m) => n + m.alerts, 0) + horsPerimetre;
	const qualifiantes = mesures.filter(
		(m) => m.statut === "mesure" && m.precision !== null && m.recall !== null
			&& m.precision >= MIN_PRECISION && m.recall >= MIN_RECALL,
	).length;
	const sansSeuilQualifiant = mesures.filter((m) => m.statut === "sans-seuil-qualifiant").length;
	const sansObservation = mesures.filter((m) => m.statut === "sans-observation").length;
	const positifs = mesures.reduce((n, m) => n + m.positives, 0);
	const conserves = mesures.reduce((n, m) => n + m.conservedPositives, 0);
	const perte = positifs - conserves;
	const partPerte = positifs === 0 ? 0 : perte / positifs;
	const regles = mesures.length;
	const atteint = regles === REGLES_ACTIVES && qualifiantes === REGLES_ACTIVES
		&& alertes < holdout && partPerte <= PERTE_MAXIMALE;
	const valeur = `${grouper(alertes)} alertes conservées sur ${grouper(holdout)}, ` +
		`${grouper(perte)}/${grouper(positifs)} alertes vraies supprimées (${pourcent(partPerte)})`;
	const cible = `< ${grouper(holdout)} alertes et ≤ 40 % de perte, avec ` +
		`${REGLES_ACTIVES}/${REGLES_ACTIVES} règles qualifiant (précision ≥ 0,85, rappel ≥ 0,60)`;
	const manques: string[] = [];
	if (sansSeuilQualifiant > 0) {
		manques.push(`${sansSeuilQualifiant} ${sansSeuilQualifiant === 1 ? "règle" : "règles"} sans seuil qualifiant`);
	}
	if (sansObservation > 0) {
		manques.push(`${sansObservation} ${sansObservation === 1 ? "règle" : "règles"} sans observation`);
	}
	if (qualifiantes + sansSeuilQualifiant + sansObservation < REGLES_ACTIVES) {
		manques.push(`${REGLES_ACTIVES - qualifiantes - sansSeuilQualifiant - sansObservation} règles absentes du relevé`);
	}
	if (alertes >= holdout) manques.push(`${grouper(alertes - holdout + 1)} alertes à retirer`);
	if (partPerte > PERTE_MAXIMALE) manques.push(`${pourcent(partPerte - PERTE_MAXIMALE)} de perte superflue`);
	if (manques.length === 0) manques.push("mesure incomplète");
	const ligne = atteint
		? `OBJECTIF : atteint — ${valeur} / ${cible}`
		: `OBJECTIF : partiel — ${valeur} / ${cible}, manque ${manques.join(", ")}`;
	return {
		alertes, holdout, horsPerimetre, qualifiantes, regles,
		sansSeuilQualifiant, sansObservation, positifs, conserves, perte, partPerte, atteint, ligne,
	};
}

/** La déclaration publiée doit être exacte et unique, jamais une variante périmée. */
export function verifierDeclarationObjectifCalibration(rapport: string, ligne: string): boolean {
	return rapport.split(/\r?\n/).filter((publiee) => publiee === ligne).length === 1;
}
