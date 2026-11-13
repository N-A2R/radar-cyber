/**
 * `/sources` — le rendement, pas seulement la réponse.
 *
 * L'écran sources disait « ok » dès que `last_ok_at` était renseigné. Une source
 * qui répond 200 tous les jours pendant six mois sans produire un seul
 * événement affichait donc « ok » : c'est exactement ce qui a fait croire à 303
 * sources saines alors qu'elles ne rendaient rien.
 *
 * Ce test vérifie que la route expose de quoi distinguer trois situations que
 * le produit confondait, et surtout que **« rien n'a été lu » n'est pas
 * « 0 % de rendement »** : `rendement` vaut `null`, jamais `0`, quand aucune
 * entrée n'a été lue.
 *
 * Isolation : trois sources jetables et leurs runs, supprimés dans `after`.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import sourcesRoute from "../src/routes/sources.js";

const TAG = `src${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const PRODUCTIVE = `${TAG}-productive`;
const VIDE = `${TAG}-vide`;
const JAMAIS = `${TAG}-jamais`;

let app: FastifyInstance;

async function creerSource(id: string, nom: string): Promise<void> {
	await query(
		`INSERT INTO source (id, name, family, url, kind, enabled)
		 VALUES ($1,$2,'cti','https://exemple.invalid/flux','narrative',true)`,
		[id, nom],
	);
}

before(async () => {
	await creerSource(PRODUCTIVE, "Source productive (test)");
	await creerSource(VIDE, "Source qui lit sans rendre (test)");
	await creerSource(JAMAIS, "Source jamais tentée (test)");

	// Productrice : elle lit peu, mais ce qu'elle lit devient un événement.
	await query(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped)
		 VALUES ($1, now(), 'ok', 10, 4, 6)`,
		[PRODUCTIVE],
	);
	await query(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, observed_at, severity)
		 VALUES ($1,'cti','ambient_signal','Événement de test productif',$2, now(), 2),
		        ($3,'cti','ambient_signal','Deuxième événement de test',$2, now(), 2)`,
		[`${TAG}:p1`, PRODUCTIVE, `${TAG}:p2`],
	);

	// Vide : 40 entrées lues, aucune retenue. Le collecteur va bien.
	await query(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped)
		 VALUES ($1, now(), 'ok', 40, 0, 40)`,
		[VIDE],
	);

	app = Fastify();
	await app.register(sourcesRoute);
	await app.ready();
});

after(async () => {
	await query("DELETE FROM event WHERE source_id = ANY($1)", [[PRODUCTIVE, VIDE, JAMAIS]]);
	await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [[PRODUCTIVE, VIDE, JAMAIS]]);
	await query("DELETE FROM source WHERE id = ANY($1)", [[PRODUCTIVE, VIDE, JAMAIS]]);
	await app.close();
	await closePools();
});

type LigneSource = {
	id: string;
	entrees: number | null;
	rejets: number | null;
	evenements30j: number;
	evenementsTotal: number;
	dernierRun: string | null;
	rendement: number | null;
	disabledReason: string | null;
};

async function lire(): Promise<Map<string, LigneSource>> {
	const res = await app.inject({ method: "GET", url: "/sources" });
	assert.equal(res.statusCode, 200);
	const body = res.json() as LigneSource[];
	return new Map(body.filter((s) => s.id.startsWith(TAG)).map((s) => [s.id, s]));
}

test("une source productive expose son rendement", async () => {
	const lignes = await lire();
	const s = lignes.get(PRODUCTIVE);
	assert.ok(s, "source productrice absente de la réponse");
	assert.equal(s.entrees, 10);
	assert.equal(s.rejets, 6);
	assert.equal(s.evenements30j, 2);
	assert.equal(s.rendement, 0.2, "2 événements pour 10 entrées = 0,2");
	assert.ok(s.dernierRun);
});

test("une source qui lit sans rendre a un rendement de 0, pas null", async () => {
	const lignes = await lire();
	const s = lignes.get(VIDE);
	assert.ok(s);
	assert.equal(s.entrees, 40);
	assert.equal(s.rejets, 40);
	assert.equal(s.evenements30j, 0);
	assert.equal(s.rendement, 0, "40 entrées lues et rien : 0 % de rendement, pas « inconnu »");
});

test("une source jamais tentée n'est pas « 0 % » : elle est inconnue", async () => {
	const lignes = await lire();
	const s = lignes.get(JAMAIS);
	assert.ok(s);
	assert.equal(s.entrees, null);
	assert.equal(s.rendement, null, "aucune mesure ne doit s'afficher comme un zéro");
	assert.equal(s.evenements30j, 0);
});

test("la route ne casse pas sur une base sans run ni événement", async () => {
	const res = await app.inject({ method: "GET", url: "/sources" });
	assert.equal(res.statusCode, 200);
	const body = res.json() as unknown[];
	assert.ok(Array.isArray(body) && body.length > 0);
});
