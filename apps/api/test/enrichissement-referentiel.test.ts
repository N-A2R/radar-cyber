import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
	analyserOrganisation,
	calculerCouverture,
	CHAMPS,
	choisirCandidat,
	codePostalValide,
	couvertureVide,
	entreprisesDepuisApi,
	indexerCommunes,
	indexerEntreprises,
	lireJson,
	nafVersSecteur,
	nomNormalise,
	normaliserNaf,
	proposerDomaine,
	proposerGeo,
	racineAdmissible,
	verifierDomaine,
	type Commune,
	type ContexteEnrichissement,
	type EntrepriseSnapshot,
	type FetchLike,
	type OrgEnrichissable,
	type Proposition,
	type TentativeDomaine,
	type ReponseLike,
} from "../src/referentiel/enrichissement.js";
import {
	appliquerLot,
	lireOrganisations,
	mesurerCouverture,
} from "../src/referentiel/enrichissement-db.js";
import { query } from "../src/db.js";
import { sirenUnique } from "./helpers/siren.js";

const SIREN_VIDE = sirenUnique("enrichissement-referentiel:vide");
const SIREN_PLEIN = sirenUnique("enrichissement-referentiel:plein");

function org(sur: Partial<OrgEnrichissable> = {}): OrgEnrichissable {
	return {
		id: 1,
		name: "Test Organisation",
		name_norm: "test organisation",
		domain: null,
		website: null,
		siren: null,
		naf: null,
		sector: null,
		city: "Bordeaux",
		dept: "33",
		lat: null,
		lon: null,
		...sur,
	};
}

function commune(sur: Partial<Commune> = {}): Commune {
	return {
		code: "33063",
		nom: "Bordeaux",
		departement: "33",
		codesPostaux: ["33000"],
		lat: 44.8378,
		lon: -0.5792,
		population: 260_000,
		...sur,
	};
}

function entreprise(sur: Partial<EntrepriseSnapshot> = {}): EntrepriseSnapshot {
	return {
		siren: "123456789",
		nom: "TEST ORGANISATION",
		naf: "62.02A",
		etat: "actif",
		siege: { codePostal: "33000", commune: "Bordeaux", departement: "33" },
		...sur,
	};
}

function contexte(sur: Partial<ContexteEnrichissement> = {}): ContexteEnrichissement {
	return {
		champs: new Set(CHAMPS),
		seuil: 0.7,
		modeSiren: "snapshot",
		verifierHttp: false,
		apiBase: "https://api.invalid/search",
		timeoutMs: 1000,
		retries: 0,
		entreprisesParNom: new Map(),
		entreprisesParSiren: new Map(),
		communesParCp: new Map(),
		communesParNom: new Map(),
		...sur,
	};
}

function reponse(statut: number, url: string, corps: unknown = {}): ReponseLike {
	return {
		status: statut,
		url,
		json: async () => corps,
		body: { cancel: async () => {} },
	};
}

/* ---------------------------- normalisation ------------------------------ */

test("normalisations et vocabulaire NAF", () => {
	assert.equal(nomNormalise("Établissement de l'Hôpital—Saint-André"), "etablissement de l hopital saint andre");
	assert.equal(codePostalValide(" 33 000 "), null);
	assert.equal(codePostalValide("33000"), "33000");
	assert.equal(normaliserNaf("6202A"), "62.02A");
	assert.equal(normaliserNaf("62.02A"), "62.02A");
	assert.equal(normaliserNaf("nonsense"), null);
	assert.deepEqual(nafVersSecteur("62.02A"), { secteur: "numerique", libelle: "Numérique et télécommunications" });
	assert.equal(nafVersSecteur("86.10Z")?.secteur, "sante");
	assert.equal(nafVersSecteur(null), null);
});

test("racine de domaine : fournisseur, TLD et hôte privé refusés", () => {
	assert.equal(racineAdmissible("www.exemple.fr"), true);
	assert.equal(racineAdmissible("gmail.com"), false);
	assert.equal(racineAdmissible("serveur.invalid"), false);
	assert.equal(racineAdmissible("192.168.1.4"), false);
});

/* ------------------------------- domaine -------------------------------- */

