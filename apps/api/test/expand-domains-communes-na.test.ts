/** Un comportement par test : route des domaines municipaux du référentiel NA. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	communeVerdict, communeSlug, designatesCommune, loadCommunes, provenanceForCommune,
	ROOT_PATTERNS, selectCommuneDomains, verifyCommuneDomain,
} from "../../../scripts/expand-domains-communes-na.mts";
import type {
	Commune, CommuneOrganisation, CommuneSelection, PageFetch,
} from "../../../scripts/expand-domains-communes-na.mts";

const commune: Commune = {
	code: "16001", nom: "Abzac", slug: "abzac", dept: "16",
	deptName: "charente", postalCodes: ["16500"],
};
const organisation: CommuneOrganisation = { id: 42, name: "Commune de Abzac", dept: "16" };
const selection: CommuneSelection = { organisation, commune, domain: "ville-abzac.fr" };

const html = `<html><head><title>Mairie d'Abzac — Charente</title></head><body>
<p>La mairie d'Abzac accueille les habitants de la commune du lundi au vendredi.
Le conseil municipal se réunit en mairie. Pour vos démarches d'état civil,
écrivez à la mairie, 16500 Abzac, Charente. Le service est ouvert toute l'année.</p>
</body></html>`;

describe("Nouvelle-Aquitaine municipal domain route", () => {
	it("builds an ASCII slug from an accented commune name", () => {
		assert.equal(communeSlug("Saint-Jean-d'Angély"), "saint-jean-d-angely");
	});

	it("keeps only regional communes with a department name", () => {
		const raw = JSON.stringify({
			departements: [{ code: "16", nom: "Charente" }],
			communes: [
				{ code: "16001", nom: "Abzac", dept: "16", codesPostaux: ["16500"] },
				{ code: "75001", nom: "Paris", dept: "75", codesPostaux: ["75001"] },
			],
		});
		const loaded = loadCommunes(raw);
		assert.deepEqual(loaded.map((row) => row.code), ["16001"]);
		assert.equal(loaded[0].deptName, "charente");
	});

	it("accepts only names designating the commune", () => {
		assert.equal(designatesCommune("Mairie de Abzac", commune), true);
		assert.equal(designatesCommune("Abzac Distribution SARL", commune), false);
	});

	it("skips a root already attributed to another record", () => {
		const selected = selectCommuneDomains([organisation], [commune], new Set(["abzac.fr"]));
		assert.deepEqual(selected, []);
	});

	it("tries the mairie root in the second pass", () => {
		const selected = selectCommuneDomains([organisation], [commune], new Set(), "mairie");
		assert.deepEqual(selected.map((row) => row.domain), ["mairie-abzac.fr"]);
	});

	it("uses one root per commune even with two homonymous organisations", () => {
		const other: CommuneOrganisation = { id: 43, name: "Ville de Abzac", dept: "16" };
		const selected = selectCommuneDomains([organisation, other], [commune]);
		assert.deepEqual(selected.map((row) => row.domain), ["abzac.fr"]);
	});

	it("builds the four public root patterns from the same slug", () => {
		assert.deepEqual(Object.values(ROOT_PATTERNS).map((build) => build("abzac")), [
			"abzac.fr", "mairie-abzac.fr", "abzac-mairie.fr", "ville-abzac.fr",
		]);
	});

	it("accepts a live municipal page anchored in the right department", () => {
		const verdict = communeVerdict(html, 200, "https://ville-abzac.fr/", selection);
		assert.equal(verdict.ok, true);
		assert.equal(verdict.motif, "http200-commune-locale");
		assert.equal(verdict.confidence >= 0.85, true);
	});

	it("rejects a homonymous commune in another department", () => {
		const foreign = html.replace("16500 Abzac", "(17) Abzac");
		const verdict = communeVerdict(foreign, 200, "https://ville-abzac.fr/", selection);
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "foreign-department-anchor");
	});

	it("rejects a page without a local anchor", () => {
		const anonymous = html.replace(/16500|Charente/g, "");
		const verdict = communeVerdict(anonymous, 200, "https://ville-abzac.fr/", selection);
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "local-anchor-absent");
	});

	it("rejects a non-200 response", () => {
		assert.equal(communeVerdict(html, 404, "https://ville-abzac.fr/", selection).ok, false);
	});

	it("retries the www host before accepting a page", async () => {
		const urls: string[] = [];
		const fetcher: PageFetch = async (url) => {
			urls.push(url);
			return url.includes("www.")
				? { html, status: 200, finalUrl: "https://www.ville-abzac.fr/" }
				: { html: "", status: 503, finalUrl: url };
		};
		const verdict = await verifyCommuneDomain(selection, fetcher);
		assert.equal(verdict?.ok, true);
		assert.deepEqual(urls, ["https://ville-abzac.fr/", "https://www.ville-abzac.fr/"]);
	});

	it("records the commune code and the final URL in the provenance", () => {
		const verdict = communeVerdict(html, 200, "https://ville-abzac.fr/", selection);
		const proof = provenanceForCommune(selection, verdict);
		assert.equal(proof.preuve.codeCommune, "16001");
		assert.equal(proof.preuve.urlFinale, "https://ville-abzac.fr/");
		assert.equal(proof.source, "source:referentiel-territorial:nom-domaine:http200");
	});
});
