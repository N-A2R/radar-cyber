/** Un comportement par test : route des mentions légales SIRENE déclarées. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	candidateLegalUrls, legalNoticeUrls, legalNoticeVerdict, selectLegalNoticeDomains, verifyLegalNotice,
} from "../../../scripts/expand-domains-mentions.mts";

function row(overrides: Partial<AliasRow> = {}): AliasRow {
	return {
		orgId: 42, name: "JESTOCKE.COM", city: "Bordeaux", dept: "33",
		identifier: "403104813", alias: "JESTOCKE.COM (WARESITO ET APPSITO)",
		aliasSource: "sirene-enseigne", ...overrides,
	};
}

function selection(overrides: Partial<AliasDomainSelection> = {}): AliasDomainSelection {
	return { row: row(), domain: "jestocke.com", identityToken: null, ...overrides };
}

const home = `<html><body><a href="/mentions-legales">Mentions légales</a>
<a href="https://www.jestocke.com/mentions-legales">Mentions légales</a>
<a href="https://www.autre.fr/mentions-legales">Mentions légales</a></body></html>`;

const legal = `<html><head><title>Jestocke — mentions légales</title></head><body>`
	+ `Jestocke édite ce site depuis Bordeaux. L'entreprise Jestocke accompagne les artisans `
	+ `de Nouvelle-Aquitaine depuis quinze ans et publie ici des conseils sur la vente en ligne, `
	+ `les outils numériques et l'hébergement des petites entreprises de la région. `
	+ `SIREN : 403 104 813. Contactez la rédaction pour toute question sur ce site.</body></html>`;

describe("SIRENE legal-notice domain route", () => {
	it("extracts and deduplicates legal links on the declared root", () => {
		const urls = legalNoticeUrls(home, "https://www.jestocke.com/", "jestocke.com");
		assert.deepEqual(urls, [
			"https://www.jestocke.com/mentions-legales",
		]);
	});

	it("rejects a legal notice hosted on another root", () => {
		assert.equal(legalNoticeUrls('<a href="https://autre.fr/mentions">Mentions</a>', "https://jestocke.com/", "jestocke.com").length, 0);
	});

	it("rejects a legal notice that does not answer 200", () => {
		const verdict = legalNoticeVerdict(legal, 404, "https://jestocke.com/mentions-legales", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "http-not-200");
	});

	it("rejects a legal notice that redirects off the declared root", () => {
		const verdict = legalNoticeVerdict(legal, 200, "https://autre.fr/mentions", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "redirect-off-root");
	});

	it("accepts a legal notice publishing the organisation's SIREN", () => {
		const verdict = legalNoticeVerdict(legal, 200, "https://jestocke.com/mentions-legales", selection());
		assert.equal(verdict.ok, true);
		assert.equal(verdict.motif, "http200-published-legal-identifier");
	});

	it("rejects a directory page listing several identifiers", () => {
		const page = `${legal} SIREN 111 111 111 SIREN 222 222 222 SIREN 333 333 333`;
		const verdict = legalNoticeVerdict(page, 200, "https://jestocke.com/mentions-legales", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "directory-page");
	});

	it("rejects a legal notice that publishes neither identifier nor two name tokens", () => {
		const verdict = legalNoticeVerdict(legal, 200, "https://jestocke.com/mentions-legales", selection({
			row: row({ identifier: "999999999" }),
		}));
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "no-published-identity");
	});

	it("accepts a legal notice publishing two distinctive name tokens", () => {
		const named = selection({ row: row({ name: "ASSIETTES COMPAGNIE", identifier: "999999999" }) });
		const page = `${legal} Les assiettes et la compagnie ont ouvert leur atelier en Gironde.`;
		const verdict = legalNoticeVerdict(page, 200, "https://jestocke.com/mentions-legales", named);
		assert.equal(verdict.ok, true);
		assert.equal(verdict.motif, "http200-published-name");
	});

	it("rejects a legal notice publishing only one name token", () => {
		const named = selection({ row: row({ name: "ASSIETTES COMPAGNIE", identifier: "999999999" }) });
		const verdict = legalNoticeVerdict(legal, 200, "https://jestocke.com/mentions-legales", named);
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "no-published-identity");
	});

	it("uses the conventional legal path when the homepage has no link", () => {
		assert.deepEqual(candidateLegalUrls("<html></html>", "https://jestocke.com/", "jestocke.com"), [
			"https://jestocke.com/mentions-legales",
			"https://jestocke.com/mentions",
			"https://jestocke.com/legal",
		]);
	});

	it("never attributes a domain to a natural person's alias", () => {
		const person = row({
			name: "CHRISTIAN HENRIQUE (E-RESSOURCES.NET)",
			alias: "E-RESSOURCES.NET",
		});
		assert.equal(selectLegalNoticeDomains([person]).length, 0);
	});

	it("re-verifies the declared root and its legal notice through an injected fetcher", async () => {
		const result = await verifyLegalNotice(selection(), async (url) => ({
			html: url.endsWith("/") ? home : legal,
			status: 200,
			finalUrl: url,
		}));
		assert.equal(result?.ok, true);
		assert.equal(result?.legalUrl, "https://jestocke.com/mentions-legales");
	});
});
