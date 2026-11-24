/** One behaviour per test: hardened Wikidata P856 candidate verification. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lookup } from "node:dns/promises";
import {
	confirmP856, fetchOfficialPage, isPrivateAddress, matchesOfficialUrl,
	provenanceFor, publicHostname, resolvesToPublicHost, selectOfficialCandidates,
	verifySelection, type OfficialCandidate, type Organisation, type OfficialSelection,
} from "../../../scripts/expand-domains-candidats-officiels.mts";

const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as unknown as typeof lookup;
const privateDns = (async () => [{ address: "10.4.2.1", family: 4 }]) as unknown as typeof lookup;

function page(html: string, status = 200, headers: HeadersInit = {}): Response {
	return new Response(html, { status, headers });
}

function candidate(overrides: Partial<OfficialCandidate> = {}): OfficialCandidate {
	return {
		qid: "Q1000796", url: "http://www.ville-boulazac.fr", label: "Boulazac",
		corpus: "wikidata-na-sites.tsv", ...overrides,
	};
}

function organisation(overrides: Partial<Organisation> = {}): Organisation {
	return {
		id: 12, name: "BOULAZAC", city: "Boulazac", dept: "24", siren: "212400123", ...overrides,
	};
}

function selection(overrides: Partial<OfficialSelection> = {}): OfficialSelection {
	return {
		candidate: candidate(), organisation: organisation(),
		domain: "ville-boulazac.fr", officialUrl: "http://www.ville-boulazac.fr",
		...overrides,
	};
}

const validHtml = "<html><head><title>Boulazac — accueil</title></head><body>"
	+ "La commune de Boulazac accueille ses habitants toute l'année"
	+ " avec ses services municipaux et ses actualités locales.</body></html>";

describe("official Wikidata candidate route", () => {
	it("accepts an RFC-shaped public hostname only", () => {
		assert.equal(publicHostname("https://www.ville-boulazac.fr/actualites"), "ville-boulazac.fr");
		assert.equal(publicHostname("http://127.0.0.1/"), null);
		assert.equal(publicHostname("http://user:pass@ville-boulazac.fr/"), null);
		assert.equal(publicHostname("http://mairie.local/"), null);
		assert.equal(publicHostname("http://mairie.fr:8080/"), null);
	});

	it("rejects private, loopback and documentation addresses", () => {
		for (const address of ["127.0.0.1", "10.4.2.1", "192.168.1.1", "169.254.169.254",
			"100.64.0.1", "::1", "fd00::1", "::ffff:172.16.0.1", "203.0.113.10"]) {
			assert.equal(isPrivateAddress(address), true, address);
		}
		assert.equal(isPrivateAddress("93.184.216.34"), false);
		assert.equal(isPrivateAddress("2606:4700::1111"), false);
	});

	it("refuses a host as soon as one DNS answer is private", async () => {
		assert.equal(await resolvesToPublicHost("ville-boulazac.fr", publicDns), true);
		assert.equal(await resolvesToPublicHost("ville-boulazac.fr", privateDns), false);
	});

	it("validates every redirect hop before the next HTTP request", async () => {
		let calls = 0;
		const fetcher = (async () => {
			calls += 1;
			return page("", 302, { location: "http://127.0.0.1/admin" });
		}) as unknown as typeof fetch;
		await assert.rejects(
			fetchOfficialPage("http://ville-boulazac.fr", { dnsLookup: publicDns, fetcher }),
			/unsafe-hostname/,
		);
		assert.equal(calls, 1);
	});

	it("records the real final URL and hop count after a safe redirect", async () => {
		const fetcher = (async (url: string | URL) => url.toString().includes("ville-boulazac")
			? page("", 301, { location: "https://www.ville-boulazac.fr/" })
			: page(validHtml)) as unknown as typeof fetch;
		const result = await fetchOfficialPage("http://ville-boulazac.fr", {
			dnsLookup: publicDns, fetcher,
		});
		assert.equal(result.status, 200);
		assert.equal(result.finalUrl, "https://www.ville-boulazac.fr/");
		assert.equal(result.hops, 1);
	});

	it("confirms only URLs still published by the official Wikidata API", async () => {
		const body = JSON.stringify({ entities: { Q1000796: {
			claims: { P856: [{ mainsnak: { datavalue: { value: "http://www.ville-boulazac.fr/" } } }] },
		} } });
		const fetcher = async () => ({ html: body, status: 200 });
		const confirmed = await confirmP856(["Q1000796"], fetcher);
		assert.equal(matchesOfficialUrl(candidate().url, confirmed.get("Q1000796") ?? []),
			"http://www.ville-boulazac.fr/");
		assert.equal(matchesOfficialUrl("http://www.autre-ville.fr", confirmed.get("Q1000796") ?? []), null);
	});

	it("selects an exact label match and accounts for every refusal", () => {
		const result = selectOfficialCandidates(
			[candidate(), candidate({ qid: "Q2", url: "https://autre.fr", label: "Introuvable" })],
			[organisation()], new Set(["deja-attribue.fr"]), new Set(),
			new Map([["Q1000796", ["http://www.ville-boulazac.fr"]]]),
		);
		assert.equal(result.selections.length, 1);
		assert.deepEqual(result.refusals, { "wikidata-claim-unconfirmed": 1 });
	});

	it("accepts a live 200 page naming the organisation and records proof", async () => {
		const fetcher = (async () => page(validHtml)) as unknown as typeof fetch;
		const result = await verifySelection(selection(), { dnsLookup: publicDns, fetcher });
		assert.ok("verdict" in result);
		if (!("verdict" in result)) return;
		assert.equal(result.verdict.ok, true);
		assert.equal(result.verdict.status, 200);
		const proof = provenanceFor(selection(), result.verdict, result.hops);
		assert.equal(proof.source, "wikidata:P856:candidats-officiels:http200");
		assert.equal(proof.preuve.qid, "Q1000796");
		assert.equal(proof.preuve.urlFinale, selection().candidate.url);
		assert.ok(proof.confiance >= 0.8);
	});

	it("refuses a thin page even when the host is public", async () => {
		const fetcher = (async () => page("<html><body>Boulazac</body></html>")) as unknown as typeof fetch;
		const result = await verifySelection(selection(), { dnsLookup: publicDns, fetcher });
		assert.deepEqual(result, { refusal: "content-too-short" });
	});
});
