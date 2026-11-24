#!/usr/bin/env -S npx tsx
/**
 * Vérification du critère org_risk : rejoue le benchmark, compare la valeur
 * stockée à celle recalculée, contrôle la courbe archivée et imprime la sortie
 * brute de la requête du juge.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-org-risk-prospectif.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	evaluateOrgRiskBenchmark,
	generateOrgRiskBenchmark,
	riskScoreFailures,
	type OrgRiskParams,
} from "../apps/api/src/risk/org-prospective.js";

const PARAMS_PATH = fileURLToPath(new URL("../bench/org-risk/params.json", import.meta.url));
const CRITERION_SQL = "SELECT c_index FROM model_eval WHERE model='org_risk' AND horizon_days=90;";
const TARGET = 0.7;

async function main(): Promise<void> {
	const params = JSON.parse(readFileSync(PARAMS_PATH, "utf8")) as OrgRiskParams;
	const evaluation = evaluateOrgRiskBenchmark(generateOrgRiskBenchmark(params), params);
	const failures = riskScoreFailures(evaluation, TARGET);

	const criterion = await query<{ c_index: number }>(CRITERION_SQL);
	const sqlValue = criterion.rows[0]?.c_index ?? null;
	if (criterion.rows.length !== 1) failures.push(`critère SQL : ${criterion.rows.length} ligne(s)`);
	if (sqlValue === null || Math.abs(sqlValue - evaluation.prospective.cIndex) > 1e-9) {
		failures.push(`c_index stocké ${sqlValue} ≠ recalculé ${evaluation.prospective.cIndex}`);
	}
	if (sqlValue !== null && sqlValue < TARGET) failures.push(`c_index SQL ${sqlValue} < ${TARGET}`);

	const curve = await query<{ bin_index: number; count: number; positives: number }>(
		`SELECT bin_index, count, positives FROM org_risk_calibration_curve
		  WHERE model = 'org_risk' AND horizon_days = 90 ORDER BY bin_index`,
	);
	if (curve.rows.length !== 10 || curve.rows.some((row) => row.count !== 12)) {
		failures.push(`courbe archivée : ${curve.rows.length} bins`);
	}

	const universe = await query<{ count: string }>("SELECT count(*)::text AS count FROM org_risk_score WHERE model = 'org_risk'");
	const universeCount = Number(universe.rows[0]?.count ?? 0);
	if (universeCount !== params.universeSize) {
		failures.push(`référentiel scoré : ${universeCount}/${params.universeSize}`);
	}

	console.log("=== critère SQL (sortie brute) ===");
	console.log(CRITERION_SQL);
	console.log(" c_index");
	console.log("--------");
	console.log(` ${sqlValue}`);
	console.log("");
	console.log(`benchmark 120/40 : C-index recalculé ${evaluation.prospective.cIndex.toFixed(6)}, volume brut ${evaluation.volumeBaseline.cIndex.toFixed(6)}`);
	console.log(`courbe archivée : ${curve.rows.length} bins, ${curve.rows.reduce((total, row) => total + row.count, 0)} organisations`);
	console.log(`référentiel scoré : ${universeCount}/${params.universeSize}`);

	if (failures.length > 0) {
		console.error(`OBJECTIF NON ATTEINT : ${failures.join(" ; ")}`);
		process.exitCode = 1;
	} else {
		console.log(`OBJECTIF : atteint — ${sqlValue} / ${TARGET}`);
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
