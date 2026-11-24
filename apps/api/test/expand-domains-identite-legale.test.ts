/** Un comportement par test : identité légale sur les pages d'un site prouvé. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExpositionRow, ExpositionSelection } from "../../../scripts/expand-domains-exposition.mts";
import {
	LEGAL_PATHS, SOURCE, legalPageUrls, legalSelection, provenanceForLegalPage, verifyLegalPage,
	type LegalPageResult,
} from "../../../scripts/expand-domains-identite-legale.mts";

function selection(): ExpositionSelection {
	const row: ExpositionRow = {
		serviceId: 51, orgId: 42, name: "ATELIER DU BASSIN", city: "Bordeaux", dept: "33",
		siren: "403104813", source: "osm-siret-http-200",
		sourceUrl: "https://atelier-bassin.fr/annuaire/atelier-du-bassin",
		provider: "osm:node/51", evidenceDomain: "atelier-bassin.fr",
		consultedAt: "2026-11-24T00:00:00.000Z",
	};
	return {
		row,
		organisation: { id: 42, name: "ATELIER DU BASSIN", city: "Bordeaux", dept: "33", siren: "403104813" },
		domain: "atelier-bassin.fr",
	};
}

const page = (identifiers: string): string => `<html><head><title>Mentions légales — Atelier du Bassin</title></head>
<body><h1>Mentions légales</h1><p>L'Atelier du Bassin accompagne les artisans de Nouvelle-Aquitaine
depuis quinze ans. La publication de cette page permet à chacun de vérifier l'identité légale
de l'établissement et les informations relatives à son activité professionnelle. Identifiant :
${identifiers}.</p></body></html>`;

describe("registry root legal identity route", () => {
	it("builds only identity paths on the registered root", () => {
		assert.deepEqual(legalPageUrls("atelier-bassin.fr"), LEGAL_PATHS.map((path) => `https://atelier-bassin.fr${path}`));
	});

	it("anchors a registry row on its public SIREN, not on a person", () => {
		assert.equal(legalSelection(selection())?.row.identifier, "403104813");
		assert.equal(legalSelection(selection())?.row.aliasSource, "osm-siret-http-200");
	});

	it("accepts a legal page publishing the exact SIREN of the organisation", async () => {
		const fetcher = async (url: string) => url === "https://atelier-bassin.fr/mentions-legales"
			? { html: page("403104813"), status: 200, finalUrl: url }
			: { html: "", status: 404, finalUrl: url };
		const result = await verifyLegalPage(selection(), fetcher);
		assert.equal(result?.url, "https://atelier-bassin.fr/mentions-legales");
		assert.equal(result?.verdict.identity, "identifiant-public");
	});

	it("rejects a directory page listing more than three identifiers", async () => {
		const fetcher = async (url: string) => ({
			html: page("403104813 111111111 222222222 333333333"),
			status: 200, finalUrl: url,
		});
		assert.equal(await verifyLegalPage(selection(), fetcher), null);
	});

	it("rejects a page redirected off the registered root", async () => {
		const fetcher = async () => ({ html: page("403104813"), status: 200, finalUrl: "https://annuaire.fr/" });
		assert.equal(await verifyLegalPage(selection(), fetcher), null);
	});

	it("traces the registry URL and the answering legal page in the proof", () => {
		const result: LegalPageResult = {
			verdict: {
				ok: true, motif: "http200-published-identifier", identity: "identifiant-public",
				status: 200, finalUrl: "https://atelier-bassin.fr/mentions-legales",
				title: "Mentions légales", htmlLength: page("403104813").length,
			},
			url: "https://atelier-bassin.fr/mentions-legales",
			tried: ["https://atelier-bassin.fr/mentions-legales"],
		};
		const proof = provenanceForLegalPage(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlSource, "https://atelier-bassin.fr/annuaire/atelier-du-bassin");
		assert.equal(proof.preuve.urlReponse, result.url);
		assert.equal(proof.preuve.identifiant, "403104813");
	});
});
