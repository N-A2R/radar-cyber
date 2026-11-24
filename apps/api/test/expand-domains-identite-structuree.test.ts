/** Un comportement par test : identité publiée dans les métadonnées d'une page prouvée. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExpositionRow, ExpositionSelection } from "../../../scripts/expand-domains-exposition.mts";
import {
	SOURCE, provenanceForStructuredIdentity, structuredAnchors, structuredVerdict, verifyStructuredIdentity,
	type StructuredResult,
} from "../../../scripts/expand-domains-identite-structuree.mts";

function selection(): ExpositionSelection {
	const row: ExpositionRow = {
		serviceId: 71, orgId: 42, name: "ATELIER DU BASSIN", city: "Bordeaux", dept: "33",
		siren: "403104813", source: "osm-siret-http-200",
		sourceUrl: "https://atelier-bassin.fr/", provider: "osm:node/71",
		evidenceDomain: "atelier-bassin.fr", consultedAt: "2026-11-24T00:00:00.000Z",
	};
	return {
		row,
		organisation: { id: 42, name: "ATELIER DU BASSIN", city: "Bordeaux", dept: "33", siren: "403104813", domain: null },
		domain: "atelier-bassin.fr",
	};
}

const body = `<p>L'atelier du Bassin accompagne les artisans de Nouvelle-Aquitaine depuis quinze ans.
La publication de cette page permet à chacun de vérifier l'identité de l'établissement et les
informations relatives à son activité professionnelle, sans donnée personnelle.</p>`;

const page = (head: string): string => `<html><head>${head}</head><body>${body}</body></html>`;

describe("structured identity on proved registry pages", () => {
	it("reads only explicit title, og:site_name and JSON-LD identity slots", () => {
		const html = page(`<title>Atelier du Bassin</title>
<meta property="og:site_name" content="Atelier du Bassin" />
<script type="application/ld+json">{"@type":"Organization","legalName":"Atelier du Bassin","name":"Atelier"}</script>`);
		assert.deepEqual(structuredAnchors(html).map((anchor) => anchor.field),
			["title", "meta", "jsonld:legalName", "jsonld:name"]);
	});

	it("accepts a JSON-LD legal name naming the organisation", () => {
		const html = page(`<script type="application/ld+json">{"@type":"Organization","legalName":"Atelier du Bassin"}</script>`);
		const verdict = structuredVerdict(html, 200, "https://atelier-bassin.fr/", selection());
		assert.equal(verdict.ok, true);
		assert.equal(verdict.field, "jsonld:legalName");
		assert.equal(verdict.token, "atelier");
	});

	it("accepts a page publishing the exact public SIREN", () => {
		const html = page(`<title>Atelier du Bassin</title><p>SIREN : 403104813</p>`);
		const verdict = structuredVerdict(html, 200, "https://atelier-bassin.fr/", selection());
		assert.equal(verdict.identity, "identifiant-public");
		assert.equal(verdict.token, "403104813");
	});
	it("recognises a name token in a digit-suffixed root", () => {
		const html = page(`<meta property="og:site_name" content="Commune de Messanges" />`);
		const messanges = {
			...selection(),
			organisation: { ...selection().organisation, name: "Commune de Messanges" },
			domain: "messanges40.fr",
		};
		const verdict = structuredVerdict(html, 200, "https://messanges40.fr/", messanges);
		assert.equal(verdict.ok, true);
		assert.equal(verdict.token, "messanges");
	});


	it("rejects structured data naming another organisation", () => {
		const html = page(`<title>Maison de la Charente</title>
<script type="application/ld+json">{"@type":"Organization","legalName":"Maison de la Charente"}</script>`);
		assert.equal(structuredVerdict(html, 200, "https://atelier-bassin.fr/", selection()).ok, false);
	});


	it("rejects a short page even when its title names the organisation", () => {
		const html = "<html><head><title>Atelier du Bassin</title></head><body>Atelier</body></html>";
		assert.equal(structuredVerdict(html, 200, "https://atelier-bassin.fr/", selection()).motif, "content-too-short");
	});

	it("rejects a root that does not name the organisation", () => {
		const html = page(`<title>Atelier du Bassin</title>`);
		const offBrand = { ...selection(), domain: "boutique-cadeaux.fr" };
		assert.equal(structuredVerdict(html, 200, "https://boutique-cadeaux.fr/", offBrand).motif, "root-not-named");
	});

	it("rejects a redirect off the registered root", async () => {
		const html = page(`<title>Atelier du Bassin</title>`);
		const fetcher = async () => ({ html, status: 200, finalUrl: "https://annuaire.fr/atelier" });
		assert.equal(await verifyStructuredIdentity(selection(), fetcher), null);
	});

	it("traces the metadata field and the answering URL in the proof", () => {
		const result: StructuredResult = {
			verdict: structuredVerdict(page(`<meta property="og:site_name" content="Atelier du Bassin" />`),
				200, "https://atelier-bassin.fr/", selection()),
			url: "https://atelier-bassin.fr/",
			tried: ["https://atelier-bassin.fr/"],
		};
		const proof = provenanceForStructuredIdentity(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.champIdentite, "meta");
		assert.equal(proof.preuve.urlReponse, result.url);
		assert.equal(proof.preuve.statut, 200);
	});
});
