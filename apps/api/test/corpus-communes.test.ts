/**
 * Corpus des sites de communes — un test par comportement vérifiable.
 *
 * Aucun appel réseau ici : la sélection lit le référentiel versionné, les
 * réponses Wikidata et HTTP sont synthétiques. Le seul test en base vérifie
 * l'effet observable de `--appliquer` sur des organisations jetables.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, after } from "node:test";
import { fileURLToPath } from "node:url";
import { query, closePools } from "../src/db.js";
import {
	appliquerPlan,
	candidatsDepuisWikidata,
	communesCibles,
	evaluerReponse,
	ligneCorpus,
	planApplication,
	trierCandidats,
	type CandidatSite,
	type CommuneCible,
	type LigneCorpus,
} from "../src/corpus/communes.js";
import type { ReferentielNA } from "../src/referentiel/model.js";

const REFERENTIEL = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../../db/data/referentiel-na.json", import.meta.url)), "utf8"),
) as ReferentielNA;

const BORDEAUX: CommuneCible = {
	code: "33063",
	nom: "Bordeaux",
	departement: "33",
	population: 79_851,
	siren: "213300635",
};

function ligne(confirme: boolean, urlFinale = "https://www.bordeaux.fr/"): LigneCorpus {
	const verification = evaluerReponse({
		statut: confirme ? 200 : 404,
		urlFinale,
		html: "<title>Mairie de Bordeaux</title>",
		nom: BORDEAUX.nom,
	});
	return ligneCorpus(
		BORDEAUX,
		{ url: urlFinale, qid: "Q1479", source: "wikidata:P856" },
		verification,
		[],
		"2026-11-21",
	);
}
test("sélection : 74 communes actuelles de NA dépassent 10 000 habitants", () => {
	const cibles = communesCibles(REFERENTIEL);
	assert.equal(cibles.length, 74);
	assert.ok(cibles.every((c) => c.population > 10_000));
	assert.ok(cibles.every((c) => /^\d{5}$/.test(c.code)));
	assert.deepEqual(
		cibles.map((c) => c.code),
		cibles.map((c) => c.code).toSorted(),
	);
});

test("sélection : le seuil est strict et les communes déléguées sont exclues", () => {
	const cibles = communesCibles(REFERENTIEL, 41_908);
	assert.ok(cibles.every((c) => c.population > 41_908));
	assert.ok(!cibles.some((c) => c.code === "16015")); // Angoulême : exactement 41 908
	const modele = REFERENTIEL.communes[0]!;
	const avecDeleguees = {
		...REFERENTIEL,
		communes: [
			...REFERENTIEL.communes,
			{ ...modele, code: "99999", type: "commune-deleguee", population: 50_000 },
		],
	};
	assert.ok(!communesCibles(avecDeleguees).some((c) => c.code === "99999"));
});

// ── Découverte Wikidata ──────────────────────────────────────────────────

test("Wikidata : les P856 sont rattachés au code INSEE, pas au nom", () => {
	const payload = {
		results: {
			bindings: [
				{ insee: { value: "33063" }, item: { value: "http://www.wikidata.org/entity/Q1479" }, site: { value: "https://www.bordeaux.fr" } },
				{ insee: { value: "33063" }, item: { value: "http://www.wikidata.org/entity/Q1479" }, site: { value: "https://www.bordeaux.fr" } },
				{ insee: { value: "999" }, item: { value: "Q1" }, site: { value: "https://exemple.fr" } },
				{ insee: { value: "16015" }, item: { value: "Q134346" }, site: { value: "javascript:alert(1)" } },
			],
		},
	};
	const parCode = candidatsDepuisWikidata(payload);
	assert.equal(parCode.get("33063")?.length, 1);
	assert.equal(parCode.get("33063")?.[0]?.qid, "Q1479");
	assert.equal(parCode.get("33063")?.[0]?.source, "wikidata:P856");
	assert.equal(parCode.has("999"), false);
	assert.equal(parCode.has("16015"), false);
	assert.equal(candidatsDepuisWikidata({ autre: 1 }).size, 0);
});

test("candidats : HTTPS et hôte portant le nom passent avant l'ancien site", () => {
	const candidats: CandidatSite[] = [
		{ url: "http://www.ville-boulazac.fr", qid: "Q1000796", source: "wikidata:P856" },
		{ url: "https://www.boulazacislemanoire.fr/", qid: "Q30041807", source: "wikidata:P856" },
	];
	assert.equal(trierCandidats(candidats, "Boulazac Isle Manoire")[0]?.url, candidats[1]?.url);
});

// ── Cohérence du contenu ─────────────────────────────────────────────────

test("cohérence : le nom exact dans la page suffit, accents inclus", () => {
	const r = evaluerReponse({
		statut: 200,
		urlFinale: "https://www.larochelle.fr/",
		html: "<title>Ville de La Rochelle</title>",
		nom: "La Rochelle",
	});
	assert.equal(r.confirme, true);
	assert.equal(r.correspondance, "exacte");
	assert.match(r.extrait ?? "", /la rochelle/);
});

test("cohérence : un nom composé est accepté avec un marqueur institutionnel", () => {
	const r = evaluerReponse({
		statut: 200,
		urlFinale: "https://www.brive.fr/",
		html: "<title>Site officiel de la ville de Brive</title>",
		nom: "Brive-la-Gaillarde",
	});
	assert.equal(r.confirme, true);
	assert.equal(r.correspondance, "partielle");
});

test("cohérence : une page 200 sans mention de la commune est un échec", () => {
	const r = evaluerReponse({
		statut: 200,
		urlFinale: "https://exemple.fr/",
		html: "<title>Actualités du tourisme en Nouvelle-Aquitaine</title>",
		nom: "Bordeaux",
	});
	assert.equal(r.confirme, false);
	assert.equal(r.raison, "page 200 sans mention de la commune");
});

// ── Contrôles HTTP ───────────────────────────────────────────────────────

test("HTTP : un statut non-200 échoue même si le contenu mentionne la commune", () => {
	const r = evaluerReponse({
		statut: 301,
		urlFinale: "http://www.villedebiganos.fr/",
		html: "<title>Ville de Biganos</title>",
		nom: "Biganos",
	});
	assert.equal(r.confirme, false);
	assert.equal(r.raison, "HTTP 301");
});

test("HTTP : une redirection vers un réseau social n'est pas un site officiel", () => {
	const r = evaluerReponse({
		statut: 200,
		urlFinale: "https://www.facebook.com/ville-de-bordeaux/",
		html: "Bordeaux — Ville de Bordeaux",
		nom: "Bordeaux",
	});
	assert.equal(r.confirme, false);
	assert.match(r.raison ?? "", /hôte non officiel/);
});

// ── Corpus et application ────────────────────────────────────────────────

test("corpus : une commune sans site candidat garde sa raison d'échec", () => {
	const l = ligneCorpus(
		BORDEAUX,
		null,
		{
			confirme: false,
			raison: "aucun site officiel référencé (Wikidata P856)",
			statut: null,
			urlFinale: null,
			extrait: null,
			correspondance: null,
		},
		[],
		"2026-11-21",
	);
	assert.equal(l.id, "na-commune-33063");
	assert.equal(l.confirme, false);
	assert.match(l.raison ?? "", /P856/);
	assert.deepEqual(l.tentatives, []);
});

test("application : le plan ne retient que les confirmés et normalise le domaine", () => {
	const plan = planApplication([ligne(true), ligne(false), ligne(true, "https://www.pessac.fr/")]);
	assert.equal(plan.length, 2);
	assert.deepEqual(plan[0], {
		code: "33063",
		siren: "213300635",
		website: "https://www.bordeaux.fr/",
		domain: "bordeaux.fr",
	});
	assert.equal(plan[1]?.domain, "pessac.fr");
});

const TAG = `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const codes = [`${TAG}a`, `${TAG}b`, `${TAG}c`];
const crees: number[] = [];

after(async () => {
	if (crees.length) await query("DELETE FROM org WHERE id = ANY($1::int[])", [crees]);
	await closePools();
});

test("base : --appliquer remplit les champs vides sans écraser l'existant", async () => {
	for (const [i, code] of codes.entries()) {
		const site = i === 1 ? "https://deja-saisi.fr/" : null;
		const { rows } = await query<{ id: number }>(
			`INSERT INTO org (name, slug, kind, entity_code, siren, website, status)
			 VALUES ($1, $2, 'collectivite', $3, $4, $5, 'confirme') RETURNING id`,
			[`Commune test ${code}`, `${TAG}-${code}`, code, `${TAG}${i}`, site],
		);
		crees.push(rows[0]!.id);
	}
	const resultat = await appliquerPlan([
		{ code: codes[0]!, siren: `${TAG}0`, website: "https://www.bordeaux.fr/", domain: "bordeaux.fr" },
		{ code: codes[1]!, siren: `${TAG}1`, website: "https://www.pessac.fr/", domain: "pessac.fr" },
		{ code: codes[2]!, siren: "siren-errone", website: "https://exemple.fr/", domain: "exemple.fr" },
	]);
	assert.equal(resultat.organisations, 1);
	const { rows } = await query<{ entity_code: string; website: string | null; domain: string | null }>(
		"SELECT entity_code, website, domain FROM org WHERE id = ANY($1::int[]) ORDER BY entity_code",
		[crees],
	);
	const parCode = new Map(rows.map((r) => [r.entity_code, r]));
	assert.equal(parCode.get(codes[0]!)?.domain, "bordeaux.fr");
	assert.equal(parCode.get(codes[1]!)?.website, "https://deja-saisi.fr/");
	assert.equal(parCode.get(codes[1]!)?.domain, null);
	assert.equal(parCode.get(codes[2]!)?.domain, null);
});
