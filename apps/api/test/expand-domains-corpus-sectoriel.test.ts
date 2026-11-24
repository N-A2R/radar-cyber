/** Un comportement par test : route des corpus sectoriels versionnés. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	departmentCode, nameKey, provenanceForSite, selectSectorSites, siteVerdict, verifySite,
} from "../../../scripts/expand-domains-corpus-sectoriel.mts";
import type {
	OrganisationRow, SiteRow, SiteSelection,
} from "../../../scripts/expand-domains-corpus-sectoriel.mts";

function site(overrides: Partial<SiteRow> = {}): SiteRow {
	return {
		sourceId: "sources-agriculture-16.jsonl:1",
		sourceName: "Club Landes Entreprises",
		url: "https://club-landes-entreprises.fr/",
		department: "40",
		corpus: "sources-agriculture-40.jsonl",
		...overrides,
	};
}

function org(overrides: Partial<OrganisationRow> = {}): OrganisationRow {
	return {
		id: 42, name: "CLUB LANDES ENTREPRISES", city: "Mont-de-Marsan",
		dept: "40", siren: null, ...overrides,
	};
}

const html = `<html><head><title>Club Landes Entreprises</title></head><body>`
	+ `Le Club Landes Entreprises réunit les entreprises du département des Landes `
	+ `autour de rencontres, de formations et d'échanges tout au long de l'année. `
	+ `Retrouvez notre programme, nos adhérents et nos contacts sur ce site.</body></html>`;

function selection(overrides: Partial<SiteSelection> = {}): SiteSelection {
	return { row: site(), organisation: org(), domain: "club-landes-entreprises.fr", ...overrides };
}

describe("sector corpus domain route", () => {
	it("normalises an accentuated corpus label like an organisation name", () => {
		assert.equal(nameKey("Béarn Nouvelles Énergies"), "bearn nouvelles energies");
	});

	it("accepts a full department name from a sector corpus", () => {
		assert.equal(departmentCode("Pyrénées-Atlantiques"), "64");
	});

	it("rejects a department outside Nouvelle-Aquitaine", () => {
		assert.equal(departmentCode("75"), null);
	});

	it("selects an organisation named exactly by the corpus entry", () => {
		const selected = selectSectorSites([site()], [org()], new Set());
		assert.equal(selected.length, 1);
		assert.equal(selected[0].organisation.id, 42);
	});

	it("rejects a name shared by two organisations", () => {
		const selected = selectSectorSites([site()], [org(), org({ id: 43 })], new Set());
		assert.equal(selected.length, 0);
	});

	it("skips a domain root already attributed to another organisation", () => {
		const selected = selectSectorSites([site()], [org()], new Set(["club-landes-entreprises.fr"]));
		assert.equal(selected.length, 0);
	});

	it("skips a page hosted on a third-party platform", () => {
		const selected = selectSectorSites(
			[site({ url: "https://sites.google.com/club-landes-entreprises/" })], [org()], new Set(),
		);
		assert.equal(selected.length, 0);
	});

	it("accepts a live page proving the organisation identity", () => {
		const verdict = siteVerdict(html, 200, "https://club-landes-entreprises.fr/", selection());
		assert.equal(verdict.ok, true);
	});

	it("rejects a non-200 response", () => {
		const verdict = siteVerdict(html, 404, "https://club-landes-entreprises.fr/", selection());
		assert.equal(verdict.ok, false);
	});

	it("rejects a redirect outside the corpus domain root", () => {
		const verdict = siteVerdict(html, 200, "https://autre.fr/", selection());
		assert.equal(verdict.ok, false);
	});

	it("re-verifies the corpus URL live before accepting it", async () => {
		const result = await verifySite(selection(), async (url) => ({ html, status: 200, finalUrl: url }));
		assert.equal(result?.ok, true);
	});

	it("records the corpus entry and the live proof as provenance", () => {
		const proof = provenanceForSite(selection(), siteVerdict(html, 200, "https://club-landes-entreprises.fr/", selection()));
		assert.equal(proof.source, "source:corpus-sectoriel:http200");
		assert.equal(proof.preuve.urlFinale, "https://club-landes-entreprises.fr/");
		assert.equal(proof.preuve.corpus, "sources-agriculture-40.jsonl");
	});
});
