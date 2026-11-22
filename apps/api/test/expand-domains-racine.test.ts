/** Behaviour tests for domain-root candidate matching. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	excludeAttributedCandidates,
	labelsFromReport,
	labelMatches,
	provenanceForRacine,
	rootTokens,
	selectByRootToken,
} from "../../../scripts/expand-domains-racine.mts";
import { pageVerdict, type Candidate, type Organisation } from "../../../scripts/expand-domains.mts";

const candidate: Candidate = { siren: "111111111", url: "https://www.barrault.fr/", qid: "Q123" };
const org: Organisation = {
	id: 7, name: "BARRAULT (THOUARS)", city: "THOUARS", dept: "79", siren: "999999999", domain: null,
};
const verdict = pageVerdict(
	`<html><head><title>Barrault</title></head><body><p>${"Barrault industrial solutions in Thouars. ".repeat(4)}</p></body></html>`,
	200, "https://www.barrault.fr/", org, "barrault.fr",
);

describe("expand domains by domain root", () => {
	it("extracts distinctive accent-free tokens from the domain root only", () => {
		assert.deepEqual(rootTokens("https://www.barrault.fr/accueil"), ["barrault"]);
		assert.deepEqual(rootTokens("https://www.ville-de-cognac.fr/"), ["cognac"]);
		assert.deepEqual(rootTokens("http://127.0.0.1/"), []);
	});

	it("pairs rare root tokens without reusing a SIREN match or an organisation", () => {
		const frequent = { ...candidate, qid: "Q999", url: "https://commune-francaise.fr/" };
		const selected = selectByRootToken(
			[candidate, candidate, frequent],
			new Map([
				["barrault", [org, org]],
				["communefrancaise", [org]],
			]),
		);
		assert.equal(selected.length, 1);
		assert.equal(selected[0].organisation.id, 7);
		assert.equal(selected[0].domain, "barrault.fr");
	});

	it("attribue un même candidat à une seule organisation", () => {
		const double = { ...candidate, url: "https://www.barrault-thouars.fr/" };
		const selected = selectByRootToken(
			[double],
			new Map([
				["barrault", [org]],
				["thouars", [{ ...org, id: 8, siren: "888888888" }]],
			]),
		);
		assert.equal(selected.length, 1);
	});

	it("skips pairs whose SIREN is already matched by the first route", () => {
		const selected = selectByRootToken([candidate], new Map([["barrault", [{ ...org, siren: "111111111" }]]]));
		assert.deepEqual(selected, []);
	});

	it("confirms a pairing only when the Wikidata label names the organisation", () => {
		assert.equal(labelMatches("EQUIPE PREV SPECIALISEE GRANDANGOULEME", "Grand Angoulême"), true);
		assert.equal(labelMatches("GROUPE TELECOMS DE L OUEST (KOESIO)", "Koesio"), true);
		assert.equal(labelMatches("OLANO VESOUL", "communauté d'agglomération de Vesoul"), false);
		assert.equal(labelMatches("SMICTOM DU PERIGORD NOIR", "Smictom d'Alsace Centrale"), false);
		assert.equal(labelMatches("Collège Joseph Kessel", "Kessel GmbH"), false);
		assert.equal(labelMatches("BARRAULT (THOUARS)", null), false);
	});

	it("does not reuse a candidate already attributed by a verified-domain route", () => {
		const other = { ...candidate, qid: "Q456", url: "https://www.autre.fr/" };
		const remaining = excludeAttributedCandidates(
			[
				{ candidate, organisation: org, domain: "barrault.fr" },
				{ candidate: other, organisation: { ...org, id: 8 }, domain: "autre.fr" },
			],
			new Set(["Q123"]),
		);
		assert.deepEqual(remaining.map((entry) => entry.candidate.qid), ["Q456"]);
	});

	it("reuses labels recorded by a previous dry run", () => {
		const labels = labelsFromReport({
			domains: [{ qid: "Q123", label: "Barrault" }, { qid: "Q456", label: "" }],
		});
		assert.equal(labels.get("Q123"), "Barrault");
		assert.equal(labels.size, 1);
	});

	it("records the root-match route in traceable provenance", () => {
		const proof = provenanceForRacine(
			{ candidate, organisation: org, domain: "barrault.fr" }, verdict, "barrault", "Barrault",
		);
		assert.equal(proof.source, "wikidata:P856:racine:http200");
		assert.equal(proof.preuve.appariement, "racine");
		assert.equal(proof.preuve.jeton, "barrault");
		assert.equal(proof.preuve.label, "Barrault");
		assert.equal(proof.preuve.statut, 200);
	});
});
