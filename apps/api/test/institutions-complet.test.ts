/**
 * Régression du corpus consolidé des institutions de Nouvelle-Aquitaine :
 * chaque règle de sélection et de preuve est testée sur des données synthétiques,
 * puis le corpus versionné est contrôlé (aucun appel réseau).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	candidatsCommunes,
	candidatsEpci,
	candidatsPrefectures,
	candidatsSante,
	candidatsScolaires,
	candidatsSdis,
	evaluerPage,
	jetonsAttendus,
	ligneCorpus,
	normaliser,
	texteVisible,
	type Candidat,
} from "../../../scripts/institutions-complet.mjs";

const CANDIDAT: Candidat = {
	id: "na-test-001",
	nom: "Mairie de Test-sur-Mer",
	type: "mairie",
	commune: "Test-sur-Mer",
	departement: "Charente",
	siren: "211600001",
	url: "https://www.test-sur-mer.fr/",
	source: "test",
	sourceSiren: "test",
};

test("normalisation : casse et diacritiques ne distinguent pas deux noms", () => {
	assert.equal(normaliser("Préfecture de la Charente-Maritime"), "prefecture de la charente maritime");
	assert.deepEqual(jetonsAttendus("Mairie de La Rochelle"), ["rochelle"]);
});

test("texte visible : scripts, styles et entités HTML sont écartés", () => {
	const html = "<style>hidden</style><script>secret</script><title>Ville de Test</title><p>Accueil &eacute;lu</p>";
	const visible = texteVisible(html);
	assert.match(visible, /Ville de Test/);
	assert.match(visible, /Accueil élu/);
	assert.doesNotMatch(visible, /secret|hidden/);
});

test("preuve : le nom discriminant dans la page confirme l'institution", () => {
	const confirme = evaluerPage("<title>Mairie de Test-sur-Mer</title>", CANDIDAT.nom);
	assert.equal(confirme.confirme, true);
	assert.deepEqual(confirme.jetons, ["test", "mer"]);
	const autre = evaluerPage("<title>Actualités de la région</title>", CANDIDAT.nom);
	assert.equal(autre.confirme, false);
});

test("ligne de corpus : URL de preuve, statut HTTP et SIREN sont explicites", () => {
	const ligne = ligneCorpus(CANDIDAT, {
		statut: 200, urlFinale: "https://www.test-sur-mer.fr/accueil",
		extrait: "Mairie de Test-sur-Mer", jetons: ["test", "mer"], confirme: true, erreur: null,
	});
	assert.equal(ligne.siren, "211600001");
	assert.equal(ligne.url_preuve, "https://www.test-sur-mer.fr/accueil");
	assert.deepEqual((ligne.preuve as Record<string, unknown>).http_status, 200);
});

test("mairies : seuil strict, communes actuelles et SIREN du référentiel", () => {
	const ref = {
		communes: [
			{ code: "17001", nom: "Petite", siren: "211700010", departement: "17", type: "commune-actuelle", population: 4999 },
			{ code: "17002", nom: "Grande", siren: "211700020", departement: "17", type: "commune-actuelle", population: 5001 },
			{ code: "17003", nom: "Déléguée", siren: "211700030", departement: "17", type: "commune-deleguee", population: 9000 },
		],
		epci: [], departements: [{ code: "17", nom: "Charente-Maritime" }],
	};
	const candidats = candidatsCommunes(ref, new Map([["17002", ["https://www.grande.fr/"]]]), new Map());
	assert.deepEqual(candidats.map((c) => c.nom), ["Mairie de Grande"]);
	assert.equal(candidats[0]!.siren, "211700020");
	assert.equal(candidats[0]!.departement, "Charente-Maritime");
});

test("EPCI : le code à 9 chiffres sert de SIREN", () => {
	const ref = {
		communes: [], departements: [],
		epci: [{ code: "200023307", nom: "CA du Grand Villeneuvois", type: "CA" }],
	};
	const candidats = candidatsEpci(ref, new Map([["200023307", ["http://www.grand-villeneuvois.fr/"]]]));
	assert.equal(candidats[0]!.siren, "200023307");
	assert.equal(candidats[0]!.type, "epci");
});

test("écoles : le SIREN est extrait du SIRET et le type est normalisé", () => {
	const nomsDep = new Map([["086", "Vienne"]]);
	const candidats = candidatsScolaires([{
		identifiant_de_l_etablissement: "0860028N", nom_etablissement: "Lycée Jean Moulin",
		nom_commune: "Montmorillon", code_departement: "086", web: "https://jeanmoulin.fr",
		siren_siret: "19860028000012", type_etablissement: "Lycée",
	}], nomsDep);
	assert.equal(candidats[0]!.siren, "198600280");
	assert.equal(candidats[0]!.type, "lycée");
	assert.equal(candidats[0]!.commune, "Montmorillon");
});

test("SDIS : un seul candidat par département, avec le SIREN Wikidata", () => {
	const candidats = candidatsSdis([
		{ label: "préfecture de la Charente", siren: "171600013", site: "https://www.charente.gouv.fr/" },
		{ label: "service départemental d'incendie et de secours de la Charente", siren: "281600014", site: "https://www.sdis16.fr/" },
	], [
		{ code: "16", nom: "Charente" },
		{ code: "17", nom: "Charente-Maritime" },
	]);
	assert.deepEqual(candidats.map((c) => [c.id, c.type, c.siren]), [["na-etat-sdis-16", "sdis", "281600014"]]);
});

test("préfectures : site officiel et SIREN de l'annuaire des entreprises", () => {
	const sirens = new Map([["charente", "171600018"], ["nouvelle aquitaine", "173300005"]]);
	const candidats = candidatsPrefectures([
		{ code: "16", nom: "Charente" },
		{ code: "17", nom: "Charente-Maritime" },
	], sirens);
	assert.deepEqual(candidats.map((c) => [c.id, c.nom, c.siren, c.url]), [
		["na-etat-prefecture-16", "Préfecture de Charente", "171600018", "https://www.charente.gouv.fr/"],
		["na-etat-prefecture-75", "Préfecture de la région Nouvelle-Aquitaine", "173300005", "https://www.nouvelle-aquitaine.gouv.fr/"],
	]);
});

test("écoles : deux campus avec le même UAI reçoivent des identifiants distincts", () => {
	const commune = new Map([["033", "Gironde"]]);
	const candidats = candidatsScolaires([1, 2].map((i) => ({
		identifiant_de_l_etablissement: "0332497K",
		nom_etablissement: `Lycée Saint-Vincent ${i}`,
		nom_commune: "Bordeaux", code_departement: "033",
		web: `https://etablissement-${i}.fr`, siren_siret: "78184276000012",
		type_etablissement: "Lycée",
	})), commune);
	assert.deepEqual(candidats.map((c) => c.id), ["na-edu-0332497K", "na-edu-0332497K-2"]);
});

test("santé : seules les entrées avec SIREN et URL sont conservées", () => {
	const candidats = candidatsSante([
		{ id: "a", nom: "CH de Test", siren: "193300000", url: "https://www.ch-test.fr/", type: "ch" },
		{ id: "b", nom: "Sans SIREN", siren: "", url: "https://exemple.fr/" },
	], new Map());
	assert.deepEqual(candidats.map((c) => c.id), ["na-sante-a"]);
});

test("corpus versionné : 200 institutions minimum, toutes prouvées et pourvues de SIREN", () => {
	const chemin = fileURLToPath(new URL("../../../bench/corpus/institutions-complet.jsonl", import.meta.url));
	const lignes = readFileSync(chemin, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
	assert.ok(lignes.length >= 200, `${lignes.length} institutions`);
	const ids = new Set<string>();
	const types = new Set<string>();
	for (const l of lignes) {
		assert.ok(!ids.has(l.id), `identifiant dupliqué : ${l.id}`);
		ids.add(l.id);
		assert.match(l.id, /^na-/);
		assert.ok(l.nom && l.type && l.url);
		assert.match(l.siren, /^\d{9}$/, `SIREN de ${l.nom}`);
		assert.match(l.url, /^https?:\/\//);
		assert.match(l.url_preuve, /^https?:\/\//);
		assert.equal(l.preuve.http_status, 200);
		assert.ok(l.preuve.verifie_le && l.preuve.extrait);
		types.add(l.type);
	}
	for (const categorie of ["mairie", "epci", "prefecture", "sdis"]) {
		assert.ok(types.has(categorie), `catégorie absente : ${categorie}`);
	}
	assert.ok(types.has("collège") || types.has("lycée"), "aucun établissement scolaire");
});

test("corpus versionné : les 12 préfectures départementales sont prouvées", () => {
	const chemin = fileURLToPath(new URL("../../../bench/corpus/institutions-complet.jsonl", import.meta.url));
	const lignes = readFileSync(chemin, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
	const prefectures = lignes.filter((l) => l.type === "prefecture");
	assert.ok(prefectures.length >= 13, `${prefectures.length} préfectures`);
	assert.equal(new Set(prefectures.map((l) => l.departement)).size, 13);
	for (const l of prefectures) {
		assert.match(l.nom, /^Préfecture/);
		assert.match(l.siren, /^\d{9}$/);
		assert.equal(l.preuve.http_status, 200);
		assert.ok(l.preuve.extrait);
	}
});

test("rapport : retenus et répartition par type collent au corpus versionné", () => {
	const dossier = new URL("../../../bench/", import.meta.url);
	const lignes = readFileSync(new URL("corpus/institutions-complet.jsonl", dossier), "utf8")
		.split(/\r?\n/).filter(Boolean);
	const rapport = JSON.parse(readFileSync(new URL("results/institutions-complet.json", dossier), "utf8"));
	assert.equal(rapport.retenus, lignes.length);
	assert.equal(rapport.avecSiren, lignes.length);
	const parType: Record<string, number> = {};
	for (const l of lignes.map((ligne) => JSON.parse(ligne))) {
		parType[l.type] = (parType[l.type] ?? 0) + 1;
	}
	assert.deepEqual(rapport.parType, parType);
});
