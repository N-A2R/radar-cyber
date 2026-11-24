/** Un comportement par test : domaine officiel dont le libellé nomme l'organisation. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	isNamedDomainUrl, provenanceForNamedDomain, selectNamedDomainCandidates,
	verifyNamedDomain, SOURCE, type NamedDomainResult,
} from "../../../scripts/expand-domains-domain-label.mts";
import type { ExpositionRow } from "../../../scripts/expand-domains-exposition.mts";

const html = "<html><head><title>Aussac-Vadalle</title></head><body>"
	+ "Bienvenue sur le site de la commune d'Aussac-Vadalle en Charente."
	+ " Retrouvez les services municipaux, les horaires et les actualités toute l'année.</body></html>";

function row(sourceUrl = "https://aussac-vadalle.fr"): ExpositionRow {
	return {
		serviceId: 7, orgId: 12, name: "Commune de Aussac-Vadalle", city: "Aussac-Vadalle", dept: "16",
		siren: "111111111", source: "osm-siret-http-200", sourceUrl,
		provider: "osm:way/1", evidenceDomain: "aussac-vadalle.fr",
		consultedAt: "2026-11-24T10:00:00Z",
	};
}

function selection() {
	return selectNamedDomainCandidates([row()])[0];
}

function result(): NamedDomainResult {
	return {
		verdict: {
			ok: true, motif: "http200-title-and-body", token: "aussac", confidence: 0.85,
			title: "Aussac-Vadalle", status: 200, finalUrl: row().sourceUrl, htmlLength: html.length,
		},
		url: row().sourceUrl,
		tried: [row().sourceUrl],
	};
}

describe("named domain route", () => {
	it("accepts a registrable domain that names the organisation", () => {
		assert.equal(isNamedDomainUrl("Commune de Aussac-Vadalle", "Aussac-Vadalle", row().sourceUrl), true);
	});

	it("rejects an unrelated registrable domain", () => {
		assert.equal(isNamedDomainUrl("Commune de Aussac-Vadalle", "Aussac-Vadalle", "https://exemple.fr/"), false);
	});

	it("keeps a named root already attributed to another organisation", () => {
		assert.equal(selection()?.domain, "aussac-vadalle.fr");
	});

	it("refuses an HTTP 200 page redirected to an unnamed address", async () => {
		const redirected = {
			...row("https://ch-agen-nerac.fr/centre-de-gerontologie-de-pompeyrie"),
			orgId: 13, name: "EHPAD POMPEYRIE", city: "Nérac", evidenceDomain: "ch-agen-nerac.fr",
		};
		const candidate = selectNamedDomainCandidates([redirected])[0];
		const fetcher = async () => ({ html, status: 200, finalUrl: "https://ch-agen-nerac.fr/" });
		assert.equal(await verifyNamedDomain(candidate, fetcher), null);
	});
	it("traces the answering named page in the proof", () => {
		const proof = provenanceForNamedDomain(selection(), result());
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlReponse, row().sourceUrl);
		assert.equal(proof.preuve.domaineNommant, true);
		assert.equal(proof.preuve.statut, 200);
	});
});
