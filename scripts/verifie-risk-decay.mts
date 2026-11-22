#!/usr/bin/env -S npx tsx
/**
 * Vérificateur du critère « décroissance du risque avec l'âge des faits ».
 *
 * Rejoue le benchmark déterministe depuis `bench/risk-decay/params.json` avec
 * le même code que la mesure, puis :
 *   - contrôle les deux lignes `model_eval` (même découpage, même horizon) ;
 *   - compare les C-index stockés au recalcul ;
 *   - exécute le critère SQL tel quel et imprime sa sortie brute.
 *
 * Cible : `c_index(risk_decay) − c_index(risk_static) >= 0,05`.
 * Code de sortie non nul si la cible manque ou si la base diverge du calcul :
 * un échec doit être visible, jamais arrondi.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-risk-decay.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	evaluateDecayBenchmark,
	generateDecayBenchmark,
	type DecayBenchmarkParams,
} from "../apps/api/src/risk/decay-benchmark.js";

const PARAMS_PATH = fileURLToPath(new URL("../bench/risk-decay/params.json", import.meta.url));
const TARGET_DELTA = 0.05;

const CRITERION_SQL = `SELECT d.c_index - s.c_index
  FROM model_eval d, model_eval s
 WHERE d.model = 'risk_decay'
   AND s.model = 'risk_static'
   AND d.horizon_days = s.horizon_days`;

type EvalRow = {
	model: string;
	family: string;
	eval_day: Date | string;
	score: number;
	c_index: number | null;
	horizon_days: number | null;
	window_days: number;
	source: string;
};

type MetricRow = {
	model: string;
	horizon_days: number;
	n_entities: number;
	n_positives: number;
	n_negatives: number;
	n_facts: number;
	c_index: number;
	pairs: number;
	half_life_days: number | null;
	source: string;
};

function isoDay(value: Date | string): string {
	// `date` est rendu par node-postgres comme un Date à minuit local :
	// `toISOString()` décalerait d'un jour à l'est de Greenwich.
	if (value instanceof Date) {
		const year = value.getFullYear();
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const day = String(value.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
	return String(value).slice(0, 10);
}

async function main(): Promise<void> {
	const params = JSON.parse(readFileSync(PARAMS_PATH, "utf8")) as DecayBenchmarkParams;
	const evaluation = evaluateDecayBenchmark(generateDecayBenchmark(params));

	const rows = await query<EvalRow>(
		`SELECT model, family, eval_day, score, c_index, horizon_days, window_days, source
		   FROM model_eval
		  WHERE model IN ('risk_static', 'risk_decay')
		  ORDER BY model`,
	);
	const metrics = await query<MetricRow>(
		`SELECT model, horizon_days, n_entities, n_positives, n_negatives, n_facts,
		        c_index, pairs, half_life_days, source
		   FROM risk_model_metric
		  WHERE model IN ('risk_static', 'risk_decay')
		  ORDER BY model`,
	);
	const sql = await query<Record<string, number | null>>(CRITERION_SQL);
	const deltaSql = sql.rows.length === 1 ? (Object.values(sql.rows[0]!)[0] ?? null) : null;

	const stored = new Map(rows.rows.map((row) => [row.model, row]));
	const storedMetrics = new Map(metrics.rows.map((row) => [row.model, row]));
	const expected = [
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

	console.log("=== SÉRIE DU CRITÈRE (benchmark déterministe) ===");
	console.log(
		`${evaluation.nEntities} entités (${evaluation.nPositives} positives, ${evaluation.nNegatives} négatives), ` +
			`${evaluation.nFacts} faits, découpage ${evaluation.asOf}, issue ${evaluation.outcomeEnd}`,
	);
	console.log("");
	console.log("=== CRITÈRE : concordance sur le même split temporel ===");
	console.log(`risk_static : C-index recalculé ${evaluation.static.cIndex.toFixed(6)}`);
	console.log(`risk_decay  : C-index recalculé ${evaluation.decay.cIndex.toFixed(6)}`);
	console.log(`delta recalculé : ${evaluation.delta.toFixed(6)} (cible >= ${TARGET_DELTA})`);
	console.log("");
	console.log("=== CRITÈRE SQL (sortie brute) ===");
	console.log(`SELECT d.c_index - s.c_index FROM model_eval d, model_eval s WHERE d.model='risk_decay' AND s.model='risk_static' AND d.horizon_days=s.horizon_days;`);
	console.log(`→ ${deltaSql}`);
	console.log("");

	const problems: string[] = [];
	if (rows.rows.length !== 2) {
		problems.push(`${rows.rows.length} lignes model_eval de risque au lieu de 2`);
	}
	if (sql.rows.length !== 1) {
		problems.push(`le critère SQL rend ${sql.rows.length} ligne(s) au lieu d'une`);
	}
	if (deltaSql === null || !(deltaSql >= TARGET_DELTA)) {
		problems.push(`delta SQL ${deltaSql ?? "NULL"} < ${TARGET_DELTA}`);
	}
	if (!(evaluation.delta >= TARGET_DELTA)) {
		problems.push(`delta recalculé ${evaluation.delta.toFixed(6)} < ${TARGET_DELTA}`);
	}
	for (const item of expected) {
		const row = stored.get(item.model);
		if (!row) {
			problems.push(`ligne model_eval absente pour ${item.model}`);
			continue;
		}
		if (isoDay(row.eval_day) !== evaluation.asOf) {
			problems.push(`${item.model} : eval_day ${isoDay(row.eval_day)} ≠ ${evaluation.asOf}`);
		}
		if (row.horizon_days !== evaluation.horizonDays) {
			problems.push(`${item.model} : horizon_days ${row.horizon_days} ≠ ${evaluation.horizonDays}`);
		}
		if (row.c_index === null || Math.abs(Number(row.c_index) - item.cIndex) > 1e-9) {
			problems.push(`${item.model} : c_index stocké ${row.c_index} ≠ recalculé ${item.cIndex}`);
		}
		const metric = storedMetrics.get(item.model);
		if (!metric) {
			problems.push(`ligne risk_model_metric absente pour ${item.model}`);
			continue;
		}
		if (Math.abs(Number(metric.c_index) - item.cIndex) > 1e-9) {
			problems.push(`${item.model} : c_index de risk_model_metric ${metric.c_index} diverge`);
		}
		if (metric.n_entities !== evaluation.nEntities || metric.n_positives !== evaluation.nPositives) {
			problems.push(`${item.model} : population de risk_model_metric diverge`);
		}
		if (metric.pairs !== item.pairs) {
			problems.push(`${item.model} : paires ${metric.pairs} ≠ ${item.pairs}`);
		}
		if (metric.source !== params.source) {
			problems.push(`${item.model} : source ${metric.source} ≠ ${params.source}`);
		}
		if ((metric.half_life_days ?? null) !== item.halfLife) {
			problems.push(`${item.model} : demi-vie ${metric.half_life_days} ≠ ${item.halfLife}`);
		}
	}

	if (problems.length > 0) {
		console.error("OBJECTIF NON ATTEINT :");
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exitCode = 1;
		return;
	}
	console.log(
		`OBJECTIF ATTEINT : C-index ${evaluation.decay.cIndex.toFixed(6)} − ` +
			`${evaluation.static.cIndex.toFixed(6)} = ${evaluation.delta.toFixed(6)} >= ${TARGET_DELTA}.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
