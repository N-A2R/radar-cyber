/**
 * Les motifs de rejet, écrits en base au lieu d'être perdus dans les logs.
 *
 * Le cas qui compte est celui d'une source qui **lit et refuse tout** : elle
 * n'est ni en panne ni muette, et le tableau de bord la voyait « ok ». Sans le
 * motif, on ne peut pas savoir s'il faut instruire la porte de pertinence, le
 * classement de famille ou le parseur — c'est le chantier 15 en entier.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import sourcesRoute from "../src/routes/sources.js";

const TAG = `mot${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const AVEC = `${TAG}-avec`;
const SANS = `${TAG}-sans`;

let app: FastifyInstance;

before(async () => {
	for (const id of [AVEC, SANS]) {
		await query(
			`INSERT INTO source (id, name, family, url, kind, enabled)
			 VALUES ($1,$2,'presse','https://exemple.invalid/m','narrative',true)`,
			[id, `Source de test (${id})`],
		);
	}
	// Celle-ci lit 40 entrées et les refuse toutes, pour deux raisons.
	await query(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped, items_rejected)
		 VALUES ($1, now(), 'ok', 40, 0, 40, $2::jsonb)`,
		[AVEC, JSON.stringify({ hors_sujet: 34, presse: 6 })],
	);
	// Celle-ci n'a pas de motif mesuré (run antérieur à la migration 029).
	await query(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped)
		 VALUES ($1, now(), 'ok', 3, 1, 2)`,
		[SANS],
	);
	app = Fastify();
	await app.register(sourcesRoute);
	await app.ready();
});

after(async () => {
	await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [[AVEC, SANS]]);
	await query("DELETE FROM source WHERE id = ANY($1)", [[AVEC, SANS]]);
	await app.close();
	await closePools();
});

type Ligne = { id: string; motifs: Record<string, number> | null; motifDominant: string | null };

async function lire(): Promise<Map<string, Ligne>> {
	const res = await app.inject({ method: "GET", url: "/sources" });
	assert.equal(res.statusCode, 200);
	const body = res.json() as Ligne[];
	return new Map(body.filter((s) => s.id.startsWith(TAG)).map((s) => [s.id, s]));
}

test("le motif de rejet dominant est celui qui coûte le plus", async () => {
	const s = (await lire()).get(AVEC);
	assert.ok(s);
	assert.deepEqual(s.motifs, { hors_sujet: 34, presse: 6 });
	assert.equal(s.motifDominant, "hors_sujet");
});

test("un run sans motif mesuré rend null, pas un objet vide", async () => {
	const s = (await lire()).get(SANS);
	assert.ok(s);
	assert.equal(s.motifs, null, "« non mesuré » ne doit pas se confondre avec « aucun rejet »");
	assert.equal(s.motifDominant, null);
});

test("la migration 029 est idempotente et rétrocompatible", async () => {
	// Rejouer l'ALTER ne doit rien casser : la colonne existe déjà.
	await query("ALTER TABLE collector_run ADD COLUMN IF NOT EXISTS items_rejected jsonb");
	const { rows } = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM collector_run WHERE items_rejected IS NOT NULL",
	);
	assert.ok((rows[0]?.n ?? 0) >= 1);
});
