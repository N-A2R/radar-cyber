/**
 * Persistance idempotente d'une mesure de précurseur de campagne.
 *
 * Seules les lignes du modèle mesuré sont remplacées : une base partagée peut
 * contenir les résultats d'autres modèles et ils ne doivent pas être effacés.
 * Le appelant fournit la transaction, afin que signaux, évaluations et résumé
 * soient visibles ensemble ou pas du tout.
 */
import type { PoolClient } from "pg";
import {
	countSignalMatches,
	COOLDOWN_DAYS,
	LOOKBACK_DAYS,
	MAX_LEAD_DAYS,
	MIN_CLAIMS,
	MIN_LEAD_DAYS,
	MIN_SOURCES,
	type CampaignPrecursorRow,
	type PrecursorMetric,
	type PrecursorSignal,
} from "./campaign-precursor.js";

export type CampaignPrecursorPersistence = {
	model: string;
	source: string;
	signals: readonly PrecursorSignal[];
	evaluations: readonly CampaignPrecursorRow[];
	metric: PrecursorMetric;
};

export async function persistCampaignPrecursor(
	client: PoolClient,
	report: CampaignPrecursorPersistence,
): Promise<void> {
	await client.query("DELETE FROM campaign_precursor_eval WHERE model = $1", [report.model]);
	await client.query("DELETE FROM campaign_precursor_signal WHERE model = $1", [report.model]);
	await client.query("DELETE FROM campaign_precursor_metric WHERE model = $1", [report.model]);

	for (const signal of report.signals) {
		await client.query(
			`INSERT INTO campaign_precursor_signal
			   (model, started_at, ended_at, claims, sources, matched_campaigns, false_positive, source)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			[
				report.model,
				signal.startedAt,
				signal.endedAt,
				signal.claims,
				signal.sources,
				0,
				false,
				report.source,
			],
		);
	}

	for (const evaluation of report.evaluations) {
		await client.query(
			`INSERT INTO campaign_precursor_eval
			   (model, campaign_key, label, first_alert_at, precursor_at, lead_days,
			    signal_claims, signal_sources, source)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			[
				report.model,
				evaluation.campaignKey,
				evaluation.label,
				evaluation.firstAlertAt,
				evaluation.precursorAt,
				evaluation.leadDays,
				evaluation.signalClaims,
				evaluation.signalSources,
				report.source,
			],
		);
	}

	await client.query(
		`INSERT INTO campaign_precursor_metric
		   (model, evaluated_campaigns, early_campaigns, detection_rate, false_positives,
		    evaluated_months, false_positives_per_month, lookback_days, min_claims,
		    min_sources, min_lead_days, max_lead_days, cooldown_days, source)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		[
			report.model,
			report.metric.evaluatedCampaigns,
			report.metric.earlyCampaigns,
			report.metric.detectionRate,
			report.metric.falsePositives,
			report.metric.evaluatedMonths,
			report.metric.falsePositivesPerMonth,
			LOOKBACK_DAYS,
			MIN_CLAIMS,
			MIN_SOURCES,
			MIN_LEAD_DAYS,
			MAX_LEAD_DAYS,
			COOLDOWN_DAYS,
			report.source,
		],
	);

	// Un signal sans campagne dans sa fenêtre est un faux positif ; les autres
	// portent le nombre de campagnes effectivement précédées.
	for (const signal of report.signals) {
		const matches = countSignalMatches(signal, report.evaluations);
		const falsePositive = matches === 0;
		await client.query(
			`UPDATE campaign_precursor_signal
			    SET matched_campaigns = $1, false_positive = $2
			  WHERE model = $3 AND started_at = $4`,
			[matches, falsePositive, report.model, signal.startedAt],
		);
	}
}
