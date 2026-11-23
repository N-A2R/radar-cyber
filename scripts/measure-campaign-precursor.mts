#!/usr/bin/env -S npx tsx
/**
 * Mesure du signal précurseur de campagne sur le corpus Postgres local.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-campaign-precursor.mts
 *
 * Rejoue le détecteur sur les revendications publiques agrégées par jour,
 * persiste les signaux/évaluations/résumé, puis affiche la requête brute du
 * critère. Aucun titre de victime, courriel ou identifiant personnel n'est
 * lu : la requête ne projette que des dates, des groupes et des agrégats.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	buildCampaignPrecursorReport,
	MIN_LEAD_DAYS,
	MODEL,
	SOURCE,
	type CampaignForPrecursor,
	type ClaimDay,
} from "../apps/api/src/detection/campaign-precursor.js";
import { persistCampaignPrecursor } from "../apps/api/src/detection/campaign-precursor-store.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
// Import différé nécessaire : db.js crée ses pools au chargement du module,
// donc DATABASE_URL doit être posé avant son évaluation (pas de static import).
const { closePools, query, withIngestTransaction } = await import("../apps/api/src/db.js");

const OUTPUT = fileURLToPath(new URL("../bench/results/campaign-precursor.json", import.meta.url));
const CRITERION_SQL =
	"SELECT count(*) FILTER (WHERE lead_days >= 14)::float/count(*) FROM campaign_precursor_eval";

type ClaimDayRow = { day: string; claims: number | string; sources: number | string };
type CampaignRow = { campaign_key: string; label: string; first_alert_at: Date | string };
type RatioRow = Record<string, number | string>;

async function main(): Promise<void> {
	const { rows: dayRows } = await query<ClaimDayRow>(
		`SELECT (published_at AT TIME ZONE 'UTC')::date::text AS day,
		        count(*)::int AS claims,
		        count(DISTINCT site_slug)::int AS sources
		   FROM leak_claim
		  GROUP BY 1 ORDER BY 1`,
	);
	const days: ClaimDay[] = dayRows.map((row) => ({
		day: row.day,
		claims: Number(row.claims),
		sources: Number(row.sources),
	}));

	const { rows: campaignRows } = await query<CampaignRow>(
		`SELECT c.cle AS campaign_key, c.label,
		        (SELECT min(a.created_at)
		           FROM alert a
		          WHERE a.event_id::text = ANY(c.incidents::text[])) AS first_alert_at
		   FROM campaign c
		  WHERE EXISTS (SELECT 1 FROM alert a WHERE a.event_id::text = ANY(c.incidents::text[]))
		  ORDER BY first_alert_at, c.cle`,
	);
	if (campaignRows.length === 0) throw new Error("aucune campagne avec alerte : mesure impossible");
	const campaigns: CampaignForPrecursor[] = campaignRows.map((row) => ({
		campaignKey: row.campaign_key,
		label: row.label,
		firstAlertAt: row.first_alert_at,
	}));

	const report = buildCampaignPrecursorReport(days, campaigns);
	await withIngestTransaction((client) =>
		persistCampaignPrecursor(client, { ...report, model: MODEL, source: SOURCE }),
	);

	const { rows: ratioRows } = await query<RatioRow>(CRITERION_SQL);
	// La requête du critère est reproduite à l'identique : sa colonne est anonyme.
	const ratio = Number(Object.values(ratioRows[0] ?? {})[0] ?? 0);
	const result = {
		command: "pnpm mesure:precurseur-campagne",
		model: MODEL,
		source: SOURCE,
		minLeadDays: MIN_LEAD_DAYS,
		criterionSql: CRITERION_SQL,
		criterionRatio: ratio,
		metric: report.metric,
		signals: report.signals,
		evaluations: report.evaluations,
		measuredAt: new Date().toISOString(),
	};
	mkdirSync(new URL("../bench/results/", import.meta.url), { recursive: true });
	writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");

	console.log(CRITERION_SQL);
	console.log(ratio);
	console.log(
		`campaigns=${report.metric.evaluatedCampaigns} early=${report.metric.earlyCampaigns} ` +
			`signals=${report.signals.length} false_positives=${report.metric.falsePositives} ` +
			`false_positives_per_month=${report.metric.falsePositivesPerMonth} -> ${OUTPUT}`,
	);
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
