/** Behaviour tests for public-source domain expansion. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	distinctiveTokens,
	domainRoot,
	pageVerdict,
	parseCandidate,
	provenanceFor,
	selectCandidates,
	type Organisation,
} from "../../../scripts/expand-domains.mts";

const org: Organisation = {
	id: 7, name: "BARRAULT (THOUARS)", city: "THOUARS", dept: "79", siren: "012345678", domain: null,
};
const candidate = { siren: "012345678", url: "https://www.barrault.fr/", qid: "Q123" };
const body = `<html><head><title>Barrault — Thouars</title></head><body><p>${
	"Barrault proposes industrial solutions in Thouars and Nouvelle-Aquitaine. ".repeat(3)
}</p></body></html>`;

describe("expand domains", () => {
	it("parses only complete Wikidata SIREN/site/QID rows", () => {
		assert.deepEqual(parseCandidate("006080170\thttp://www.coop-breizh.fr/\tQ2996566"), {
			siren: "006080170", url: "http://www.coop-breizh.fr/", qid: "Q2996566",
		});
		assert.equal(parseCandidate("abc\thttps://x.fr\tQ1"), null);
		assert.equal(parseCandidate("123\thttps://x.fr"), null);
	});

	it("returns a canonical root and rejects non-domain hosts", () => {
		assert.equal(domainRoot("https://www.angouleme.fr/actualite"), "angouleme.fr");
		assert.equal(domainRoot("http://127.0.0.1/"), null);
		assert.equal(domainRoot("javascript:alert(1)"), null);
	});

	it("extracts accent-free distinctive tokens", () => {
		assert.deepEqual(distinctiveTokens("Commune d'Angoulême", "Angoulême"), ["angouleme"]);
		assert.equal(distinctiveTokens("Ville de Cognac", "Cognac").includes("ville"), false);
	});

	it("selects unique Nouvelle-Aquitaine organisations still missing a domain", () => {
		const selected = selectCandidates(
			[candidate, candidate],
			[
				org,
				{ ...org, id: 8, domain: "deja.fr" },
				{ ...org, id: 9, dept: "75" },
			],
		);
		assert.equal(selected.length, 1);
		assert.equal(selected[0].domain, "barrault.fr");
		assert.equal(selected[0].organisation.id, 7);
	});

	it("verifies HTTP 200, same root, content and a name token", () => {
		const accepted = pageVerdict(body, 200, "https://www.barrault.fr/accueil", org, "barrault.fr");
		assert.equal(accepted.ok, true);
		assert.equal(accepted.token, "barrault");
		assert.equal(accepted.confidence, 0.95);
		assert.equal(pageVerdict(body, 404, "https://www.barrault.fr/", org, "barrault.fr").motif, "http-not-200");
		assert.equal(pageVerdict(body, 200, "https://autre.fr/", org, "barrault.fr").motif, "redirect-off-root");
		assert.equal(pageVerdict("<p>trop court</p>", 200, "https://www.barrault.fr/", org, "barrault.fr").motif, "content-too-short");
		assert.equal(pageVerdict(body.replace(/Barrault|Thouars/g, "Ailleurs"), 200, "https://www.barrault.fr/", org, "barrault.fr").motif, "no-distinctive-token");
	});

	it("builds traceable provenance for an accepted domain", () => {
		const selection = selectCandidates([candidate], [org])[0];
		const proof = provenanceFor(selection, pageVerdict(body, 200, "https://www.barrault.fr/", org, "barrault.fr"));
		assert.equal(proof.source, "wikidata:P856:http200");
		assert.equal(proof.preuve.qid, "Q123");
		assert.equal(proof.preuve.statut, 200);
		assert.equal(proof.preuve.token, "barrault");
	});
});
