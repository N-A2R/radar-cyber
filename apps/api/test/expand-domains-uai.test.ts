/** Un comportement par test : route des sites d'établissement indexés par UAI. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	identityToken, parseUaiSite, provenanceForUai, selectUaiSites, uaiVerdict, verifyUaiSite,
} from "../../../scripts/expand-domains-uai.mts";
import type {
	UaiOrganisation, UaiSelection, UaiSite,
} from "../../../scripts/expand-domains-uai.mts";

function site(overrides: Partial<UaiSite> = {}): UaiSite {
	return {
		uai: "0160061E", url: "https://saintemarthe-chavagnes.com/",
		domain: "saintemarthe-chavagnes.com", ...overrides,
	};
}

function organisation(overrides: Partial<UaiOrganisation> = {}): UaiOrganisation {
	return {
		id: 14508, name: "Collège privé Sainte-Marthe Chavagnes", city: "Angoulême",
		dept: "16", entity_code: "0160061E", ...overrides,
	};
}

function selection(overrides: Partial<UaiSelection> = {}): UaiSelection {
	return { site: site(), organisation: organisation(), domain: site().domain, token: "chavagnes", ...overrides };
}

const html = `<html><head><title>Sainte-Marthe Chavagnes — Collège privé</title></head><body>`
	+ `Le collège Sainte-Marthe Chavagnes accueille ses élèves à Angoulême. `
	+ `L'établissement propose un enseignement général et technique, un accueil `
	+ `personnalisé et un suivi régulier des familles tout au long de l'année.</body></html>`;

describe("Wikidata UAI domain route", () => {
	it("reads a UAI and a website from one versioned row", () => {
		assert.deepEqual(parseUaiSite("uai\t0160061E\thttps://www.saintemarthe-chavagnes.com/"), {
			uai: "0160061E", url: "https://www.saintemarthe-chavagnes.com/",
			domain: "saintemarthe-chavagnes.com",
		});
	});

	it("rejects a SIRET row", () => {
		assert.equal(parseUaiSite("siret\t34371831800052\thttps://exemple.fr/"), null);
	});

	it("rejects an academy shared root", () => {
		assert.equal(parseUaiSite("uai\t0160051U\thttp://www.cio.ac-poitiers.fr/angouleme"), null);
	});

	it("rejects a school-platform subdomain root", () => {
		assert.equal(parseUaiSite("uai\t0332288H\thttps://0332288h.index-education.net/pronote/pageetablissement.html"), null);
	});

	it("extracts the name word published by the school host", () => {
		assert.equal(identityToken(organisation(), site()), "chavagnes");
	});

	it("rejects a token that only names the city", () => {
		assert.equal(identityToken(
			organisation({ name: "Collège d'Angoulême" }),
			site({ url: "https://college-angouleme.fr/", domain: "college-angouleme.fr" }),
		), null);
	});

	it("selects only the organisation carrying the exact UAI in Nouvelle-Aquitaine", () => {
		assert.deepEqual(
			selectUaiSites([site()], [organisation(), organisation({ id: 99, entity_code: "0160061F" })]),
			[selection()],
		);
	});

	it("skips a root already attributed to another organisation", () => {
		assert.deepEqual(selectUaiSites([site()], [organisation()], new Set([site().domain])), []);
	});

	it("accepts a live page naming the school in host and title", () => {
		assert.equal(uaiVerdict(html, 200, "https://saintemarthe-chavagnes.com/", selection()).ok, true);
	});

	it("rejects a page whose title does not name the school", () => {
		const verdict = uaiVerdict(html.replace(/Sainte-Marthe Chavagnes — Collège privé/, "Accueil"),
			200, "https://saintemarthe-chavagnes.com/", selection());
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "title-missing-token");
	});

	it("rejects a non-200 response", () => {
		assert.equal(uaiVerdict(html, 404, "https://saintemarthe-chavagnes.com/", selection()).ok, false);
	});

	it("retries the https variant before accepting a page", async () => {
		const tried: string[] = [];
		const fetcher = async (url: string) => {
			tried.push(url);
			if (url.startsWith("http://")) return { html: "", status: 503, finalUrl: url };
			return { html, status: 200, finalUrl: "https://saintemarthe-chavagnes.com/" };
		};
		const result = await verifyUaiSite(selection({ site: site({ url: "http://saintemarthe-chavagnes.com/" }) }), fetcher);
		assert.equal(result?.ok, true);
		assert.equal(tried.length, 2);
	});

	it("records the UAI and the live HTTP proof as provenance", () => {
		const proof = provenanceForUai(selection(), uaiVerdict(html, 200, "https://saintemarthe-chavagnes.com/", selection()));
		assert.equal(proof.preuve.uai, "0160061E");
		assert.equal(proof.preuve.statut, 200);
	});
});