test("HTTP 200 sur le même domaine : confiance et source tracées", async () => {
	const ctx = contexte({
		verifierHttp: true,
		fetchHttp: (async () => reponse(200, "https://www.exemple.fr/accueil")) as FetchLike,
	});
	const verification = await verifierDomaine("exemple.fr", ctx);
	assert.deepEqual(verification, {
		ok: true,
		statut: 200,
		urlFinale: "https://www.exemple.fr/accueil",
		hoteFinal: "www.exemple.fr",
	});
	const tentatives: TentativeDomaine[] = [];
	const proposition = await proposerDomaine(org({ name: "EXEMPLE FR", domain: "exemple.fr" }), ctx, tentatives);
	assert.ok(proposition);
	assert.equal(proposition!.champ, "domain");
	assert.equal(proposition!.source, "http-200:www.exemple.fr");
	assert.ok(proposition!.confiance >= 0.8);
	assert.equal(tentatives[0]!.ok, true);
});

test("HTTP : 404, redirection hors domaine, timeout et hors ligne", async () => {
	const base = contexte({ verifierHttp: true });
	assert.equal((await verifierDomaine("exemple.fr", { ...base, fetchHttp: (async () => reponse(404, "https://exemple.fr")) as FetchLike })).ok, false);
	assert.equal(
		(await verifierDomaine("exemple.fr", { ...base, fetchHttp: (async () => reponse(200, "https://ailleurs.com/")) as FetchLike })).ok,
		false,
	);
	assert.match(
		JSON.stringify(await verifierDomaine("exemple.fr", {
			...base,
			fetchHttp: (async () => { throw new Error("timeout"); }) as FetchLike,
		})),
		/timeout/,
	);
	assert.equal((await verifierDomaine("exemple.fr", contexte())).ok, false);
	const tentatives: TentativeDomaine[] = [];
	assert.equal(await proposerDomaine(org({ website: "exemple.fr" }), contexte(), tentatives), null);
	assert.equal(tentatives[0]!.motif, "verification-desactivee");
});

/* -------------------------------- SIREN --------------------------------- */

test("API recherche-entreprises : parsing tolérant et score de correspondance", () => {
	const candidats = entreprisesDepuisApi({
		results: [{
			siren: "123456789",
			nom_complet: "TEST ORGANISATION",
			nom_raison_sociale: "TEST ORGANISATION SA",
			etat_administratif: "A",
			siege: { activite_principale: "6202A", code_postal: "33000", libelle_commune: "Bordeaux", departement: "33" },
		}],
		total_results: 1,
	});
	assert.equal(candidats.length, 2); // nom complet + raison sociale (alias)
	assert.equal(candidats[0]!.origine, "api");
	assert.equal(candidats[1]!.alias, true);
	const choix = choisirCandidat(org(), candidats);
	assert.equal(choix.ok, true);
	if (choix.ok) {
		assert.ok(choix.evaluation.confiance >= 0.9);
		assert.ok(choix.evaluation.raisons.includes("departement"));
	}
});

test("deux SIREN pour le même nom : refus ambigu, jamais de choix arbitraire", () => {
	const choix = choisirCandidat(org(), [
		{ ...entreprise({ siren: "111111111" }), origine: "snapshot", alias: false },
		{ ...entreprise({ siren: "222222222" }), origine: "snapshot", alias: false },
	]);
	assert.deepEqual(choix, { ok: false, motif: "match-ambigu" });
	assert.deepEqual(choisirCandidat(org({ name: "Autre" }), []), { ok: false, motif: "sans-match" });
});

test("retry JSON sur 429 puis réussite, et JSON invalide", async () => {
	let appels = 0;
	const fetch: FetchLike = (async () => {
		appels++;
		return appels === 1 ? reponse(429, "https://api.invalid/") : reponse(200, "https://api.invalid/", { results: [] });
	}) as FetchLike;
	const resultat = await lireJson(fetch, "https://api.invalid/", 2, async () => {});
	assert.equal(resultat.ok, true);
	assert.equal(appels, 2);
	const mauvais: FetchLike = (async () => ({
		status: 200, url: "https://api.invalid/", json: async () => { throw new Error("cassé"); },
	})) as FetchLike;
	const echec = await lireJson(mauvais, "https://api.invalid/", 0, async () => {});
	assert.equal(echec.ok, false);
	if (!echec.ok) assert.match(echec.motif, /json-invalide/);
});

/* ---------------------------------- géo --------------------------------- */

