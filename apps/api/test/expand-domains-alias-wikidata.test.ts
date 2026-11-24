import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	SOURCE, indexAliases, normalizeAlias, parseWikidataSites, previouslyUsedQids,
	provenanceForAliasSite, selectAliasSites, verifyAliasSite,
	type AliasMatch, type AliasRow, type AliasSiteResult, type WikidataSite,
} from "../../../scripts/expand-domains-alias-wikidata.mts";
import type { Organisation } from "../../../scripts/expand-domains.mts";

function org(id: number, name: string): Organisation {
	return { id, name, city: null, dept: "33", siren: null, domain: null };
}

const wikidata: WikidataSite = {
	qid: "Q1004159", url: "https://www.semens.fr/", label: "Semens",
};
const aliases: AliasRow[] = [
	{ orgId: 1, alias: "Mairie de Semens", source: "referentiel-na", name: "Commune de Semens" },
	{ orgId: 2, alias: "Semens", source: "finess", name: "EHPAD SEMENS" },
];
const organisations = new Map([[1, org(1, "COMMUNE DE SEMENS")], [2, org(2, "EHPAD SEMENS")]]);

function selection(): AliasMatch {
	return {
		qid: wikidata.qid, url: wikidata.url, label: wikidata.label,
		alias: "Mairie de Semens", identityName: "semens",
		org: organisations.get(1)!, domain: "semens.fr",
	};
}

const html = "<html><head><title>Mairie de Semens</title></head><body>"
	+ "La commune de Semens publie sur ce site les horaires de la mairie, "
	+ "les délibérations du conseil municipal et les informations utiles aux habitants "
	+ "de la Nouvelle-Aquitaine pour l'année en cours.</body></html>";

describe("Wikidata label matched through a public alias", () => {
	it("normalises accents and civic words to one comparison key", () => {
		assert.equal(normalizeAlias("Mairie de Saint-Germain-d'Esteuil"), "germain esteuil");
	});

	it("keeps an alias only when it names one organisation", () => {
		assert.equal(indexAliases(aliases).get("semens"), undefined);
		assert.equal(indexAliases([aliases[0]]).get("semens")?.orgId, 1);
	});

	it("reads only well-formed cached Wikidata P856 rows", () => {
		assert.deepEqual(parseWikidataSites([
			"Q1004159\thttps://www.semens.fr/\tSemens",
			"not-a-qid\thttps://semens.fr\tSemens",
			"Q1004160\tftp://semens.fr\tSemens",
		]), [wikidata]);
	});

	it("refuses a QID already written or a root already attributed", () => {
		const usedQids = new Set(["Q1004159"]);
		assert.deepEqual(selectAliasSites(
			[wikidata], indexAliases([aliases[0]]), usedQids, new Set(), organisations,
		), []);
		assert.deepEqual(selectAliasSites(
			[wikidata], indexAliases([aliases[0]]), new Set(), new Set(["semens.fr"]), organisations,
		), []);
	});

	it("accepts the official page when the Wikidata label is published on its own root", async () => {
		const fetcher = async (url: string) => ({ html, status: 200, finalUrl: url });
		const result = await verifyAliasSite(selection(), fetcher);
		assert.equal(result?.verdict.token, "semens");
		assert.equal(result?.url, wikidata.url);
	});

	it("refuses a page redirected to another root", async () => {
		const fetcher = async () => ({ html, status: 200, finalUrl: "https://ailleurs.fr/" });
		assert.equal(await verifyAliasSite(selection(), fetcher), null);
	});

	it("traces the QID, the public alias and the answering page in the proof", () => {
		const result: AliasSiteResult = {
			verdict: {
				ok: true, motif: "http200-title-and-body", token: "semens", confidence: 0.95,
				title: "Mairie de Semens", status: 200, finalUrl: wikidata.url, htmlLength: html.length,
			},
			url: wikidata.url, tried: [wikidata.url],
		};
		const proof = provenanceForAliasSite(selection(), result);
		assert.equal(proof.source, SOURCE);
		assert.equal(proof.preuve.qid, wikidata.qid);
		assert.equal(proof.preuve.alias, "Mairie de Semens");
		assert.equal(proof.preuve.urlFinale, wikidata.url);
	});

	it("does not exclude QIDs from a dry run or from its own result file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "alias-wikidata-"));
		try {
			await writeFile(join(dir, "dry.json"), JSON.stringify({ applied: false, domains: [{ qid: "Q1" }] }));
			await writeFile(join(dir, "applied.json"), JSON.stringify({ applied: true, domains: [{ qid: "Q2" }] }));
			assert.deepEqual([...(await previouslyUsedQids(dir, "applied.json"))], []);
			assert.deepEqual([...(await previouslyUsedQids(dir, "dry.json"))], ["Q2"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
