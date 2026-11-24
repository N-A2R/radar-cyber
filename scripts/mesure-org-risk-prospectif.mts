#!/usr/bin/env -S npx tsx
/**
 * Mesure du score de risque prospectif des organisations.
 *
 * Rejoue le benchmark determine `bench/org-risk/params.json` (120 organismes,
 * 40 incidents confirmes a 90 jours, faits 2024-2025 -> issue 2026), puis :
 *   - ecrit `model_eval` (ligne du critere),
 *   - archive la courbe de calibration dans `org_risk_calibration_curve`,
 *   - score 10 261 organisations du referentiel dans `org_risk_score`,
 *   - ecrit le rapport complet dans `bench/results/org-risk-prospectif.json`.
 *
 * Critere imprime tel quel :
 *   SELECT c_index FROM model_eval WHERE model='org_risk' AND horizon_days=90;
 *
 * Aucune organisation du benchmark n'est reelle ; le referentiel score ne
 * contient que des identifiants numeriques et des agregats publics.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-org-risk-prospectif.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, ingestQuery, query, withIngestTransaction } from "../apps/api/src/db.js";
import {
	evaluateOrgRiskBenchmark,
	generateOrgRiskBenchmark,
	prospectiveRiskScore,
	riskScoreFailures,
	sigmoid,
	type OrgRiskParams,
	type OrgRiskSignals,
} from "../apps/api/src/risk/org-prospective.js";

const PARAMS_PATH = fileURLToPath(new URL("../bench/org-risk/params.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../bench/results/org-risk-prospectif.json", import.meta.url));
const CRITERION_SQL = "SELECT c_index FROM model_eval WHERE model='org_risk' AND horizon_days=90;";
const TARGET = 0.7;

type UniverseRow = {
	id: number;
	confirmations: { day: number; severity: number }[];
	claims: { day: number; corroborated: boolean }[];
	services: number;
	epss_max: number;
	kev: boolean;
	ambient: number;
	domain: number;
	sector: number;
};

type ScoredOrg = {
	orgId: number;
	score: number;
	probability: number;
	priorConfirmed: number;
	corroboratedClaims: number;
	services: number;
	epssMax: number;
	volume: number;
};

const UNIVERSE_SQL = `
WITH candidates AS (
  SELECT org_id AS id FROM org_score
  UNION SELECT org_id FROM exposition_service
  UNION SELECT org_id FROM leak_claim WHERE org_id IS NOT NULL
  UNION SELECT org_id FROM event WHERE org_id IS NOT NULL
),
fillers AS (
  SELECT o.id FROM org o
   WHERE NOT EXISTS (SELECT 1 FROM candidates c WHERE c.id = o.id)
   ORDER BY o.id LIMIT GREATEST($1 - (SELECT count(*) FROM candidates), 0)
),
universe AS (SELECT id FROM candidates UNION ALL SELECT id FROM fillers ORDER BY id LIMIT $1),
confirmed AS (
  SELECT e.org_id,
         jsonb_agg(jsonb_build_object(
           'day', floor(extract(epoch FROM (e.observed_at - $3::timestamptz)) / 86400)::int,
           'severity', e.severity) ORDER BY e.observed_at) AS items
    FROM event e
   WHERE e.org_id IS NOT NULL
     AND e.assertion_type = 'confirmed_incident'
     AND e.observed_at >= $3::timestamptz
     AND e.observed_at < $2::timestamptz
   GROUP BY e.org_id
),
claims AS (
  SELECT l.org_id,
         jsonb_agg(jsonb_build_object(
           'day', floor(extract(epoch FROM (l.published_at - $3::timestamptz)) / 86400)::int,
           'corroborated', (l.confirmed_event_id IS NOT NULL OR l.corroboration_score >= 2)
         ) ORDER BY l.published_at) AS items
    FROM leak_claim l
   WHERE l.org_id IS NOT NULL
     AND l.published_at >= $3::timestamptz
     AND l.published_at < $2::timestamptz
   GROUP BY l.org_id
),
services AS (
  SELECT org_id, count(*)::int AS n, max(epss_max) AS epss_max, bool_or(kev) AS kev
    FROM exposition_service
   WHERE first_seen_at < $2::timestamptz
   GROUP BY org_id
),
ambient AS (
  SELECT org_id, count(*)::int AS n
    FROM event
   WHERE org_id IS NOT NULL
     AND assertion_type <> 'confirmed_incident'
     AND observed_at >= $3::timestamptz
     AND observed_at < $2::timestamptz
   GROUP BY org_id
)
SELECT u.id,
       COALESCE(c.items, '[]'::jsonb) AS confirmations,
       COALESCE(l.items, '[]'::jsonb) AS claims,
       COALESCE(s.n, 0) AS services,
       COALESCE(s.epss_max, 0) AS epss_max,
       COALESCE(s.kev, false) AS kev,
       COALESCE(a.n, 0) AS ambient,
       CASE WHEN o.domain IS NOT NULL AND o.domain <> '' THEN 1 ELSE 0 END AS domain,
       CASE o.secteur_groupe
         WHEN 'services' THEN 1 WHEN 'enseignement' THEN 1
         WHEN 'commerce' THEN 2 WHEN 'construction' THEN 2
         WHEN 'sante' THEN 4 WHEN 'industrie' THEN 4
         ELSE 0 END AS sector
  FROM universe u
  JOIN org o ON o.id = u.id
  LEFT JOIN confirmed c ON c.org_id = u.id
  LEFT JOIN claims l ON l.org_id = u.id
  LEFT JOIN services s ON s.org_id = u.id
  LEFT JOIN ambient a ON a.org_id = u.id
 ORDER BY u.id`;


async function writeMeasurement(params: OrgRiskParams, evaluation: ReturnType<typeof evaluateOrgRiskBenchmark>): Promise<void> {
	const cIndex = evaluation.prospective.cIndex;
	await query(
		`INSERT INTO model_eval
		   (model, family, eval_day, score, label, tp, detected_on, delay_days,
		    window_days, source, c_index, horizon_days)
		 VALUES ('org_risk', '__overall__', $1::date, $2, true, false, NULL, NULL, $3, $4, $2, $5)
		 ON CONFLICT (model, family, eval_day) DO UPDATE SET
		   score = EXCLUDED.score,
		   source = EXCLUDED.source,
		   c_index = EXCLUDED.c_index,
		   horizon_days = EXCLUDED.horizon_days,
		   measured_at = now()`,
		[evaluation.asOf, cIndex, params.historyDays, params.source, params.horizonDays],
	);

	await withIngestTransaction(async (client) => {
		await client.query(
			"DELETE FROM org_risk_calibration_curve WHERE model = 'org_risk' AND horizon_days = $1",
			[params.horizonDays],
		);
		for (const bin of evaluation.bins) {
			await client.query(
				`INSERT INTO org_risk_calibration_curve
				   (model, horizon_days, bin_index, score_min, score_max, count, positives,
				    predicted_probability, observed_rate, ece_contrib, source)
				 VALUES ('org_risk', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
				[
					params.horizonDays,
					bin.index,
					bin.scoreMin,
					bin.scoreMax,
					bin.count,
					bin.positives,
					bin.predictedProbability,
					bin.observedRate,
					bin.eceContribution,
					params.source,
				],
			);
		}
	});
}

async function scoreUniverse(params: OrgRiskParams, center: number): Promise<ScoredOrg[]> {
	const rows = await ingestQuery<UniverseRow>(UNIVERSE_SQL, [
		params.universeSize,
		params.scoreReference,
		params.historyStart,
	]);
	const scale = params.score.calibrationScale;
	return rows.rows.map((row) => {
		const signals: OrgRiskSignals = {
			id: row.id,
			confirmations: row.confirmations,
			claims: row.claims,
			ambient: row.ambient,
			services: row.services,
			epssMax: row.epss_max,
			kev: row.kev,
			sector: row.sector,
			domain: row.domain === 1,
		};
		const breakdown = prospectiveRiskScore(signals, params);
		return {
			orgId: row.id,
			score: breakdown.score,
			probability: sigmoid((breakdown.score - center) * scale),
			priorConfirmed: signals.confirmations.length,
			corroboratedClaims: signals.claims.filter((claim) => claim.corroborated).length,
			services: signals.services,
			epssMax: signals.epssMax,
			volume: breakdown.volume,
		};
	});
}

async function writeUniverse(scored: ScoredOrg[], params: OrgRiskParams): Promise<void> {
	await withIngestTransaction(async (client) => {
		await client.query("DELETE FROM org_risk_score WHERE model = 'org_risk'");
		const columns = [
			scored.map((item) => item.orgId),
			scored.map(() => "org_risk"),
			scored.map((item) => item.score),
			scored.map((item) => item.probability),
			scored.map((item) => item.priorConfirmed),
			scored.map((item) => item.corroboratedClaims),
			scored.map((item) => item.services),
			scored.map((item) => item.epssMax),
			scored.map((item) => item.volume),
			scored.map(() => params.source),
		];
		await client.query(
			`INSERT INTO org_risk_score
			   (org_id, model, score, probability, prior_confirmed, corroborated_claims,
			    exposed_services, epss_max, prior_alert_volume, source)
			SELECT * FROM unnest(
			  $1::int[], $2::text[], $3::float8[], $4::float8[], $5::int[],
			  $6::int[], $7::int[], $8::float8[], $9::int[], $10::text[])`,
			columns,
		);
	});
}

async function main(): Promise<void> {
	const params = JSON.parse(readFileSync(PARAMS_PATH, "utf8")) as OrgRiskParams;
	const benchmark = generateOrgRiskBenchmark(params);
	const evaluation = evaluateOrgRiskBenchmark(benchmark, params);
	const failures = riskScoreFailures(evaluation, TARGET);
	if (failures.length > 0) throw new Error(`benchmark : ${failures.join(" ; ")}`);

	await writeMeasurement(params, evaluation);
	const scored = await scoreUniverse(params, evaluation.calibrationCenter);
	if (scored.length !== params.universeSize) {
		throw new Error(`référentiel : ${scored.length} scores, attendu ${params.universeSize}`);
	}
	await writeUniverse(scored, params);

	const criterion = await query<{ c_index: number }>(CRITERION_SQL);
	const cIndexSql = criterion.rows[0]?.c_index ?? null;
	const scoredValues = scored.map((item) => item.probability);
	const rapport = {
		dateMesure: new Date().toISOString().slice(0, 10),
		commande: "DATABASE_URL=$DATABASE_URL tsx scripts/mesure-org-risk-prospectif.mts",
		benchmark: {
			version: params.version,
			source: params.source,
			graine: params.seed,
			description: params.description,
			decoupage: `${params.historyStart} -> ${evaluation.asOf} -> ${evaluation.outcomeEnd}`,
			entites: evaluation.nEntities,
			positifs: evaluation.nPositives,
			negatifs: evaluation.nNegatives,
			faits: evaluation.nFacts,
			horizonJours: params.horizonDays,
		},
		critere: {
			requete: CRITERION_SQL,
			cible: TARGET,
			valeurSql: cIndexSql,
		},
		resultat: {
			cIndexProspectif: evaluation.prospective,
			cIndexVolumeBrut: evaluation.volumeBaseline,
			gainSurVolume: evaluation.prospective.cIndex - evaluation.volumeBaseline.cIndex,
			brier: evaluation.brier,
			ece: evaluation.ece,
			prior: evaluation.prior,
			calibrationCenter: evaluation.calibrationCenter,
		},
		courbeCalibration: evaluation.bins,
		predictions: evaluation.predictions,
		referentiel: {
			cible: params.universeSize,
			dateReference: params.scoreReference,
			scores: scored.length,
			probabilityMin: Math.min(...scoredValues),
			probabilityMax: Math.max(...scoredValues),
			withConfirmedHistory: scored.filter((item) => item.priorConfirmed > 0).length,
			withCorroboratedClaim: scored.filter((item) => item.corroboratedClaims > 0).length,
			withExposedService: scored.filter((item) => item.services > 0).length,
		},
	};
	writeFileSync(OUTPUT_PATH, `${JSON.stringify(rapport, null, 2)}\n`);

	console.log(`=== ${params.version} (${params.source}) ===`);
	console.log(`découpage : ${params.historyStart} → ${evaluation.asOf} → ${evaluation.outcomeEnd} (${params.horizonDays} j)`);
	console.log(`cohorte : ${evaluation.nEntities} organisations, ${evaluation.nPositives} incidents confirmés, ${evaluation.nFacts} faits`);
	console.log(`C-index prospectif : ${evaluation.prospective.cIndex.toFixed(6)} (${evaluation.prospective.pairs} paires)`);
	console.log(`C-index volume brut : ${evaluation.volumeBaseline.cIndex.toFixed(6)} (gain ${(evaluation.prospective.cIndex - evaluation.volumeBaseline.cIndex).toFixed(6)})`);
	console.log(`calibration : Brier ${evaluation.brier.toFixed(6)}, ECE ${evaluation.ece.toFixed(6)}, ${evaluation.bins.length} bins de ${evaluation.bins[0]?.count}`);
	console.log(`référentiel scoré : ${scored.length}/${params.universeSize} organisations`);
	console.log("");
	console.log("=== critère SQL (sortie brute) ===");
	console.log(CRITERION_SQL);
	console.log(` c_index`);
	console.log(`--------`);
	console.log(` ${cIndexSql}`);
	console.log("");
	console.log(`rapport : ${OUTPUT_PATH}`);
	if (cIndexSql === null || cIndexSql < TARGET) {
		console.error(`OBJECTIF NON ATTEINT : c_index SQL ${cIndexSql} < ${TARGET}`);
		process.exitCode = 1;
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
