/**
 * Intégration HTTP de GET /api/couverture.
 *
 * Deux garanties : la réponse porte l'empreinte du corpus réellement mesuré,
 * et le chiffre servi reste identique à celui que le script recalcule sur la
 * base de travail. Un corpus modifié sans nouvelle mesure, ou une mesure figée
 * devenue fausse, font échouer ce test.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import couvertureRoute from "../src/routes/couverture.js";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const CORPUS = fileURLToPath(new URL("../../../bench/couverture/incidents.jsonl", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../../../scripts/mesure-couverture-systeme.mts", import.meta.url));

type Ligne = { vus: number; total: number; taux: number };
type Corps = {
	dateCalcul: string;
	hashCorpus: string;
	fenetre: { debut: string; fin: string };
	global: Ligne;
	parMotif: Array<{ motif: string; incidents: number; part: number }>;
	parDepartement: Array<Ligne & { departement: string }>;
	parType: Array<Ligne & { type: string }>;
	delaiMedianHeures: number | null;
	incidents: Array<{ id: string; vu: boolean; motif: string; delaiHeures: number | null }>;
};

let app: FastifyInstance;

before(async () => {
	app = Fastify();
	await app.register(couvertureRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
});

async function lireReponse(): Promise<Corps> {
	const reponse = await app.inject({ method: "GET", url: "/api/couverture" });
	assert.equal(reponse.statusCode, 200);
	return reponse.json<Corps>();
}

test("GET /api/couverture renvoie le hash et les décompositions du corpus", async () => {
	const corps = await lireReponse();
	const hashAttendu = createHash("sha256").update(readFileSync(CORPUS)).digest("hex");
	assert.equal(corps.hashCorpus, hashAttendu);
	assert.match(corps.dateCalcul, /^\d{4}-\d{2}-\d{2}$/);
	assert.match(corps.fenetre.debut, /^\d{4}-\d{2}-\d{2}$/);
	assert.match(corps.fenetre.fin, /^\d{4}-\d{2}-\d{2}$/);

	assert.ok(corps.global.total > 0, "dénominateur de la mesure");
	assert.ok(corps.global.vus >= 0 && corps.global.vus <= corps.global.total);
	assert.equal(corps.global.taux, Math.round((corps.global.vus / corps.global.total) * 1000) / 10);

	assert.ok(corps.parMotif.length > 0, "section par motif");
	assert.equal(
		corps.parMotif.reduce((somme, motif) => somme + motif.incidents, 0),
		corps.global.total,
		"les motifs couvrent exactement les incidents du corpus",
	);
	assert.ok(
		corps.parMotif.find((motif) => motif.motif === "vu")?.incidents === corps.global.vus,
		"le motif vu porte le même nombre que le chiffre global",
	);

	for (const section of [corps.parDepartement, corps.parType]) {
		assert.ok(section.length > 0, "décomposition renseignée");
		assert.equal(section.reduce((somme, ligne) => somme + ligne.total, 0), corps.global.total);
		assert.equal(section.reduce((somme, ligne) => somme + ligne.vus, 0), corps.global.vus);
		for (const ligne of section) {
			assert.ok(ligne.taux >= 0 && ligne.taux <= 100);
		}
	}

	assert.equal(corps.incidents.length, corps.global.total);
	for (const incident of corps.incidents) {
		assert.equal(incident.vu, incident.motif === "vu");
		if (incident.vu) assert.ok(typeof incident.delaiHeures === "number");
		else assert.equal(incident.delaiHeures, null, "aucun délai pour un incident non vu");
	}
});

const baseTravail = process.env.RADAR_TEST_ADMIN_URL
	? (() => {
			const url = new URL(process.env.RADAR_TEST_ADMIN_URL!);
			url.pathname = "/radar";
			return url.toString();
		})()
	: null;

test(
	"le chiffre servi diverge du script ⇒ échec",
	{ skip: baseTravail === null ? "RADAR_TEST_ADMIN_URL absent : base de travail non accessible" : false },
	async () => {
		const servi = await lireReponse();
		const stdout = execFileSync(TSX, [SCRIPT, "--stdout"], {
			cwd: RACINE,
			env: { ...process.env, DATABASE_URL: baseTravail! },
			encoding: "utf8",
			timeout: 120_000,
		});
		const calcule = JSON.parse(stdout) as Corps;
		assert.equal(calcule.hashCorpus, servi.hashCorpus, "même corpus");
		assert.deepEqual(calcule.global, servi.global, "même chiffre");
		assert.deepEqual(calcule.parMotif, servi.parMotif, "même décomposition par motif");
		assert.deepEqual(calcule.parDepartement, servi.parDepartement, "même décomposition départementale");
		assert.deepEqual(calcule.parType, servi.parType, "même décomposition par type");
		assert.equal(calcule.delaiMedianHeures, servi.delaiMedianHeures, "même délai médian");
		assert.deepEqual(calcule.incidents, servi.incidents, "mêmes preuves par incident");
	},
);
