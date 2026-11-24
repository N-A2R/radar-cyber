/** Un comportement par test : communiqués officiels versionnés et racine prouvée. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	SOURCE, namedRoot, officialCommuniques, provenanceForCommunique, verifyCommuniqueRoot,
	type CommuniqueRow, type CommuniqueResult, type CommuniqueSelection,
} from "../../../scripts/expand-domains-communiques.mts";

const official: CommuniqueRow = {
	id: "gir-couv-012",
	organisation: "Dedalus — healthcare solutions",
	source: "Dedalus (communiqué officiel)",
	url: "https://www.dedalus.com/actualites/incident",
};

function selection(): CommuniqueSelection {
	return {
		row: official, orgId: 42, name: "DEDALUS PRIVATE HEALTHCARE SOLUTIONS",
		siren: "403104813", domain: "dedalus.com", token: "dedalus",
	};
}

const html = "<html><head><title>Dedalus — solutions de santé</title></head><body>"
	+ "Dedalus accompagne les établissements de santé dans la gestion de leurs systèmes "
	+ "d'information. Nos équipes publient régulièrement des informations sur la sécurité "
	+ "des services numériques et la continuité des soins en Nouvelle-Aquitaine.</body></html>";

describe("official communiqué root route", () => {
	it("keeps only official first-party statements", () => {
		const press = { ...official, id: "p1", source: "Sud Ouest" };
		assert.deepEqual(officialCommuniques([official, press]), [official]);
	});

	it("extracts a named root, never a city or a generic label", () => {
		assert.deepEqual(namedRoot(official), { domain: "dedalus.com", token: "dedalus" });
		assert.equal(namedRoot({ ...official, url: "https://ville.fr/contact" }), null);
	});

	it("accepts the official root only with the strict published-name proof", async () => {
		const fetcher = async (url: string) => ({ html, status: 200, finalUrl: url });
		const result = await verifyCommuniqueRoot(selection(), fetcher);
		assert.equal(result?.url, "https://dedalus.com/");
		assert.equal(result?.verdict.token, "dedalus");
	});

	it("rejects a root redirected to a different host", async () => {
		const fetcher = async () => ({ html, status: 200, finalUrl: "https://ailleurs.fr/" });
		assert.equal(await verifyCommuniqueRoot(selection(), fetcher), null);
	});

	it("traces the versioned communiqué and the verified root in the proof", () => {
		const result: CommuniqueResult = {
			verdict: {
				ok: true, motif: "http200-title-and-body", token: "dedalus", confidence: 0.95,
				title: "Dedalus — solutions de santé", status: 200,
				finalUrl: "https://dedalus.com/", htmlLength: html.length,
			},
			url: "https://dedalus.com/",
		};
		const proof = provenanceForCommunique(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.corpusId, "gir-couv-012");
		assert.equal(proof.preuve.urlCommunique, official.url);
		assert.equal(proof.preuve.urlRacine, result.url);
	});
});
