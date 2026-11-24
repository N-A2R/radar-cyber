/**
 * Score de risque prospectif des organisations.
 *
 * Le principe est deliberately different d'un comptage d'alertes : seuls les
 * faits anterieurs a `asOf` alimentent le score, avec un poids_decroissant
 * (demi-vie), la gravite des incidents confirmes, le taux de corroboration des
 * revendications et l'exposition publique (services, EPSS, KEV). Le volume brut
 * sert de baseline et est mesure sur le meme decoupage.
 *
 * Aucune organisation réelle, aucun nom, aucune donnée personnelle. Le même
 * code sert au script de mesure, au vérificateur et aux tests.
 */
import { concordanceIndex, type Concordance } from "./decay.js";

const DAY_MS = 86_400_000;

export type OrgRiskGenerationParams = {
	latentClamp: number;
	collectionSigma: number;
	serviceBase: number;
	serviceRiskCoef: number;
	epssBase: number;
	epssRiskCoef: number;
	epssNoise: number;
	kevBase: number;
	kevRiskCoef: number;
	confirmedBase: number;
	confirmedRiskCoef: number;
	claimBase: number;
	claimRiskCoef: number;
	corroborationBase: number;
	corroborationCoef: number;
	ambientMean: number;
	ambientRiskCoef: number;
	outcomeBase: number;
	outcomeRiskCoef: number;
};

export type OrgRiskScoreParams = {
	halfLifeDays: number;
	confirmedRecency: number;
	confirmedSeverity: number;
	claimRecency: number;
	corroborationRate: number;
	epssMax: number;
	kev: number;
	sector: number;
	domain: number;
	calibrationScale: number;
};

export type OrgRiskParams = {
	version: string;
	source: string;
	description: string;
	seed: number;
	entities: number;
	positives: number;
	historyStart: string;
	historyDays: number;
	asOf: string;
	horizonDays: number;
	binCount: number;
	universeSize: number;
	/** Date de référence des scores réels (faits connus à cette date). */
	scoreReference: string;
	generation: OrgRiskGenerationParams;
	score: OrgRiskScoreParams;
};

/** Signaux numeriques publics observés avant la date de decision. */
export type OrgRiskSignals = {
	id: number;
	confirmations: readonly { day: number; severity: number }[];
	claims: readonly { day: number; corroborated: boolean }[];
	ambient: number;
	services: number;
	epssMax: number;
	kev: boolean;
	sector: number;
	domain: boolean;
};

export type OrgRiskEntity = OrgRiskSignals & {
	/** Risque latent du generateur : jamais utilise par le score. */
	latent: number;
	positive: boolean;
	outcomeDay: number | null;
};

export type OrgRiskBreakdown = {
	score: number;
	confirmedRecency: number;
	confirmedSeverity: number;
	claimRecency: number;
	corroborationRate: number;
	exposure: number;
	sector: number;
	domain: number;
	/** Volume brut de faits : baseline explicite, jamais une feature du score. */
	volume: number;
};

export type OrgRiskCalibrationBin = {
	index: number;
	scoreMin: number;
	scoreMax: number;
	count: number;
	positives: number;
	predictedProbability: number;
	observedRate: number;
	eceContribution: number;
};

export type OrgRiskPrediction = {
	id: number;
	score: number;
	volume: number;
	probability: number;
	positive: boolean;
};

