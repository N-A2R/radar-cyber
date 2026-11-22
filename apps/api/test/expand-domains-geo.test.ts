/** Behaviour tests for the geographic Wikidata domain route. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	compact,
	excludeKnownCandidates,
	labelTokens,
	parseGeoCandidates,
	parseSparqlBinding,
	provenanceForGeo,
	selectByLabel,
	type GeoCandidate,
	type GeoSelection,
} from "../../../scripts/expand-domains-geo.mts";
import { pageVerdict, type Organisation } from "../../../scripts/expand-domains.mts";

const candidate: GeoCandidate = {
	qid: "Q1000796", url: "https://www.ville-boulazac.fr/", label: "Boulazac",
};
const org: Organisation = {
	id: 7, name: "MAIRIE DE BOULAZAC", city: "BOULAZAC", dept: "24", siren: "999999999", domain: null,
};
const verdict = pageVerdict(
	`<html><head><title>Boulazac</title></head><body><p>${"La ville de Boulazac vous accueille. ".repeat(5)}</p></body></html>`,
	200, "https://www.ville-boulazac.fr/", org, "ville-boulazac.fr",
);

describe("expand domains from geographic Wikidata labels", () => {
	it("normalises labels without accents or punctuation", () => {
		assert.equal(compact("L'Île-d'Yeu"), "liledyeu");
		assert.equal(compact("Saint-Abit"), "saintabit");
	});

	it("keeps only distinctive words of a label", () => {
		assert.deepEqual(labelTokens("Communauté de communes du Périgord Noir"), ["perigord", "noir"]);
	});

	it("parses cached candidate rows and rejects malformed ones", () => {
		const parsed = parseGeoCandidates(`${candidate.qid}\t${candidate.url}\t${candidate.label}\nINVALID\trow\n`);
		assert.deepEqual(parsed, [candidate]);
	});

	it("extracts a candidate from a public SPARQL result row", () => {
		assert.deepEqual(parseSparqlBinding({
			item: { value: "http://www.wikidata.org/entity/Q1000796" },
			site: { value: candidate.url },
			itemLabel: { value: "Boulazac" },
		}), candidate);
	});

	it("pairs a site only when the full label names one organisation", () => {
		const selected = selectByLabel([candidate], new Map([["boulazac", [org]]]));
		assert.equal(selected.length, 1);
		assert.equal(selected[0].organisation.id, 7);
		assert.equal(selected[0].domain, "ville-boulazac.fr");
	});

	it("skips ambiguous labels and names too short to identify an organisation", () => {
		const other = { ...org, id: 8, siren: "888888888" };
		const short: GeoCandidate = { ...candidate, label: "Yeu" };
		const selected = selectByLabel([candidate, short], new Map([["boulazac", [org, other]]]));
		assert.deepEqual(selected, []);
	});

	it("uses one QID and one domain root per organisation", () => {
		const duplicate = { ...candidate, url: "http://www.ville-boulazac.fr/accueil" };
		const selected = selectByLabel([candidate, duplicate], new Map([["boulazac", [org]]]));
		assert.equal(selected.length, 1);
	});

	it("drops candidates already verified or examined by the SIREN routes", () => {
		const other: GeoCandidate = { ...candidate, qid: "Q2000796", url: "https://www.autre.fr/" };
		const selections: GeoSelection[] = [
			{ candidate, organisation: org, domain: "ville-boulazac.fr" },
			{ candidate: other, organisation: { ...org, id: 8 }, domain: "autre.fr" },
		];
		const remaining = excludeKnownCandidates(selections, new Set(["Q1000796"]), new Set(["Q2000796"]));
		assert.deepEqual(remaining, []);
	});

	it("traces the geographic label route and the HTTP proof", () => {
		const proof = provenanceForGeo(
			{ candidate, organisation: org, domain: "ville-boulazac.fr" }, verdict,
		);
		assert.equal(proof.source, "wikidata:P856:geographie:http200");
		assert.equal(proof.preuve.qid, "Q1000796");
		assert.equal(proof.preuve.label, "Boulazac");
		assert.equal(proof.preuve.appariement, "libelle");
		assert.equal(proof.preuve.statut, 200);
		assert.match(String(proof.preuve.requete), /Q18678082/);
	});
});
