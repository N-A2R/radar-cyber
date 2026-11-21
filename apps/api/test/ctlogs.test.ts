/**
 * Inventaire CT : comportements vérifiables sans réseau ni base.
 *
 * Les certificats sont fabriqués ici avec des noms explicites : aucun test ne
 * dépend de la disponibilité de crt.sh ou du quota Cert Spotter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClientCT, parserCertSpotter, parserCrtSh } from "../src/ctlogs/client.js";
import {
	ciblesDepuisCorpus,
	ciblesDepuisOrg,
	detecterSuspects,
	distanceEdition,
	extraireSousDomaines,
	fusionnerCibles,
	racine,
	tauxEchec,
	variantesTypo,
	type Cible,
	type CertificatCT,
	type Tentative,
} from "../src/ctlogs/inventaire.js";

const cible = (domaine: string, organisation = domaine): Cible => ({
	domaine, organisation, source: "test", departement: "33",
});

const cert = (nom: string, premiereVue: string, source: "crt.sh" | "certspotter" = "crt.sh", id = "1"): CertificatCT => ({
	nom, premiereVue, source, certificatId: id, emetteur: "Test CA", requete: nom,
});

test("une cible de corpus est un domaine enregistrable confirmé, hors agrégateurs", () => {
	const cibles = ciblesDepuisCorpus([
		{ nom: "Angoulême", url_finale: "https://www.angouleme.fr/", confirme: true, departement: "16" },
		{ nom: "Doublon", url: "https://angouleme.fr/contact", confirme: true },
		{ nom: "Non confirmé", url: "https://ville-non-confirme.fr/", confirme: false },
		{ nom: "Wikipédia", url: "https://fr.wikipedia.org/wiki/Angouleme" },
		{ nom: "ARS", url: "https://nouvelle-aquitaine.ars.sante.fr/" },
		{ nom: "Sans domaine", url: null },
	], "corpus:test");
	assert.deepEqual(cibles.map((c) => c.domaine), ["angouleme.fr"]);
	assert.equal(cibles[0]?.organisation, "Angoulême");
	assert.equal(cibles[0]?.source, "corpus:test");
	assert.equal(racine("https://WWW.Exemple.FR."), "exemple.fr");
});

test("le référentiel ne fournit que des organisations dont le siège est en NA", () => {
	const cibles = ciblesDepuisOrg([
		{ name: "Bordeaux", domain: "https://www.bordeaux.fr/", dept: "33" },
		{ name: "Paris", domain: "paris.fr", dept: "75" },
		{ name: "Sans département", domain: "sansdepartement.fr" },
		{ name: "Doublon", domain: "bordeaux.fr", dept: "33" },
	]);
	assert.deepEqual(cibles.map((c) => c.domaine), ["bordeaux.fr"]);
	assert.equal(cibles[0]?.organisation, "Bordeaux");
});

test("la fusion garde la première occurrence de chaque domaine", () => {
	const cibles = fusionnerCibles(
		[cible("a.fr", "Première")],
		[cible("a.fr", "Seconde"), cible("b.fr")],
	);
	assert.deepEqual(cibles.map((c) => c.organisation), ["Première", "b.fr"]);
});

test("un sous-domaine n'est retenu que s'il est explicite, avec la première vue la plus ancienne", () => {
	const cibles = [cible("angouleme.fr", "Ville d'Angoulême")];
	const lignes = extraireSousDomaines([
		cert("*.cad.angouleme.fr", "2025-01-01T00:00:00Z"),
		cert("cad.angouleme.fr", "2026-01-10T00:00:00Z", "crt.sh", "10"),
		cert("CAD.Angouleme.fr.", "2025-12-01T00:00:00Z", "certspotter", "20"),
		cert("www.wikipedia.org", "2026-01-01T00:00:00Z"),
		cert("angouleme.fr", "2026-01-01T00:00:00Z"),
		cert("autre.fr", "2026-01-01T00:00:00Z"),
	], cibles);
	assert.equal(lignes.length, 1);
	assert.equal(lignes[0]?.sous_domaine, "cad.angouleme.fr");
	assert.equal(lignes[0]?.domaine, "angouleme.fr");
	assert.equal(lignes[0]?.organisation, "Ville d'Angoulême");
	assert.equal(lignes[0]?.source, "certspotter");
	assert.equal(lignes[0]?.premiere_vue, "2025-12-01T00:00:00Z");
	assert.equal(lignes[0]?.certificat_id, "20");
});

test("la distance d'édition compte substitutions, insertions et suppressions", () => {
	assert.equal(distanceEdition("u-bordeaux", "u-bordeau"), 1);
	assert.equal(distanceEdition("u-bordeaux", "u-bordelau"), 2);
	assert.equal(distanceEdition("u-bordeaux", "u-bordeaux"), 0);
});

test("un look-alike récent proche d'une organisation connue est signalé", () => {
	const cibles = [cible("u-bordeaux.fr", "Université de Bordeaux")];
	const suspects = detecterSuspects([
		cert("u-bordeau.fr", "2026-11-01T00:00:00Z", "crt.sh", "11"),
		cert("u-bordeaux.fr", "2026-11-02T00:00:00Z", "crt.sh", "12"),
		cert("u-bordeu.fr", "2020-01-01T00:00:00Z", "crt.sh", "13"),
		cert("autre.fr", "2026-11-03T00:00:00Z", "crt.sh", "14"),
	], cibles, "2026-11-21T00:00:00Z");
	assert.equal(suspects.length, 1);
	assert.deepEqual(
		{
			domaine: suspects[0]?.domaine,
			organisation: suspects[0]?.organisation_cible,
			distance: suspects[0]?.distance,
			motif: suspects[0]?.motif,
			premiere_vue: suspects[0]?.premiere_vue,
		},
		{
			domaine: "u-bordeau.fr",
			organisation: "Université de Bordeaux",
			distance: 1,
			motif: "lookalike-distance-1-recent",
			premiere_vue: "2026-11-01T00:00:00Z",
		},
	);
});

test("une correspondance ambiguë entre deux organisations n'est pas attribuée", () => {
	const cibles = [cible("u-bordeaux.fr", "Université A"), cible("u-bordelau.fr", "Université B")];
	const suspects = detecterSuspects(
		[cert("u-bordelaux.fr", "2026-11-01T00:00:00Z", "crt.sh", "15")],
		cibles,
		"2026-11-21T00:00:00Z",
	);
	assert.equal(suspects.length, 0);
});


test("le taux d'échec agrège les deux fournisseurs", () => {
	const tentatives: Tentative[] = [
		{ fournisseur: "crt.sh", domaine: "a.fr", statut: 200, ok: true, erreur: null, dureeMs: 1 },
		{ fournisseur: "crt.sh", domaine: "b.fr", statut: 0, ok: false, erreur: "HTTP réseau", dureeMs: 1 },
		{ fournisseur: "certspotter", domaine: "a.fr", statut: 429, ok: false, erreur: "HTTP 429", dureeMs: 1 },
	];
	assert.deepEqual(tauxEchec(tentatives), { total: 3, echecs: 2, taux: 2 / 3 });
	assert.deepEqual(tauxEchec([]), { total: 0, echecs: 0, taux: 0 });
});

test("les parseurs conservent noms SAN, identifiant, émetteur et première vue", () => {
	const crt = parserCrtSh(
		[{ name_value: "a.exemple.fr\nb.exemple.fr", first_seen: "2026-01-02T03:04:05", id: 42, issuer_name: "CA" }],
		"exemple.fr",
	);
	assert.deepEqual(crt.map((c) => c.nom), ["a.exemple.fr", "b.exemple.fr"]);
	assert.equal(crt[0]?.premiereVue, "2026-01-02T03:04:05.000Z");
	assert.equal(crt[0]?.source, "crt.sh");
	assert.equal(crt[0]?.certificatId, "42");
	assert.equal(crt[0]?.emetteur, "CA");
	assert.equal(crt[0]?.requete, "exemple.fr");

	const spotter = parserCertSpotter(
		[{ dns_names: ["a.exemple.fr", "c.exemple.fr"], id: "x", issuer: { name: "CA2" }, not_before: "2026-02-03" }],
		"exemple.fr",
	);
	assert.deepEqual(spotter.map((c) => c.nom), ["a.exemple.fr", "c.exemple.fr"]);
	assert.equal(spotter[0]?.source, "certspotter");
	assert.equal(spotter[0]?.premiereVue, "2026-02-03T00:00:00.000Z");
	assert.equal(spotter[0]?.emetteur, "CA2");
});

test("les variantes typo explorent suppressions et transpositions de l'étiquette", () => {
	const variantes = variantesTypo("u-bordeaux.fr", 4);
	assert.deepEqual(variantes.slice(0, 2), ["u-bordeau.fr", "u-bordeax.fr"]);
	assert.ok(variantes.every((v) => v.endsWith(".fr") && v !== "u-bordeaux.fr"));
	assert.ok(variantesTypo("u-bordeaux.fr", 20).includes("u-bordeaxu.fr"));
	assert.ok(variantesTypo("mairie.fr").every((v) => v.length === "mairie.fr".length));
});

test("un 429 avec Retry-After est rejoué une fois puis compté comme succès", async () => {
	const appels: string[] = [];
	const repos = { statut: 200, corps: JSON.stringify([{ dns_names: ["a.exemple.fr"], id: "1" }]) };
	const fetchImpl = (async (_url: string | URL | Request) => {
		appels.push("appel");
		return appels.length === 1
			? new Response(JSON.stringify({ code: "rate_limited" }), { status: 429, headers: { "retry-after": "1" } })
			: new Response(repos.corps, { status: repos.statut });
	}) as typeof fetch;
	const dormir: number[] = [];
	const client = new ClientCT({
		fetchImpl,
		utiliserCrtSh: false,
		dormir: async (ms) => { dormir.push(ms); },
	});
	const resultat = await client.interroger(["exemple.fr"]);
	assert.equal(appels.length, 2);
	assert.deepEqual(dormir, [1000]);
	assert.deepEqual(resultat.certificats.map((c) => c.nom), ["a.exemple.fr"]);
	assert.equal(resultat.tentatives.length, 1);
	assert.equal(resultat.tentatives[0]?.ok, true);
	assert.equal(resultat.tentatives[0]?.statut, 200);
});

test("une panne réseau est enregistrée comme échec, sans certificat inventé", async () => {
	const fetchImpl = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
	const client = new ClientCT({ fetchImpl, utiliserCrtSh: false, dormir: async () => {} });
	const resultat = await client.interroger(["exemple.fr"]);
	assert.deepEqual(resultat.certificats, []);
	assert.equal(resultat.tentatives.length, 1);
	assert.equal(resultat.tentatives[0]?.ok, false);
	assert.equal(resultat.tentatives[0]?.erreur, "HTTP réseau");
	assert.equal(resultat.tentatives[0]?.statut, null);
});

test("un JSON invalide est un échec explicite, pas une liste vide réussie", async () => {
	const fetchImpl = (async () => new Response("<html>crt.sh</html>", { status: 200 })) as typeof fetch;
	const client = new ClientCT({ fetchImpl, utiliserCrtSh: true, dormir: async () => {} });
	const resultat = await client.interroger(["exemple.fr"]);
	assert.equal(resultat.tentatives.length, 2);
	assert.deepEqual(resultat.tentatives.map((t) => t.erreur), ["JSON invalide", "JSON invalide"]);
	assert.deepEqual(resultat.certificats, []);
});

test("un quota épuisé avec Retry-After long est mesuré sans bloquer l'inventaire", async () => {
	const appels: string[] = [];
	const fetchImpl = (async () => {
		appels.push("appel");
		return new Response(JSON.stringify({ code: "rate_limited" }), {
			status: 429,
			headers: { "retry-after": "102" },
		});
	}) as typeof fetch;
	const dormir: number[] = [];
	const client = new ClientCT({ fetchImpl, utiliserCrtSh: false, dormir: async (ms) => { dormir.push(ms); } });
	const resultat = await client.interroger(["exemple.fr"]);
	assert.equal(appels.length, 1);
	assert.deepEqual(dormir, []);
	assert.equal(resultat.tentatives[0]?.ok, false);
	assert.equal(resultat.tentatives[0]?.erreur, "HTTP 429");
});
