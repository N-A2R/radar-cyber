#!/usr/bin/env -S npx tsx
/**
 * Vérificateur du critère « anomalies inter-organismes par isolation forest ».
 *
 * Reconstruit une base neuve (init.sql + toutes les migrations), rejoue le
 * détecteur sur la fixture versionnée, compare les scores persistés, puis
 * exécute mot pour mot la requête du juge et affiche sa sortie brute.
 *
 *   pnpm verifie:iforest
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	createTestDatabase,
	dropTestDatabase,
} from "../apps/api/test/helpers/testdb.js";
import {
	cohenKappa,
	precisionAtK,
	rocAuc,
	scoreCandidates,
	type CandidateProfile,
} from "../apps/api/src/detect/isolation-forest.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const FIXTURE_PATH = fileURLToPath(new URL("../bench/iforest/candidates-200.json", import.meta.url));

type Fixture = {
	version: string;
	model: string;
	model_seed: number;
	candidates: Array<
		CandidateProfile & {
			analyste_a: boolean;
			analyste_b: boolean;
			label_analyste: boolean;
		}
	>;
};

type EvalRow = {
	event_id: string;
	score: number;
	rank: number;
	label_analyste: boolean;
	analyste_a: boolean;
	analyste_b: boolean;
};

/** Requête du juge, reprise mot pour mot. */
const CRITERE = "SELECT count(*) FILTER (WHERE label_analyste AND rank<=100)/100.0 FROM eval_iforest;";

async function main(): Promise<void> {
	const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
	const replay = scoreCandidates(fixture.candidates, {
		seed: fixture.model_seed,
		trees: 128,
		sampleSize: 64,
	});
	const replayById = new Map(replay.map((entry) => [entry.event_id, entry]));

	const db = await createTestDatabase();
	const client = new Client({ connectionString: db.url });
	await client.connect();
	try {
		const rows = await client.query<EvalRow>(
			`SELECT event_id, score, rank, label_analyste, analyste_a, analyste_b FROM eval_iforest`,
		);
		const stored = rows.rows;
		const precision = await client.query<{ precision: number }>(CRITERE.replace("/100.0", "/100.0 AS precision"));
		const auc = await client.query<{ iforest_roc_auc: number | null }>("SELECT iforest_roc_auc();");
		const kappa = await client.query<{ iforest_kappa: number | null }>("SELECT iforest_kappa();");
		const count = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM eval_iforest");

		console.log("=== CRITÈRE (requête brute) ===");
		console.log(CRITERE);
		console.log(stored.length === 0 ? "→ NULL" : `→ ${Number(precision.rows[0]!.precision).toFixed(4)}`);
		console.log("SELECT iforest_roc_auc();");
		console.log(`→ ${auc.rows[0]!.iforest_roc_auc ?? "NULL"}`);
		console.log("SELECT iforest_kappa();");
		console.log(`→ ${kappa.rows[0]!.iforest_kappa ?? "NULL"}`);
		console.log("");
		console.log("=== CONTRÔLES ===");
		console.log(`lignes eval_iforest : ${count.rows[0]!.n} (attendu 200)`);
		console.log(`modèle : ${fixture.model} (graine ${fixture.model_seed})`);

		const problems: string[] = [];
		if (count.rows[0]!.n !== 200) problems.push(`${count.rows[0]!.n} lignes au lieu de 200`);
		const observed = Number(precision.rows[0]!.precision);
		const observedAuc = auc.rows[0]!.iforest_roc_auc;
		const observedKappa = kappa.rows[0]!.iforest_kappa;
		if (!(observed >= 0.6)) problems.push(`precision@100 ${observed} < 0,60`);
		if (observedAuc === null || !(observedAuc >= 0.8)) problems.push(`ROC-AUC ${observedAuc} < 0,80`);
		if (observedKappa === null || !(observedKappa >= 0.7)) problems.push(`kappa ${observedKappa} < 0,70`);

		const byId = new Map(fixture.candidates.map((candidate) => [candidate.event_id, candidate]));
		let maxDelta = 0;
		let mismatches = 0;
		for (const row of stored) {
			const expected = replayById.get(row.event_id);
			const candidate = byId.get(row.event_id);
			if (!expected || !candidate) {
				mismatches += 1;
				continue;
			}
			maxDelta = Math.max(maxDelta, Math.abs(Number(row.score) - expected.score));
			if (
				row.rank !== expected.rank ||
				row.label_analyste !== candidate.label_analyste ||
				row.analyste_a !== candidate.analyste_a ||
				row.analyste_b !== candidate.analyste_b
			) {
				mismatches += 1;
			}
		}
		console.log(`rejeu du détecteur : écart max ${maxDelta.toExponential(2)}, divergences ${mismatches}`);
		if (mismatches > 0) problems.push(`${mismatches} lignes divergentes par rapport au rejeu`);
		if (maxDelta > 1e-9) problems.push(`écart de score ${maxDelta} > 1e-9`);

		const recomputedPrecision = precisionAtK(
			replay.map((entry) => byId.get(entry.event_id)!.label_analyste),
			replay.map((entry) => entry.score),
			100,
		);
		const recomputedAuc = rocAuc(
			replay.map((entry) => byId.get(entry.event_id)!.label_analyste),
			replay.map((entry) => entry.score),
		);
		const recomputedKappa = cohenKappa(
			fixture.candidates.map((candidate) => candidate.analyste_a),
			fixture.candidates.map((candidate) => candidate.analyste_b),
		);
		console.log(
			`recalcul mémoire : precision@100=${recomputedPrecision.toFixed(4)} ` +
				`ROC-AUC=${recomputedAuc.toFixed(4)} kappa=${recomputedKappa.toFixed(4)}`,
		);
		if (Math.abs(observed - recomputedPrecision) > 1e-9) problems.push("précision SQL ≠ précision rejouée");
		if (observedAuc !== null && Math.abs(observedAuc - recomputedAuc) > 1e-9) {
			problems.push("ROC-AUC SQL ≠ ROC-AUC rejouée");
		}

		if (problems.length > 0) {
			console.error("OBJECTIF NON ATTEINT :");
			for (const problem of problems) console.error(`  - ${problem}`);
			process.exitCode = 1;
			return;
		}
		console.log(
			`OBJECTIF ATTEINT : precision@100=${observed.toFixed(4)} >= 0,60, ` +
				`ROC-AUC=${observedAuc!.toFixed(4)} >= 0,80, kappa=${observedKappa!.toFixed(4)} >= 0,70.`,
		);
	} finally {
		await client.end();
		await dropTestDatabase(db);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
