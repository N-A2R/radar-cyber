/**
 * Détecteur de précurseur de campagne, sans accès base ni effet de bord.
 *
 * Un pic est déclaré le jour UTC où le volume de revendications publiques
 * dépasse la moyenne des 28 jours précédents de deux écarts-types, avec un
 * plancher de volume et de diversité de sites. Seul le passé (les 28 jours
 * précédant le pic) entre dans le calcul : aucune campagne ni alerte ne sert à
 * déclencher le signal. Les campagnes ne servent qu'à l'évaluation, en
 * cherchant le dernier pic survenu entre 14 et 60 jours avant la première
 * alerte de la règle.
 *
 * Seules des dates et des agrégations (nombre de revendications, nombre de
 * sites) sont manipulées ici : aucun titre, victime ou identifiant personnel.
 */

export const MODEL = "claim-rate-anomaly@28-2sigma-40-8";
export const SOURCE = "leak-claim-daily-rate";
export const LOOKBACK_DAYS = 28;
export const SIGMA = 2;
export const MIN_CLAIMS = 40;
export const MIN_SOURCES = 8;
export const COOLDOWN_DAYS = 14;
export const MIN_LEAD_DAYS = 14;
export const MAX_LEAD_DAYS = 60;

const DAY_MS = 86_400_000;

export type ClaimDay = {
	/** Date UTC au format AAAA-MM-JJ. */
	day: string;
	claims: number;
	sources: number;
};

export type CampaignForPrecursor = {
	campaignKey: string;
	label: string;
	/** ISO 8601, typiquement `alert.created_at`. */
	firstAlertAt: string | Date;
};

export type PrecursorSignal = {
	/** Minuit UTC du jour du pic. */
	startedAt: string;
	/** Minuit UTC du jour du pic + MAX_LEAD_DAYS. */
	endedAt: string;
	claims: number;
	sources: number;
};

export type CampaignPrecursorRow = {
	campaignKey: string;
	label: string;
	firstAlertAt: string;
	precursorAt: string | null;
	leadDays: number | null;
	signalClaims: number;
	signalSources: number;
};

export type PrecursorMetric = {
	evaluatedCampaigns: number;
	earlyCampaigns: number;
	detectionRate: number;
	falsePositives: number;
	evaluatedMonths: number;
	falsePositivesPerMonth: number;
};

export type PrecursorReport = {
	signals: PrecursorSignal[];
	evaluations: CampaignPrecursorRow[];
	metric: PrecursorMetric;
};

function utcDay(value: string | Date): number {
	const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
	return Date.parse(`${iso}T00:00:00.000Z`);
}

function isoDay(time: number): string {
	return new Date(time).toISOString().slice(0, 10);
}