test("géo par code postal :unique, ambigu, nom de commune et cohérence dept", () => {
	const ctx = contexte({
		communesParCp: indexerCommunes([
			commune(),
			commune({ code: "33064", nom: "Mérignac", codesPostaux: ["33000"], population: 70_000, lat: 44.84, lon: -0.6 }),
			commune({ code: "16001", nom: "Abzac", codesPostaux: ["16500"], departement: "16" }),
			commune({ code: "99999", nom: "Nulle", codesPostaux: ["99999"], lat: null, lon: null }),
		]).parCp,
	});
	const index = ctx.communesParCp;
	const ctxComplet = contexte({
		communesParCp: index,
		communesParNom: indexerCommunes([commune(), commune({ code: "16001", nom: "Abzac", departement: "16" }) ]).parNom,
	});
	const unique = proposerGeo(org({ city: "16500 Abzac", dept: "16" }), ctxComplet, "16500");
	assert.equal(unique.ok, true);
	if (unique.ok) {
		assert.equal(unique.proposition.confiance, 0.95);
		assert.equal(unique.proposition.valeur.commune, "Abzac");
	}
	const ambigu = proposerGeo(org({ city: null, dept: "33" }), ctxComplet, "33000");
	assert.equal(ambigu.ok, true);
	if (ambigu.ok) {
		assert.equal(ambigu.proposition.confiance, 0.65);
		assert.equal(ambigu.proposition.valeur.commune, "Bordeaux");
	}
	assert.equal(proposerGeo(org({ dept: "33" }), ctxComplet, "99999").ok, false);
	assert.equal(proposerGeo(org({ dept: "33" }), ctxComplet, "16500").ok, false);
	assert.equal(proposerGeo(org({ city: "Abzac", dept: "16" }), ctxComplet).ok, true);
	assert.equal(proposerGeo(org({ city: null }), ctxComplet).ok, false);
});

/* --------------------------- orchestration ------------------------------- */

test("analyserOrganisation : SIREN, secteur et géo depuis les snapshots", async () => {
	const indexE = indexerEntreprises([entreprise()]);
	const indexC = indexerCommunes([commune()]);
	const ctx = contexte({
		entreprisesParNom: indexE.parNom,
		entreprisesParSiren: indexE.parSiren,
		communesParCp: indexC.parCp,
		communesParNom: indexC.parNom,
	});
	const resultat = await analyserOrganisation(org({ name: "TEST ORGANISATION" }), ctx);
	const champs = resultat.propositions.map((p) => p.champ).sort();
	assert.deepEqual(champs, ["geo", "secteur", "siren"]);
	assert.equal(resultat.propositions.find((p) => p.champ === "siren")?.source, "sirene-snapshot");
	assert.equal(resultat.propositions.find((p) => p.champ === "secteur")?.valeur.secteur, "numerique");
	assert.equal(resultat.propositions.find((p) => p.champ === "geo")?.source, "codes-postaux-communes");
	assert.ok(resultat.rejets.some((r) => r.champ === "domain" && r.motif === "sans-candidat"));
	assert.equal(resultat.tentativesHttp, 0);
	assert.equal(resultat.appelsApi, 0);
});

test("états vides : aucune donnée, aucun réseau, aucune proposition", async () => {
	const resultat = await analyserOrganisation(org({ city: null, name: "Sans fiche" }), contexte());
	assert.equal(resultat.propositions.length, 0);
	assert.deepEqual(resultat.rejets.map((r) => r.motif).sort(), [
		"sans-candidat", "sans-code-postal", "sans-match", "sans-match",
	]);
});

test("couverture projetée : gains par champ et division par zéro", () => {
	const avant = couvertureVide();
	avant.domain.remplis = 10;
	avant.siren.remplis = 50;
	avant.secteur.remplis = 60;
	avant.geo.remplis = 20;
	const propositions: Proposition[] = [
		{ orgId: 1, champ: "domain", valeur: { domaine: "a.fr" }, source: "http-200:a.fr", confiance: 0.9, details: {} },
		{ orgId: 1, champ: "geo", valeur: { lat: 45, lon: 0 }, source: "codes-postaux-communes", confiance: 0.8, details: {} },
	];
	const apres = calculerCouverture(100, avant, propositions);
	assert.equal(apres.domain.remplis, 11);
	assert.equal(apres.domain.taux, 0.11);
	assert.equal(apres.geo.gain, 1);
	assert.equal(apres.siren.taux, 0.5);
	assert.equal(calculerCouverture(0, avant, []).domain.taux, 0);
});

/* ----------------------------- intégration ------------------------------- */

