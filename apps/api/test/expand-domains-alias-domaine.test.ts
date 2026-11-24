/** Un comportement par test : route des domaines déclarés dans l'alias SIRENE. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	aliasDomains, aliasDomainVerdict, selectAliasDomains, verifyAliasDomain,
} from "../../../scripts/expand-domains-alias-domaine.mts";
import type { AliasDomainSelection, AliasRow } from "../../../scripts/expand-domains-alias-domaine.mts";

function row(overrides: Partial<AliasRow> = {}): AliasRow {
	return {
		orgId: 42, name: "JESTOCKE.COM", city: "Bordeaux", dept: "33",
		identifier: "403104813", alias: "JESTOCKE.COM (WARESITO ET APPSITO)",
		aliasSource: "sirene-enseigne", ...overrides,
	};
}

function selection(overrides: Partial<AliasDomainSelection> = {}): AliasDomainSelection {
	return { row: row(), domain: "jestocke.com", identityToken: "jestocke", ...overrides };
}

const html = `<html><head><title>Jestocke</title></head><body>`
	+ `Jestocke accompagne les artisans de Nouvelle-Aquitaine depuis quinze ans. `
	+ `Nos équipes répondent aux commandes et publient chaque semaine des conseils `
	+ `sur la vente en ligne et les outils numériques des petites entreprises.</body></html>`;

describe("SIRENE alias domain route", () => {
	it("extracts a declared domain from a public alias", () => {
		assert.deepEqual(aliasDomains("DREAMCLIC DREAMCLIC.COM DREAMCLIC.FR"), ["dreamclic.com", "dreamclic.fr"]);
	});

	it("ignores short and platform roots", () => {
		assert.deepEqual(aliasDomains("L.NET ASSOC FACEBOOK.COM"), []);
	});

	it("rejects an already attributed root", () => {
		assert.equal(selectAliasDomains([row()], new Set(["jestocke.com"])).length, 0);
	});

	it("rejects a natural person's alias", () => {
		const person = row({
			name: "JULIEN TISSIDRE (LAB118.IO)", alias: "JULIEN TISSIDRE (LAB118.IO)",
		});
		assert.equal(selectAliasDomains([person]).length, 0);
	});

	it("accepts an alias naming the organisation with an unattributed root", () => {
		const selected = selectAliasDomains([row()]);
		assert.equal(selected.length, 1);
		assert.equal(selected[0].domain, "jestocke.com");
	});

	it("rejects a page that redirects off the declared root", () => {
		const verdict = aliasDomainVerdict(html, 200, "https://www.autre.fr/", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "redirect-off-root");
	});

	it("accepts a live page publishing the name of the alias", () => {
		const verdict = aliasDomainVerdict(html, 200, "https://www.jestocke.com/", selection());
		assert.equal(verdict.ok, true);
		assert.equal(verdict.identity, "jestocke");
	});

	it("accepts a live page publishing the legal identifier", () => {
		const page = html.replace("Jestocke accompagne", "SIRET 403 104 813 00019 — Jestocke accompagne");
		const verdict = aliasDomainVerdict(page, 200, "https://jestocke.com/", selection({ identityToken: null }));
		assert.equal(verdict.ok, true);
		assert.equal(verdict.identity, "identifiant-public");
	});

	it("re-verifies the declared domain through the injected fetcher", async () => {
		const result = await verifyAliasDomain(selection(), async (url) => ({
			html, status: 200, finalUrl: url,
		}));
		assert.equal(result?.ok, true);
	});
});
