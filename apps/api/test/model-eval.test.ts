/**
 * Table model_eval : la mesure doit être lisible par la requête du critère,
 * avec ses dix strates et un effectif vérifiable par bin.
 *
 * Isolation : modèle de test jetable, supprimé en fin de fichier. Aucune
 * donnée d'organisation n'est créée : la table ne stocke que des agrégats.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query, withIngestTransaction } from "../src/db.js";

const MODEL = `test_calibration_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

after(async () => {
	await query("DELETE FROM model_eval_legacy WHERE model = $1", [MODEL]);
	await closePools().catch(() => {});
});

test("la migration fournit la table et ses contraintes", async () => {
	const columns = await query<{ column_name: string }>(
		`SELECT column_name FROM information_schema.columns
		  WHERE table_schema = 'public' AND table_name = 'model_eval_legacy' ORDER BY ordinal_position`,
	);
	for (const name of ["model", "brier", "ece", "sample_count", "bin_count", "min_bin_count"]) {
		assert.ok(columns.rows.some((row) => row.column_name === name), `colonne ${name} absente`);
	}
	const bins = await query<{ column_name: string }>(
		`SELECT column_name FROM information_schema.columns
		  WHERE table_schema = 'public' AND table_name = 'model_eval_bin' ORDER BY ordinal_position`,
	);
	assert.ok(bins.rows.some((row) => row.column_name === "count"));
	assert.ok(bins.rows.some((row) => row.column_name === "model"));
});

test("une mesure est lisible par le SELECT du critère avec 10 bins peuplés", async () => {
	await withIngestTransaction(async (client) => {
		await client.query(
			`INSERT INTO model_eval_legacy
			   (model, brier, ece, sample_count, bin_count, min_bin_count, horizon_days,
			    reference_date, method, report_path)
			 VALUES ($1, 0.041, 0.015, 120, 10, 12, 90, '2026-11-22', 'test', 'test.json')`,
			[MODEL],
		);
		for (let index = 0; index < 10; index += 1) {
			await client.query(
				`INSERT INTO model_eval_bin
				   (model, bin_index, score_min, score_max, count, positives, probability,
				    observed, loo_mean, ece_contrib)
				 VALUES ($1,$2,0,10,12,0,0.04,0,0.04,0.004)`,
				[MODEL, index],
			);
		}
	});

	const measured = await query<{ brier: number; ece: number }>(
		"SELECT brier, ece FROM model_eval_legacy WHERE model = $1",
		[MODEL],
	);
	assert.equal(measured.rows.length, 1);
	assert.ok(measured.rows[0]!.brier <= 0.15);
	assert.ok(measured.rows[0]!.ece <= 0.05);

	const counts = await query<{ bin_index: number; count: number }>(
		"SELECT bin_index, count FROM model_eval_bin WHERE model = $1 ORDER BY bin_index",
		[MODEL],
	);
	assert.equal(counts.rows.length, 10);
	assert.deepEqual(counts.rows.map((row) => row.bin_index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	assert.ok(counts.rows.every((row) => row.count >= 12));
});
