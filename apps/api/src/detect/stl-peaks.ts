/**
 * Détection de pics de volume par famille à partir d'une décomposition STL.
 *
 * Une série quotidienne (un point par jour, zéros compris) est notée en
 * fenêtre glissante : à chaque jour, STL estime la saison hebdomadaire et la
 * tendance sur les `windowDays` derniers jours, et le reste du jour est
 * rapporté à l'échelle robuste de la fenêtre. Le score est donc un z robuste
 * du départ, comparable entre une famille à 2 faits/jour et une famille à
 * 200 faits/jour.
 *
 * Garde-fou de fraîcheur : un lot collecté des semaines après coup est un
 * import historique, pas une activité. Quand la part de preuves collectées
 * dans le délai habituel tombe sous la moitié, le score est divisé — le pic
 * reste visible, mais il ne passe plus devant un vrai départ d'activité.
 *
 * Le module est pur : aucune base, aucune horloge. L'évaluation (PR-AUC,
 * délais) vit ici aussi pour que le backtest et le détecteur partagent
 * exactement la même définition de « détecté ».
 */
import { DAY_MS as FRESHNESS_DAY_MS, DEFAULT_MIN_FRESH_SHARE } from "../analyse/evidence-freshness.js";
import { median, robustScale, stl } from "./stl.js";

export const DEFAULT_PERIOD = 7;
/** Profondeur de la fenêtre glissante : huit semaines, de quoi estimer la saison. */
export const DEFAULT_WINDOW_DAYS = 56;
/** Seuil de z robuste ; calibré à priori, jamais sur les étiquettes du backtest. */
export const DEFAULT_THRESHOLD = 4.5;
/** Un pic est détecté si l'alerte part au plus tard le lendemain du pic. */
export const DEFAULT_MAX_DELAY_DAYS = 1;
/** Plancher d'échelle (log) : une série parfaitement plate ne donne pas z = ∞. */
export const SCORE_FLOOR = 0.08;
/** Un lot dont moins de la moitié des preuves est fraîche est un import. */
export const FRESHNESS_FLOOR = DEFAULT_MIN_FRESH_SHARE;
/** Multiplicateur appliqué aux jours d'import : le pic perd son rang d'alerte. */
export const FRESHNESS_PENALTY = 0.1;

export type SeriesPoint = {
	/** Jour UTC au format AAAA-MM-JJ. */
	day: string;
	/** Volume du jour, zéros compris. */
	count: number;
	/** Preuves collectées dans `DEFAULT_MAX_LAG_DAYS` jours. */
	fresh: number;
};

export type ScoredDay = {
	family: string;
	day: string;
	count: number;
	/** z robuste du reste STL, après garde-fou de fraîcheur. */
	score: number;
	remainder: number;
	scale: number;
	freshShare: number;
	guarded: boolean;
};

export type StlScoringOptions = {
	period?: number;
	windowDays?: number;
	seasonalWindow?: number;
	trendWindow?: number;
	outer?: number;
	minFreshShare?: number;
	freshnessPenalty?: number;
	scoreFloor?: number;
};

export type PeakAnnotation = {
	family: string;
	day: string;
};

export type PeakEvaluationRow = {
	family: string;
	day: string;
	score: number;
	label: boolean;
	tp: boolean;
	detectedOn: string | null;
	delayDays: number | null;
};

export type PeakEvaluationOptions = {
	threshold?: number;
	maxDelayDays?: number;
};

