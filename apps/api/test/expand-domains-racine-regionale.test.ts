/** Un comportement par test : route racine des sites Wikidata de Nouvelle-Aquitaine. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	provenanceForRegionalRoot, selectRegionalRootMatches,
} from "../../../scripts/expand-domains-racine-regionale.mts";
import { pageVerdict, type Organisation } from "../../../scripts/expand-domains.mts";
import type { GeoCandidate, GeoSelection } from "../../../scripts/expand-domains-geo.mts";

const boulazac: GeoCandidate = {
	qid: "Q1000796", url: "http://www.ville-boulazac.fr", label: "Boulazac",
};
const organisation: Organisation = {
	id: 42, name: "BOULAZAC ISLE MIREAU", city: "BOULAZAC", dept: "24",
	siren: "111111111", domain: null,
};
const groups = new Map<string, Organisation[]>([["boulazac", [organisation]]]);

describe("regional Wikidata root route", () => {
	it("pairs a site only when the root token and the full Wikidata label agree", () => {
		const wrongLabel: GeoCandidate = { ...boulazac, qid: "Q2", url: "http://ville-vesoul.fr", label: "Vesoul" };
		const wrongOrg: GeoCandidate = { ...boulazac, qid: "Q3", url: "http://autre-boulazac.fr", label: "Autre Boulazac" };
		const selected = selectRegionalRootMatches([boulazac, wrongLabel, wrongOrg], groups, new Set());
		assert.deepEqual(selected.map((entry) => entry.candidate.qid), ["Q1000796"]);
		assert.equal(selected[0].domain, "ville-boulazac.fr");
	});

	it("does not reuse a QID already attributed by another verified route", () => {
		const selected = selectRegionalRootMatches(
			[boulazac], groups, new Set([boulazac.qid]),
		);
		assert.deepEqual(selected, []);
	});

	it("traces the regional root match and the HTTP proof", () => {
		const selection: GeoSelection = { candidate: boulazac, organisation, domain: "ville-boulazac.fr" };
		const verdict = pageVerdict(
			`<html><head><title>Boulazac</title></head><body><p>${"Boulazac ville et services ".repeat(6)}</p></body></html>`,
			200, "http://www.ville-boulazac.fr/", organisation, "ville-boulazac.fr",
		);
		const proof = provenanceForRegionalRoot(selection, verdict, "boulazac");
		assert.equal(proof.source, "wikidata:P856:racine-regionale:http200");
		assert.equal(proof.preuve.appariement, "racine-regionale");
		assert.equal(proof.preuve.jeton, "boulazac");
		assert.equal(proof.preuve.statut, 200);
		assert.equal(proof.preuve.urlFinale, "http://www.ville-boulazac.fr/");
	});
});
