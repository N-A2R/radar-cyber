/** Un comportement par test : pages dédiées sur annuaires et sites d'enseigne. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	provenanceForAnnuaire, selectAnnuaireCandidates, verifyAnnuaireCandidate, SOURCE,
} from "../../../scripts/expand-domains-annuaire.mts";
import type { ExpositionRow } from "../../../scripts/expand-domains-exposition.mts";

const html = "<html><head><title>Agence Boulazac immobilier</title></head><body>"
	+ "L'agence Boulazac immobilier accompagne les vendeurs et les acheteurs a Boulazac "
	+ "et dans toute la Nouvelle-Aquitaine. Retrouvez nos annonces, nos horaires et "
	+ "les coordonnees de nos conseillers tout au long de l'annee.</body></html>";

function row(sourceUrl = "https://www.orpi.com/agences/agence-boulazac", orgId = 42): ExpositionRow {
	return {
		serviceId: 9, orgId, name: "AGENCE BOULAZAC IMMOBILIER", city: "Boulazac", dept: "24",
		siren: "222222222", source: "osm-http-200", sourceUrl,
		provider: "osm-siret", evidenceDomain: "orpi.com",
		consultedAt: "2026-11-24T10:00:00Z",
	};
}

function selected(sourceUrl?: string, orgId = 42) {
	return selectAnnuaireCandidates([row(sourceUrl, orgId)], new Set())[0];
}

describe("directory dedicated-page route", () => {
	it("accepts a page whose address names the organisation on a platform root", () => {
		assert.equal(selected()?.domain, "orpi.com");
	});

	it("refuses a directory homepage that does not name the organisation", () => {
		assert.equal(selectAnnuaireCandidates([row("https://www.orpi.com/")], new Set()).length, 0);
	});

	it("refuses a page named only by the city", () => {
		assert.equal(selectAnnuaireCandidates([row("https://www.orpi.com/boulazac")], new Set()).length, 0);
	});

	it("skips an organisation that already carries a domain proof", () => {
		assert.equal(selectAnnuaireCandidates([row()], new Set([42])).length, 0);
	});

	it("keeps only one dedicated page per organisation", () => {
		const second = row("https://www.orpi.com/agences/boulazac-immobilier");
		assert.equal(selectAnnuaireCandidates([row(), second], new Set()).length, 1);
	});

	it("refuses a dedicated URL redirected to the directory homepage", async () => {
		const fetcher = async () => ({ html, status: 200, finalUrl: "https://www.orpi.com/" });
		assert.equal(await verifyAnnuaireCandidate(selected(), fetcher), null);
	});

	it("refuses a page whose body names only the city", async () => {
		const cityOnly = "<html><body>Boulazac, commune du departement de la Dordogne en Nouvelle-Aquitaine. "
			+ "Retrouvez les actualites, les services municipaux, les horaires et les coordonnees "
			+ "de la mairie pour toutes vos demarches administratives en ligne.</body></html>";
		const fetcher = async () => ({ html: cityOnly, status: 200, finalUrl: row().sourceUrl });
		assert.equal(await verifyAnnuaireCandidate(selected(), fetcher), null);
	});

	it("traces the answering directory page in the proof", () => {
		const url = row().sourceUrl;
		const proof = provenanceForAnnuaire(selected(), {
			verdict: {
				ok: true, motif: "http200-title-and-body", token: "boulazac", confidence: 0.95,
				title: "Agence Boulazac immobilier", status: 200, finalUrl: url, htmlLength: html.length,
			},
			url,
			tried: [url],
		});
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlReponse, url);
		assert.equal(proof.preuve.statut, 200);
	});
});