export type PeakEvaluation = {
	rows: PeakEvaluationRow[];
	detected: number;
	annotated: number;
	falsePositives: number;
	medianDelayDays: number | null;
	averageDelayDays: number | null;
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Jour UTC normalisé ; refuse une date qui ne serait pas exactement un jour. */
export function parseDay(day: string): number {
	if (!DAY_PATTERN.test(day)) throw new RangeError(`jour invalide : ${day} (attendu AAAA-MM-JJ)`);
	const instant = Date.parse(`${day}T00:00:00Z`);
	if (!Number.isFinite(instant)) throw new RangeError(`jour invalide : ${day}`);
	return instant;
}

export function formatDay(instant: number): string {
	return new Date(instant).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
	if (!Number.isInteger(delta)) throw new RangeError("delta doit être un entier");
	return formatDay(parseDay(day) + delta * FRESHNESS_DAY_MS);
}

export function daysBetween(from: string, to: string): number {
	return Math.round((parseDay(to) - parseDay(from)) / FRESHNESS_DAY_MS);
}

function freshnessShare(point: SeriesPoint): number {
	if (!Number.isFinite(point.count) || point.count <= 0) return 0;
	const fresh = Number.isFinite(point.fresh) ? Math.max(0, Math.min(point.fresh, point.count)) : 0;
	// Le délai de collecte est déjà appliqué par l'appelant (requête SQL ou
	// fixture) au comptage `fresh`.
	return fresh / point.count;
}

/**
 * Note chaque jour à partir de `windowDays` points. Les jours antérieurs à la
 * fenêtre complète ne reçoivent aucun score : une saison estimée sur trois
 * jours n'est pas une saison.
 */
export function scoreFamilySeries(
	family: string,
	points: readonly SeriesPoint[],
	options: StlScoringOptions = {},
): ScoredDay[] {
	const period = options.period ?? DEFAULT_PERIOD;
	const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
	const seasonalWindow = options.seasonalWindow ?? 13;
	const trendWindow = options.trendWindow ?? 21;
	const outer = options.outer ?? 5;
	const minFreshShare = options.minFreshShare ?? FRESHNESS_FLOOR;
	const penalty = options.freshnessPenalty ?? FRESHNESS_PENALTY;
	const scoreFloor = options.scoreFloor ?? SCORE_FLOOR;
	if (!Number.isInteger(windowDays) || windowDays < 2 * period + 2) {
		throw new RangeError(`windowDays doit être un entier >= ${2 * period + 2}`);
	}
	if (!Number.isFinite(minFreshShare) || minFreshShare <= 0 || minFreshShare > 1) {
		throw new RangeError("minFreshShare doit être dans (0, 1]");
	}
	if (!Number.isFinite(penalty) || penalty <= 0 || penalty > 1) {
		throw new RangeError("freshnessPenalty doit être dans (0, 1]");
	}
	if (points.length < windowDays) return [];

	const days = points.map((p) => parseDay(p.day));
	for (let i = 1; i < days.length; i++) {
		if ((days[i] ?? 0) <= (days[i - 1] ?? 0)) throw new RangeError("les points doivent être triés par jour croissant et uniques");
	}

	const logCounts = points.map((p) => Math.log1p(Math.max(0, p.count)));
	const scored: ScoredDay[] = [];
	for (let end = windowDays - 1; end < points.length; end++) {
		const start = end - windowDays + 1;
		const window = logCounts.slice(start, end + 1);
		const decomposition = stl(window, { period, seasonalWindow, trendWindow, outer });
		const remainder = decomposition.remainder;
		const last = remainder[remainder.length - 1] ?? 0;
		const scale = robustScale(remainder, scoreFloor);
		const share = freshnessShare(points[end]!);
		const guarded = share < minFreshShare;
		const raw = Math.max(0, last / scale);
		scored.push({
			family,
			day: points[end]!.day,
			count: points[end]!.count,
			score: guarded ? raw * penalty : raw,
			remainder: last,
			scale,
			freshShare: share,
			guarded,
		});
	}
	return scored;
}

/**
 * Average precision (PR-AUC usuelle, identique à `average_precision_score`).
 * Les ex æquo sont départagés par l'étiquette puis par l'ordre d'entrée, pour
 * que le résultat ne dépende pas du tri du moteur.
 */
export function averagePrecision(labels: readonly boolean[], scores: readonly number[]): number {
	if (labels.length !== scores.length) throw new RangeError("labels et scores doivent avoir la même longueur");
	const positives = labels.filter(Boolean).length;
	if (positives === 0) return 0;
	const ranked = labels
		.map((label, index) => ({ label, score: scores[index] ?? 0, index }))
		.sort((a, b) => b.score - a.score || Number(b.label) - Number(a.label) || a.index - b.index);
	let tp = 0;
	let ap = 0;
	ranked.forEach((entry, rank) => {
		if (!entry.label) return;
		tp += 1;
		ap += tp / (rank + 1);
	});
	return ap / positives;
}

/**
 * Aire sous la courbe précision/rappel (trapèzes). Publiée à côté de
 * l'average precision : deux définitions courantes de « PR-AUC », aucune ne
 * doit être devinée par le lecteur.
 */
export function precisionRecallAuc(labels: readonly boolean[], scores: readonly number[]): number {
	if (labels.length !== scores.length) throw new RangeError("labels et scores doivent avoir la même longueur");
	const positives = labels.filter(Boolean).length;
	if (positives === 0) return 0;
	const ranked = labels
		.map((label, index) => ({ label, score: scores[index] ?? 0, index }))
		.sort((a, b) => b.score - a.score || Number(b.label) - Number(a.label) || a.index - b.index);
	const points: Array<{ precision: number; recall: number }> = [];
	let tp = 0;
	let fp = 0;
	for (const entry of ranked) {
		if (entry.label) tp += 1;
		else fp += 1;
		points.push({ precision: tp / (tp + fp), recall: tp / positives });
	}
	let area = 0;
	let previous = { precision: 1, recall: 0 };
	for (const point of points) {
		area += (point.recall - previous.recall) * ((point.precision + previous.precision) / 2);
		previous = point;
	}
	return area;
}

/**
 * Confronte les annotations aux scores.
 *
 * Une annotation est un vrai positif si l'alerte part au plus tard
 * `maxDelayDays` après le jour du pic. L'alerte du jour J est produite par le
 * passage quotidien de J+1 : `detectedOn = jour du premier score au-dessus du
 * seuil + 1`, et le délai est la différence avec le jour du pic. Un pic
 * détecté le jour J a donc un délai de 1 jour, un pic qui n'est vu que le
 * lendemain a un délai de 2 et n'est pas un vrai positif dans le budget.
 *
 * Les négatifs ne sont pas tous matérialisés : seuls les jours scorés
 * au-dessus du seuil entrent dans la table, avec les pics annotés. Le calcul
 * de l'average precision se fait sur la grille complète (script de mesure et
 * vérificateur partagent `runBacktest`), la table porte la trace auditable
 * des décisions et le délai.
 */
export function evaluatePeaks(
	scoredByFamily: ReadonlyMap<string, readonly ScoredDay[]>,
	annotations: readonly PeakAnnotation[],
	options: PeakEvaluationOptions = {},
): PeakEvaluation {
	const threshold = options.threshold ?? DEFAULT_THRESHOLD;
	const maxDelayDays = options.maxDelayDays ?? DEFAULT_MAX_DELAY_DAYS;
	if (!Number.isFinite(threshold) || threshold <= 0) throw new RangeError("threshold doit être > 0");
	if (!Number.isInteger(maxDelayDays) || maxDelayDays < 0) throw new RangeError("maxDelayDays doit être un entier >= 0");

	const annotationKeys = new Set(annotations.map((a) => `${a.family}\u0000${a.day}`));
	// Jours d'alerte déjà rattachés à un pic, même détecté en retard : ils ne
	// doivent pas être comptés une seconde fois comme faux positifs.
	const alertDays = new Set<string>();
	const rows: PeakEvaluationRow[] = [];
	const delays: number[] = [];

	for (const annotation of annotations) {
		const scores = scoredByFamily.get(annotation.family) ?? [];
		const byDay = new Map(scores.map((s) => [s.day, s]));
		let alertDay: string | null = null;
		for (let offset = 0; offset <= maxDelayDays; offset++) {
			const day = addDays(annotation.day, offset);
			const entry = byDay.get(day);
			if (entry && entry.score >= threshold) {
				alertDay = day;
				break;
			}
		}
		if (alertDay !== null) alertDays.add(`${annotation.family}\u0000${alertDay}`);
		const detectedOn = alertDay === null ? null : addDays(alertDay, 1);
		const delayDays = detectedOn === null ? null : daysBetween(annotation.day, detectedOn);
		const tp = delayDays !== null && delayDays <= maxDelayDays;
		if (tp && delayDays !== null) delays.push(delayDays);
		rows.push({
			family: annotation.family,
			day: annotation.day,
			score: byDay.get(annotation.day)?.score ?? 0,
			label: true,
			tp,
			detectedOn: tp ? detectedOn : null,
			delayDays: tp ? delayDays : null,
		});
	}

	let falsePositives = 0;
	for (const [family, scores] of scoredByFamily) {
		for (const entry of scores) {
			if (entry.score < threshold) continue;
			if (annotationKeys.has(`${family}\u0000${entry.day}`)) continue;
			if (alertDays.has(`${family}\u0000${entry.day}`)) continue;
			falsePositives += 1;
			rows.push({
				family,
				day: entry.day,
				score: entry.score,
				label: false,
				tp: false,
				detectedOn: null,
				delayDays: null,
			});
		}
	}

	rows.sort((a, b) => a.family.localeCompare(b.family) || a.day.localeCompare(b.day));
	return {
		rows,
		detected: delays.length,
		annotated: annotations.length,
		falsePositives,
		medianDelayDays: median(delays),
		averageDelayDays: delays.length === 0 ? null : delays.reduce((sum, d) => sum + d, 0) / delays.length,
	};
}
