/**
 * Intégration HTTP de GET /api/couverture : la réponse doit porter l'empreinte
 * du corpus réellement mesuré et les quatre sections annoncées, avec des
 * décompositions cohérentes avec le chiffre global.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import couvertureRoute from "../src/routes/couverture.js";

const CORPUS = fileURLToPath(
	new URL("../../../bench/fixtures/corpus-reference-na.json", import.meta.url),
);

type Ligne = { vus: number; total: number; taux: number };
type Corps = {
	dateCalcul: string;
	hashCorpus: string;
	fenetre: { debut: string; fin: string };
	global: Ligne;
	parMotif: Array<{ motif: string; incidents: number; part: number }>;
	parDepartement: Array<Ligne & { departement: string }>;
	parSecteur: Array<Ligne & { secteur: string }>;
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

test("GET /api/couverture renvoie le hash et les quatre sections", async () => {
	const reponse = await app.inject({ method: "GET", url: "/api/couverture" });
	assert.equal(reponse.statusCode, 200);

	const corps = reponse.json<Corps>();
	const hashAttendu = createHash("sha256").update(readFileSync(CORPUS)).digest("hex");
	assert.equal(corps.hashCorpus, hashAttendu);
	assert.match(corps.dateCalcul, /^\d{4}-\d{2}-\d{2}$/);

	assert.ok(corps.global.total > 0, "dénominateur de la mesure");
	assert.ok(corps.global.vus > 0 && corps.global.vus <= corps.global.total);
	assert.equal(corps.global.taux, Math.round((corps.global.vus / corps.global.total) * 1000) / 10);

	assert.ok(corps.parMotif.length > 0, "section par motif");
	assert.equal(
		corps.parMotif.reduce((somme, motif) => somme + motif.incidents, 0),
		corps.global.total,
		"les motifs couvrent exactement les incidents de la fenêtre",
	);
	assert.ok(corps.parMotif.some((motif) => motif.motif === "vu"));

	assert.ok(corps.parDepartement.length > 0, "section par département");
	assert.ok(corps.parSecteur.length > 0, "section par secteur");
	for (const section of [corps.parDepartement, corps.parSecteur]) {
		assert.equal(
			section.reduce((somme, ligne) => somme + ligne.total, 0),
			corps.global.total,
		);
		assert.equal(
			section.reduce((somme, ligne) => somme + ligne.vus, 0),
			corps.global.vus,
		);
		for (const ligne of section) {
			assert.ok(ligne.taux >= 0 && ligne.taux <= 100);
		}
	}
});
