/**
 * Benchmark reproductible de la décroissance du risque avec l'âge des faits.
 *
 * Le risque n'est pas stationnaire : l'intensité d'incident d'une entité dérive
 * dans le temps (marche aléatoire autorégressive). Les faits sont des signaux
 * tirés au rythme de cette intensité. Le modèle statique additionne 240 jours
 * de faits ; le modèle à décroissance donne plus de poids aux récents. Sur le
 * même découpage — faits avant `asOf`, issue dans les `horizonDays` suivants —
 * la décroissance doit mieux classer les entités.
 *
 * Tout est synthétique et déterministe (graine fixe) : aucun fait réel, aucune
 * organisation, aucune donnée personnelle. Le même code sert au script de
 * mesure, au vérificateur et au test, donc aucun risque de divergence.
 */
import { type Concordance, type Fact, type LabelledEntity, concordanceIndex, scoreDecay, scoreStatic } from "./decay.js";

const DAY_MS = 86_400_000;

export type DecayBenchmarkParams = {
	/** Nom de version, repris dans `model_eval.source`. */
	version: string;
	description: string;
	seed: number;
	entities: number;
	/** Premier jour ISO de l'historique. */
	start: string;
	/** Jours de faits disponibles avant le découpage. */
	historyDays: number;
	/** Fenêtre d'issue après le découpage. */
	horizonDays: number;
	/** Demi-vie du modèle à décroissance. */
	halfLifeDays: number;
	/** Rythme moyen de faits par jour quand l'intensité latente est nulle. */
	factRate: number;
	/** Rythme moyen d'incident par jour quand l'intensité latente est nulle. */
	incidentRate: number;
	/** Persistance de la marche aléatoire (0 < phi < 1). */
	arPhi: number;
	/** Écart-type de l'innovation de la marche aléatoire. */
	arSigma: number;
	source: string;
};

export type DecayBenchmark = {
	params: DecayBenchmarkParams;
	/** Dernier jour couvert par l'historique ; les faits vont jusqu'à `asOf - 1`. */
	asOf: string;
	/** Fin de la fenêtre d'issue (exclue). */
	outcomeEnd: string;
	entities: LabelledEntity[];
};

export type DecayEvaluation = {
	asOf: string;
	outcomeEnd: string;
	horizonDays: number;
	halfLifeDays: number;
	nEntities: number;
	nPositives: number;
	nNegatives: number;
	nFacts: number;
	static: Concordance;
	decay: Concordance;
	/** `decay.cIndex - static.cIndex`, la valeur du critère de sortie. */
	delta: number;
};

function addDays(day: string, offset: number): string {
	const base = Date.parse(`${day}T00:00:00Z`);
	if (!Number.isFinite(base)) throw new RangeError(`jour ISO invalide : ${day}`);
	return new Date(base + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

/** Loi normale centrée réduite par Box-Muller, à partir de deux uniformes. */
function normal(rand: () => number): number {
	const u1 = Math.max(rand(), Number.EPSILON);
	const u2 = rand();
	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Loi de Poisson par l'algorithme de Knuth ; les taux du benchmark restent < 2. */
function poisson(rand: () => number, lambda: number): number {
	const limit = Math.exp(-lambda);
	let k = 0;
	let p = 1;
	do {
		k += 1;
		p *= rand();
	} while (p > limit);
	return k - 1;
}

/**
 * Construit le benchmark. L'ordre des tirages est fixe : deux appels avec les
 * mêmes paramètres rendent exactement les mêmes faits et les mêmes issues.
 */
export function generateDecayBenchmark(params: DecayBenchmarkParams): DecayBenchmark {
	if (!(params.entities > 0)) throw new RangeError(`entités invalides : ${params.entities}`);
	if (!(params.historyDays > 0)) throw new RangeError(`historique invalide : ${params.historyDays}`);
	if (!(params.horizonDays > 0)) throw new RangeError(`horizon invalide : ${params.horizonDays}`);
	if (!(params.halfLifeDays > 0)) throw new RangeError(`demi-vie invalide : ${params.halfLifeDays}`);
	if (!(params.arPhi > 0 && params.arPhi < 1)) throw new RangeError(`phi invalide : ${params.arPhi}`);
	if (!(params.arSigma > 0)) throw new RangeError(`sigma invalide : ${params.arSigma}`);
	if (!(params.factRate > 0)) throw new RangeError(`taux de faits invalide : ${params.factRate}`);
	if (!(params.incidentRate > 0)) throw new RangeError(`taux d'incident invalide : ${params.incidentRate}`);

	const rand = mulberry32(params.seed);
	const stationary = params.arSigma / Math.sqrt(1 - params.arPhi * params.arPhi);
	const entities: LabelledEntity[] = [];

	for (let id = 0; id < params.entities; id++) {
		// Intensité latente au début de l'historique, déjà à sa loi stationnaire.
		let intensity = normal(rand) * stationary;
		const facts: Fact[] = [];
		for (let offset = 0; offset < params.historyDays; offset++) {
			intensity = params.arPhi * intensity + params.arSigma * normal(rand);
			const lambda = params.factRate * Math.exp(intensity);
			const count = poisson(rand, lambda);
			const day = addDays(params.start, offset);
			for (let k = 0; k < count; k++) facts.push({ day, weight: 1 });
		}
		// L'issue est tirée à l'intensité du dernier jour d'historique, figée
		// sur tout l'horizon : c'est le risque « courant » que les faits récents
		// doivent estimer mieux que la moyenne des 240 jours.
		const lambdaIncident = params.incidentRate * Math.exp(intensity);
		const expected = lambdaIncident * params.horizonDays;
		const positive = rand() < 1 - Math.exp(-expected);
		entities.push({ id, facts, positive });
	}

	return {
		params,
		asOf: addDays(params.start, params.historyDays),
		outcomeEnd: addDays(params.start, params.historyDays + params.horizonDays),
		entities,
	};
}

/** Note les deux modèles sur le même découpage et rend leurs concordances. */
export function evaluateDecayBenchmark(benchmark: DecayBenchmark): DecayEvaluation {
	const { asOf, params, entities } = benchmark;
	const staticRows = entities.map((entity) => ({
		score: scoreStatic(entity.facts, asOf),
		positive: entity.positive,
	}));
	const decayRows = entities.map((entity) => ({
		score: scoreDecay(entity.facts, asOf, params.halfLifeDays),
		positive: entity.positive,
	}));
	const modelStatic = concordanceIndex(staticRows);
	const modelDecay = concordanceIndex(decayRows);
	const nPositives = entities.filter((entity) => entity.positive).length;
	return {
		asOf,
		outcomeEnd: benchmark.outcomeEnd,
		horizonDays: params.horizonDays,
		halfLifeDays: params.halfLifeDays,
		nEntities: entities.length,
		nPositives,
		nNegatives: entities.length - nPositives,
		nFacts: entities.reduce((sum, entity) => sum + entity.facts.length, 0),
		static: modelStatic,
		decay: modelDecay,
		delta: modelDecay.cIndex - modelStatic.cIndex,
	};
}
