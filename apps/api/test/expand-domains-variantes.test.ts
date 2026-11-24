/** Un comportement par test : variantes d'hôte d'une URL officielle prouvée. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	hostVariants, provenanceForVariant, selectVariantCandidates, verifyVariant, SOURCE,
	type VariantResult,
} from "../../../scripts/expand-domains-variantes.mts";
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
	return selectVariantCandidates([row()])[0];
}

const accepted: VariantResult = {
	verdict: {
		ok: true, motif: "http200-title-and-body", token: "aussac", confidence: 0.85,
		title: "Aussac-Vadalle", status: 200, finalUrl: "http://www.aussac-vadalle.fr/", htmlLength: html.length,
	},
	url: "http://www.aussac-vadalle.fr/",
	tried: ["https://aussac-vadalle.fr/", "http://aussac-vadalle.fr/", "http://www.aussac-vadalle.fr/"],
};

describe("official host variant route", () => {
	it("proposes both protocols and both www prefixes of the same host", () => {
		const variants = hostVariants("https://aussac-vadalle.fr");
		assert.deepEqual(variants, [
			"https://aussac-vadalle.fr/", "https://www.aussac-vadalle.fr/",
			"http://aussac-vadalle.fr/", "http://www.aussac-vadalle.fr/",
		]);
	});

	it("accepts the http www variant when the https registry URL never answered", async () => {
		const fetcher = async (url: string) => url === "http://www.aussac-vadalle.fr/"
			? { html, status: 200, finalUrl: url }
			: { html: "", status: 503, finalUrl: url };
		const result = await verifyVariant(selection(), fetcher);
		assert.equal(result?.url, "http://www.aussac-vadalle.fr/");
		assert.equal(result?.verdict.token, "aussac");
	});

	it("rejects a variant redirected to an unnamed root", async () => {
		const fetcher = async (url: string) => ({ html, status: 200, finalUrl: "https://exemple.fr/" });
		assert.equal(await verifyVariant(selection(), fetcher), null);
	});

	it("keeps one candidate per organisation when two URL shapes qualify", () => {
		const dedicated: ExpositionRow = {
			...row("https://pep86.fr/terra-nova"), orgId: 13,
			name: "MAS TERRA NOVA - PEP 86", city: "Poitiers", evidenceDomain: "pep86.fr",
		};
		const candidates = selectVariantCandidates([row(), dedicated]);
		assert.equal(candidates.length, 2);
		assert.equal(new Set(candidates.map((entry) => entry.organisation.id)).size, 2);
		assert.equal(candidates[0].domain, "aussac-vadalle.fr");
	});

	it("traces the registry URL and the answering variant in the proof", () => {
		const proof = provenanceForVariant(selection(), accepted);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlSource, "https://aussac-vadalle.fr");
		assert.equal(proof.preuve.urlReponse, "http://www.aussac-vadalle.fr/");
		assert.equal(proof.preuve.statut, 200);
		assert.equal(proof.preuve.tentatives, 3);
	});
});
