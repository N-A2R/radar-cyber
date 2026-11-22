#!/usr/bin/env -S npx tsx
/**
 * Mesure de la décroissance du risque avec l'âge des faits.
 *
 * Rejoue le benchmark déterministe `bench/risk-decay/params.json`, note les
 * deux modèles sur le même découpage temporel, puis persiste le résultat :
 *   - `model_eval` : une ligne résumé par modèle et par horizon
 *     (`family = '__overall__'`, `score = c_index`) ;
 *   - `risk_model_metric` : le détail auditable (entités, positifs, faits,
 *     concordance, demi-vie) ;
 *   - `bench/results/risk-decay-240j.json` : rapport complet rejouable.
 *
 * Le critère de sortie est imprimé tel quel :
 *   SELECT d.c_index - s.c_index FROM model_eval d, model_eval s
 *    WHERE d.model='risk_decay' AND s.model='risk_static'
 *      AND d.horizon_days=s.horizon_days;
 *
 * Aucune donnée personnelle, aucune organisation, aucune source réelle.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-risk-decay.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	evaluateDecayBenchmark,
	generateDecayBenchmark,
	type DecayBenchmarkParams,
} from "../apps/api/src/risk/decay-benchmark.js";

const PARAMS_PATH = fileURLToPath(new URL("../bench/risk-decay/params.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../bench/results/risk-decay-240j.json", import.meta.url));

const CRITERION_SQL = `SELECT d.c_index - s.c_index
  FROM model_eval d, model_eval s
 WHERE d.model = 'risk_decay'
   AND s.model = 'risk_static'
   AND d.horizon_days = s.horizon_days`;

async function writeMeasurement(
	params: DecayBenchmarkParams,
	evaluation: ReturnType<typeof evaluateDecayBenchmark>,
): Promise<void> {
	const models = [
		{
			model: "risk_static",
			cIndex: evaluation.static.cIndex,
			halfLife: null as number | null,
			pairs: evaluation.static.pairs,
		},
		{
			model: "risk_decay",
			cIndex: evaluation.decay.cIndex,
			halfLife: evaluation.halfLifeDays,
			pairs: evaluation.decay.pairs,
		},
	];
	for (const entry of models) {
		await query(
			`INSERT INTO model_eval
			   (model, family, eval_day, score, label, tp, detected_on, delay_days,
			    window_days, source, c_index, horizon_days)
			 VALUES ($1, '__overall__', $2::date, $3, $4, false, NULL, NULL, $5, $6, $3, $7)
			 ON CONFLICT (model, family, eval_day) DO UPDATE SET
			   score = EXCLUDED.score,
			   label = EXCLUDED.label,
			   tp = EXCLUDED.tp,
			   detected_on = EXCLUDED.detected_on,
			   delay_days = EXCLUDED.delay_days,
			   window_days = EXCLUDED.window_days,
			   source = EXCLUDED.source,
			   c_index = EXCLUDED.c_index,
			   horizon_days = EXCLUDED.horizon_days,
			   measured_at = now()`,
			[
				entry.model,
				evaluation.asOf,
				entry.cIndex,
				evaluation.nPositives > 0,
				params.historyDays,
				params.source,
				evaluation.horizonDays,
			],
		);
		await query(
			`INSERT INTO risk_model_metric
			   (model, horizon_days, n_entities, n_positives, n_negatives, n_facts,
			    c_index, pairs, half_life_days, source)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 ON CONFLICT (model, horizon_days) DO UPDATE SET
			   n_entities = EXCLUDED.n_entities,
			   n_positives = EXCLUDED.n_positives,
			   n_negatives = EXCLUDED.n_negatives,
			   n_facts = EXCLUDED.n_facts,
			   c_index = EXCLUDED.c_index,
			   pairs = EXCLUDED.pairs,
			   half_life_days = EXCLUDED.half_life_days,
			   source = EXCLUDED.source,
			   measured_at = now()`,
			[
				entry.model,
				evaluation.horizonDays,
				evaluation.nEntities,
				evaluation.nPositives,
				evaluation.nNegatives,
				evaluation.nFacts,
				entry.cIndex,
				entry.pairs,
				entry.halfLife,
				params.source,
			],
		);
	}
}

async function main(): Promise<void> {
	const params = JSON.parse(readFileSync(PARAMS_PATH, "utf8")) as DecayBenchmarkParams;
	const benchmark = generateDecayBenchmark(params);
	const evaluation = evaluateDecayBenchmark(benchmark);
	await writeMeasurement(params, evaluation);

	const sql = await query<Record<string, number | null>>(CRITERION_SQL);
	const deltaSql = sql.rows.length === 1 ? (Object.values(sql.rows[0]!)[0] ?? null) : null;

	const rapport = {
		dateMesure: new Date().toISOString().slice(0, 10),
		commande: "DATABASE_URL=$DATABASE_URL tsx scripts/mesure-risk-decay.mts",
		benchmark: {
			version: params.version,
			source: params.source,
			graine: params.seed,
			entites: params.entities,
			debut: params.start,
			historiqueJours: params.historyDays,
			horizonJours: params.horizonDays,
			asOf: evaluation.asOf,
			finIssue: evaluation.outcomeEnd,
			faits: evaluation.nFacts,
			positifs: evaluation.nPositives,
			negatifs: evaluation.nNegatives,
			description: params.description,
			nonStationnarite: {
				marcheAleatoire: "AR(1) sur log-intensité",
				phi: params.arPhi,
				sigma: params.arSigma,
				demiVieJours: params.halfLifeDays,
			},
		},
		critere: {
			requete: CRITERION_SQL,
			cible: 0.05,
			valeurSql: deltaSql,
		},
		resultat: {
			riskStatic: evaluation.static,
			riskDecay: evaluation.decay,
			delta: evaluation.delta,
		},
	};
	writeFileSync(OUTPUT_PATH, `${JSON.stringify(rapport, null, 2)}\n`);

	console.log(`=== benchmark ${params.version} (${params.source}) ===`);
	console.log(`entités : ${evaluation.nEntities} (${evaluation.nPositives} positives, ${evaluation.nNegatives} négatives)`);
	console.log(`faits : ${evaluation.nFacts} ; découpage : ${evaluation.asOf} ; issue : ${evaluation.outcomeEnd}`);
	console.log(`demi-vie : ${evaluation.halfLifeDays} jours`);
	console.log("");
	console.log("=== concordance sur le même split temporel ===");
	console.log(`risk_static : C-index ${evaluation.static.cIndex.toFixed(6)} (${evaluation.static.pairs} paires)`);
	console.log(`risk_decay  : C-index ${evaluation.decay.cIndex.toFixed(6)} (${evaluation.decay.pairs} paires)`);
	console.log(`delta       : ${evaluation.delta.toFixed(6)}  (cible >= 0.05)`);
	console.log("");
	console.log("=== critère SQL (sortie brute) ===");
	console.log(CRITERION_SQL);
	console.log(`→ ${deltaSql}`);
	console.log("");
	console.log(`rapport : ${OUTPUT_PATH}`);
	if (deltaSql === null || deltaSql < 0.05) {
		console.error(`OBJECTIF NON ATTEINT : delta SQL ${deltaSql} < 0.05`);
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
