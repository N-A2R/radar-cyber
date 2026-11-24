/** Un comportement par test : site officiel du catalogue apparié à son organisation. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	extractCommune, organisationLabel, selectCatalogueSites, siteVerdict, verifySite,
} from "../../../scripts/expand-domains-catalogue.mts";
import type { OrganisationRow, SiteRow } from "../../../scripts/expand-domains-catalogue.mts";

function site(overrides: Partial<SiteRow> = {}): SiteRow {
	return {
		sourceId: "corpus:landes-40-mairie-de-soustons",
		sourceName: "Actualités — Mairie de Soustons (mairie-soustons.fr)",
		url: "https://www.mairie-soustons.fr/actualites",
		department: "40",
		...overrides,
	};
}

function org(overrides: Partial<OrganisationRow> = {}): OrganisationRow {
	return {
		id: 42, name: "Commune de Soustons", city: "Soustons", dept: "40", siren: null, ...overrides,
	};
}

const html = `<html><head><title>Mairie de Soustons</title></head><body>`
	+ `La commune de Soustons, dans les Landes, accueille ses habitants toute `
	+ `la semaine en mairie. Retrouvez les horaires, les services municipaux et `
	+ `les actualités de la ville de Soustons sur ce site officiel.</body></html>`;

describe("official catalogue route", () => {
	it("extracts the commune only from an explicit municipal designation", () => {
		assert.equal(extractCommune("Actualités — Mairie de Soustons (mairie-soustons.fr)"), "soustons");
		assert.equal(extractCommune("La Dépêche — Landes (RSS)"), null);
	});

	it("extracts an exact school label from a corpus entry", () => {
		assert.equal(organisationLabel("Collège privé Saint-Joseph"), "college prive saint joseph");
		assert.equal(organisationLabel("Journal municipal — Soustons"), null);
	});

	it("selects one site per commune", () => {
		const selected = selectCatalogueSites(
			[site(), site({ sourceId: "autre", url: "https://www.autre.fr/actualites" })],
			[org()], new Set(),
		);
		assert.equal(selected.length, 1);
		assert.equal(selected[0].organisation.id, 42);
	});

	it("skips a root already attributed to an organisation", () => {
		const selected = selectCatalogueSites([site()], [org()], new Set(["mairie-soustons.fr"]));
		assert.equal(selected.length, 0);
	});

	it("rejects an ambiguous school name shared by two organisations", () => {
		const row = site({ sourceName: "Collège Jean Moulin", url: "https://jeanmoulin.fr", department: "33" });
		const two = [org({ id: 1, name: "Collège Jean Moulin", dept: "33" }), org({ id: 2, name: "Collège Jean Moulin", dept: "33" })];
		assert.equal(selectCatalogueSites([row], two, new Set()).length, 0);
	});

	it("accepts a live page naming the commune on the official root", () => {
		const selection = selectCatalogueSites([site()], [org()], new Set())[0];
		const verdict = siteVerdict(html, 200, "https://www.mairie-soustons.fr/actualites", selection);
		assert.equal(verdict.ok, true);
	});

	it("rejects a page where the commune is absent", () => {
		const selection = selectCatalogueSites([site()], [org()], new Set())[0];
		const verdict = siteVerdict(html.replace(/soustons/gi, "mimizan"), 200, "https://www.mairie-soustons.fr/actualites", selection);
		assert.equal(verdict.ok, false);
	});

	it("re-verifies the catalogue URL live before accepting it", async () => {
		const selection = selectCatalogueSites([site()], [org()], new Set())[0];
		const result = await verifySite(selection, async (url) => ({ html, status: 200, finalUrl: url }));
		assert.equal(result?.ok, true);
	});
});
