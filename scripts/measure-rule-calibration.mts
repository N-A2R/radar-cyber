#!/usr/bin/env -S npx tsx
/**
 * Rejeu en lecture seule de la calibration des 8 règles actives.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-rule-calibration.mts
 *
 * Holdout : les alertes créées sur 30 jours. Les vérités terrain viennent des
 * verdicts déjà enregistrés (`false_event`, `evidence->'false_event'`), jamais
 * d'un jugement pris ici. Aucun titre, URL ou identifiant de victime n'est lu
 * ni écrit. Le score balayé est la note de confiance **non majorée** : la
 * majoration de 30 d'un ancrage Nouvelle-Aquitaine ne concerne que la porte
 * globale du détecteur.
 *
 * Le script ne modifie aucune table : il publie seulement
 * `bench/results/rule-calibration-30d.json`. Une règle observée sans seuil
 * satisfaisant les contraintes est signalée, jamais dotée d'un seuil inventé.
 * L'application d'un seuil en production exige une migration dédiée.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	MIN_PRECISION,
	MIN_RECALL,
	chooseThreshold,
	mesurerObjectifCalibration,
	precisionRecallCurve,
	type CalibrationPoint,
	type MesureRegleObjectif,
	type StatutMesureRegle,
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
	is_false: boolean;
	score: number;
};

export type RuleCalibrationRow = MesureRegleObjectif & {
	threshold?: number | null;
	statut: StatutMesureRegle;
	negatives: number;
	source: string;
	curve: Pick<CalibrationPoint, "threshold" | "precision" | "recall" | "alerts">[];
	meilleur?: { precision: number; recall: number; threshold: number; alerts: number };
	meilleurAuRappel60?: { precision: number; recall: number; threshold: number; alerts: number };
};
const THRESHOLDS = Array.from({ length: 121 }, (_, i) => i);
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

export function calibrateRule(ruleId: string, rows: readonly AlertRow[]): RuleCalibrationRow {
	const observes = rows.filter((r) => r.rule_id === ruleId);
	const observations = observes.map((r) => ({ score: r.score, positive: !r.is_false }));
	const positives = observations.filter((o) => o.positive).length;
	if (observations.length === 0) {
		return {
			ruleId,
			statut: "sans-observation",
			precision: null,
			recall: null,
			alerts: 0,
			observedAlerts: 0,
			positives: 0,
			negatives: 0,
			conservedPositives: 0,
			source: "holdout-30j:sans-observation",
			curve: [],
		};
	}
	const curve = precisionRecallCurve(observations, THRESHOLDS);
	const point = chooseThreshold(curve);
	if (!point) {
		const avecAlertes = curve.filter((p) => p.alerts > 0);
		const meilleur = [...avecAlertes].sort(
			(a, b) => b.precision - a.precision || b.threshold - a.threshold,
		)[0];
		const meilleurAuRappel60 = curve
			.filter((p) => p.recall >= MIN_RECALL && p.alerts > 0)
			.sort((a, b) => b.precision - a.precision || b.threshold - a.threshold)[0];
		return {
			ruleId,
			statut: "sans-seuil-qualifiant",
			precision: null,
			recall: null,
			alerts: observes.length,
			observedAlerts: observes.length,
			positives,
			negatives: observations.length - positives,
			conservedPositives: positives,
			source: "holdout-30j:alertes+false_event",
			curve: curve.map(({ threshold, precision, recall, alerts }) => ({
				threshold,
				precision: round4(precision),
				recall: round4(recall),
				alerts,
			})),
			...(meilleur ? {
				meilleur: {
					precision: round4(meilleur.precision),
					recall: round4(meilleur.recall),
					threshold: meilleur.threshold,
					alerts: meilleur.alerts,
				},
			} : {}),
			...(meilleurAuRappel60 ? {
				meilleurAuRappel60: {
					precision: round4(meilleurAuRappel60.precision),
					recall: round4(meilleurAuRappel60.recall),
					threshold: meilleurAuRappel60.threshold,
					alerts: meilleurAuRappel60.alerts,
				},
			} : {}),
		};
	}
	return {
		ruleId,
		statut: "mesure",
		threshold: point.threshold,
		precision: round4(point.precision),
		recall: round4(point.recall),
		alerts: point.alerts,
		observedAlerts: observations.length,
		positives,
		negatives: observations.length - positives,
		conservedPositives: point.tp,
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
		const horloge = await client.query<{ measured_at: string; database: string }>(
			"SELECT now()::text AS measured_at, current_database()::text AS database",
		);
		const res = await client.query<Omit<AlertRow, "score">>(`
			SELECT a.rule_id,
			       a.evidence->'confidence'->>'score' AS base_score,
			       a.evidence->>'silenceHours' AS silence_hours,
			       (f.event_id IS NOT NULL OR a.evidence ? 'false_event') AS is_false
			  FROM alert a
			  LEFT JOIN false_event f ON f.event_id = a.event_id
			 WHERE a.created_at >= now() - interval '30 days'
		`);
		// La règle de supervision porte une durée en heures, pas une note de
		// confiance ; toutes les autres sont mesurées sans majoration d'ancrage.
		const rows: AlertRow[] = res.rows.map((r) => ({
			...r,
			score: r.rule_id === "supervision:silent-source-24h"
				? Number(r.silence_hours)
				: Number(r.base_score),
		}));
		const rules = ACTIVE_RULES.map((ruleId) => calibrateRule(ruleId, rows));
		const seuils = new Map(
			rules.filter((r) => r.statut === "mesure").map((r) => [r.ruleId, r.threshold as number]),
		);
		const conservées = rows.filter(
			(r) => seuils.get(r.rule_id) == null || r.score >= (seuils.get(r.rule_id) as number),
		).length;
		const vraiesRetirées = rows.filter(
			(r) => !r.is_false && seuils.get(r.rule_id) != null && r.score < (seuils.get(r.rule_id) as number),
		).length;
		const live = await client.query<{
			rule_id: string;
			threshold: string;
			measured_at: string;
		}>("SELECT rule_id, threshold::text, measured_at::text FROM rule_calibration ORDER BY rule_id");
		const objectif = mesurerObjectifCalibration(rules, rows.length);
		const report = {
			generatedAt: new Date().toISOString(),
			measuredAt: horloge.rows[0]?.measured_at ?? null,
			database: horloge.rows[0]?.database ?? null,
			mode: "lecture-seule",
			scale: "note de confiance non majorée ; majoration NA réservée à la porte globale",
			holdout: {
				days: 30,
				alerts: rows.length,
				window: "created_at >= now() - interval '30 days'",
				outOfScopeAlerts: rows.length - rules.reduce((n, r) => n + r.observedAlerts, 0),
			},
			constraints: { minPrecision: MIN_PRECISION, minRecall: MIN_RECALL },
			rules,
			check: {
				qualifying: rules.filter((r) => r.statut === "mesure").length,
				withObservation: rules.filter((r) => r.statut !== "sans-observation").length,
				withoutQualifyingThreshold: rules.filter((r) => r.statut === "sans-seuil-qualifiant").length,
				withoutObservation: rules.filter((r) => r.statut === "sans-observation").length,
				rows: rules.length,
			},
			projection: {
				alertes30j: rows.length,
				projetees: conservées,
				retirees: rows.length - conservées,
				vraiesRetirees: vraiesRetirées,
				note: "seuls les seuils qualifiants sont appliqués ; les autres règles sont conservées",
			},
			live: {
				rows: live.rows.length,
				thresholds: Object.fromEntries(live.rows.map((r) => [r.rule_id, Number(r.threshold)])),
				measuredAt: live.rows[0]?.measured_at ?? null,
				modifiedByThisRun: false,
			},
			objectif: objectif.ligne,
		};
		writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
		console.log(JSON.stringify(report.check));
		console.log(JSON.stringify(report.projection));
		console.log(objectif.ligne);
		for (const row of rules) {
			const mesure = row.statut === "mesure"
				? `seuil=${row.threshold} precision=${row.precision?.toFixed(4)} rappel=${row.recall?.toFixed(4)}`
				: `seuil=non mesure precision=non mesure rappel=non mesure`;
			console.log(`${row.ruleId.padEnd(30)} ${row.statut.padEnd(21)} ${mesure} alertes=${row.alerts}`);
		}
	} finally {
		await client.end();
	}
}

await main();
