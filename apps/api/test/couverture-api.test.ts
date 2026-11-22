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
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import Fastify, { type FastifyInstance } from "fastify";
import couvertureRoute from "../src/routes/couverture.js";
import { COUVERTURE_PUBLIQUE } from "../src/analyse/couverture-publique.js";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const CORPUS = fileURLToPath(new URL("../../../bench/couverture/incidents.jsonl", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../../../scripts/mesure-couverture-systeme.mts", import.meta.url));
const FIXTURE = fileURLToPath(
	new URL("../../../bench/couverture/reproduction-fixture.sql", import.meta.url),
);

type Ligne = { vus: number; total: number; taux: number };
type Corps = {
	dateCalcul: string;
	hashCorpus: string;
	fenetre: { debut: string; fin: string };
	publiable: boolean;
	mention: string | null;
	raison: string | null;
	publication: {
		refus: Array<{ code: string; raison: string }>;
		corpus: { dansFenetre: number; jours: number };
		sources: { distinctes: number; partMax: number };
		referentiel: { partSecteurs: number };
	};
	global: Ligne;
	parMotif: Array<{ motif: string; incidents: number; part: number }>;
	parDepartement: Array<Ligne & { departement: string }>;
	parType: Array<Ligne & { type: string }>;
	delaiMedianHeures: number | null;
	incidents: Array<{ id: string; vu: boolean; motif: string; delaiHeures: number | null }>;
};

let app: FastifyInstance;
let baseTravail: string | null = null;
let baseFigure: string | null = null;

/** Connexion d'administration : jamais la base applicative vivante. */
function urlAdmin(): string | null {
	const source = process.env.RADAR_TEST_ADMIN_URL ?? process.env.DATABASE_URL;
	if (!source) return null;
	const url = new URL(source);
	url.pathname = "/postgres";
	url.searchParams.delete("options");
	return url.toString();
}

const ADMIN = urlAdmin();
const SANS_BASE = process.env.RADAR_COUVERTURE_DB === undefined && ADMIN === null;

/** Base figée issue du fixture versionné : la même que celle du rapport publié. */
async function creerBaseFigure(): Promise<string> {
	const nom = `radar_couv_test_${process.pid}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
	const url = new URL(`/${nom}`, ADMIN!).toString();
	const admin = new Client({ connectionString: ADMIN! });
	await admin.connect();
	try {
		await admin.query(`CREATE DATABASE ${nom}`);
		baseFigure = nom;
	} finally {
		await admin.end();
	}

	const base = new Client({ connectionString: url });
	try {
		await base.connect();
		await base.query(readFileSync(FIXTURE, "utf8"));
	} catch (err) {
		await supprimerBaseFigure();
		throw err;
	} finally {
		await base.end();
	}
	return url;
}

async function supprimerBaseFigure(): Promise<void> {
	if (!baseFigure) return;
	const nom = baseFigure;
	baseFigure = null;
	const admin = new Client({ connectionString: ADMIN! });
	await admin.connect();
	try {
		await admin.query(
			"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
			[nom],
		);
		await admin.query(`DROP DATABASE IF EXISTS ${nom}`);
	} finally {
		await admin.end();
	}
}

before(async () => {
	app = Fastify();
	await app.register(couvertureRoute, { prefix: "/api" });
	await app.ready();
	// URL fournie : exacte, sans réécriture. Sinon snapshot local du fixture.
	if (process.env.RADAR_COUVERTURE_DB) baseTravail = process.env.RADAR_COUVERTURE_DB;
	else if (ADMIN) baseTravail = await creerBaseFigure();
});

after(async () => {
	if (app) await app.close();
	await supprimerBaseFigure();
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

test("GET /api/couverture publie le 0 % du corpus de 50 incidents (quatre seuils franchis)", async () => {
	const corps = await lireReponse();
	assert.equal(corps.global.vus, 0);
	assert.equal(corps.global.total, 50);
	assert.equal(corps.global.taux, 0);
	assert.equal(corps.publiable, true);
	assert.equal(corps.mention, null);
	assert.equal(corps.raison, null);
	assert.deepEqual(corps.publication.refus, []);
	assert.equal(corps.publication.corpus.dansFenetre, 50);
	assert.equal(corps.publication.corpus.jours, 909);
	assert.equal(corps.publication.sources.distinctes, 17);
	assert.equal(corps.publication.sources.partMax, 0.3);
	assert.equal(corps.publication.referentiel.partSecteurs, 1);
});

test("GET /api/couverture sous le seuil : publiable false et raison explicite", async () => {
	const publication = COUVERTURE_PUBLIQUE.publication;
	const precedent = structuredClone(publication);
	const raison =
		"Corpus trop petit : 5 incident(s) dans la fenêtre 2026-01-01 → 2026-04-30, seuil minimal 30.";
	try {
		Object.assign(publication, {
			publiable: false,
			mention: "refus de publication",
			raison,
			refus: [{ code: "corpus_trop_petit", raison }],
			corpus: { ...publication.corpus, dansFenetre: 5 },
		});
		const corps = await lireReponse();
		assert.equal(corps.publiable, false);
		assert.equal(corps.mention, "refus de publication");
		assert.equal(corps.raison, raison);
		assert.deepEqual(corps.publication.refus.map((r) => r.code), ["corpus_trop_petit"]);
		assert.equal(corps.publication.corpus.dansFenetre, 5);
	} finally {
		Object.assign(publication, precedent);
	}
});

test(
	"le chiffre servi diverge du script ⇒ échec",
	{
		skip: SANS_BASE
			? "ni RADAR_COUVERTURE_DB ni accès administration : base figée indisponible"
			: false,
	},
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
