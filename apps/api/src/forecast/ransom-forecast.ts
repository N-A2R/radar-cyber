/**
 * Prévision à 30 jours de la pression rançongiciel régionale.
 *
 * L'unité est la semaine. À la fin d'une semaine `w`, on ne regarde que des
 * faits déjà publiés ; l'étiquette est la présence d'au moins une revendication
 * Nouvelle-Aquitaine (`leak_claim.na`) dans les 30 jours suivants. Les scores
 * sont donc produits sans fuite temporelle, puis notés sur un découpage
 * temporel : entraînement avant 2025, test à partir de 2025.
 *
 * Le modèle est une forêt aléatoire déterministe (CART, grain fixe) entraînée
 * sur l'historique des revendications, des groupes déjà passés en NA et des
 * fuites connues. La référence est un Poisson dont λ est estimé sur les 364
 * jours précédant l'origine. Les deux PR-AUC sont calculés sur le même jeu de
 * test avec `averagePrecision`.
 *
 * Aucune donnée personnelle : uniquement des agrégations hebdomadaires.
 */
import { averagePrecision } from "../detect/stl-peaks.js";

export const HORIZON_DAYS = 30;
export const HISTORY_DAYS = 364;
export const CLAIM_THRESHOLD = 1;
export const TRAIN_CUTOFF = "2025-01-01";
export const SAMPLE_START = "2022-01-01";
export const SOURCE = "ransom-forecast-30j-v1";

/** Lignes hebdomadaires produites par `RANSOM_FORECAST_SQL`. */
export interface WeeklyClaimRow {
	week: string;
	naClaims: number;
	allClaims: number;
	leakEvents: number;
	ransomwareEvents: number;
	breaches: number;
	groupClaims4: number;
	groupClaims12: number;
	groupClaims26: number;
	activeGroups12: number;
	newGroups26: number;
	forwardClaims30: number;
}

export interface ForecastSample {
	week: string;
	features: number[];
	label: boolean;
	forwardClaims30: number;
	poissonLambda: number;
}

export interface ForestParams {
	trees: number;
	mtry: number;
	maxDepth: number;
	minLeaf: number;
	seed: number;
}

export const FOREST_PARAMS: ForestParams = {
	trees: 400,
	mtry: 4,
	maxDepth: 3,
	minLeaf: 2,
	seed: 0,
};

/** Plusieurs graines : la mesure ne dépend pas d'un tirage aléatoire unique. */
export const FOREST_SEEDS = [0, 1, 2] as const;

export const FEATURE_NAMES = [
	"na4",
	"na12",
	"na26",
	"na52",
	"all4",
	"all12",
	"all26",
	"leak12",
	"ransomware12",
	"breaches12",
	"activeWeeks12",
	"maxWeek12",
	"groupClaims4",
	"groupClaims12",
	"groupClaims26",
	"activeGroups12",
	"newGroups26",
	"activeGroupsDelta12",
	"poissonLambda",
] as const;

function rolling(values: readonly number[], width: number): number[] {
	const result: number[] = [];
	let sum = 0;
	values.forEach((value, index) => {
		sum += value;
		if (index >= width) sum -= values[index - width];
		result.push(sum);
	});
	return result;
}

/** Construit les Observations : aucune colonne ne regarde après `week`. */
export function buildSamples(rows: readonly WeeklyClaimRow[]): ForecastSample[] {
	const na = rows.map((row) => row.naClaims);
	const all = rows.map((row) => row.allClaims);
	const leaks = rows.map((row) => row.leakEvents);
	const ransomware = rows.map((row) => row.ransomwareEvents);
	const breaches = rows.map((row) => row.breaches);
	const na4 = rolling(na, 4);
	const na12 = rolling(na, 12);
	const na26 = rolling(na, 26);
	const na52 = rolling(na, 52);
	const all4 = rolling(all, 4);
	const all12 = rolling(all, 12);
	const all26 = rolling(all, 26);
	const leak12 = rolling(leaks, 12);
	const ransomware12 = rolling(ransomware, 12);
	const breaches12 = rolling(breaches, 12);

	return rows.map((row, index) => {
		const window = rows.slice(Math.max(0, index - 12), index + 1);
		const lambda = (na52[index] * HORIZON_DAYS) / HISTORY_DAYS;
		return {
			week: row.week,
			label: row.forwardClaims30 >= CLAIM_THRESHOLD,
			forwardClaims30: row.forwardClaims30,
			poissonLambda: lambda,
			features: [
				na4[index],
				na12[index],
				na26[index],
				na52[index],
				all4[index],
				all12[index],
				all26[index],
				leak12[index],
				ransomware12[index],
				breaches12[index],
				window.filter((point) => point.naClaims > 0).length,
				Math.max(0, ...window.map((point) => point.naClaims)),
				row.groupClaims4,
				row.groupClaims12,
				row.groupClaims26,
				row.activeGroups12,
				row.newGroups26,
				row.activeGroups12 - (rows[index - 12]?.activeGroups12 ?? row.activeGroups12),
				lambda,
			],
		};
	});
}

