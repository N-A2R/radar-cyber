/** Un comportement par test : réemploi des pages dédiées d'un domaine de groupe. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	isDedicatedPageUrl, provenanceForShared, selectSharedCandidates,
	verifySharedCandidate, SOURCE, type SharedResult,
} from "../../../scripts/expand-domains-shared.mts";
import type { ExpositionRow } from "../../../scripts/expand-domains-exposition.mts";

const html = "<html><head><title>Marius Lacroix</title></head><body>"
	+ "L'établissement Marius Lacroix accueille des patients à La Rochelle en Nouvelle-Aquitaine."
	+ " Retrouvez les horaires, l'équipe et les coordonnées de l'établissement toute l'année.</body></html>";

function row(sourceUrl = "https://ch-larochelle.fr/etablissement/marius-lacroix"): ExpositionRow {
	return {
		serviceId: 7, orgId: 12, name: "HOPITAL MARIUS LACROIX", city: "La Rochelle", dept: "17",
		siren: "111111111", source: "finess-site-http-200", sourceUrl,
		provider: "finess", evidenceDomain: "ch-larochelle.fr",
		consultedAt: "2026-11-24T10:00:00Z",
	};
}

function selection(sourceUrl?: string) {
	return selectSharedCandidates([row(sourceUrl)])[0];
}

function result(sourceUrl: string): SharedResult {
	return {
		verdict: {
			ok: true, motif: "http200-title-and-body", token: "marius", confidence: 0.95,
			title: "Marius Lacroix", status: 200, finalUrl: sourceUrl, htmlLength: html.length,
		},
		url: sourceUrl,
		tried: [sourceUrl],
	};
}

describe("shared group domain route", () => {
	it("accepts a page whose address names the organisation", () => {
		assert.equal(isDedicatedPageUrl("HOPITAL MARIUS LACROIX", "La Rochelle", row().sourceUrl), true);
	});

	it("rejects a generic group homepage", () => {
		assert.equal(isDedicatedPageUrl("HOPITAL MARIUS LACROIX", "La Rochelle", "https://ch-larochelle.fr/"), false);
	});

	it("keeps a dedicated page on a domain already attributed to another organisation", () => {
		assert.equal(selection()?.domain, "ch-larochelle.fr");
	});

	it("refuses an HTTP 200 page redirected to a generic address", async () => {
		const generic = "https://ch-larochelle.fr/";
		const fetcher = async () => ({ html, status: 200, finalUrl: generic });
		assert.equal(await verifySharedCandidate(selection(), fetcher), null);
	});

	it("traces the answering dedicated page in the proof", () => {
		const proof = provenanceForShared(selection(), result(row().sourceUrl));
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlReponse, row().sourceUrl);
		assert.equal(proof.preuve.urlDediee, true);
		assert.equal(proof.preuve.statut, 200);
	});
});
