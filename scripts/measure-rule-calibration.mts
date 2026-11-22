#!/usr/bin/env -S npx tsx
/**
 * Mesure reproductible de la calibration des 8 règles actives.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/measure-rule-calibration.mts
 *
 * Holdout : les alertes des 30 derniers jours (1457 sur le jeu livré). Les
 * vérités terrain viennent des verdicts déjà enregistrés (false_event et
 * evidence->'false_event'), jamais d'un jugement pris ici. Aucun titre, URL
 * ou identifiant de victime n'est lu ni écrit.
 *
 * Le script met à jour `rule_calibration` de façon idempotente et publie le
 * rapport `bench/results/rule-calibration-30d.json`. La migration SQL porte
 * les mêmes valeurs pour qu'une base neuve soit calibrée dès le setup.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	chooseThreshold,
	noObservationPoint,
	precisionRecallCurve,
	ruleScore,
	type CalibrationObservation,
	type CalibrationPoint,
} from "../apps/api/src/detect/calibration.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const JSON_PATH = fileURLToPath(new URL("../bench/results/rule-calibration-30d.json", import.meta.url));

/** Les 7 règles JSON de db/detection-rules.sql + la règle de supervision pure. */
export const ACTIVE_RULES = [
	"incident-confirme",
	"ransomware-revendication",
	"avis-cert-fr",
	"fuite-donnees",
	"certificat-observé",
	"presse-cyber",
	"operateur-critique-vise",
	"supervision:silent-source-24h",
] as const;

type AlertRow = {
	rule_id: string;
	base_score: string | null;
	silence_hours: string | null;
	anchor: boolean;
	is_false: boolean;
};

export type RuleCalibrationRow = {
	ruleId: string;
	threshold: number;
	precision: number;
	recall: number;
	alerts: number;
	positives: number;
	negatives: number;
	source: string;
	curve: Pick<CalibrationPoint, "threshold" | "precision" | "recall" | "alerts">[];
};

const THRESHOLDS = Array.from({ length: 121 }, (_, i) => i);
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

function toObservation(row: AlertRow): CalibrationObservation {
	// La règle de supervision ne porte pas de note de confiance : son score
	// observable est la durée de silence mesurée, en heures.
	const base = row.rule_id === "supervision:silent-source-24h"
		? Number(row.silence_hours)
		: Number(row.base_score);
	return {
		score: ruleScore(base, row.anchor),
		positive: !row.is_false,
	};
}

export function calibrateRule(ruleId: string, rows: readonly AlertRow[]): RuleCalibrationRow {
	const observations = rows.filter((r) => r.rule_id === ruleId).map(toObservation);
	const curve = precisionRecallCurve(observations, THRESHOLDS);
	if (observations.length === 0) {
		const point = noObservationPoint();
		return {
			ruleId,
			threshold: point.threshold,
			precision: point.precision,
			recall: point.recall,
			alerts: point.alerts,
			positives: 0,
			negatives: 0,
			source: "holdout-30j:sans-observation",
			curve: [],
		};
	}
	const point = chooseThreshold(curve);
	if (!point) {
		// Un échec est un résultat : on ne fabrique pas un seuil qualifiant.
		throw new Error(
			`Aucun seuil ne satisfait precision>=0.85 et recall>=0.60 pour ${ruleId} ` +
				`(${observations.filter((o) => o.positive).length} positifs, ` +
				`${observations.filter((o) => !o.positive).length} négatifs)`,
		);
	}
	const positives = observations.filter((o) => o.positive).length;
	return {
		ruleId,
		threshold: point.threshold,
		precision: round4(point.precision),
		recall: round4(point.recall),
		alerts: point.alerts,
		positives,
		negatives: observations.length - positives,
		source: "holdout-30j:alertes+false_event",
		curve: curve.map(({ threshold, precision, recall, alerts }) => ({
			threshold,
			precision: round4(precision),
			recall: round4(recall),
			alerts,
		})),
	};
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		const res = await client.query<AlertRow>(`
			SELECT a.rule_id,
			       a.evidence->'confidence'->>'score' AS base_score,
			       a.evidence->>'silenceHours' AS silence_hours,
			       (a.event_id IS NOT NULL AND (e.regional OR e.org_id IS NOT NULL)) AS anchor,
			       (f.event_id IS NOT NULL OR a.evidence ? 'false_event') AS is_false
			  FROM alert a
			  LEFT JOIN event e ON e.id = a.event_id
			  LEFT JOIN false_event f ON f.event_id = e.id
			 WHERE a.created_at >= now() - interval '30 days'
		`);
		const rows = res.rows;
		const calibrated = ACTIVE_RULES.map((ruleId) => calibrateRule(ruleId, rows));

		await client.query("BEGIN");
		for (const row of calibrated) {
			await client.query(
				`INSERT INTO rule_calibration
				  (rule_id, threshold, precision, recall, alerts, positives, negatives, window_days, source)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,30,$8)
				 ON CONFLICT (rule_id) DO UPDATE SET
				   threshold = EXCLUDED.threshold,
				   precision = EXCLUDED.precision,
				   recall = EXCLUDED.recall,
				   alerts = EXCLUDED.alerts,
				   positives = EXCLUDED.positives,
				   negatives = EXCLUDED.negatives,
				   measured_at = now(),
				   source = EXCLUDED.source`,
				[row.ruleId, row.threshold, row.precision, row.recall, row.alerts,
					row.positives, row.negatives, row.source],
			);
		}
		await client.query("COMMIT");

		const check = await client.query<{ qualifying: string; total_alerts: string; alerts: string }>(`
			SELECT count(*) FILTER (WHERE precision >= 0.85 AND recall >= 0.6)::text AS qualifying,
			       sum(alerts)::text AS total_alerts,
			       count(*)::text AS alerts
			  FROM rule_calibration
		`);
		const report = {
			generatedAt: new Date().toISOString(),
			holdout: { days: 30, alerts: rows.length, window: "created_at >= now() - interval '30 days'" },
			rules: calibrated,
			check: {
				qualifying: Number(check.rows[0]?.qualifying ?? 0),
				totalAlerts: Number(check.rows[0]?.total_alerts ?? 0),
				rows: Number(check.rows[0]?.alerts ?? 0),
			},
		};
		writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
		console.log(JSON.stringify(report.check));
		for (const row of calibrated) {
			console.log(
				`${row.ruleId.padEnd(30)} seuil=${String(row.threshold).padStart(3)} ` +
					`precision=${row.precision.toFixed(4)} rappel=${row.recall.toFixed(4)} alertes=${row.alerts}`,
			);
		}
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	} finally {
		await client.end();
	}
}

await main();