test("base : lecture paginée, application idempotente, provenance et non-écrasement", async () => {
	const { rows: inseres } = await query<{ id: number; slug: string }>(
		`INSERT INTO org (name, slug, kind, city, dept, status)
		 VALUES ('Orgo Sans Valeur', 'test-enrichissement-vide', 'entreprise', 'Bordeaux', '33', 'confirme'),
		        ('Orgo Deja Renseignee', 'test-enrichissement-plein', 'entreprise', 'Bordeaux', '33', 'confirme')
		 ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id, slug`,
	);
	const vide = inseres.find((r) => r.slug === "test-enrichissement-vide")!;
	const plein = inseres.find((r) => r.slug === "test-enrichissement-plein")!;
	await query(
		`UPDATE org SET domain = 'deja.fr', siren = '${SIREN_PLEIN}', sector = 'sante', lat = 48.8, lon = 2.3
		  WHERE id = $1`,
		[plein.id],
	);
	const apresId = Math.max(plein.id, vide.id) - 2;
	const lus = await lireOrganisations({ champs: new Set(CHAMPS), apresId, limite: 100 });
	assert.ok(lus.some((o) => o.id === vide.id));
	assert.ok(!lus.some((o) => o.id === plein.id));

	const propositions: Proposition[] = [
		{ orgId: vide.id, champ: "domain", valeur: { domaine: "nouveau.fr" }, source: "http-200:nouveau.fr", confiance: 0.88, details: { codeHttp: 200 } },
		{ orgId: vide.id, champ: "siren", valeur: { siren: SIREN_VIDE }, source: "recherche-entreprises-api", confiance: 0.93, details: {} },
		{ orgId: vide.id, champ: "secteur", valeur: { secteur: "numerique", naf: "62.02A", libelle: "Numérique" }, source: "recherche-entreprises-api", confiance: 0.91, details: {} },
		{ orgId: vide.id, champ: "geo", valeur: { lat: 44.8378, lon: -0.5792, codePostal: "33000", commune: "Bordeaux", codeCommune: "33063" }, source: "codes-postaux-communes", confiance: 0.95, details: {} },
		{ orgId: plein.id, champ: "domain", valeur: { domaine: "écrasement.fr" }, source: "http-200:ecrasement.fr", confiance: 0.99, details: {} },
	];
	const avant = await mesurerCouverture();
	const premiere = await appliquerLot(propositions);
	assert.equal(premiere.valeursTracees, 5);
	assert.equal(premiere.colonnesMisesAJour, 4);

	const { rows } = await query<{
		domain: string | null; siren: string | null; sector: string | null;
		lat: number | null; geo_source: string | null; naf: string | null;
	}>("SELECT domain, siren, sector, lat, lon, geo_source, naf FROM org WHERE id = ANY($1::int[])", [[vide.id, plein.id]]);
	const orgVide = rows.find((r) => r.domain === "nouveau.fr")!;
	const orgPlein = rows.find((r) => r.domain === "deja.fr")!;
	assert.equal(orgVide.siren, SIREN_VIDE);
	assert.equal(orgVide.sector, "numerique");
	assert.equal(orgVide.naf, "62.02A");
	assert.equal(orgVide.lat, 44.8378);
	assert.match(orgVide.geo_source!, /^code-postal:/);
	assert.equal(orgPlein.siren, SIREN_PLEIN);
	assert.equal(orgPlein.sector, "sante");
	assert.equal(orgPlein.lat, 48.8);

	const traces = await query<{ champ: string; source: string; confiance: string }>(
		"SELECT champ, source, confiance::text FROM org_enrichment WHERE org_id = $1 ORDER BY champ",
		[vide.id],
	);
	assert.deepEqual(traces.rows.map((t) => t.champ).sort(), ["domain", "geo", "secteur", "siren"]);
	assert.equal(traces.rows.find((t) => t.champ === "domain")?.source, "http-200:nouveau.fr");
	assert.equal(traces.rows.find((t) => t.champ === "domain")?.confiance, "0.880");

	const seconde = await appliquerLot(propositions);
	assert.equal(seconde.colonnesMisesAJour, 0);
	const apres = await mesurerCouverture();
	assert.ok(apres.avant.domain.remplis > avant.avant.domain.remplis);
	assert.equal(apres.avant.geo.traces, 1);
	assert.equal(apres.avant.siren.traces, 1);
});

after(async () => {
	await query("DELETE FROM org_enrichissement WHERE org_id IN (SELECT id FROM org WHERE slug LIKE 'test-enrichissement-%')");
	await query("DELETE FROM org WHERE slug LIKE 'test-enrichissement-%'");
});