/** Écart-type population : la fenêtre est la population de référence, pas un échantillon. */
function standardDeviation(values: readonly number[], average: number): number {
	const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

/**
 * Parcourt la série journalière croissante et émet un signal par pic, avec un
 * délai réfractaire de COOLDOWN_DAYS pour éviter de compter le même épisode
 * plusieurs fois. La série doit être triée par date UTC croissante.
 */
export function detectClaimRateSignals(days: readonly ClaimDay[]): PrecursorSignal[] {
	const signals: PrecursorSignal[] = [];
	for (let index = LOOKBACK_DAYS; index < days.length; index += 1) {
		const current = days[index]!;
		const currentDay = utcDay(current.day);
		if (!Number.isFinite(currentDay)) continue;
		const previous = days.slice(index - LOOKBACK_DAYS, index).map((row) => row.claims);
		const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
		const threshold = average + SIGMA * standardDeviation(previous, average);
		if (current.claims <= threshold || current.claims < MIN_CLAIMS || current.sources < MIN_SOURCES) {
			continue;
		}
		const last = signals.at(-1);
		if (last && currentDay - utcDay(last.startedAt) < COOLDOWN_DAYS * DAY_MS) continue;
		signals.push({
			startedAt: isoDay(currentDay),
			endedAt: isoDay(currentDay + MAX_LEAD_DAYS * DAY_MS),
			claims: current.claims,
			sources: current.sources,
		});
	}
	return signals;
}

/**
 * Retient, pour chaque campagne, le dernier pic tombant dans la fenêtre
 * d'avance autorisée. En l'absence de pic, la ligne existe quand même avec un
 * précurseur nul : le dénominateur du critère reste toutes les campagnes
 * évaluées, pas seulement les campagnes détectées.
 */
export function evaluatePrecursors(
	campaigns: readonly CampaignForPrecursor[],
	signals: readonly PrecursorSignal[],
	days: readonly ClaimDay[] = [],
): CampaignPrecursorRow[] {
	const observations = new Map(days.map((row) => [row.day, row]));
	return campaigns.map((campaign) => {
		const alertMs = Date.parse(
			campaign.firstAlertAt instanceof Date ? campaign.firstAlertAt.toISOString() : campaign.firstAlertAt,
		);
		if (!Number.isFinite(alertMs)) {
			throw new Error(`first_alert_at invalide pour ${campaign.campaignKey}`);
		}
		let best: PrecursorSignal | null = null;
		let bestLead = Number.POSITIVE_INFINITY;
		for (const signal of signals) {
			const lead = Math.floor((alertMs - utcDay(signal.startedAt)) / DAY_MS);
			if (lead < MIN_LEAD_DAYS || lead > MAX_LEAD_DAYS || lead >= bestLead) continue;
			best = signal;
			bestLead = lead;
		}
		if (!best) {
			const referenceDay = isoDay(alertMs - MIN_LEAD_DAYS * DAY_MS);
			const observation = observations.get(referenceDay);
			return {
				campaignKey: campaign.campaignKey,
				label: campaign.label,
				firstAlertAt: new Date(alertMs).toISOString(),
				precursorAt: null,
				leadDays: null,
				// Valeurs observées ce jour-là, et non un signal : la contrainte
				// de la table exige un effectif strictement positif.
				signalClaims: Math.max(1, observation?.claims ?? 1),
				signalSources: Math.max(1, observation?.sources ?? 1),
			};
		}
		return {
			campaignKey: campaign.campaignKey,
			label: campaign.label,
			firstAlertAt: new Date(alertMs).toISOString(),
			precursorAt: `${best.startedAt}T00:00:00.000Z`,
			leadDays: bestLead,
			signalClaims: best.claims,
			signalSources: best.sources,
		};
	});
}

/** Nombre de campagnes suivies dans la fenêtre [J+14, J+60] de ce signal. */
export function countSignalMatches(
	signal: PrecursorSignal,
	evaluations: readonly CampaignPrecursorRow[],
): number {
	const start = utcDay(signal.startedAt);
	return evaluations.filter((evaluation) => {
		const lead = Math.floor((Date.parse(evaluation.firstAlertAt) - start) / DAY_MS);
		return lead >= MIN_LEAD_DAYS && lead <= MAX_LEAD_DAYS;
	}).length;
}

/** Un signal est un faux positif si aucune campagne évaluée ne suit dans sa fenêtre. */
export function summarisePrecursors(
	signals: readonly PrecursorSignal[],
	evaluations: readonly CampaignPrecursorRow[],
): PrecursorMetric {
	const counts = signals.map((signal) => countSignalMatches(signal, evaluations));
	const falsePositives = counts.filter((count) => count === 0).length;
	const months = new Set<string>();
	for (const evaluation of evaluations) months.add(evaluation.firstAlertAt.slice(0, 7));
	for (const signal of signals) months.add(signal.startedAt.slice(0, 7));
	const evaluatedMonths = Math.max(1, months.size);
	const earlyCampaigns = evaluations.filter((row) => row.leadDays !== null && row.leadDays >= MIN_LEAD_DAYS).length;
	const evaluatedCampaigns = evaluations.length;
	return {
		evaluatedCampaigns,
		earlyCampaigns,
		detectionRate: evaluatedCampaigns === 0 ? 0 : earlyCampaigns / evaluatedCampaigns,
		falsePositives,
		evaluatedMonths,
		falsePositivesPerMonth: falsePositives / evaluatedMonths,
	};
}

/** Compare les signaux à la fenêtre d'évaluation bornée par les alertes connues. */
export function signalsInEvaluationWindow(
	signals: readonly PrecursorSignal[],
	campaigns: readonly CampaignForPrecursor[],
): PrecursorSignal[] {
	if (campaigns.length === 0) return [];
	const alerts = campaigns.map((campaign) => Date.parse(
		campaign.firstAlertAt instanceof Date ? campaign.firstAlertAt.toISOString() : campaign.firstAlertAt,
	));
	const windowStart = Math.min(...alerts) - MAX_LEAD_DAYS * DAY_MS;
	const windowEnd = Math.max(...alerts);
	return signals.filter((signal) => {
		const time = utcDay(signal.startedAt);
		return time >= windowStart && time <= windowEnd;
	});
}

/** Pipeline complet, utilisé par le script de mesure et par les tests. */
export function buildCampaignPrecursorReport(
	days: readonly ClaimDay[],
	campaigns: readonly CampaignForPrecursor[],
): PrecursorReport {
	const allSignals = detectClaimRateSignals(days);
	const signals = signalsInEvaluationWindow(allSignals, campaigns);
	const evaluations = evaluatePrecursors(campaigns, signals, days);
	return { signals, evaluations, metric: summarisePrecursors(signals, evaluations) };
}
