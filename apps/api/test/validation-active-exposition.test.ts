/**
 * Validation active du décile d'exposition : règle de qualification, budget de
 * sondes et requête brute du juge. Jeu entièrement synthétique (IP de
 * documentation, sondes injectées) : aucun réseau, aucune donnée personnelle.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import {
	REGLE_VALIDATION_ACTIVE,
	estConfirme,
	estFauxPositif,
	preuveSonde,
	lireCandidatsTopDecile,
	lireCritereValidationActive,
	lireTauxFauxPositif,
	validerTopDecile,
	type CandidatValidation,
	type ReponseSonde,
	type ResultatActive,
	type SondeTcp,
	} from "../src/exposition/validation-active.js";

const TAG = `vac${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const REGLE_TEST = `${REGLE_VALIDATION_ACTIVE}-test-${TAG}`;
const SLUG = `test-validation-active-${TAG}`;
const ID_BASE = 8_000_000 + Math.floor(Math.random() * 100_000);
const DECOUVERTE = new Date(Date.now() - 60 * 60 * 1000);

after(async () => {
	await query("DELETE FROM exposure_validation_eval WHERE regle_version = $1", [REGLE_TEST]);
	await query("DELETE FROM exposition_validation_tentative WHERE regle_version = $1", [REGLE_TEST]);
	await query("DELETE FROM exposition_service WHERE org_id = (SELECT id FROM org WHERE slug = $1)", [SLUG]);
	await query("DELETE FROM org WHERE slug = $1", [SLUG]);
	await closePools();
});

test("seule la connexion ouverte confirme ; le refus est le seul faux positif", () => {
	assert.equal(estConfirme("ouvert"), true);
	assert.equal(estConfirme("refuse"), false);
	assert.equal(estConfirme("timeout"), false);
	assert.equal(estFauxPositif("refuse"), true);
	assert.equal(estFauxPositif("timeout"), false);
	assert.equal(estFauxPositif("erreur"), false);

	const preuve = preuveSonde(
		{ id: 1, ip: "198.51.100.7", port: 25, categorie: "mail", criticite: 45, rang: 1 },
		{ resultat: "ouvert", tentatives: 1, latenceMs: 12 },
	);
	assert.match(preuve, /^tcp-connect@1 port=25 resultat=ouvert tentatives=1 latence_ms=12$/);
	assert.equal(preuve.includes("198.51.100"), false);
});

test("les candidats du décile sont cités, récents et ordonnés par criticité", async () => {
	await query(
		`INSERT INTO org (name, slug, kind, city, status)
		 VALUES ('Test validation active', $1, 'entreprise', 'Bordeaux', 'confirme')
		 ON CONFLICT (slug) DO NOTHING`,
		[SLUG],
	);
	const { rows: orgs } = await query<{ id: number }>("SELECT id FROM org WHERE slug = $1", [SLUG]);
	const orgId = orgs[0]!.id;

	for (let i = 0; i < 12; i += 1) {
		await query(
			`INSERT INTO exposition_service
			   (org_id, ip, port, category, service, technology, source, source_url, consulted_at)
			 VALUES ($1, $2, $3, $4, $5, $6, 'shodan-internetdb', $7, now())`,
			[orgId, `198.51.100.${i + 1}`, i < 6 ? 5432 : 8000,
				i < 6 ? "base_de_donnees" : "web", i < 6 ? "postgresql" : "http",
				i < 6 ? "postgresql" : "http_server", `https://internetdb.shodan.io/test-${TAG}-${i}`],
		);
	}

	const candidats = await lireCandidatsTopDecile(8);
	const { rows: comptes } = await query<{ total: number }>("SELECT count(*)::int AS total FROM exposition_service");
	const attendu = Math.min(8, Math.max(1, Math.ceil(comptes[0]!.total / 10)));
	assert.equal(candidats.length, attendu);
	assert.ok(candidats.every((c, i) => i === 0 || candidats[i - 1]!.criticite >= c.criticite));
	assert.ok(candidats.every((c) => c.rang > 0 && c.port > 0));
	assert.ok(candidats.some((c) => c.categorie === "base_de_donnees"), "les ports critiques remontent en tête");
});

test("20 expositions confirmées sous 24 h, faux positifs sous 10 %", async () => {
	const candidats: CandidatValidation[] = Array.from({ length: 23 }, (_, i) => ({
		id: ID_BASE + i,
		ip: `198.51.100.${i + 1}`,
		port: 25 + (i % 4),
		categorie: "mail",
		criticite: 85 - i * 0.1,
		rang: i + 1,
	}));
	const sorties = new Map<number, ResultatActive>(candidats.map((c, i) => [c.id, i === 0 ? "refuse" : i < 3 ? "timeout" : "ouvert"] as const));
	const sonde: SondeTcp = async (ip): Promise<ReponseSonde> => ({
		resultat: sorties.get(Number(ip.split(".").at(-1)) + ID_BASE - 1) ?? "erreur",
		latenceMs: 8,
	});

	const rapport = await validerTopDecile({
		candidats,
		sonde,
		discoveredAt: DECOUVERTE,
		regleVersion: REGLE_TEST,
		cible: 20,
		budget: 23,
		concurrence: 4,
	});

	assert.equal(rapport.confirmees, 20);
	assert.equal(rapport.refusees, 1);
	assert.equal(rapport.indeterminees, 2);
	assert.equal(rapport.tauxConfirmation, 1);
	assert.ok(rapport.tauxFauxPositif <= 0.1);

	const critere = await lireCritereValidationActive();
	assert.equal(critere.lignes, 20);
	assert.equal(critere.validees, 20);
	assert.equal(critere.ratio, 1);
	const faux = await lireTauxFauxPositif();
	assert.equal(faux.tentatives, 23);
	assert.ok(faux.ratio <= 0.1);

	const { rows } = await query<{ rang: number; preuve: string; faux_positif: boolean }>(
		`SELECT rang, preuve, faux_positif FROM exposure_validation_eval
		  WHERE regle_version = $1 ORDER BY rang`,
		[REGLE_TEST],
	);
	assert.deepEqual(rows.map((r) => r.rang), Array.from({ length: 20 }, (_, i) => i + 1));
	assert.ok(rows.every((r) => r.faux_positif === false));
	assert.ok(rows.every((r) => !r.preuve.includes("198.51.100")));
});