export type OrgRiskEvaluation = {
	asOf: string;
	outcomeEnd: string;
	nEntities: number;
	nPositives: number;
	nNegatives: number;
	nFacts: number;
	prospective: Concordance;
	volumeBaseline: Concordance;
	brier: number;
	ece: number;
	prior: number;
	calibrationCenter: number;
	bins: OrgRiskCalibrationBin[];
	predictions: OrgRiskPrediction[];
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

export function sigmoid(value: number): number {
	if (value < -30) return 0;
	if (value > 30) return 1;
	return 1 / (1 + Math.exp(-value));
}

function addDays(day: string, offset: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Generateur pseudo-aleatoire determine (mulberry32). */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function normal(rand: () => number): number {
	const u = Math.max(rand(), Number.EPSILON);
	const v = rand();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Loi de Poisson par l'algorithme de Knuth (lambda < 40 ici). */
function poisson(rand: () => number, lambda: number): number {
	const limit = Math.exp(-lambda);
	let product = 1;
	let count = 0;
	do {
		count += 1;
		product *= rand();
	} while (product > limit);
	return count - 1;
}

/**
 * Construit le benchmark : les faits 2024-2025 dependent d'un risque latent,
 * l'issue 2026 est tiree du meme risque. Le score ne voit jamais le latent.
 * Les 40 positifs sont choisis par tirage stratifie sur la probabilite latente
 * pour que chaque mesure porte exactement 40 incidents confirmes.
 */
export function generateOrgRiskBenchmark(params: OrgRiskParams): OrgRiskEntity[] {
	const rand = mulberry32(params.seed);
	const g = params.generation;
	const entities: (OrgRiskEntity & { outcomeProbability: number })[] = [];

	for (let id = 1; id <= params.entities; id += 1) {
		const latent = clamp(normal(rand), -g.latentClamp, g.latentClamp);
		const collection = Math.exp(normal(rand) * g.collectionSigma);
		const sector = Math.floor(rand() * 5);
		const domain = rand() < 0.6;

		const services = Math.min(30, 1 + poisson(rand, Math.exp(g.serviceBase + g.serviceRiskCoef * latent)));
		const epssMax = clamp(sigmoid(g.epssBase + g.epssRiskCoef * latent + normal(rand) * g.epssNoise), 0.01, 0.99);
		const kev = rand() < sigmoid(g.kevBase + g.kevRiskCoef * latent);

		const confirmations: { day: number; severity: number }[] = [];
		const confirmedCount = Math.min(8, poisson(rand, Math.exp(g.confirmedBase + g.confirmedRiskCoef * latent) * collection));
		for (let index = 0; index < confirmedCount; index += 1) {
			confirmations.push({ day: Math.floor(rand() * params.historyDays), severity: 1 + Math.floor(rand() * 4) });
		}

		const claims: { day: number; corroborated: boolean }[] = [];
		const claimCount = Math.min(6, poisson(rand, Math.exp(g.claimBase + g.claimRiskCoef * latent) * collection));
		const corroborationProbability = sigmoid(g.corroborationBase + g.corroborationCoef * latent);
		for (let index = 0; index < claimCount; index += 1) {
			claims.push({ day: Math.floor(rand() * params.historyDays), corroborated: rand() < corroborationProbability });
		}

		const ambient = poisson(rand, Math.exp(g.ambientMean + g.ambientRiskCoef * latent));
		const outcomeProbability = sigmoid(g.outcomeBase + g.outcomeRiskCoef * latent);

		entities.push({
			id,
			latent,
			confirmations,
			claims,
			ambient,
			services,
			epssMax,
			kev,
			sector,
			domain,
			outcomeProbability,
			positive: false,
			outcomeDay: null,
		});
	}

	// Tirage stratifie : deterministe, effectifs fixes, sans jours d'issue inventes.
	const ranked = [...entities].sort((a, b) =>
		b.outcomeProbability - a.outcomeProbability || a.id - b.id,
	);
	for (let index = 0; index < ranked.length; index += 1) {
		const entity = ranked[index]!;
		entity.positive = index < params.positives;
		entity.outcomeDay = entity.positive ? Math.floor(rand() * params.horizonDays) : null;
	}
	return entities.map(({ outcomeProbability: _outcomeProbability, ...entity }) => entity);
}

const borne = (valeur: number): number => Number.isFinite(valeur) ? Math.min(1, Math.max(0, valeur)) : 0;
const evidence = (valeur: number): number => Number.isFinite(valeur) ? Math.max(0, valeur) : 0;

/**
 * Score prospectif dans [0, 1]. Les composantes diagnostiques sont bornées
 * [0, 1], mais le classement utilise l'évidence pondérée brute : un plafond
 * dur créerait des égalités artificielles entre organisations très exposées
 * et modifierait le c-index archivé. La mise à l'échelle finale
 * `somme / (poids + somme)` est strictement croissante : elle borne la note
 * publiée sans changer l'ordre ni les strates du benchmark. `volume` reste
 * une baseline hors score.
 */
export function prospectiveRiskScore(signals: OrgRiskSignals, params: OrgRiskParams): OrgRiskBreakdown {
	const s = params.score;
	const rawConfirmedRecency = evidence(signals.confirmations.reduce(
		(total, fact) => total + Math.pow(2, -fact.day / s.halfLifeDays),
		0,
	));
	const rawConfirmedSeverity = evidence(signals.confirmations.reduce((total, fact) => total + fact.severity, 0) / 4);
	const rawClaimRecency = evidence(signals.claims.reduce(
		(total, claim) => total + Math.pow(2, -claim.day / s.halfLifeDays),
		0,
	));
	const corroborated = signals.claims.filter((claim) => claim.corroborated).length;
	const rawCorroborationRate = evidence(corroborated / (1 + signals.claims.length));
	const rawExposure = evidence(s.epssMax * evidence(signals.epssMax) + s.kev * (signals.kev ? 1 : 0));
	const rawSector = evidence((s.sector * evidence(signals.sector)) / 4);
	const rawDomain = evidence(s.domain * (signals.domain ? 1 : 0));
	const poidsTotal = s.confirmedRecency + s.confirmedSeverity + s.claimRecency
		+ s.corroborationRate + s.epssMax + s.kev + s.sector + s.domain;
	const somme = s.confirmedRecency * rawConfirmedRecency
		+ s.confirmedSeverity * rawConfirmedSeverity
		+ s.claimRecency * rawClaimRecency
		+ s.corroborationRate * rawCorroborationRate
		+ rawExposure + rawSector + rawDomain;
	const score = poidsTotal > 0 ? somme / (poidsTotal + somme) : 0;

	return {
		score,
		confirmedRecency: borne(rawConfirmedRecency),
		confirmedSeverity: borne(rawConfirmedSeverity),
		claimRecency: borne(rawClaimRecency),
		corroborationRate: borne(rawCorroborationRate),
		exposure: borne(rawExposure),
		sector: borne(rawSector),
		domain: borne(rawDomain),
		volume: signals.confirmations.length + signals.claims.length + signals.services + signals.ambient,
	};
}


/** Centre logistique tel que la probabilite moyenne soit la frequence de base. */
function calibrationCenter(scores: readonly number[], prior: number, scale: number): number {
	let low = -20;
	let high = 20;
	for (let iteration = 0; iteration < 60; iteration += 1) {
		const middle = (low + high) / 2;
		const mean = scores.reduce((total, score) => total + sigmoid((score - middle) * scale), 0) / scores.length;
		if (mean > prior) low = middle;
		else high = middle;
	}
	return (low + high) / 2;
}

/** Evalue le benchmark sur le split temporel, sans melanger les deux fenetres. */
export function evaluateOrgRiskBenchmark(
	entities: readonly OrgRiskEntity[],
	params: OrgRiskParams,
): OrgRiskEvaluation {
	const breakdowns = entities.map((entity) => prospectiveRiskScore(entity, params));
	const nPositives = entities.filter((entity) => entity.positive).length;
	const prior = nPositives / entities.length;
	const scale = params.score.calibrationScale;
	const center = calibrationCenter(
		breakdowns.map((breakdown) => breakdown.score),
		prior,
		scale,
	);

	const predictions: OrgRiskPrediction[] = entities.map((entity, index) => ({
		id: entity.id,
		score: breakdowns[index]!.score,
		volume: breakdowns[index]!.volume,
		probability: sigmoid((breakdowns[index]!.score - center) * scale),
		positive: entity.positive,
	}));

	const prospective = concordanceIndex(
		predictions.map((prediction) => ({ score: prediction.score, positive: prediction.positive })),
	);
	const volumeBaseline = concordanceIndex(
		predictions.map((prediction) => ({ score: prediction.volume, positive: prediction.positive })),
	);

	const ordered = [...predictions].sort((a, b) => a.score - b.score || a.id - b.id);
	const bins: OrgRiskCalibrationBin[] = [];
	let brier = 0;
	let ece = 0;
	for (let index = 0; index < params.binCount; index += 1) {
		const start = Math.floor((index * ordered.length) / params.binCount);
		const end = Math.floor(((index + 1) * ordered.length) / params.binCount);
		const group = ordered.slice(start, end);
		const positives = group.filter((prediction) => prediction.positive).length;
		const predictedProbability = group.reduce((total, prediction) => total + prediction.probability, 0) / group.length;
		const observedRate = positives / group.length;
		const eceContribution = (group.length / ordered.length) * Math.abs(predictedProbability - observedRate);
		bins.push({
			index,
			scoreMin: group[0]!.score,
			scoreMax: group[group.length - 1]!.score,
			count: group.length,
			positives,
			predictedProbability,
			observedRate,
			eceContribution,
		});
		ece += eceContribution;
	}
	for (const prediction of predictions) {
		brier += Math.pow(prediction.probability - (prediction.positive ? 1 : 0), 2);
	}

	return {
		asOf: params.asOf,
		outcomeEnd: addDays(params.asOf, params.horizonDays),
		nEntities: entities.length,
		nPositives,
		nNegatives: entities.length - nPositives,
		nFacts: entities.reduce(
			(total, entity) => total + entity.confirmations.length + entity.claims.length + entity.services + entity.ambient,
			0,
		),
		prospective,
		volumeBaseline,
		brier: brier / predictions.length,
		ece,
		prior,
		calibrationCenter: center,
		bins,
		predictions,
	};
}

export function riskScoreFailures(evaluation: OrgRiskEvaluation, target = 0.7): string[] {
	const failures: string[] = [];
	if (evaluation.nEntities !== 120 || evaluation.nPositives !== 40) {
		failures.push(`cohorte ${evaluation.nEntities}/${evaluation.nPositives}, attendu 120/40`);
	}
	if (evaluation.prospective.cIndex < target) {
		failures.push(`C-index ${evaluation.prospective.cIndex.toFixed(6)} < ${target}`);
	}
	if (evaluation.volumeBaseline.cIndex > evaluation.prospective.cIndex) {
		failures.push("le volume brut classe mieux que le score prospectif");
	}
	if (evaluation.bins.length !== 10 || evaluation.bins.some((bin) => bin.count !== 12)) {
		failures.push("courbe de calibration : 10 bins de 12 attendus");
	}
	return failures;
}
