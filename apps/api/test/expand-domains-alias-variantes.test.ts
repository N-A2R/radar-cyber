/** Un comportement par test : variantes d'hôte d'un alias SIRENE déclaré. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	aliasHostVariants, provenanceForAliasVariant, verifyAliasVariant, SOURCE,
	type AliasVariantResult,
} from "../../../scripts/expand-domains-alias-variantes.mts";
import type { AliasDomainSelection, AliasRow } from "../../../scripts/expand-domains-alias-domaine.mts";

function selection(overrides: Partial<AliasDomainSelection> = {}): AliasDomainSelection {
	const row: AliasRow = {
		orgId: 42, name: "NUTSY.NET", city: "Bordeaux", dept: "33",
		identifier: "403104813", alias: "SARL NUTSY.NET", aliasSource: "sirene-nom",
	};
	return { row, domain: "nutsy.net", identityToken: "nutsy", ...overrides };
}

const html = "<html><head><title>Nutsy</title></head><body>"
	+ "Nutsy accompagne les artisans de Nouvelle-Aquitaine depuis quinze ans. "
	+ "Nos équipes répondent aux commandes et publient chaque semaine des conseils "
	+ "sur la vente en ligne et les outils numériques des petites entreprises.</body></html>";

describe("SIRENE alias host variant route", () => {
	it("proposes both protocols and both www prefixes of the alias root", () => {
		assert.deepEqual(aliasHostVariants("nutsy.net"), [
			"https://nutsy.net/", "https://www.nutsy.net/",
			"http://nutsy.net/", "http://www.nutsy.net/",
		]);
	});

	it("accepts the http root when the https root never answered", async () => {
		const fetcher = async (url: string) => url === "http://nutsy.net/"
			? { html, status: 200, finalUrl: url }
			: { html: "", status: 503, finalUrl: url };
		const result = await verifyAliasVariant(selection(), fetcher);
		assert.equal(result?.url, "http://nutsy.net/");
		assert.equal(result?.verdict.identity, "nutsy");
	});

	it("rejects a variant redirected off the declared root", async () => {
		const fetcher = async (url: string) => ({ html, status: 200, finalUrl: "https://exemple.fr/" });
		assert.equal(await verifyAliasVariant(selection(), fetcher), null);
	});

	it("rejects a live variant that does not publish the organisation identity", async () => {
		const anonymous = html.replaceAll("Nutsy", "La maison");
		const fetcher = async (url: string) => ({ html: anonymous, status: 200, finalUrl: url });
		assert.equal(await verifyAliasVariant(selection(), fetcher), null);
	});

	it("traces the alias and the answering variant in the proof", () => {
		const result: AliasVariantResult = {
			verdict: {
				ok: true, motif: "http200-published-name", status: 200,
				finalUrl: "http://nutsy.net/", title: "Nutsy", htmlLength: html.length,
				identifiersOnPage: 0, identity: "nutsy",
			},
			url: "http://nutsy.net/",
			tried: ["https://nutsy.net/", "https://www.nutsy.net/", "http://nutsy.net/"],
		};
		const proof = provenanceForAliasVariant(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.urlSource, "https://nutsy.net");
		assert.equal(proof.preuve.urlReponse, "http://nutsy.net/");
		assert.equal(proof.preuve.tentatives, 3);
	});
});
