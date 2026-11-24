/** Un comportement par test : route des annuaires officiels appariés par SIREN. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	labelToken, officialDepartment, officialVerdict, parseOfficialSite, provenanceForOfficial,
	selectOfficialSites, verifyOfficialSite,
} from "../../../scripts/expand-domains-siren-officiel.mts";
import type {
	OfficialOrganisation, OfficialSelection, OfficialSiteRow,
} from "../../../scripts/expand-domains-siren-officiel.mts";

function row(overrides: Partial<OfficialSiteRow> = {}): OfficialSiteRow {
	return {
		entryId: "na-edu-0160001P", corpus: "institutions-complet.jsonl",
		label: "Collège privé Lo Collègi Calandreta Gasconha",
		siren: "441710779", url: "https://www.calandreta-pau.org/", department: "016",
		...overrides,
	};
}

function org(overrides: Partial<OfficialOrganisation> = {}): OfficialOrganisation {
	return {
		id: 42, name: "ASSOCIATION LO COLLEGI", city: "Pau", dept: "64", siren: "441710779",
		...overrides,
	};
}

function selection(overrides: Partial<OfficialSelection> = {}): OfficialSelection {
	return { row: row(), organisation: org(), domain: "calandreta-pau.org", token: "calandreta", ...overrides };
}

const html = `<html><head><title>Lo Collègi Calandreta Gasconha</title></head><body>`
	+ `Lo Collègi Calandreta Gasconha accueille ses élèves à Pau. `
	+ `L'association propose un enseignement en langue occitane et organise `
	+ `des activités culturelles et sportives pour les élèves de l'établissement.</body></html>`;

describe("official directory SIREN domain route", () => {
	it("reads the legal identifier, label and URL from an official corpus line", () => {
		const parsed = parseOfficialSite("institutions-complet.jsonl", JSON.stringify({
			id: "na-edu-1", nom: "Lycée Guez de Balzac", siren: "191600022",
			departement: "016", url_preuve: "https://lgtguezdebalzac.fr/",
		}));
		assert.equal(parsed?.siren, "191600022");
		assert.equal(parsed?.url, "https://lgtguezdebalzac.fr/");
	});

	it("rejects a corpus line without a nine-digit SIREN", () => {
		assert.equal(parseOfficialSite("x.jsonl", JSON.stringify({ nom: "X", siren: "12", url: "https://x.fr" })), null);
	});

	it("normalises a three-digit department and a department name", () => {
		assert.equal(officialDepartment("016"), "16");
		assert.equal(officialDepartment("Pyrénées-Atlantiques"), "64");
	});

	it("extracts an establishment word instead of a school type or city", () => {
		assert.equal(labelToken("Collège privé Lo Collègi Calandreta Gasconha", "Pau"), "calandreta");
	});

	it("selects the organisation carrying exactly the published SIREN", () => {
		const selected = selectOfficialSites([row({ department: "64" })], [org()]);
		assert.equal(selected.length, 1);
		assert.equal(selected[0].organisation.id, 42);
	});

	it("rejects a directory entry from another department", () => {
		assert.equal(selectOfficialSites([row()], [org()]).length, 0);
	});

	it("keeps a shared root when the official SIREN identifies this organisation", () => {
		const selected = selectOfficialSites([row({ department: "64" })], [org()]);
		assert.equal(selected[0].domain, "calandreta-pau.org");
	});

	it("skips a page hosted on a public directory root", () => {
		const selected = selectOfficialSites(
			[row({ department: "64", url: "https://www.sante.fr/etablissement/calandreta" })], [org()],
		);
		assert.equal(selected.length, 0);
	});

	it("keeps only one site per organisation", () => {
		const selected = selectOfficialSites(
			[row({ department: "64" }), row({ department: "64", entryId: "autre", url: "https://autre.fr/" })],
			[org()],
		);
		assert.equal(selected.length, 1);
	});

	it("accepts a live page naming the establishment from the directory", () => {
		assert.equal(officialVerdict(html, 200, "https://www.calandreta-pau.org/", selection()).ok, true);
	});

	it("rejects a page that does not publish the establishment name", () => {
		const verdict = officialVerdict("<html><body>Actualités de la région Nouvelle-Aquitaine...</body></html>",
			200, "https://www.calandreta-pau.org/", selection());
		assert.equal(verdict.ok, false);
	});

	it("rejects a non-200 response", () => {
		assert.equal(officialVerdict(html, 404, "https://www.calandreta-pau.org/", selection()).ok, false);
	});

	it("re-verifies the directory URL before accepting it", async () => {
		const result = await verifyOfficialSite(selection(), async (url) => ({ html, status: 200, finalUrl: url }));
		assert.equal(result?.ok, true);
	});

	it("records the official entry and live proof as provenance", () => {
		const verdict = officialVerdict(html, 200, "https://www.calandreta-pau.org/", selection());
		const proof = provenanceForOfficial(selection(), verdict);
		assert.equal(proof.source, "source:annuaire-officiel:siren:http200");
		assert.equal(proof.preuve.siren, "441710779");
		assert.equal(proof.preuve.urlFinale, "https://www.calandreta-pau.org/");
	});
});
