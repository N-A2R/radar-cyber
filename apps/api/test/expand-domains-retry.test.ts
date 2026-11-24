/** Un comportement par test : re-vérification des URL d'exposition laissées sans preuve. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	provenanceForRetry, retryUrls, SOURCE, verifyWithRetry,
	type PageFetch,
} from "../../../scripts/expand-domains-retry.mts";
import {
	selectExpositionCandidates, type ExpositionRow,
} from "../../../scripts/expand-domains-exposition.mts";

const html = "<html><head><title>Les Tilleuls</title></head><body>"
	+ "Bienvenue sur le site officiel des Tilleuls, une association de Périgueux en Nouvelle-Aquitaine."
	+ " Retrouvez nos horaires, nos activités et nos coordonnées toute l'année.</body></html>";

function selection() {
	const row: ExpositionRow = {
		serviceId: 42, orgId: 10, name: "SCI DES TILLEULS", city: "Périgueux", dept: "24",
		siren: "111111111", source: "osm-siret-http-200", sourceUrl: "https://tilleuls.fr/",
		provider: "osm:website", evidenceDomain: "tilleuls.fr",
		consultedAt: "2026-11-23T10:00:00Z",
	};
	const [entry] = selectExpositionCandidates([row], new Set());
	return entry;
}

function page(status: number, url: string, body = html) {
	return { html: body, status, finalUrl: url };
}

describe("exposition retry route", () => {
	it("proposes only the www variant of the same official host", () => {
		assert.deepEqual(retryUrls("https://tilleuls.fr/"), [
			"https://tilleuls.fr/", "https://www.tilleuls.fr/",
		]);
	});

	it("accepts the www variant when the registry URL answered without proof", async () => {
		const fetcher: PageFetch = async (url) => url.includes("www.")
			? page(200, "https://www.tilleuls.fr/")
			: page(503, url);
		const result = await verifyWithRetry(selection(), fetcher);
		assert.equal(result?.url, "https://www.tilleuls.fr/");
		assert.equal(result?.tried.length, 2);
	});

	it("rejects candidates whose variants never return HTTP 200", async () => {
		const fetcher: PageFetch = async (url) => page(404, url);
		assert.equal(await verifyWithRetry(selection(), fetcher), null);
	});

	it("traces the registry URL and the answering URL in the proof", () => {
		const result = { verdict: {
			ok: true, motif: "http200-title-and-body", token: "tilleuls", confidence: 0.95,
			title: "Les Tilleuls", status: 200, finalUrl: "https://www.tilleuls.fr/", htmlLength: html.length,
		}, url: "https://www.tilleuls.fr/", tried: ["https://tilleuls.fr/", "https://www.tilleuls.fr/"] };
		const proof = provenanceForRetry(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlSource, "https://tilleuls.fr/");
		assert.equal(proof.preuve.urlReponse, "https://www.tilleuls.fr/");
		assert.equal(proof.preuve.statut, 200);
		assert.equal(proof.preuve.tentatives, 2);
	});
});
