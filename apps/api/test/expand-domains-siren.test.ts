/** Un comportement par test : ancrage par SIREN public sur une racine partagée. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	MAX_SIRENS_ON_PAGE, selectSirenCandidates, sirenVerdict, verifySirenCandidate,
} from "../../../scripts/expand-domains-siren.mts";
import type { ExpositionRow } from "../../../scripts/expand-domains-exposition.mts";

function row(overrides: Partial<ExpositionRow> = {}): ExpositionRow {
	return {
		serviceId: 9, orgId: 42, name: "AGENCE MMA COZES", city: "Cozes", dept: "17",
		siren: "509458493", source: "osm-siret-http-200", sourceUrl: "https://agence.mma.fr/cozes",
		provider: "osm-siret", evidenceDomain: "agma.fr",
		consultedAt: "2026-11-24T10:00:00Z", ...overrides,
	};
}

function selection(overrides: Partial<ExpositionRow> = {}) {
	return selectSirenCandidates([row(overrides)])[0];
}

const page = `<html><head><title>Agence de Cozes</title></head><body>`
	+ `L'agence de Cozes vous accueille du lundi au vendredi pour vos assurances `
	+ `et vos services. SIREN 509458493 — établissement situé en Charente-Maritime. `
	+ `Retrouvez nos horaires et nos coordonnées sur cette page.</body></html>`;

describe("published SIREN route", () => {
	it("accepts a shared-root page publishing the organisation's exact SIREN", () => {
		const verdict = sirenVerdict(page, 200, "https://agma.fr/cozes", selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
		assert.equal(verdict.ok, true);
		assert.equal(verdict.motif, "http200-published-siren");
	});

	it("rejects a directory page listing many legal identifiers", () => {
		const many = Array.from({ length: MAX_SIRENS_ON_PAGE + 1 }, (_, i) => `${509458493 + i}`).join(" ");
		const verdict = sirenVerdict(`${page} ${many}`, 200, "https://agma.fr/cozes", selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "directory-page");
	});

	it("rejects a real page that does not publish the organisation's SIREN", () => {
		const verdict = sirenVerdict(page, 200, "https://agma.fr/cozes", selection({ siren: "111111111", evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "no-published-siren");
	});

	it("rejects a redirect off the registered root", () => {
		const verdict = sirenVerdict(page, 200, "https://autre.fr/cozes", selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "redirect-off-root");
	});

	it("requires a dedicated address rather than a bare homepage", () => {
		assert.equal(selectSirenCandidates([row({ sourceUrl: "https://agma.fr" })]).length, 0);
	});

	it("re-verifies the registry URL live before accepting it", async () => {
		const result = await verifySirenCandidate(
			selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }),
			async (url) => ({ html: page, status: 200, finalUrl: url }),
		);
		assert.equal(result?.ok, true);
	});
});
