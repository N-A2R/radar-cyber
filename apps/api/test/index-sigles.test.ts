/**
 * Index sigle → organisations : le registre importé (76 799 usuelles SIRENE)
 * doit alimenter le rapprochement, et un sigle partagé ne doit être tranché
 * que par un contexte discriminant (département ou domaine de la source).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildIndexSigles,
	decideSigle,
	desambiguiserSigles,
	type LigneAliasSigle,
} from "../src/match/sigles.js";

function ligne(alias: string, orgId: number, overrides: Partial<LigneAliasSigle> = {}): LigneAliasSigle {
	return {
		alias,
		org_id: orgId,
		name: ` Organisation ${orgId} `,
		slug: `org-${orgId}`,
		kind: "entreprise",
		city: null,
		dept: null,
		domain: null,
		website: null,
		...overrides,
	};
}

const registre = [
	ligne("A.M.F.", 1, { name: "Association des maires de France", dept: "33" }),
	ligne("AMF", 1, { name: "Association des maires de France", dept: "33" }),
	ligne("AMF", 2, { name: "AMF Bâtiment", dept: "64" }),
	ligne("MAISON DE LA PRESSE", 3, { dept: "33" }),
];

test("l'index normalise les sigles, déduplique les organisations et écarte les noms", () => {
	const index = buildIndexSigles(registre);
	const candidats = index.get("AMF") ?? [];
	assert.deepEqual(candidats.map((c) => c.orgId), [1, 2]);
	assert.equal(index.has("MAISONDELAPRESSE"), false);
});

test("sans contexte, un sigle partagé reste ambigu", () => {
	const candidats = buildIndexSigles(registre).get("AMF") ?? [];
	assert.equal(desambiguiserSigles(candidats).length, 2);
	assert.equal(decideSigle("AMF", candidats).motif, "ambigu");
});

test("le département de la source départage les homonymes", () => {
	const candidats = buildIndexSigles(registre).get("AMF") ?? [];
	const retenus = desambiguiserSigles(candidats, { dept: "64" });
	assert.deepEqual(retenus.map((c) => c.orgId), [2]);
	const decision = decideSigle("A.M.F.", retenus);
	assert.equal(decision.accepte, true);
	assert.equal(decision.orgId, 2);
});

test("un département partagé ne tranche pas : le domaine départage", () => {
	const candidats = buildIndexSigles([
		ligne("ALFA", 10, { dept: "33", domain: "alfa.fr" }),
		ligne("ALFA", 11, { dept: "33", website: "https://www.alfa-sante.fr" }),
		ligne("ALFA", 12, { dept: "64" }),
	]).get("ALFA") ?? [];
	assert.equal(desambiguiserSigles(candidats, { dept: "33" }).length, 2);
	const retenus = desambiguiserSigles(candidats, {
		dept: "33",
		domain: "www.alfa-sante.fr",
	});
	assert.deepEqual(retenus.map((c) => c.orgId), [11]);
});

test("un domaine seul départage quand l'indice n'a pas d'organisation proposée", () => {
	const candidats = buildIndexSigles([
		ligne("BETA", 20, { domain: "beta.fr" }),
		ligne("BETA", 21, { website: "https://www.beta-pro.fr/contact" }),
	]).get("BETA") ?? [];
	assert.deepEqual(desambiguiserSigles(candidats, { domain: "beta-pro.fr" }).map((c) => c.orgId), [21]);
});
