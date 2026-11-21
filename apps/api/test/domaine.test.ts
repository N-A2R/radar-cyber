/**
 * Indices-domaines : normalisation, prudence et chaîne de résolution.
 *
 * Les cas sont ceux de la file de quarantaine mesurée le 2026-11-21 :
 * 184 indices sur 220 sont des domaines, mais 0 organisation sur 1,67 M porte
 * un domaine. Le contrôle ci-dessous prouve la correction du code sur des
 * domaines réels, sans écrire dans la base de production.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	domainAffinity,
	domainFromHint,
	isDomainHint,
	normalizeDomainValue,
	racineDomaine,
	domaineRacine,
	resoudreDomaine,
	type OrgDomaine,
} from "../src/match/domaine.js";
import { matchOrgInIndex, type OrgIndexEntry } from "../src/quarantine/promote.js";

function org(
	id: number,
	name: string,
	extra: { slug?: string; domain?: string | null; website?: string | null } = {},
): OrgIndexEntry {
	const nameNorm = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
	return {
		id,
		name,
		slug: extra.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		kind: "entreprise",
		city: null,
		domain: extra.domain ?? null,
		website: extra.website ?? null,
		nameNorm,
		domainNorm: extra.domain ? normalizeDomainValue(extra.domain) : null,
		websiteDomain: extra.website ? domainFromHint(extra.website) : null,
		cityNorm: null,
		nameTokens: nameNorm.split(" ").filter((t) => t.length >= 4),
	};
}

// ── Normalisation ────────────────────────────────────────────────────────

test("normalisation : www., casse et point final", () => {
	assert.equal(normalizeDomainValue("  WWW.Exemple.FR.  "), "exemple.fr");
	assert.equal(normalizeDomainValue("CONNECTWELL.COM"), "connectwell.com");
	assert.equal(isDomainHint("www.sdjeng.com"), true);
	assert.equal(isDomainHint("Chu De Rennes"), false);
	assert.equal(normalizeDomainValue("Chu De Rennes"), null);
});

test("normalisation : port, chemin, requête et scheme", () => {
	assert.equal(normalizeDomainValue("https://WWW.Exemple.com:8443/contact?a=1"), "exemple.com");
	assert.equal(normalizeDomainValue("http://exemple.com/"), "exemple.com");
	assert.equal(normalizeDomainValue("exemple.com:443"), "exemple.com");
	assert.equal(normalizeDomainValue("exemple.com/chemin/fichier"), "exemple.com");
	assert.equal(domainFromHint("courriel@exemple.fr"), "exemple.fr");
});

test("racine : un tiret découpé, un service générique refusé", () => {
	assert.equal(racineDomaine("black-star.fr"), "black");
	assert.equal(racineDomaine("library.uta.edu"), null);
});

test("domaine racine : sous-domaines, port, chemin et suffixe composé", () => {
	assert.equal(domaineRacine("https://www.library.uta.edu:8443/a"), "uta.edu");
	assert.equal(domaineRacine("WWW.Exemple.FR."), "exemple.fr");
	assert.equal(domaineRacine("solarium.com.br"), "solarium.com.br");
	assert.equal(domaineRacine("com.br"), null);
	assert.equal(domaineRacine("Chu De Rennes"), null);
});

// ── Prudence ─────────────────────────────────────────────────────────────

test("un TLD ne se compense pas : .fr ≠ .com", () => {
	assert.equal(domainAffinity("exemple.fr", "exemple.com"), 0);
	assert.equal(domainAffinity("exemple.com", "exemple.fr"), 0);
});

test("un sous-domaine générique est ramené à la racine pour le rattachement", () => {
	// La prudence locale reste vraie (domainAffinity refuse le parent), mais
	// la clé de rattachement est désormais la racine : www/library/ns… ne sont
	// plus des obstacles à la résolution de l'organisation.
	assert.equal(domainAffinity("mail.exemple.com", "exemple.com"), 0);
	assert.equal(racineDomaine("mail.exemple.com"), null);
	const index = [org(1, "EXEMPLE", { domain: "exemple.com" })];
	assert.equal(matchOrgInIndex("mail.exemple.com", index)?.orgId, 1);
});

test("un sous-domaine spécifique reste une clé secondaire", () => {
	assert.equal(domainAffinity("recherche.exemple.com", "exemple.com"), 0.85);
	assert.equal(racineDomaine("recherche.exemple.com"), "recherche");
});

test("une racine trop courte n'est pas proposée", () => {
	assert.equal(racineDomaine("dts.edu"), null);
	assert.equal(
		resoudreDomaine("dts.edu", [org(1, "DTS", { slug: "dts" })]).etape,
		"aucune",
	);
});

// ── Chaîne de résolution ─────────────────────────────────────────────────

test("étage 1 : domaine exact, quelle que soit la forme de l'indice", () => {
	const index = [org(7, "CONNECTWELL INDUSTRIES", { domain: "connectwell.com" })];
	const r = resoudreDomaine("https://WWW.Connectwell.com:443/a", index);
	assert.equal(r.etape, "exact");
	assert.equal(r.orgId, 7);
	assert.equal(r.confidence, 0.95);
});

test("étage 2 : racine unique contre slug ou nom", () => {
	const bySlug = [org(3, "Connectwell Industries Pvt Ltd", { slug: "connectwell" })];
	assert.deepEqual(resoudreDomaine("connectwell.com", bySlug), {
		etape: "racine", orgId: 3, confidence: 0.75,
	});
	const byName = [org(4, "Mvsd11", { domain: null })];
	assert.equal(resoudreDomaine("www.mvsd11.org", byName).orgId, 4);
});

test("étage 1 : la racine trouve un alias de type domaine", () => {
	const parAlias = { ...org(9, "Association locale"), domainAliases: ["exemple.com"] };
	const r = resoudreDomaine("https://www.sous.exemple.com:443/contact", [parAlias]);
	assert.equal(r.etape, "exact");
	assert.equal(r.orgId, 9);
	assert.equal(r.confidence, 0.95);
});

test("étage 1 : un suffixe public composé ne rassemble pas les organisations", () => {
	const index = [org(8, "Upperweb", { domain: "upperweb.com.br" })];
	assert.equal(resoudreDomaine("solarium.com.br", index).orgId, null);
	assert.equal(resoudreDomaine("www.solarium.com.br", index).orgId, null);
	assert.equal(resoudreDomaine("upperweb.com.br", index).orgId, 8);
});

test("étage 2 : deux candidates = refus motivé, jamais de tirage", () => {
	const index = [
		org(1, "Connectwell Industries", { slug: "connectwell" }),
		org(2, "Connectwell Systems", { slug: "connectwell-systems" }),
	];
	const r = resoudreDomaine("connectwell.com", index);
	assert.equal(r.etape, "aucune");
	assert.equal(r.orgId, null);
	assert.match(r.raison ?? "", /2 candidates/);
});

test("étage 3 : sans domaine ni racine exploitable, rien n'est rattaché", () => {
	const r = resoudreDomaine("inconnu.fr.", [org(1, "Autre chose")]);
	assert.equal(r.etape, "aucune");
	assert.equal(r.orgId, null);
});

test("branchement : le moteur de quarantaine utilise la chaîne", () => {
	const slugIndex = [org(11, "Connectwell Industries", { slug: "connectwell" })];
	const m = matchOrgInIndex("connectwell.com", slugIndex);
	assert.equal(m?.orgId, 11);
	assert.equal(m?.confidence, 0.75);

	const exactIndex = [org(12, "Apellis", { website: "https://WWW.apellis.com:443/" })];
	const exact = matchOrgInIndex("www.apellis.com.", exactIndex);
	assert.equal(exact?.orgId, 12);
	assert.equal(exact?.via, "domain");

	const ambigu = [
		org(13, "Connectwell Industries", { slug: "connectwell" }),
		org(14, "Connectwell Systems", { slug: "connectwell-systems" }),
	];
	assert.equal(matchOrgInIndex("connectwell.com", ambigu), null);
});

// ── Contrôle isolé (aucune écriture en base) ─────────────────────────────

const DOMAINES_CONTROLE = [
	"acmanagement.ma", "adaristech.com", "agapefrance.org", "alanmokengineering.com",
	"amd.com", "apellis.com", "baronandbudd.com", "connectwell.com",
	"conecuhsausage.com", "dts.edu",
] as const;

test("contrôle : 10 domaines réels rattachés quand org.porte le domaine", () => {
	// Jeu de contrôle isolé : les organisations sont construites en mémoire
	// avec le domaine de l'indice. Cela prouve la correction du code, pas un
	// taux de production (le référentiel réel n'a que 69 domaines renseignés).
	const index: OrgDomaine[] = DOMAINES_CONTROLE.map((domaine, i) =>
		org(100 + i, domaine.split(".")[0]!, { domain: domaine }),
	);
	for (let i = 0; i < DOMAINES_CONTROLE.length; i++) {
		const r = resoudreDomaine(DOMAINES_CONTROLE[i]!, index);
		assert.equal(r.etape, "exact", `échec sur ${DOMAINES_CONTROLE[i]}`);
		assert.equal(r.orgId, 100 + i);
	}
});

test("URL avec identifiants : domaine racine inchangé", () => {
	assert.equal(normalizeDomainValue("https://user:pass@WWW.Exemple.com:8443/contact?a=1"), "exemple.com");
	assert.equal(domaineRacine("https://user:pass@www.sous.exemple.com/x"), "exemple.com");
});

test("un suffixe public composé observé dans la file n'est pas une racine", () => {
	assert.equal(domaineRacine("franc-oiloffshore.com.ng"), "franc-oiloffshore.com.ng");
	const index = [
		org(1, "Autre", { domain: "autre.com.ng" }),
		org(2, "Franc Oil", { domain: "franc-oiloffshore.com.ng" }),
	];
	const r = resoudreDomaine("www.franc-oiloffshore.com.ng", index);
	assert.equal(r.etape, "exact");
	assert.equal(r.orgId, 2);
});

test("états vides : ni domaine ni organisation ne fondent un rattachement", () => {
	assert.equal(normalizeDomainValue(null), null);
	assert.equal(normalizeDomainValue("   "), null);
	assert.deepEqual(resoudreDomaine("", []), {
		etape: "aucune", orgId: null, confidence: 0, raison: "pas un domaine",
	});
	assert.equal(matchOrgInIndex("", []), null);
});

test("un domaine partagé est départagé par le département de la source", () => {
	const index = [
		{ ...org(1, "Alpha", { domain: "exemple.com" }), dept: "33" },
		{ ...org(2, "Beta", { domain: "exemple.com" }), dept: "64" },
	];
	assert.equal(resoudreDomaine("www.exemple.com", index).orgId, 1);
	assert.equal(resoudreDomaine("www.exemple.com", index, { dept: "Gironde" }).orgId, 1);
	assert.equal(resoudreDomaine("www.exemple.com", index, { dept: "64" }).orgId, 2);
	const refuse = resoudreDomaine("www.exemple.com", index, { dept: "75" });
	assert.equal(refuse.orgId, null);
	assert.match(refuse.raison ?? "", /2 organisations/);
});

test("un domaine partagé est départagé par le domaine exact de la source", () => {
	const index = [
		org(1, "Alpha", { domain: "sous1.exemple.com" }),
		org(2, "Beta", { domain: "sous2.exemple.com" }),
	];
	assert.equal(resoudreDomaine("www.exemple.com", index).orgId, 1);
	assert.equal(
		resoudreDomaine("www.exemple.com", index, { domain: "https://sous2.exemple.com/contact" }).orgId,
		2,
	);
});

test("le moteur ne tranche pas au hasard entre deux orgs portant le même domaine", () => {
	const index = [
		org(1, "Alpha", { domain: "exemple.com" }),
		org(2, "Beta", { domain: "exemple.com" }),
	];
	assert.equal(matchOrgInIndex("www.exemple.com", index), null);
});
