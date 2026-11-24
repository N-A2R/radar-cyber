/** Un comportement par test : route des sites indexés par identifiant public. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	identityToken, parseRegistrySite, provenanceForRegistry, registryVerdict,
	selectRegistrySites, verifyRegistrySite,
} from "../../../scripts/expand-domains-registre.mts";
import type {
	RegistryOrganisation, RegistrySelection, RegistrySite,
} from "../../../scripts/expand-domains-registre.mts";

function site(overrides: Partial<RegistrySite> = {}): RegistrySite {
	return {
		kind: "finess", id: "870013240", url: "https://pharmacie-desvignes.fr/",
		domain: "pharmacie-desvignes.fr", ...overrides,
	};
}

function organisation(overrides: Partial<RegistryOrganisation> = {}): RegistryOrganisation {
	return {
		id: 42, name: "PHARMACIE DESVIGNES", city: "Nantiat", dept: "87",
		siren: null, entity_code: "870013240", entity_source: "finess", ...overrides,
	};
}

function selection(overrides: Partial<RegistrySelection> = {}): RegistrySelection {
	return { site: site(), organisation: organisation(), domain: site().domain, token: "desvignes", ...overrides };
}

const counts = new Map([["desvignes", 1], ["pharmacie", 3]]);
const html = `<html><head><title>Pharmacie Desvignes | Nantiat</title></head><body>`
	+ `Pharmacie Desvignes, officine à Nantiat en Haute-Vienne. `
	+ `L'équipe accueille les patients du lundi au samedi et propose `
	+ `des conseils personnalisés, la délivrance des ordonnances et un service de garde.</body></html>`;

describe("public identifier registry domain route", () => {
	it("reads a legal identifier and site from one versioned row", () => {
		const row = parseRegistrySite("finess\t870013240\thttps://pharmacie-desvignes.fr/\n");
		assert.equal(row?.id, "870013240");
		assert.equal(row?.domain, "pharmacie-desvignes.fr");
	});

	it("rejects a malformed legal identifier", () => {
		assert.equal(parseRegistrySite("siret\t12\thttps://exemple.fr/"), null);
	});

	it("rejects a page hosted on a public directory root", () => {
		assert.equal(parseRegistrySite("finess\t870013240\thttps://www.sante.fr/pharmacie-desvignes"), null);
	});

	it("extracts the name word published by the site host", () => {
		assert.equal(identityToken(organisation(), site().domain, counts), "desvignes");
	});

	it("rejects a group variant that cannot identify one establishment", () => {
		assert.equal(identityToken(organisation({ name: "LABORATOIRE MEDILAB GROUP (4)" }),
			"medilab-group.eu", new Map([["medilab", 1]])), null);
	});

	it("selects only the organisation carrying the exact public identifier", () => {
		const selected = selectRegistrySites([site()], [organisation()]);
		assert.equal(selected.length, 1);
		assert.equal(selected[0].token, "desvignes");
	});

	it("rejects an ambiguous name shared by two matched organisations", () => {
		const other = organisation({ id: 43, entity_code: "870013241", name: "ETABLISSEMENT DESVIGNES" });
		assert.equal(selectRegistrySites(
			[site(), site({ id: "870013241", domain: "desvignes-sud.fr" })],
			[organisation(), other],
		).length, 0);
	});

	it("accepts a live page naming the organisation in host and title", () => {
		assert.equal(registryVerdict(html, 200, "https://pharmacie-desvignes.fr/", selection()).ok, true);
	});

	it("rejects a page whose title does not name the organisation", () => {
		const page = html.replace("<title>Pharmacie Desvignes | Nantiat</title>", "<title>Accueil</title>");
		assert.equal(registryVerdict(page, 200, "https://pharmacie-desvignes.fr/", selection()).motif,
			"title-missing-token");
	});

	it("rejects a non-200 response", () => {
		assert.equal(registryVerdict(html, 404, "https://pharmacie-desvignes.fr/", selection()).ok, false);
	});

	it("re-verifies the registered URL before accepting it", async () => {
		const result = await verifyRegistrySite(selection(), async () => ({
			html, status: 200, finalUrl: "https://pharmacie-desvignes.fr/",
		}));
		assert.equal(result?.ok, true);
	});

	it("records the public identifier and live proof as provenance", () => {
		const verdict = registryVerdict(html, 200, "https://pharmacie-desvignes.fr/", selection());
		const proof = provenanceForRegistry(selection(), verdict);
		assert.equal(proof.source, "source:registre-identifiant:http200");
		assert.equal(proof.preuve.valeur, "870013240");
		assert.equal(proof.preuve.urlFinale, "https://pharmacie-desvignes.fr/");
	});
});
