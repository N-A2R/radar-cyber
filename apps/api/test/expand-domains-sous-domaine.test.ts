/** Un comportement par test : réalignement d'une preuve sur son hôte final. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	isSubdomainProof, repairSubdomain, type SubdomainRow,
} from "../../../scripts/expand-domains-sous-domaine.mts";

const html = "<html><head><title>Aeroport de Bordeaux Merignac</title></head><body>"
	+ "L'aeroport de Bordeaux Merignac accueille les voyageurs de Nouvelle-Aquitaine "
	+ "avec ses terminaux, ses parkings et ses liaisons routieres toute l'annee. "
	+ "Retrouvez les horaires de vol et les services de l'aeroport sur ce site.</body></html>";

function row(): SubdomainRow {
	return {
		orgId: 265810,
		name: "AEROPORT DE BORDEAUX MERIGNAC",
		domain: "aeroport.fr",
		valeur: "aeroport.fr",
		source: "domaines-reels:piste4:Q612731:http200",
		confiance: 0.95,
		preuve: {
			statut: 200,
			urlFinale: "https://www.bordeaux.aeroport.fr/",
			titre: "Aeroport de Bordeaux Merignac",
		},
	};
}

describe("verified subdomain alignment", () => {
	it("returns the exact answering host after a live strict check", async () => {
		const result = await repairSubdomain(row(), async (url) => ({ html, status: 200, finalUrl: url }));
		assert.equal(result?.host, "bordeaux.aeroport.fr");
		assert.equal(result?.verdict.ok, true);
		assert.equal(result?.preuve.racineInitiale, "aeroport.fr");
	});

	it("ignores a final URL outside the stored root", () => {
		const foreign: SubdomainRow = {
			...row(), preuve: { ...row().preuve, urlFinale: "https://www.autre-aeroport.fr/" },
		};
		assert.equal(isSubdomainProof(foreign), false);
	});

	it("ignores a proof already aligned with its final host", () => {
		const aligned: SubdomainRow = {
			...row(), domain: "bordeaux.aeroport.fr", valeur: "bordeaux.aeroport.fr",
		};
		assert.equal(isSubdomainProof(aligned), false);
	});

	it("rejects a page that fails the unchanged strict proof", async () => {
		const result = await repairSubdomain(row(), async (url) => ({ html, status: 503, finalUrl: url }));
		assert.equal(result, null);
	});
});
