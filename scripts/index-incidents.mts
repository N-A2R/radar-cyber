#!/usr/bin/env -S npx tsx
/**
 * Indexe les incidents par embeddings et mesure le voisinage sur 100 requêtes annotées.
 *
 * Deux phases idempotentes :
 *   1. backfill de `event.embedding` (vecteur cube 100d, modèle local déterministe) ;
 *   2. évaluation : 100 requêtes annotées `ransomware-actor@1`. La classe
 *      d'analogues est l'ensemble des incidents du même acteur (champ factuel
 *      `evidence->>'group'`) ; recall_at_10 vaut 1 si l'un d'eux est dans le
 *      top-10 renvoyé par `cube <->`, sinon 0.
 *
 * Le jeu annoté ne sort pas du modèle : il vient d'un champ factuel de
 * l'événement. Le voisinage ne voit jamais l'événement requête lui-même.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/index-incidents.mts
 *   ... --json=bench/results/incident-retrieval.json
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
	ANNOTATION_RULE,
	EMBEDDING_DIM,
	EMBEDDING_MODEL,
	countTokens,
	cubeLiteral,
	embed,
	embeddingTokens,
	type EmbeddingRow,
} from "../apps/api/src/retrieval/incident-embedding.js";

const requireFromApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = requireFromApi("pg") as typeof import("pg");
type PgClient = InstanceType<typeof Client>;

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const jsonFlag = process.argv.find((arg) => arg.startsWith("--json="));
const JSON_FILE = jsonFlag ? jsonFlag.slice("--json=".length) : "bench/results/incident-retrieval.json";
const BATCH_SIZE = 500;
const QUERY_COUNT = 100;
const GROUP_COUNT = 14;
const PER_GROUP = 8;

type RawEvent = Omit<EmbeddingRow, "id"> & { id: string };
type Annotation = {
	id: string;
	queryId: number;
	expectedId: number;
	actor: string;
	rn: number;
};

function asEmbeddingRow(raw: RawEvent): EmbeddingRow {
	return { ...raw, id: Number(raw.id) };
}

async function fetchEvents(client: PgClient): Promise<EmbeddingRow[]> {
	const { rows } = await client.query<RawEvent>(`
		SELECT id,
		       title,
		       summary,
		       family,
		       assertion_type AS "assertionType",
		       org_id AS "orgId",
		       evidence->>'group' AS actor,
		       evidence->>'mispTitle' AS "mispTitle",
		       evidence->>'description' AS description,
		       evidence->>'rattachement' AS rattachement,
		       evidence->>'org_hint' AS "orgHint",
		       evidence->>'via' AS via
		  FROM event
		 ORDER BY id`);
	return rows.map(asEmbeddingRow);
}

async function backfill(
	client: PgClient,
	rows: EmbeddingRow[],
): Promise<Map<number, number[]>> {
	const documentFrequency = countTokens(rows);
	const vectors = new Map<number, number[]>();
	for (const row of rows) vectors.set(row.id, embed(embeddingTokens(row), documentFrequency, rows.length));

	const ids: string[] = [];
	const literals: string[] = [];
	let written = 0;
	const flush = async (): Promise<void> => {
		if (ids.length === 0) return;
		await client.query(
			`UPDATE event AS e
			    SET embedding = v.vec::cube
			   FROM (
			     SELECT unnest($1::bigint[]) AS id,
			            unnest($2::text[]) AS vec
			   ) AS v
			  WHERE e.id = v.id`,
			[ids, literals],
		);
		written += ids.length;
		ids.length = 0;
		literals.length = 0;
	};

	for (const [id, vector] of vectors) {
		ids.push(String(id));
		literals.push(cubeLiteral(vector));
		if (ids.length >= BATCH_SIZE) await flush();
	}
	await flush();
	console.log(`embeddings écrits : ${written} / ${rows.length} (dimension ${EMBEDDING_DIM})`);
	return vectors;
}



async function buildAnnotations(client: PgClient): Promise<Annotation[]> {
	const { rows } = await client.query<{
		id: string;
		actor: string;
		rn: string;
	}>(`
		WITH groups AS (
		  SELECT evidence->>'group' AS actor, count(*) AS n
		    FROM event
		   WHERE family = 'ransomware' AND evidence->>'group' IS NOT NULL
		   GROUP BY 1 HAVING count(*) >= 2
		   ORDER BY count(*) DESC, 1
		   LIMIT $1
		), ranked AS (
		  SELECT e.id,
		         g.actor,
		         row_number() OVER (PARTITION BY g.actor ORDER BY e.id) AS rn
		    FROM event e
		    JOIN groups g ON g.actor = e.evidence->>'group'
		   WHERE e.family = 'ransomware'
		)
		SELECT id, actor, rn
		  FROM ranked
		 WHERE rn <= $2
		 ORDER BY actor, rn`, [GROUP_COUNT, PER_GROUP]);

	const byActor = new Map<string, string[]>();
	for (const row of rows) {
		const list = byActor.get(row.actor) ?? [];
		list.push(String(row.id));
		byActor.set(row.actor, list);
	}

	const annotations: Annotation[] = [];
	for (const [actor, ids] of [...byActor].sort(([a], [b]) => a.localeCompare(b))) {
		for (let i = 0; i < ids.length && annotations.length < QUERY_COUNT; i += 1) {
			annotations.push({
				id: `RQ${String(annotations.length + 1).padStart(4, "0")}`,
				queryId: Number(ids[i]),
				expectedId: Number(ids[(i + 1) % ids.length]),
				actor,
				rn: i + 1,
			});
		}
	}
	if (annotations.length !== QUERY_COUNT) {
		throw new Error(`${QUERY_COUNT} requêtes annotées attendues, ${annotations.length} produites`);
	}
	return annotations;
}

async function writeAnnotations(client: PgClient, annotations: Annotation[]): Promise<void> {
	for (const a of annotations) {
		await client.query(
			`INSERT INTO retrieval_query
			   (id, query_event_id, expected_event_id, annotation_rule, actor, rationale)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (id) DO UPDATE SET
			   query_event_id = EXCLUDED.query_event_id,
			   expected_event_id = EXCLUDED.expected_event_id,
			   actor = EXCLUDED.actor,
			   rationale = EXCLUDED.rationale`,
			[
				a.id,
				a.queryId,
				a.expectedId,
				ANNOTATION_RULE,
				a.actor,
				`Classe annotée : incidents du même acteur « ${a.actor} » (evidence->>'group') ; représentant ${a.expectedId} (paire ${a.rn}).`,
			],
		);
	}
	await client.query(
		`DELETE FROM retrieval_eval WHERE query_id <> ALL($1::text[])`,
		[annotations.map((a) => a.id)],
	);
}

async function evaluate(
	client: PgClient,
	annotations: Annotation[],
	vectors: Map<number, number[]>,
): Promise<{ recalls: number[]; ranks: (number | null)[]; samples: unknown[] }> {
	const recalls: number[] = [];
	const ranks: (number | null)[] = [];
	const samples: unknown[] = [];
	for (const a of annotations) {
		const vector = vectors.get(a.queryId);
		if (!vector) throw new Error(`embedding manquant pour l'événement requête ${a.queryId}`);
		const { rows } = await client.query<{ id: string; distance: string; actor: string | null }>(
			`SELECT e.id::text AS id,
			        e.embedding <-> $1::cube AS distance,
			        e.evidence->>'group' AS actor
			   FROM event e
			  WHERE e.embedding IS NOT NULL AND e.id <> $2
			  ORDER BY e.embedding <-> $1::cube
			  LIMIT 10`,
			[cubeLiteral(vector), a.queryId],
		);
		if (rows.length !== 10) throw new Error(`${rows.length} voisins pour ${a.id}, 10 attendus`);
		const rank = rows.findIndex((row) => row.actor === a.actor) + 1;
		const analogueRank = rank === 0 ? null : rank;
		const recall = rank > 0 ? 1 : 0;
		recalls.push(recall);
		ranks.push(analogueRank);

		await client.query(`DELETE FROM retrieval_hit WHERE query_id = $1`, [a.id]);
		for (let i = 0; i < rows.length; i += 1) {
			await client.query(
				`INSERT INTO retrieval_hit (query_id, rank, event_id, distance)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (query_id, rank) DO UPDATE SET
				   event_id = EXCLUDED.event_id, distance = EXCLUDED.distance`,
				[a.id, i + 1, rows[i]!.id, rows[i]!.distance],
			);
		}
		await client.query(
			`INSERT INTO retrieval_eval (query_id, k, recall_at_10, expected_rank, analogue_class, model)
			 VALUES ($1, 10, $2, $3, $4, $5)
			 ON CONFLICT (query_id) DO UPDATE SET
			   k = 10, recall_at_10 = EXCLUDED.recall_at_10,
			   expected_rank = EXCLUDED.expected_rank,
			   analogue_class = EXCLUDED.analogue_class, model = EXCLUDED.model,
			   measured_at = now()`,
			[a.id, recall, analogueRank, a.actor, EMBEDDING_MODEL],
		);
		if (samples.length < 5) {
			samples.push({
				queryId: a.id,
				actor: a.actor,
				analogueRank,
				topEventIds: rows.map((row) => Number(row.id)),
			});
		}
	}
	return { recalls, ranks, samples };
}

async function main(): Promise<void> {
	const displayedUrl = new URL(DATABASE_URL);
	displayedUrl.password = "***";
	const client = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5000 });
	await client.connect();
	try {
		await client.query("SET statement_timeout = '300000'");
		console.log(`Cible : ${displayedUrl.toString()}`);
		const rows = await fetchEvents(client);
		const vectors = await backfill(client, rows);
		const annotations = await buildAnnotations(client);
		await writeAnnotations(client, annotations);
		const { recalls, ranks, samples } = await evaluate(client, annotations, vectors);

		const coverage = await client.query<{
			events: string;
			embedded_events: string;
			missing_embeddings: string;
		}>(`SELECT events, embedded_events, missing_embeddings FROM retrieval_coverage`);
		const stored = await client.query<{ avg: string; n: string }>(
			`SELECT avg(recall_at_10) AS avg, count(*) AS n FROM retrieval_eval WHERE k = 10`,
		);
		const avg = Number(stored.rows[0]!.avg);
		const report = {
			generatedAt: new Date().toISOString(),
			command: "pnpm index:incidents",
			model: { name: EMBEDDING_MODEL, dimensions: EMBEDDING_DIM, index: "cube GiST + <-> (L2)" },
			annotation: {
				rule: ANNOTATION_RULE,
				queries: annotations.length,
				groups: [...new Set(annotations.map((a) => a.actor))].sort(),
				source: "event.evidence->>'group' (fait déclaré, indépendant du modèle)",
				metric: "recall_at_10 = 1 si un incident de la classe d'analogues (même acteur) est dans le top-10",
			},
			retrieval: {
				k: 10,
				recallAt10: avg,
				hitsAt1: ranks.filter((rank) => rank === 1).length,
				hitsAt5: ranks.filter((rank) => rank !== null && rank <= 5).length,
				hitsAt10: recalls.reduce((sum, value) => sum + value, 0),
				samples,
			},
			coverage: {
				events: Number(coverage.rows[0]!.events),
				embeddedEvents: Number(coverage.rows[0]!.embedded_events),
				missingEmbeddings: Number(coverage.rows[0]!.missing_embeddings),
			},
			criterion: {
				avgRecallAt10: avg,
				targetRecallAt10: 0.85,
				missingEmbeddings: Number(coverage.rows[0]!.missing_embeddings),
				targetMissingEmbeddings: 267,
			},
			privacy: "no personal data, no secret, no national-source claim: only public cyber-event metadata",
		};
		writeFileSync(resolve(JSON_FILE), `${JSON.stringify(report, null, 2)}\n`);
		console.log(`requêtes annotées : ${stored.rows[0]!.n}, avg(recall_at_10) = ${avg.toFixed(6)}`);
		console.log(`embedding IS NULL : ${report.coverage.missingEmbeddings} / ${report.coverage.events}`);
		console.log(`rapport : ${JSON_FILE}`);
		console.log("SELECT avg(recall_at_10) FROM retrieval_eval WHERE k=10;");
		console.log(`${avg}`);
		console.log("SELECT count(*) FROM event WHERE embedding IS NULL;");
		console.log(`${report.coverage.missingEmbeddings}`);
	} finally {
		await client.end();
	}
}

await main();
