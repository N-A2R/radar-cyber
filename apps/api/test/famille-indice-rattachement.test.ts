/**
 * Rattachement par famille : un test par comportement, dont trois cas ambigus
 * qui doivent rester sans rattachement. les index sont construits en mémoire,
 * sans base et sans registre réel.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildIndexFamilles,
	contexteDepuisIndice,
	rattacherIndice,
	type OrgFamille,
} from "../src/match/famille-indice.js";
import type { LigneAliasSigle } from "../src/match/sigles.js";

function org(id: number, overrides: Partial<OrgFamille> = {}): OrgFamille {
	return { id, name: `Organisation ${id}`, ...overrides };
}

function alias(aliasText: string, orgId: number, overrides: Partial<LigneAliasSigle> = {}): LigneAliasSigle {
	return {
		alias: aliasText,
		org_id: orgId,
		name: `Organisation ${orgId}`,
		slug: `org-${orgId}`,
		kind: "entreprise",
		city: null,
		dept: null,
		domain: null,
		website: null,
		...overrides,
	};
}

test("la racine retire www., sous-domaine, port et chemin des deux côtés", () => {
	const index = buildIndexFamilles([org(7, { domain: "EXEMPLE.FR." })], []);
	const r = rattacherIndice("https://www.bibliotheque.exemple.fr:8443/contact", index);
	assert.deepEqual(
		{ accepte: r.accepte, orgId: r.orgId, via: r.via, confidence: r.confidence, motif: r.motif },
		{ accepte: true, orgId: 7, via: "domain", confidence: 0.95, motif: "domaine-racine" },
	);
});

test("un alias domaine avec sous-domaine et chemin fonde le rattachement", () => {
	const index = buildIndexFamilles(
		[org(11, { domainAliases: ["https://www.campagne.sante-gironde.fr:443/contact"] })],
		[],
	);
	const r = rattacherIndice("sante-gironde.fr", index);
	assert.equal(r.accepte, true);
	assert.equal(r.orgId, 11);
});

test("un TLD différent ne rattache pas", () => {
	const index = buildIndexFamilles([org(12, { domain: "exemple.fr" })], []);
	const r = rattacherIndice("exemple.com", index);
	assert.equal(r.accepte, false);
	assert.equal(r.motif, "domaine-inconnu");
});

test("AMBIGU : deux organisations sur la même racine restent sans rattachement", () => {
	const index = buildIndexFamilles(
		[org(13, { domain: "groupe.fr", dept: "33" }), org(14, { domain: "www.groupe.fr", dept: "64" })],
		[],
	);
	const r = rattacherIndice("groupe.fr", index);
	assert.equal(r.accepte, false);
	assert.equal(r.motif, "domaine-ambigu");
	assert.equal(r.orgId, null);
});

test("AMBIGU : un sigle partagé sans contexte reste sans rattachement", () => {
	const index = buildIndexFamilles([], [
		alias("A.M.F.", 21, { dept: "33" }),
		alias("AMF", 22, { dept: "64" }),
	]);
	const r = rattacherIndice("AMF", index);
	assert.equal(r.accepte, false);
	assert.equal(r.motif, "sigle-ambigu");
});

test("le département de la source départage un sigle partagé", () => {
	const index = buildIndexFamilles([], [
		alias("AMF", 21, { dept: "33" }),
		alias("AMF", 22, { dept: "64" }),
	]);
	const r = rattacherIndice("AMF", index, { dept: "64" });
	assert.equal(r.accepte, true);
	assert.equal(r.orgId, 22);
	assert.equal(r.motif, "sigle-confirme");
	assert.equal(r.confidence, 0.7);
});

test("le domaine de la source départage deux sigles du même département", () => {
	const index = buildIndexFamilles([], [
		alias("ALFA", 31, { dept: "33", domain: "alfa.fr" }),
		alias("ALFA", 32, { dept: "33", website: "https://www.alfa-sante.fr" }),
	]);
	const contexte = contexteDepuisIndice("https://www.alfa-sante.fr/contact", "33");
	const r = rattacherIndice("ALFA", index, contexte);
	assert.equal(r.accepte, true);
	assert.equal(r.orgId, 32);
});

test("AMBIGU : un département partagé sans domaine discriminant ne tranche pas", () => {
	const index = buildIndexFamilles([], [
		alias("ALFA", 31, { dept: "33", domain: "alfa.fr" }),
		alias("ALFA", 32, { dept: "33", domain: "autre.fr" }),
	]);
	const r = rattacherIndice("ALFA", index, { dept: "33" });
	assert.equal(r.accepte, false);
	assert.equal(r.motif, "sigle-ambigu");
});

test("un mot générique n'est pas un sigle et ne rattache pas", () => {
	const index = buildIndexFamilles([], [alias("EHPAD", 41)]);
	const r = rattacherIndice("EHPAD", index);
	assert.equal(r.famille, "nom");
	assert.equal(r.motif, "hors-famille");
	assert.equal(r.accepte, false);
});

test("un indice vide ne rattache pas", () => {
	const index = buildIndexFamilles([org(51, { domain: "exemple.fr" })], [alias("AMF", 52)]);
	const r = rattacherIndice("   ", index);
	assert.equal(r.famille, "vide");
	assert.equal(r.accepte, false);
	assert.equal(r.orgId, null);
});
