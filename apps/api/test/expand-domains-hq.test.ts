/** Behaviour tests for the head-office Wikidata domain route. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	HQ_SOURCE, SPARQL_QUERY, loadPriorQids, parsePriorQids, provenanceForHq,
} from "../../../scripts/expand-domains-hq.mts";
import { pageVerdict, type Organisation } from "../../../scripts/expand-domains.mts";
import type { GeoSelection } from "../../../scripts/expand-domains-geo.mts";

const candidate = {
	qid: "Q1117543", url: "https://www.grand-cognac.fr/", label: "Grand Cognac",
};
const organisation: Organisation = {
	id: 42, name: "COMMUNAUTE DE COMMUNES DU GRAND COGNAC", city: "COGNAC",
	dept: "16", siren: "123456789", domain: null,
};

describe("expand domains from head-office Wikidata sites", () => {
	it("reads the QID column of a cached candidate row and skips malformed rows", () => {
		const qids = parsePriorQids("Q1\thttps://a.fr\tQ100\nINVALID\trow\nQ2\thttps://b.fr\tQ200\n");
		assert.deepEqual([...qids], ["Q100", "Q200"]);
	});

	it("unions QIDs examined by both prior routes", async (t) => {
		const dir = await mkdtemp(join(tmpdir(), "hq-prior-"));
		t.after(() => rm(dir, { recursive: true, force: true }));
		const sirenPath = join(dir, "siren.tsv");
		const geoPath = join(dir, "geo.tsv");
		await writeFile(sirenPath, "Q1\tu\tQ100\n");
		await writeFile(geoPath, "Q2\tu\tQ200\nQ3\tu\tQ100\n");
		assert.deepEqual([...(await loadPriorQids([sirenPath, geoPath]))].sort(), ["Q100", "Q200"]);
	});

	it("records the head-office query and HTTP proof in the provenance", () => {
		const verdict = pageVerdict(
			`<html><head><title>Grand Cognac</title></head><body><p>${"Le Grand Cognac vous accueille. ".repeat(6)}</p></body></html>`,
			200, candidate.url, organisation, "grand-cognac.fr",
		);
		const selection: GeoSelection = { candidate, organisation, domain: "grand-cognac.fr" };
		const proof = provenanceForHq(selection, verdict);
		assert.equal(proof.source, HQ_SOURCE);
		assert.match(String(proof.preuve.requete), /wdt:P159/);
		assert.match(String(proof.preuve.requete), /Q18678082/);
		assert.equal(proof.preuve.statut, 200);
		assert.equal(proof.preuve.urlFinale, candidate.url);
		assert.match(SPARQL_QUERY, /wdt:P856/);
	});
});
