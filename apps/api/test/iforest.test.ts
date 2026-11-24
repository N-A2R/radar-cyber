/**
 * Détection d'écarts inter-organismes par isolation forest.
 *
 * Le test rejoue le détecteur sur la fixture versionnée, vérifie que la table
 * d'évaluation est la matérialisation exacte de ce calcul, puis exécute la
 * requête du juge et les contrôles d'accord inter-analystes.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closePools, query } from "../src/db.js";
import {
	cohenKappa,
	precisionAtK,
	rocAuc,
	scoreCandidates,
	seededRandom,
	type CandidateProfile,
} from "../src/detect/isolation-forest.js";

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

const FIXTURE = JSON.parse(
	readFileSync(new URL("../../../bench/iforest/candidates-200.json", import.meta.url), "utf8"),
) as Fixture;
const BY_ID = new Map(FIXTURE.candidates.map((candidate) => [candidate.event_id, candidate]));

after(async () => {
	await closePools();
});

test("la forêt est déterministe et isole un profil hors distribution", () => {
	const baseline: CandidateProfile[] = Array.from({ length: 60 }, (_, index) => ({
		event_id: `n-${index}`,
		region: "NA",
		counts: { ransomware: 2, phishing: 3, vuln: 4 + (index % 2), ct: 5, leak: 1 },
		sources: 3,
		peak: 2,
	}));
	const outlier: CandidateProfile = {
		event_id: "a-001",
		region: "NA",
		counts: { ransomware: 30, phishing: 3, vuln: 4, ct: 5, leak: 1 },
		sources: 1,
		peak: 32,
	};
	const profiles = [...baseline, outlier];
	const first = scoreCandidates(profiles, { seed: 7, trees: 64, sampleSize: 32 });
	const second = scoreCandidates(profiles, { seed: 7, trees: 64, sampleSize: 32 });
	assert.deepEqual(first, second, "même graine, même score");
	assert.equal(first[0]!.event_id, "a-001", "le profil anormal doit être premier");
	assert.ok(first[0]!.score > first[1]!.score + 0.05, "l'écart doit être mesurable");
});

test("les métriques de classement se calculent sur le même classement", () => {
	assert.equal(precisionAtK([true, true, false, false], [4, 3, 2, 1], 2), 1);
	assert.equal(rocAuc([true, false], [2, 1]), 1);
	assert.equal(rocAuc([false, true], [2, 1]), 0);
	assert.equal(rocAuc([true, false], [1, 1]), 0.5, "les ex æquo comptent une demi-paire");
	assert.equal(cohenKappa([true, false, true, false], [true, false, true, false]), 1);
	assert.ok(cohenKappa([true, false], [false, true]) < 0);
	const first = seededRandom(123);
	const second = seededRandom(123);
	assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
});

test("la table eval_iforest matérialise le rejeu du détecteur", async () => {
	const scored = scoreCandidates(FIXTURE.candidates, {
		seed: FIXTURE.model_seed,
		trees: 128,
		sampleSize: 64,
	});
	const stored = await query<{
		event_id: string;
		score: number;
		rank: number;
		label_analyste: boolean;
		analyste_a: boolean;
		analyste_b: boolean;
	}>("SELECT event_id, score, rank, label_analyste, analyste_a, analyste_b FROM eval_iforest");

	assert.equal(stored.rows.length, 200);
	const storedById = new Map(stored.rows.map((row) => [row.event_id, row]));
	for (const entry of scored) {
		const row = storedById.get(entry.event_id);
		const candidate = BY_ID.get(entry.event_id)!;
		assert.ok(row, `ligne absente pour ${entry.event_id}`);
		assert.ok(Math.abs(Number(row.score) - entry.score) < 1e-9, `score divergent pour ${entry.event_id}`);
		assert.equal(row.rank, entry.rank);
		assert.equal(row.label_analyste, candidate.label_analyste);
		assert.equal(row.analyste_a, candidate.analyste_a);
		assert.equal(row.analyste_b, candidate.analyste_b);
	}
});

test("critère de sortie : precision@100 >= 0,60, ROC-AUC >= 0,80, kappa >= 0,70", async () => {
	const scored = scoreCandidates(FIXTURE.candidates, {
		seed: FIXTURE.model_seed,
		trees: 128,
		sampleSize: 64,
	});
	const labels = scored.map((entry) => BY_ID.get(entry.event_id)!.label_analyste);
	const scores = scored.map((entry) => entry.score);
	const precision = precisionAtK(labels, scores, 100);
	const auc = rocAuc(labels, scores);
	const kappa = cohenKappa(
		FIXTURE.candidates.map((candidate) => candidate.analyste_a),
		FIXTURE.candidates.map((candidate) => candidate.analyste_b),
	);

	const sql = await query<{ precision: number }>(
		"SELECT count(*) FILTER (WHERE label_analyste AND rank<=100)/100.0 AS precision FROM eval_iforest;",
	);
	const sqlAuc = await query<{ auc: number | null }>("SELECT iforest_roc_auc() AS auc;");
	const sqlKappa = await query<{ kappa: number | null }>("SELECT iforest_kappa() AS kappa;");

	assert.ok(precision >= 0.6, `precision@100=${precision}`);
	assert.ok(auc >= 0.8, `ROC-AUC=${auc}`);
	assert.ok(kappa >= 0.7, `kappa=${kappa}`);
	assert.ok(Math.abs(Number(sql.rows[0]!.precision) - precision) < 1e-9);
	assert.ok(Math.abs(Number(sqlAuc.rows[0]!.auc) - auc) < 1e-9);
	assert.ok(Math.abs(Number(sqlKappa.rows[0]!.kappa) - kappa) < 1e-9);
});
