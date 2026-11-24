/** Un comportement par test : pages dédiées d'un établissement sur un site de groupe. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	provenanceForGroup, selectGroupCandidates, verifyGroupCandidate, SOURCE, type GroupResult,
} from "../../../scripts/expand-domains-groupe.mts";
import type { ExpositionRow } from "../../../scripts/expand-domains-exposition.mts";

const html = "<html><head><title>Maison médicalisee Pasteur</title></head><body>"
	+ "La maison medicalisee Pasteur accueille des residents a Poitiers en Nouvelle-Aquitaine."
	+ " Retrouvez les horaires, l'equipe et les coordonnees de l'etablissement toute l'annee.</body></html>";

function row(sourceUrl = "https://colisee.fr/residences/maison-medicalisee-poitiers-residence-pasteur"): ExpositionRow {
	return {
		serviceId: 9, orgId: 42, name: "MAISON MEDICALISEE PASTEUR", city: "Poitiers", dept: "86",
		siren: "222222222", source: "finess-site-http-200", sourceUrl,
		provider: "finess", evidenceDomain: "colisee.fr",
		consultedAt: "2026-11-24T10:00:00Z",
	};
}

function selection(sourceUrl?: string) {
	return selectGroupCandidates([row(sourceUrl)])[0];
}

function result(sourceUrl: string): GroupResult {
	return {
		verdict: {
			ok: true, motif: "http200-title-and-body", token: "pasteur", confidence: 0.95,
			title: "Maison medicalisee Pasteur", status: 200, finalUrl: sourceUrl, htmlLength: html.length,
		},
		url: sourceUrl,
		tried: [sourceUrl],
	};
}

describe("group-site dedicated page route", () => {
	it("accepts a group page whose address names the establishment", () => {
		assert.equal(selection()?.domain, "colisee.fr");
	});

	it("refuses a marketplace page even when its address names the establishment", () => {
		assert.equal(selectGroupCandidates([row("https://www.orpi.com/agence/pasteur-poitiers")]).length, 0);
	});

	it("refuses a page named only by the establishment's city", () => {
		assert.equal(selectGroupCandidates([row("https://colisee.fr/etablissements/poitiers-autre")]).length, 0);
	});

	it("refuses an HTTP 200 page redirected to the group homepage", async () => {
		const fetcher = async () => ({ html, status: 200, finalUrl: "https://colisee.fr/" });
		assert.equal(await verifyGroupCandidate(selection(), fetcher), null);
	});

	it("traces the answering group page in the proof", () => {
		const proof = provenanceForGroup(selection(), result(row().sourceUrl));
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlReponse, row().sourceUrl);
		assert.equal(proof.preuve.statut, 200);
	});
});
