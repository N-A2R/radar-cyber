#!/usr/bin/env -S npx tsx
/**
 * Mesure de la prévision à 30 jours des revendications rançongiciel NA.
 *
 * Rejoue le backtest hebdomadaire sur les revendications et les fuites déjà
 * présentes en base, puis persiste :
 *   - `ransom_forecast_eval` : une ligne par semaine, avec le split temporel ;
 *   - `model_eval` : une ligne résumé (`model = 'ransom_forecast'`) portant le
 *     PR-AUC, le PR-AUC Poisson et leur écart ;
 *   - `bench/results/ransom-forecast-30j.json` : rapport rejouable.
 *
 * Critère (sortie brute) :
 *   SELECT pr_auc FROM model_eval WHERE model='ransom_forecast' AND horizon_days=30;
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-ransom-forecast.mts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query, withIngestTransaction } from "../apps/api/src/db.js";
import {
	evaluateRansomForecast,
	FOREST_SEEDS,
	HORIZON_DAYS,
	poissonScore,
	RANSOM_FORECAST_SQL,
	SAMPLE_START,
	SOURCE,
	TRAIN_CUTOFF,
	type WeeklyClaimRow,
} from "../apps/api/src/forecast/ransom-forecast.js";

const OUTPUT_PATH = fileURLToPath(new URL("../bench/results/ransom-forecast-30j.json", import.meta.url));
const CRITERION_SQL =
	"SELECT pr_auc FROM model_eval WHERE model='ransom_forecast' AND horizon_days=30";

interface DbRow {
	week: string;
	na_claims: number;
	all_claims: number;
	leak_events: number;
	ransomware_events: number;
	breaches: number;
	group_claims_4: number;
	group_claims_12: number;
	group_claims_26: number;
	active_groups_12: number;
	new_groups_26: number;
	forward_claims_30: number;
}

function mapRows(rows: DbRow[]): WeeklyClaimRow[] {
	return rows.map((row) => ({
		week: row.week,
		naClaims: row.na_claims,
		allClaims: row.all_claims,
		leakEvents: row.leak_events,
		ransomwareEvents: row.ransomware_events,
		breaches: row.breaches,
		groupClaims4: row.group_claims_4,
		groupClaims12: row.group_claims_12,
		groupClaims26: row.group_claims_26,
		activeGroups12: row.active_groups_12,
		newGroups26: row.new_groups_26,
		forwardClaims30: row.forward_claims_30,
	}));
}

async function persist(rows: WeeklyClaimRow[]): Promise<void> {
	const evaluation = evaluateRansomForecast(rows, undefined, undefined, FOREST_SEEDS);
	const testWeeks = evaluation.samples.filter((sample) => sample.week >= TRAIN_CUTOFF);
	const evalDay = testWeeks.at(-1)?.week;
	if (!evalDay) throw new Error("aucune semaine de test");

	await withIngestTransaction(async (client) => {
		await client.query("DELETE FROM ransom_forecast_eval WHERE source = $1", [SOURCE]);
		const insert = `INSERT INTO ransom_forecast_eval
		  (origin_week, split, claims_next_30d, label, model_score, poisson_lambda, poisson_score, source)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
		for (const sample of evaluation.samples) {
			await client.query(insert, [
				sample.week,
				sample.week >= TRAIN_CUTOFF ? "test" : "train",
				sample.forwardClaims30,
				sample.label,
				evaluation.predict(sample.features),
				sample.poissonLambda,
				poissonScore(sample.poissonLambda),
				SOURCE,
			]);
		}

		await client.query(
			`INSERT INTO model_eval
			  (model, family, eval_day, score, label, tp, detected_on, delay_days,
			   window_days, source, horizon_days, pr_auc, pr_auc_baseline, pr_auc_gain)
			 VALUES ('ransom_forecast', 'na_weekly_claims', $1::date, $2, true, false, NULL, NULL,
			         $3, $4, $5, $2, $6, $7)
			 ON CONFLICT (model, family, eval_day) DO UPDATE SET
			   score = EXCLUDED.score,
			   label = EXCLUDED.label,
			   tp = EXCLUDED.tp,
			   detected_on = EXCLUDED.detected_on,
			   delay_days = EXCLUDED.delay_days,
			   window_days = EXCLUDED.window_days,
			   source = EXCLUDED.source,
			   horizon_days = EXCLUDED.horizon_days,
			   pr_auc = EXCLUDED.pr_auc,
			   pr_auc_baseline = EXCLUDED.pr_auc_baseline,
			   pr_auc_gain = EXCLUDED.pr_auc_gain,
			   measured_at = now()`,
			[
				evalDay,
				evaluation.prAuc,
				364,
				SOURCE,
				HORIZON_DAYS,
				evaluation.baselinePrAuc,
				evaluation.gain,
			],
		);
	});
	return evaluation;
}

async function main(): Promise<void> {
	const result = await query<DbRow>(RANSOM_FORECAST_SQL);
	const rows = mapRows(result.rows);
	if (rows.length < 100) throw new Error(`série trop courte : ${rows.length} semaines`);
	const evaluation = await persist(rows);
	const criterion = await query<{ pr_auc: number }>(CRITERION_SQL);
	const prAucSql = criterion.rows[0]?.pr_auc ?? null;

	const rapport = {
		dateMesure: new Date().toISOString().slice(0, 10),
		commande: "DATABASE_URL=$DATABASE_URL tsx scripts/mesure-ransom-forecast.mts",
		source: SOURCE,
		donnees: {
			revendications: "leak_claim.na (revendications rattachées à la Nouvelle-Aquitaine)",
			fuites: "fuite_reference.breach_date et event(family='leaks')",
			semaines: rows.length,
		},
		protocole: {
			origines: `semaines complètes de ${rows[0]?.week} à ${rows.at(-1)?.week}`,
			apprentissage: `${SAMPLE_START} → ${TRAIN_CUTOFF} (exclu)`,
			test: `${TRAIN_CUTOFF} → ${rows.at(-1)?.week}`,
			horizonJours: HORIZON_DAYS,
			evenement: "au moins une revendication NA dans les 30 jours suivant la fin de la semaine d'origine",
			reference: "Poisson, lambda estimé sur les 364 jours précédant l'origine",
		},
		resultat: {
			entrainement: evaluation.trainCount,
			test: evaluation.testCount,
			positifs: evaluation.positives,
			prAuc: evaluation.prAuc,
			prAucPoisson: evaluation.baselinePrAuc,
			gain: evaluation.gain,
		},
		critere: { requete: CRITERION_SQL, cible: 0.7, gainCible: 0.1, valeurSql: prAucSql },
	};
	writeFileSync(OUTPUT_PATH, `${JSON.stringify(rapport, null, 2)}\n`);

	console.log(`=== prévision rançongiciel 30 jours (${SOURCE}) ===`);
	console.log(`semaines : ${rows.length} ; apprentissage : ${evaluation.trainCount} ; test : ${evaluation.testCount} (${evaluation.positives} positives)`);
	console.log(`PR-AUC forêt   : ${evaluation.prAuc.toFixed(6)}`);
	console.log(`PR-AUC Poisson : ${evaluation.baselinePrAuc.toFixed(6)}`);
	console.log(`gain           : ${evaluation.gain.toFixed(6)} (cible >= 0,10)`);
	console.log("=== critère SQL (sortie brute) ===");
	console.log(CRITERION_SQL);
	console.log(`→ ${prAucSql}`);
	console.log(`rapport : ${OUTPUT_PATH}`);
	if (prAucSql === null || prAucSql < 0.7 || evaluation.gain < 0.1) {
		console.error("OBJECTIF NON ATTEINT : PR-AUC < 0,70 ou gain < 0,10");
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
