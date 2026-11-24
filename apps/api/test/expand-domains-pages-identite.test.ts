/** Un comportement par test : pages d'identité d'un site déjà prouvé HTTP 200. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExpositionRow, ExpositionSelection } from "../../../scripts/expand-domains-exposition.mts";
import {
	IDENTITY_PATHS, SOURCE, identityPageUrls, provenanceForIdentityPage, verifyIdentityPage,
	type IdentityPageResult,
} from "../../../scripts/expand-domains-pages-identite.mts";

function selection(): ExpositionSelection {
	const row: ExpositionRow = {
		serviceId: 17, orgId: 42, name: "NUTSY.NET", city: "Bordeaux", dept: "33",
		siren: "403104813", source: "osm-siret-http-200",
		sourceUrl: "https://nutsy.net/boutique", provider: "osm:node/1",
		evidenceDomain: "nutsy.net", consultedAt: "2026-11-24T00:00:00.000Z",
	};
	return {
		row,
		organisation: { id: 42, name: "NUTSY.NET", city: "Bordeaux", dept: "33", siren: "403104813" },
		domain: "nutsy.net",
	};
}

const html = "<html><head><title>Nutsy — à propos</title></head><body>"
	+ "Nutsy accompagne les artisans de Nouvelle-Aquitaine depuis quinze ans. "
	+ "Nos équipes répondent aux commandes et publient chaque semaine des conseils "
	+ "sur la vente en ligne et les outils numériques des petites entreprises.</body></html>";

describe("registry root identity page route", () => {
	it("proposes conventional identity paths on the registered root only", () => {
		assert.deepEqual(identityPageUrls("nutsy.net"), IDENTITY_PATHS.map((path) => `https://nutsy.net${path}`));
	});

	it("accepts the first identity page that publishes the organisation name", async () => {
		const fetcher = async (url: string) => url === "https://nutsy.net/a-propos"
			? { html, status: 200, finalUrl: url }
			: { html: "", status: 404, finalUrl: url };
		const result = await verifyIdentityPage(selection(), fetcher);
		assert.equal(result?.url, "https://nutsy.net/a-propos");
		assert.equal(result?.verdict.token, "nutsy");
	});

	it("rejects an identity page redirected off the registered root", async () => {
		const fetcher = async (url: string) => ({ html, status: 200, finalUrl: "https://ailieurs.fr/" });
		assert.equal(await verifyIdentityPage(selection(), fetcher), null);
	});

	it("traces the registry URL and the answering identity page in the proof", () => {
		const result: IdentityPageResult = {
			verdict: {
				ok: true, motif: "http200-title-and-body", token: "nutsy", confidence: 0.95,
				title: "Nutsy — à propos", status: 200,
				finalUrl: "https://nutsy.net/a-propos", htmlLength: html.length,
			},
			url: "https://nutsy.net/a-propos",
			tried: ["https://nutsy.net/contact", "https://nutsy.net/a-propos"],
		};
		const proof = provenanceForIdentityPage(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlSource, "https://nutsy.net/boutique");
		assert.equal(proof.preuve.urlReponse, "https://nutsy.net/a-propos");
		assert.equal(proof.preuve.pagesTestees, 2);
	});
});
