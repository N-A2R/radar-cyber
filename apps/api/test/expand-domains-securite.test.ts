/** Un comportement par test : domaines publics observés par le corpus TLS/DMARC. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	CORPUS, SOURCE, chooseOrganisation, compactName, domainTokens, parseObservations,
	provenanceForObservation, verifyObservation, type NamedOrganisation,
} from "../../../scripts/expand-domains-securite.mts";

function org(id: number, name: string, nameNorm: string): NamedOrganisation {
	return { id, name, name_norm: nameNorm, city: "Bordeaux", dept: "33", siren: null, domain: null };
}

const observation = {
	domain: "gyrax.fr", sector: "agroalimentaire", observedAt: "2026-11-22T00:00:00.000Z",
};

function selection(organisation = org(1, "GYRAX", "gyrax")) {
	return { observation, organisation, domain: "gyrax.fr", token: "gyrax" };
}

const page = `<html><head><title>GYRAX</title></head><body><p>L'entreprise GYRAX accompagne
les coopératives agricoles de Nouvelle-Aquitaine depuis plus de trente ans. Cette page publique
décrit son activité et permet de vérifier l'identité du site sans donnée personnelle.</p></body></html>`;

describe("public security-observation domains", () => {
	it("keeps one unique registered root per observation", () => {
		const rows = parseObservations([
			JSON.stringify(observation),
			JSON.stringify(observation),
			JSON.stringify({ domain: "sous.gyrax.fr" }),
			"not json",
			JSON.stringify({ domain: "allianceforetsbois.fr" }),
		]);
		assert.deepEqual(rows.map((row) => row.domain), ["gyrax.fr", "allianceforetsbois.fr"]);
	});

	it("extracts only distinctive root labels, never the TLD", () => {
		assert.deepEqual(domainTokens("cave-irouleguy.com"), ["irouleguy"]);
		assert.ok(!domainTokens("agglo-agen.net").includes("agglo"));
	});

	it("compacts accents and punctuation for exact root matching", () => {
		assert.equal(compactName("Cave d'Irouléguy"), "cavedirouleguy");
	});

	it("chooses the exact organisation named by the root", () => {
		const matches = [org(2, "PERNOD PHILIPPE", "pernod philippe"), org(3, "GYRAX", "gyrax")];
		assert.equal(chooseOrganisation(matches, "gyrax.fr", "gyrax")?.id, 3);
	});

	it("refuses a personal name when several legal entities share the token", () => {
		const matches = [org(4, "CAMUS SARL", "camus sarl"), org(5, "CAMUS MATHIEU", "camus mathieu")];
		assert.equal(chooseOrganisation(matches, "camus.fr", "camus"), null);
	});

	it("accepts only a live page on the observed root", async () => {
		const result = await verifyObservation(selection(), async () => ({
			html: page, status: 200, finalUrl: "https://gyrax.fr/",
		}));
		assert.equal(result?.verdict.ok, true);
		assert.equal(result?.verdict.token, "gyrax");
	});

	it("rejects an observed domain redirected to another root", async () => {
		const result = await verifyObservation(selection(), async () => ({
			html: page, status: 200, finalUrl: "https://annuaire.fr/gyrax",
		}));
		assert.equal(result, null);
	});

	it("traces the corpus observation and the live answer in the proof", async () => {
		const result = await verifyObservation(selection(), async () => ({
			html: page, status: 200, finalUrl: "https://gyrax.fr/",
		}));
		assert.ok(result);
		const proof = provenanceForObservation(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.corpus, CORPUS);
		assert.equal(proof.preuve.jetonRacine, "gyrax");
		assert.equal(proof.preuve.urlFinale, "https://gyrax.fr/");
		assert.equal(proof.preuve.statut, 200);
	});
});
