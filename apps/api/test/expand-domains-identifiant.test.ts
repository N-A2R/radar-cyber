/** Un comportement par test : ancrage par identifiant public sur une racine partagée. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	MAX_IDENTIFIERS_ON_PAGE, identifierVerdict, selectIdentifierCandidates, verifyIdentifierCandidate,
} from "../../../scripts/expand-domains-identifiant.mts";
import type { IdentifierRow } from "../../../scripts/expand-domains-identifiant.mts";

function row(overrides: Partial<IdentifierRow> = {}): IdentifierRow {
	return {
		serviceId: 9, orgId: 42, name: "EHPAD RESIDENCE DU LAC", city: "Rochefort", dept: "17",
		siren: null,
		source: "finess-site-http-200",
		sourceUrl: "https://retab.fr/450/page-de-csj-residence-du-lac",
		provider: "finess-enrichi:site_web",
		evidenceDomain: "retab.fr",
		identifier: "170012702",
		identifierKind: "finess",
		...overrides,
	};
}

function selection(overrides: Partial<IdentifierRow> = {}) {
	return selectIdentifierCandidates([row(overrides)])[0];
}

const page = `<html><head><title>Residence du Lac</title></head><body>`
	+ `EHPAD Residence du Lac à Rochefort. FINESS géographique 170012702, `
	+ `établissement médico-social de Charente-Maritime. Horaires et coordonnées `
	+ `publiés sur cette page dédiée aux familles et aux professionnels.</body></html>`;

describe("published legal identifier route", () => {
	it("selects FINESS and SIRET pages but not homepages", () => {
		const selected = selectIdentifierCandidates([
			row(),
			row({ orgId: 43, identifierKind: "siret", identifier: "42397779200047", sourceUrl: "https://etablissement-lesterrasses.fr/contact", evidenceDomain: "etablissement-lesterrasses.fr", source: "registry-id-http-200" }),
			row({ orgId: 44, sourceUrl: "https://retab.fr" }),
		]);
		assert.deepEqual(selected.map((entry) => entry.row.orgId), [42, 43]);
	});

	it("accepts a shared-root page publishing the exact FINESS", () => {
		const verdict = identifierVerdict(page, 200, "https://retab.fr/450/page-de-csj-residence-du-lac", selection());
		assert.equal(verdict.ok, true);
		assert.equal(verdict.motif, "http200-published-finess");
	});

	it("accepts a SIRET written with spaces by the registry", () => {
		const siret = row({ identifierKind: "siret", identifier: "42397779200047", sourceUrl: "https://lesterrasses.fr/etablissement", evidenceDomain: "lesterrasses.fr" });
		const html = page.replace("170012702", "423 977 792 00047");
		const verdict = identifierVerdict(html, 200, siret.sourceUrl, selectIdentifierCandidates([siret])[0]);
		assert.equal(verdict.ok, true);
		assert.equal(verdict.motif, "http200-published-siret");
	});

	it("rejects a directory page listing many identifiers", () => {
		const many = Array.from({ length: MAX_IDENTIFIERS_ON_PAGE + 1 }, (_, i) => `${170012702 + i}`).join(" ");
		const verdict = identifierVerdict(`${page} ${many}`, 200, "https://retab.fr/450/page-de-csj-residence-du-lac", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "directory-page");
	});

	it("rejects a page that does not publish the organisation's identifier", () => {
		const verdict = identifierVerdict(page, 200, "https://retab.fr/450/page-de-csj-residence-du-lac", selection({ identifier: "170099999" }));
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "no-published-identifier");
	});

	it("rejects a redirect off the registered root", () => {
		const verdict = identifierVerdict(page, 200, "https://autre.fr/450/page", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "redirect-off-root");
	});

	it("rejects a non-200 response", () => {
		const verdict = identifierVerdict(page, 404, "https://retab.fr/450/page-de-csj-residence-du-lac", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "http-not-200");
	});

	it("re-verifies the registry URL live before accepting it", async () => {
		const result = await verifyIdentifierCandidate(
			selection(),
			async (url) => ({ html: page, status: 200, finalUrl: url }),
		);
		assert.equal(result?.ok, true);
	});
});
