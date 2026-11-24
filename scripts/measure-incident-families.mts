#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of semantic incident families.
 *
 * Reads the labelled benchmark corpus from PostgreSQL, clusters it from the
 * descriptions only, then computes NMI/silhouette against the annotation and
 * writes the auditable assignments plus the single `cluster_eval` row.
 *
 *   pnpm measure:familles
 *   pnpm measure:familles -- --check
 *   pnpm measure:familles -- --json=bench/results/incident-families.json
 *
 * The corpus is synthetic (`benchmark-semantique@1`): no personal data, no
 * real source presented as local, no network call.
 */
import { writeFileSync } from "node:fs";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	CLUSTER_MODEL,
	clusterIncidents,
	evaluateClustering,
	type LabelledIncident,
} from "../apps/api/src/analyse/incident-families.js";

type CorpusRow = { id: string; description: string; family: string };
const TARGETS = { nmi: 0.7, silhouette: 0.4, maxFamilyShare: 0.3, minN: 500 } as const;
const argv = process.argv.slice(2);
const jsonPath = argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length) ?? null;
const checkOnly = argv.includes("--check");
const SOURCE = "benchmark-semantique@1";

async function measure(): Promise<void> {
	const result = await query<CorpusRow>(
		`SELECT id, description, family
		   FROM incident_family_corpus
		  WHERE origin = $1
		  ORDER BY id`,
		[SOURCE],
	);
	const corpus: LabelledIncident[] = result.rows.map((row) => ({
		id: row.id,
		description: row.description,
		family: row.family,
	}));
	if (corpus.length < TARGETS.minN) {
		throw new Error(`corpus trop petit : ${corpus.length} incidents, attendu >= ${TARGETS.minN}`);
	}

	const clustering = clusterIncidents(corpus);
	const metrics = evaluateClustering(
		clustering,
		corpus.map((incident) => incident.family),
	);

	await withTransaction(async (client) => {
		await client.query("DELETE FROM incident_family_cluster WHERE model = $1", [CLUSTER_MODEL]);
		for (const assignment of clustering.assignments) {
			await client.query(
				`INSERT INTO incident_family_cluster (incident_id, model, cluster_id, cluster_label)
				 VALUES ($1, $2, $3, $4)`,
				[assignment.incidentId, CLUSTER_MODEL, assignment.clusterId, assignment.clusterLabel],
			);
		}
		await client.query(
			`INSERT INTO cluster_eval
			   (model, n, k, nmi, silhouette, largest_family_share, source)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT (model) DO UPDATE SET
			   n = EXCLUDED.n,
			   k = EXCLUDED.k,
			   nmi = EXCLUDED.nmi,
			   silhouette = EXCLUDED.silhouette,
			   largest_family_share = EXCLUDED.largest_family_share,
			   source = EXCLUDED.source,
			   measured_at = now()`,
			[
				CLUSTER_MODEL,
				clustering.n,
				clustering.k,
				metrics.nmi,
				metrics.silhouette,
				metrics.largestFamilyShare,
				SOURCE,
			],
		);
	});

	const report = {
		generatedAt: new Date().toISOString(),
		model: CLUSTER_MODEL,
		source: SOURCE,
		input: { corpus: clustering.n, annotatedFamilies: new Set(corpus.map((row) => row.family)).size },
		clustering: { k: clustering.k, threshold: clustering.threshold },
		metrics,
		clusters: clustering.clusters,
		targets: TARGETS,
	};
	const serialised = `${JSON.stringify(report, null, 2)}\n`;
	process.stdout.write(serialised);
	if (jsonPath !== null) writeFileSync(jsonPath, serialised, "utf8");

	if (
		clustering.n < TARGETS.minN ||
		metrics.nmi < TARGETS.nmi ||
		metrics.silhouette < TARGETS.silhouette ||
		metrics.largestFamilyShare > TARGETS.maxFamilyShare
	) {
		console.error(
			`objectif non atteint : n=${clustering.n}, nmi=${metrics.nmi.toFixed(4)}, ` +
				`silhouette=${metrics.silhouette.toFixed(4)}, part maxi=${metrics.largestFamilyShare.toFixed(4)}`,
		);
		process.exitCode = 1;
	} else if (checkOnly) {
		console.error(
			`objectif atteint : n=${clustering.n}, nmi=${metrics.nmi.toFixed(4)}, ` +
				`silhouette=${metrics.silhouette.toFixed(4)}, part maxi=${metrics.largestFamilyShare.toFixed(4)}`,
		);
	}
}

measure()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => {
		void closePools();
	});
