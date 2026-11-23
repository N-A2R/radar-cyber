/**
 * Indexation des incidents par embeddings et voisinage — schéma et chemin réel.
 *
 * La suite tourne sur la base jetable créée par `test/run.ts` (init.sql +
 * toutes les migrations, dont la 214). Ce test ne lit jamais la base de
 * production : il sème six événements synthétiques, calcule leurs vecteurs
 * avec le module TypeScript, puis vérifie que `cube <->` retrouve l'incident
 * analogue annoté et que le critère SQL agrège correctement les rappels.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	ANNOTATION_RULE,
	EMBEDDING_DIM,
	EMBEDDING_MODEL,
	cubeLiteral,
	embed,
	embeddingTokens,
	normalizeText,
	countTokens,
	type EmbeddingRow,
} from "../src/retrieval/incident-embedding.js";

const TAG = "incident-retrieval-test";
const ACTORS = ["alphaactor", "betaactor", "gammaactor"] as const;
const CREATED_IDS: number[] = [];

function syntheticRow(id: number, actor: string, index: number): EmbeddingRow {
	return {
		id,
		title: `Revendication ${actor} — incident ${index}`,
		summary: `Organisation ciblée par ${actor}`,
		family: "ransomware",
		assertionType: "third_party_claim",
		orgId: null,
		actor,
		mispTitle: null,
		description: null,
		rattachement: null,
		orgHint: null,
		via: null,
	};
}

test("le modèle est déterministe, normalisé et produit un littéral cube valide", () => {
	assert.equal(normalizeText("Rançongiciel — ŒUVRE"), "rancongiciel — oeuvre");
	const rows = [syntheticRow(1, "alphaactor", 1), syntheticRow(2, "betaactor", 2)];
	const df = countTokens(rows);
	const a = embed(embeddingTokens(rows[0]!), df, rows.length);
	const b = embed(embeddingTokens(rows[1]!), df, rows.length);
	assert.equal(a.length, EMBEDDING_DIM);
	assert.deepEqual(a, embed(embeddingTokens(rows[0]!), df, rows.length));
	const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
	assert.ok(Math.abs(norm - 1) < 1e-9, `norme ${norm}`);
	const literal = cubeLiteral(a);
	assert.match(literal, /^\(/);
	assert.equal(literal.slice(1, -1).split(",").length, EMBEDDING_DIM);
});

test("la migration fournit le type vectoriel, l'index GiST et les tables d'évaluation", async () => {
	const r = await query<{ column: string | null; index: string | null; tables: string }>(
		`SELECT (SELECT data_type FROM information_schema.columns
		          WHERE table_name = 'event' AND column_name = 'embedding') AS column,
		        (SELECT indexname FROM pg_indexes
		          WHERE tablename = 'event' AND indexname = 'event_embedding_ann_gist') AS index,
		        (SELECT string_agg(table_name, ',' ORDER BY table_name)
		           FROM information_schema.tables
		          WHERE table_name IN ('retrieval_query', 'retrieval_hit', 'retrieval_eval')) AS tables`,
	);
	assert.equal(r.rows[0]?.column, "USER-DEFINED");
	assert.equal(r.rows[0]?.index, "event_embedding_ann_gist");
	assert.equal(r.rows[0]?.tables, "retrieval_eval,retrieval_hit,retrieval_query");
});

test("le voisinage retrouve l'analogue annoté et le critère agrège les rappels", async () => {
	const seed = await query<{ id: string }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, evidence)
		 SELECT $1 || '-' || a.pos || '-' || g.slot, 'ransomware', 'third_party_claim',
		        'Revendication ' || a.actor || ' — incident ' || g.slot,
		        'ransomlook', 'https://example.invalid/' || $1,
		        jsonb_build_object('run_id', '1', 'group', a.actor)
		   FROM unnest($2::text[]) WITH ORDINALITY AS a(actor, pos)
		  CROSS JOIN generate_series(1, 2) AS g(slot)
		 RETURNING id`,
		[TAG, [...ACTORS]],
	);
	for (const row of seed.rows) CREATED_IDS.push(Number(row.id));
	assert.equal(CREATED_IDS.length, 6);

	const rows = CREATED_IDS.flatMap((id, index) => {
		const actor = ACTORS[Math.floor(index / 2)]!;
		return [syntheticRow(id, actor, (index % 2) + 1)];
	});
	const df = countTokens(rows);
	const vectors = new Map<number, number[]>();
	for (const row of rows) vectors.set(row.id, embed(embeddingTokens(row), df, rows.length));
	for (const [id, vector] of vectors) {
		await query(`UPDATE event SET embedding = $2::cube WHERE id = $1`, [id, cubeLiteral(vector)]);
	}

	for (let i = 0; i < rows.length; i += 2) {
		const queryRow = rows[i]!;
		const expected = rows[i + 1]!;
		const neighbour = await query<{ id: string; actor: string | null }>(
			`SELECT e.id::text AS id, e.evidence->>'group' AS actor
			   FROM event e
			  WHERE e.embedding IS NOT NULL AND e.id <> $1
			  ORDER BY e.embedding <-> $2::cube
			  LIMIT 10`,
			[queryRow.id, cubeLiteral(vectors.get(queryRow.id)!)],
		);
		const rank = neighbour.rows.findIndex((row) => row.actor === queryRow.actor) + 1;
		const recall = rank > 0 ? 1 : 0;
		const label = `${TAG}-RQ${String(i / 2 + 1).padStart(4, "0")}`;
		await query(
			`INSERT INTO retrieval_query
			   (id, query_event_id, expected_event_id, annotation_rule, actor, rationale)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			[label, queryRow.id, expected.id, ANNOTATION_RULE, queryRow.actor, "acteur identique (test)"],
		);
		await query(
			`INSERT INTO retrieval_eval
			   (query_id, k, recall_at_10, expected_rank, analogue_class, model)
			 VALUES ($1, 10, $2, $3, $4, $5)`,
			[label, recall, rank === 0 ? null : rank, queryRow.actor, EMBEDDING_MODEL],
		);
	}

	const criterion = await query<{ avg: number; n: number; nulls: number }>(
		`SELECT avg(recall_at_10) AS avg,
		        count(*)::int AS n,
		        (SELECT count(*)::int FROM event WHERE id = ANY($1::bigint[]) AND embedding IS NULL) AS nulls
		   FROM retrieval_eval
		  WHERE k = 10 AND query_id LIKE $2 || '%'`,
		[CREATED_IDS, TAG],
	);
	const result = criterion.rows[0]!;
	assert.equal(result.n, 3);
	assert.equal(result.nulls, 0);
	assert.ok(result.avg >= 0.85, `rappel@10 ${result.avg} < 0,85`);
});

after(async () => {
	await query(`DELETE FROM event WHERE id = ANY($1::bigint[])`, [CREATED_IDS]).catch(() => {});
	await closePools().catch(() => {});
});
