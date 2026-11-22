/**
 * Courbe précision/rappel et choix de seuil par règle.
 *
 * Fonctions pures : aucune base, aucun réseau. Le holdout est une liste
 * d'observations déjà mesurées (une alerte = un candidat, `positive` vient
 * des verdicts `false_event` enregistrés). Le score est celui que le moteur
 * peut recalculer à l'exécution : note de confiance de l'alerte, majorée de
 * 30 quand un ancrage Nouvelle-Aquitaine est observable.
 *
 * Le seuil retenu est le plus élevé qui satisfait précision >= 0,85 et
 * rappel >= 0,60 — donc le moins d'alertes possible sans perdre plus de
 * 40 % des incidents confirmés de la fenêtre.
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

export function ruleScore(baseScore: number | null | undefined, hasNaAnchor: boolean): number {
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
