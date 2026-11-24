/** Un comportement par test : sites municipaux cités par le corpus versionné. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	citedCommuneVerdict, nameDesignatesExactCommune, parseCitedSite, provenanceForCited,
	rootNamesCommune, selectCitedDomains, verifyCitedDomain,
} from "../../../scripts/expand-domains-communes-citees.mts";
import { loadCommunes, type Commune, type PageFetch } from "../../../scripts/expand-domains-communes-na.mts";

const raw = JSON.stringify({
	departements: [{ code: "16", nom: "Charente" }, { code: "64", nom: "Pyrénées-Atlantiques" }],
	communes: [
		{ code: "16001", nom: "Abzac", dept: "16", codesPostaux: ["16500"] },
		{ code: "64001", nom: "Ger", dept: "64", codesPostaux: ["64100"] },
		{ code: "64002", nom: "Boumourt", dept: "64", codesPostaux: ["64100"] },
	],
});
const communes = loadCommunes(raw);
const abzac = communes.find((row) => row.code === "16001")!;
const site = {
	commune: "Abzac", dept: "16", url: "https://www.abzac.fr/accueil", domain: "abzac.fr",
};
const organisation = { id: 42, name: "Commune de Abzac", dept: "16" };
const html = `<html><head><title>Mairie d'Abzac — Charente</title></head><body>
<p>La mairie d'Abzac accueille les habitants de la commune du lundi au vendredi.
Le conseil municipal se réunit en mairie. Pour vos démarches d'état civil,
écrivez à la mairie, 16500 Abzac, Charente. Le service est ouvert toute l'année.</p>
</body></html>`;

describe("Vergers : racines municipales citées par le corpus", () => {
	it("ne garde que les lignes HTTP 200 avec une URL officielle de Nouvelle-Aquitaine", () => {
		const ok = JSON.stringify({
			statut_http: 200, source_candidat: "https://www.abzac.fr/", commune: "Abzac", departement: "16",
		});
		const dead = ok.replace('"statut_http":200', '"statut_http":404');
		const outside = ok.replace('"departement":"16"', '"departement":"75"');
		assert.deepEqual(parseCitedSite(ok)?.domain, "abzac.fr");
		assert.equal(parseCitedSite(dead), null);
		assert.equal(parseCitedSite(outside), null);
	});

	it("rejette une racine de média ou d'hébergeur", () => {
		const media = JSON.stringify({
			statut_http: 200, source_candidat: "https://www.sudouest.fr/abzac", commune: "Abzac", departement: "16",
		});
		assert.equal(parseCitedSite(media), null);
	});

	it("exige que la racine nomme la commune citée", () => {
		assert.equal(rootNamesCommune(site), true);
		assert.equal(rootNamesCommune({ ...site, commune: "Boumourt", domain: "urt.fr" }), false);
	});

	it("n'apparie pas une commune dont le nom est seulement contenu dans celui de l'organisation", () => {
		const ger: Commune = communes.find((row) => row.code === "64001")!;
		assert.equal(nameDesignatesExactCommune("Commune de Ger", ger), true);
		assert.equal(nameDesignatesExactCommune("Commune de Gerderest", ger), false);
	});

	it("accepte une commune de trois lettres nommée dans une page municipale", () => {
		const dax: Commune = {
			code: "40072", nom: "Dax", slug: "dax", dept: "40", deptName: "landes",
			postalCodes: ["40100"],
		};
		const page = `<html><head><title>Mairie de Dax — Landes</title></head><body>
		<p>La mairie de Dax accueille les habitants de la commune du lundi au vendredi.
		Le conseil municipal se réunit à l'hôtel de ville, 40100 Dax, dans les Landes.
		Les services d'état civil et les démarches administratives sont ouverts toute
		l'année aux habitants de la ville et des communes voisines.</p></body></html>`;
		const verdict = citedCommuneVerdict(page, 200, "https://www.dax.fr/", {
			organisation: { id: 7, name: "Commune de Dax", dept: "40" },
			commune: dax, domain: "dax.fr", sourceUrl: "https://www.dax.fr/",
		});
		assert.equal(verdict.ok, true);
		assert.equal(verdict.token, "Dax");
	});

	it("rejette une redirection hors de la racine citée", () => {
		const verdict = citedCommuneVerdict(html, 200, "https://autre.fr/", {
			organisation, commune: abzac, domain: "abzac.fr", sourceUrl: site.url,
		});
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "redirect-off-root");
	});

	it("rejette une page qui ne nomme pas la commune", () => {
		const anonyme = html.replace(/Abzac/g, "Ville");
		const verdict = citedCommuneVerdict(anonyme, 200, "https://www.abzac.fr/", {
			organisation, commune: abzac, domain: "abzac.fr", sourceUrl: site.url,
		});
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "commune-name-absent");
	});

	it("ignore une racine déjà attribuée à une autre organisation", () => {
		assert.deepEqual(selectCitedDomains([organisation], [abzac], [site], new Set(["abzac.fr"])), []);
	});

	it("revérifie en direct l'URL citée avant d'accepter la racine", async () => {
		const urls: string[] = [];
		const fetcher: PageFetch = async (url) => {
			urls.push(url);
			return { html, status: 200, finalUrl: "https://www.abzac.fr/" };
		};
		const verdict = await verifyCitedDomain({
			organisation, commune: abzac, domain: "abzac.fr", sourceUrl: site.url,
		}, fetcher);
		assert.equal(verdict?.ok, true);
		assert.deepEqual(urls, [site.url]);
	});

	it("trace le corpus cité et l'URL finale dans la preuve", () => {
		const selection = selectCitedDomains([organisation], [abzac], [site])[0];
		const verdict = {
			ok: true, motif: "http200-commune-locale", token: "abzac", confidence: 0.95,
			title: "Mairie d'Abzac", status: 200, finalUrl: "https://www.abzac.fr/", htmlLength: html.length,
		};
		const proof = provenanceForCited(selection, verdict);
		assert.equal(proof.source, "source:presse-communale:url-citee:http200");
		assert.equal(proof.preuve.reference, "bench/corpus/presse-communale.jsonl");
		assert.equal(proof.preuve.urlSource, site.url);
	});
});