type TreeNode =
	| { readonly kind: "leaf"; readonly value: number }
	| {
			readonly kind: "split";
			readonly feature: number;
			readonly threshold: number;
			readonly left: TreeNode;
			readonly right: TreeNode;
	  };

/** PRNG mulberry32 : même entraînement, mêmes tirages, même mesure. */
function randomGenerator(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function leafValue(labels: readonly boolean[], indices: readonly number[]): TreeNode {
	const positives = indices.reduce((sum, index) => sum + Number(labels[index]), 0);
	return { kind: "leaf", value: positives / indices.length };
}

function growTree(
	indices: number[],
	features: readonly (readonly number[])[],
	labels: readonly boolean[],
	params: ForestParams,
	depth: number,
	random: () => number,
): TreeNode {
	const positives = indices.reduce((sum, index) => sum + Number(labels[index]), 0);
	const baseRate = positives / indices.length;
	if (depth >= params.maxDepth || indices.length < 2 * params.minLeaf || positives === 0 || positives === indices.length) {
		return { kind: "leaf", value: baseRate };
	}

	const columns = Array.from({ length: features[0].length }, (_, index) => index);
	for (let i = columns.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[columns[i], columns[j]] = [columns[j], columns[i]];
	}

	let best: { gain: number; feature: number; threshold: number } | undefined;
	const impurity = baseRate * (1 - baseRate);
	for (const feature of columns.slice(0, params.mtry)) {
		const values = Array.from(new Set(indices.map((index) => features[index][feature]))).sort((a, b) => a - b);
		for (let position = 0; position < values.length - 1; position += 1) {
			const threshold = (values[position] + values[position + 1]) / 2;
			let leftCount = 0;
			let leftPositives = 0;
			for (const index of indices) {
				if (features[index][feature] <= threshold) {
					leftCount += 1;
					leftPositives += Number(labels[index]);
				}
			}
			const rightCount = indices.length - leftCount;
			const rightPositives = positives - leftPositives;
			if (leftCount < params.minLeaf || rightCount < params.minLeaf) continue;
			const leftRate = leftPositives / leftCount;
			const rightRate = rightPositives / rightCount;
			const gain =
				impurity -
				(leftCount / indices.length) * leftRate * (1 - leftRate) -
				(rightCount / indices.length) * rightRate * (1 - rightRate);
			if (!best || gain > best.gain + 1e-12) best = { gain, feature, threshold };
		}
	}

	if (!best || best.gain <= 1e-9) return { kind: "leaf", value: baseRate };
	const left = indices.filter((index) => features[index][best.feature] <= best.threshold);
	const right = indices.filter((index) => features[index][best.feature] > best.threshold);
	return {
		kind: "split",
		feature: best.feature,
		threshold: best.threshold,
		left: growTree(left, features, labels, params, depth + 1, random),
		right: growTree(right, features, labels, params, depth + 1, random),
	};
}

export function trainForest(
	samples: readonly ForecastSample[],
	params: ForestParams = FOREST_PARAMS,
): (features: readonly number[]) => number {
	if (samples.length === 0) throw new RangeError("aucun échantillon pour entraîner la forêt");
	const features = samples.map((sample) => sample.features);
	const labels = samples.map((sample) => sample.label);
	const random = randomGenerator(params.seed);
	const trees: TreeNode[] = [];
	for (let index = 0; index < params.trees; index += 1) {
		const bootstrap = Array.from({ length: samples.length }, () => Math.floor(random() * samples.length));
		trees.push(growTree(bootstrap, features, labels, params, 0, random));
	}
	return (row) => {
		if (row.length !== features[0].length) throw new RangeError("dimension des caractéristiques invalide");
		let total = 0;
		for (const tree of trees) {
			let node = tree;
			while (node.kind === "split") node = row[node.feature] <= node.threshold ? node.left : node.right;
			total += node.value;
		}
		return total / trees.length;
	};
}

/** Bagging sur plusieurs graines : la mesure ne dépend pas d'un tirage unique. */
export function trainForestEnsemble(
	samples: readonly ForecastSample[],
	params: ForestParams = FOREST_PARAMS,
	seeds: readonly number[] = [0, 1, 2],
): (features: readonly number[]) => number {
	const predictors = seeds.map((seed) => trainForest(samples, { ...params, seed }));
	return (features) =>
		predictors.reduce((sum, predict) => sum + predict(features), 0) / predictors.length;
}

/** Probabilité Poisson d'au moins un événement ; rang identique à λ. */
export function poissonScore(lambda: number): number {
	return 1 - Math.exp(-lambda);
}

export interface ForecastEvaluation {
	prAuc: number;
	baselinePrAuc: number;
	gain: number;
	trainCount: number;
	testCount: number;
	positives: number;
	trainCutoff: string;
	source: string;
	samples: ForecastSample[];
	scores: number[];
	/** Score de la forêt entraînée sur la période d'apprentissage. */
	predict: (features: readonly number[]) => number;
}

/** Entraîne avant `TRAIN_CUTOFF`, note après : le test ne sert jamais au fit. */
export function evaluateRansomForecast(
	rows: readonly WeeklyClaimRow[],
	params: ForestParams = FOREST_PARAMS,
	cutoff: string = TRAIN_CUTOFF,
	seeds: readonly number[] = [params.seed],
): ForecastEvaluation {
	const samples = buildSamples(rows);
	const train = samples.filter((sample) => sample.week >= SAMPLE_START && sample.week < cutoff);
	const test = samples.filter((sample) => sample.week >= cutoff);
	if (train.length === 0 || test.length === 0) throw new RangeError("découpage temporel vide");
	const predict = trainForestEnsemble(train, params, seeds);
	const labels = test.map((sample) => sample.label);
	const scores = test.map((sample) => predict(sample.features));
	const baseline = test.map((sample) => poissonScore(sample.poissonLambda));
	const prAuc = averagePrecision(labels, scores);
	const baselinePrAuc = averagePrecision(labels, baseline);
	return {
		prAuc,
		baselinePrAuc,
		gain: prAuc - baselinePrAuc,
		trainCount: train.length,
		testCount: test.length,
		positives: labels.filter(Boolean).length,
		trainCutoff: cutoff,
		source: SOURCE,
		samples,
		scores,
		predict,
	};
}

/**
 * Série hebdomadaire agrégée. Les caractéristiques de groupe regardent les 26
 * semaines *précédentes* ; `forward_claims_30` est la seule colonne future,
 * utilisée uniquement comme étiquette après la date d'origine.
 */
export const RANSOM_FORECAST_SQL = `
WITH bounds AS (
  SELECT date_trunc('week', min(published_at))::date AS first_week,
         date_trunc('week', max(published_at) - interval '37 days')::date AS last_week
  FROM leak_claim
), weeks AS (
  SELECT generate_series(first_week, last_week, interval '7 days')::date AS week
  FROM bounds
), na AS (
  SELECT date_trunc('week', published_at)::date AS week, count(*)::int AS n
  FROM leak_claim WHERE na GROUP BY 1
), all_claims AS (
  SELECT date_trunc('week', published_at)::date AS week, count(*)::int AS n
  FROM leak_claim GROUP BY 1
), events AS (
  SELECT date_trunc('week', observed_at)::date AS week,
         count(*) FILTER (WHERE family = 'leaks')::int AS leak_events,
         count(*) FILTER (WHERE family = 'ransomware')::int AS ransomware_events
  FROM event GROUP BY 1
), breaches AS (
  SELECT date_trunc('week', breach_date)::date AS week, count(*)::int AS n
  FROM fuite_reference WHERE breach_date IS NOT NULL GROUP BY 1
), first_na AS (
  SELECT group_name, min(published_at) AS first_at
  FROM leak_claim WHERE na AND group_name IS NOT NULL GROUP BY 1
), groups AS (
  SELECT w.week,
         count(lc.id) FILTER (WHERE lc.published_at >= w.week - 28 AND fn.first_at < w.week)::int AS group_claims_4,
         count(lc.id) FILTER (WHERE lc.published_at >= w.week - 84 AND fn.first_at < w.week)::int AS group_claims_12,
         count(lc.id) FILTER (WHERE lc.published_at >= w.week - 182 AND fn.first_at < w.week)::int AS group_claims_26,
         count(DISTINCT lc.group_name) FILTER (WHERE lc.published_at >= w.week - 84 AND fn.first_at < w.week)::int AS active_groups_12,
         count(DISTINCT lc.group_name) FILTER (WHERE fn.first_at >= w.week - 182 AND fn.first_at < w.week)::int AS new_groups_26
  FROM weeks w
  LEFT JOIN leak_claim lc ON lc.published_at >= w.week - 182 AND lc.published_at < w.week
  LEFT JOIN first_na fn ON fn.group_name = lc.group_name
  GROUP BY w.week
)
SELECT w.week::text AS week,
       coalesce(na.n, 0) AS na_claims,
       coalesce(all_claims.n, 0) AS all_claims,
       coalesce(events.leak_events, 0) AS leak_events,
       coalesce(events.ransomware_events, 0) AS ransomware_events,
       coalesce(breaches.n, 0) AS breaches,
       groups.group_claims_4,
       groups.group_claims_12,
       groups.group_claims_26,
       groups.active_groups_12,
       groups.new_groups_26,
       (SELECT count(*)::int FROM leak_claim l
         WHERE l.na AND l.published_at >= w.week + 7 AND l.published_at < w.week + 37) AS forward_claims_30
FROM weeks w
LEFT JOIN na ON na.week = w.week
LEFT JOIN all_claims ON all_claims.week = w.week
LEFT JOIN events ON events.week = w.week
LEFT JOIN breaches ON breaches.week = w.week
LEFT JOIN groups ON groups.week = w.week
ORDER BY w.week
`;
