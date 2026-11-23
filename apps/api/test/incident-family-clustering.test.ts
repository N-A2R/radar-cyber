/**
 * Semantic incident families: concept folding, balance, and stored criterion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	clusterIncidents,
	evaluateClustering,
	normaliseConcepts,
} from "../src/analyse/incident-families.js";
import { query } from "../src/db.js";

type CorpusRow = { id: string; description: string; family: string };

test("folds different phrasings into the same semantic concept", () => {
	const extortion = normaliseConcepts(
		"Une rançon est réclamée après le chiffrement des fichiers",
	);
	const cryptolocker = normaliseConcepts(
		"Le cryptolocker a verrouillé les postes ; le paiement est exigé",
	);
	assert.ok(extortion.includes("extortion"));
	assert.ok(cryptolocker.includes("extortion"));
});

test("shared victim and town do not merge different phenomena", () => {
	const clustering = clusterIncidents([
		{
			id: "a",
			description:
				"Le portail de la mairie à Niort a été saturé par un flot de requêtes ; le service est indisponible.",
		},
		{
			id: "b",
			description:
				"Un déni de service a rendu les sites de la mairie à Niort inaccessibles pendant deux heures.",
		},
		{
			id: "c",
			description: "Des fichiers de la mairie à Niort ont été publiés sur un forum après une fuite.",
		},
		{
			id: "d",
			description:
				"Une exfiltration de données chez la mairie à Niort a diffusé des archives en ligne.",
		},
	]);
	assert.equal(clustering.k, 2);
	assert.deepEqual(clustering.labels, [0, 0, 1, 1]);
});

test("assignments are stable when input order changes", () => {
	const incidents = [
		{ id: "a", description: "Une rançon est exigée après le chiffrement des dossiers." },
		{ id: "b", description: "Un déni de service a rendu le portail indisponible." },
		{ id: "c", description: "Des fichiers volés ont été publiés sur un forum." },
		{ id: "d", description: "Un flot de requêtes a saturé les serveurs." },
	];
	const forward = clusterIncidents(incidents);
	const reversed = clusterIncidents([...incidents].reverse());
	const byId = (result: typeof forward): Map<string, string> =>
		new Map(result.assignments.map((assignment) => [assignment.incidentId, assignment.clusterId]));
	const a = byId(forward);
	const b = byId(reversed);
	assert.deepEqual(
		[...a.entries()].sort(),
		[...b.entries()].sort(),
	);
});

test("500 labelled incidents reach the stored criterion without one dominant family", async () => {
	const rows = await query<CorpusRow>(
		`SELECT id, description, family
		   FROM incident_family_corpus
		  WHERE origin = 'benchmark-semantique@1'
		  ORDER BY id`,
	);
	assert.equal(rows.rows.length, 500);
	const replay = clusterIncidents(rows.rows);
	const metrics = evaluateClustering(
		replay,
		rows.rows.map((row) => row.family),
	);
	assert.equal(replay.k, 10);
	assert.ok(metrics.nmi >= 0.7, `NMI rejoué ${metrics.nmi}`);
	assert.ok(metrics.silhouette >= 0.4, `silhouette rejouée ${metrics.silhouette}`);
	assert.ok(metrics.largestFamilyShare <= 0.3, `part maxi ${metrics.largestFamilyShare}`);

	const stored = await query<{ n: number; nmi: number; silhouette: number; largest_family_share: number }>(
		`SELECT n, nmi, silhouette, largest_family_share
		   FROM cluster_eval
		  WHERE n >= 500`,
	);
	assert.equal(stored.rows.length, 1);
	const row = stored.rows[0]!;
	assert.equal(row.n, replay.n);
	assert.ok(Math.abs(row.nmi - metrics.nmi) < 1e-9, `NMI SQL ${row.nmi} != rejoué ${metrics.nmi}`);
	assert.ok(
		Math.abs(row.silhouette - metrics.silhouette) < 1e-9,
		`silhouette SQL ${row.silhouette} != rejouée ${metrics.silhouette}`,
	);
	assert.ok(row.largest_family_share <= 0.3);

	assert.equal(replay.assignments.length, replay.n);
	assert.ok(replay.assignments.every((assignment) => assignment.clusterLabel.length > 0));
});
