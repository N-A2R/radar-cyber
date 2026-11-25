/** Fusion des 15 fichiers expand-*.test.ts : un comportement par test. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	provenanceForAnnuaire, selectAnnuaireCandidates, verifyAnnuaireCandidate,
	SOURCE as ANNUAIRE_SOURCE,
} from "../../../scripts/expand-domains-annuaire.mts";
import {
	provenanceForExposition, selectExpositionCandidates, type ExpositionRow,
} from "../../../scripts/expand-domains-exposition.mts";
import {
	distinctiveTokens, domainRoot, pageVerdict, parseCandidate, provenanceFor,
	selectCandidates, type Candidate, type Organisation,
} from "../../../scripts/expand-domains.mts";
import {
	isNamedDomainUrl, provenanceForNamedDomain, selectNamedDomainCandidates,
	verifyNamedDomain, SOURCE as NAMED_DOMAIN_SOURCE, type NamedDomainResult,
} from "../../../scripts/expand-domains-domain-label.mts";
import {
	compact, excludeKnownCandidates, labelTokens, parseGeoCandidates, parseSparqlBinding,
	provenanceForGeo, selectByLabel, type GeoCandidate, type GeoSelection,
} from "../../../scripts/expand-domains-geo.mts";
import {
	provenanceForGroup, selectGroupCandidates, verifyGroupCandidate,
	SOURCE as GROUPE_SOURCE, type GroupResult,
} from "../../../scripts/expand-domains-groupe.mts";
import {
	HQ_SOURCE, SPARQL_QUERY, loadPriorQids, parsePriorQids, provenanceForHq,
} from "../../../scripts/expand-domains-hq.mts";
import { isRepairable, repairProof, type UnprovenRow } from "../../../scripts/expand-domains-preuve.mts";
import {
	provenanceForRegionalRoot, selectRegionalRootMatches,
} from "../../../scripts/expand-domains-racine-regionale.mts";
import {
	excludeAttributedCandidates, labelsFromReport, labelMatches, provenanceForRacine,
	rootTokens, selectByRootToken,
} from "../../../scripts/expand-domains-racine.mts";
import {
	provenanceForRetry, retryUrls, SOURCE as RETRY_SOURCE, verifyWithRetry, type PageFetch,
} from "../../../scripts/expand-domains-retry.mts";
import {
	isDedicatedPageUrl, provenanceForShared, selectSharedCandidates,
	verifySharedCandidate, SOURCE as SHARED_SOURCE, type SharedResult,
} from "../../../scripts/expand-domains-shared.mts";
import {
	MAX_SIRENS_ON_PAGE, selectSirenCandidates, sirenVerdict, verifySirenCandidate,
} from "../../../scripts/expand-domains-siren.mts";
import { isSubdomainProof, repairSubdomain, type SubdomainRow } from "../../../scripts/expand-domains-sous-domaine.mts";
import {
	hostVariants, provenanceForVariant, selectVariantCandidates, verifyVariant,
	SOURCE as VARIANT_SOURCE, type VariantResult,
} from "../../../scripts/expand-domains-variantes.mts";

describe("expand-domains (suite fusionnée)", () => {
	describe("expand domains", () => {
		const org: Organisation = {
			id: 7, name: "BARRAULT (THOUARS)", city: "THOUARS", dept: "79", siren: "012345678", domain: null,
		};
		const candidate = { siren: "012345678", url: "https://www.barrault.fr/", qid: "Q123" };
		const body = `<html><head><title>Barrault — Thouars</title></head><body><p>${
			"Barrault proposes industrial solutions in Thouars and Nouvelle-Aquitaine. ".repeat(3)
		}</p></body></html>`;

		it("parses only complete Wikidata SIREN/site/QID rows", () => {
			assert.deepEqual(parseCandidate("006080170\thttp://www.coop-breizh.fr/\tQ2996566"), {
				siren: "006080170", url: "http://www.coop-breizh.fr/", qid: "Q2996566",
			});
			assert.equal(parseCandidate("abc\thttps://x.fr\tQ1"), null);
			assert.equal(parseCandidate("123\thttps://x.fr"), null);
		});

		it("returns a canonical root and rejects non-domain hosts", () => {
			assert.equal(domainRoot("https://www.angouleme.fr/actualite"), "angouleme.fr");
			assert.equal(domainRoot("http://127.0.0.1/"), null);
			assert.equal(domainRoot("javascript:alert(1)"), null);
		});

		it("extracts accent-free distinctive tokens", () => {
			assert.deepEqual(distinctiveTokens("Commune d'Angoulême", "Angoulême"), ["angouleme"]);
			assert.equal(distinctiveTokens("Ville de Cognac", "Cognac").includes("ville"), false);
		});

		it("selects unique Nouvelle-Aquitaine organisations still missing a domain", () => {
			const selected = selectCandidates(
				[candidate, candidate],
				[
					org,
					{ ...org, id: 8, domain: "deja.fr" },
					{ ...org, id: 9, dept: "75" },
				],
			);
			assert.equal(selected.length, 1);
			assert.equal(selected[0].domain, "barrault.fr");
			assert.equal(selected[0].organisation.id, 7);
		});

		it("verifies HTTP 200, same root, content and a name token", () => {
			const accepted = pageVerdict(body, 200, "https://www.barrault.fr/accueil", org, "barrault.fr");
			assert.equal(accepted.ok, true);
			assert.equal(accepted.token, "barrault");
			assert.equal(accepted.confidence, 0.95);
			assert.equal(pageVerdict(body, 404, "https://www.barrault.fr/", org, "barrault.fr").motif, "http-not-200");
			assert.equal(pageVerdict(body, 200, "https://autre.fr/", org, "barrault.fr").motif, "redirect-off-root");
			assert.equal(pageVerdict("<p>trop court</p>", 200, "https://www.barrault.fr/", org, "barrault.fr").motif, "content-too-short");
			assert.equal(pageVerdict(body.replace(/Barrault|Thouars/g, "Ailleurs"), 200, "https://www.barrault.fr/", org, "barrault.fr").motif, "no-distinctive-token");
		});

		it("builds traceable provenance for an accepted domain", () => {
			const selection = selectCandidates([candidate], [org])[0];
			const proof = provenanceFor(selection, pageVerdict(body, 200, "https://www.barrault.fr/", org, "barrault.fr"));
			assert.equal(proof.source, "wikidata:P856:http200");
			assert.equal(proof.preuve.qid, "Q123");
			assert.equal(proof.preuve.statut, 200);
			assert.equal(proof.preuve.token, "barrault");
		});
	});

	describe("expand domains by domain root (racine)", () => {
		const candidate: Candidate = { siren: "111111111", url: "https://www.barrault.fr/", qid: "Q123" };
		const org: Organisation = {
			id: 7, name: "BARRAULT (THOUARS)", city: "THOUARS", dept: "79", siren: "999999999", domain: null,
		};
		const verdict = pageVerdict(
			`<html><head><title>Barrault</title></head><body><p>${"Barrault industrial solutions in Thouars. ".repeat(4)}</p></body></html>`,
			200, "https://www.barrault.fr/", org, "barrault.fr",
		);

		it("extracts distinctive accent-free tokens from the domain root only", () => {
			assert.deepEqual(rootTokens("https://www.barrault.fr/accueil"), ["barrault"]);
			assert.deepEqual(rootTokens("https://www.ville-de-cognac.fr/"), ["cognac"]);
			assert.deepEqual(rootTokens("http://127.0.0.1/"), []);
		});

		it("pairs rare root tokens without reusing a SIREN match or an organisation", () => {
			const frequent = { ...candidate, qid: "Q999", url: "https://commune-francaise.fr/" };
			const selected = selectByRootToken(
				[candidate, candidate, frequent],
				new Map([
					["barrault", [org, org]],
					["communefrancaise", [org]],
				]),
			);
			assert.equal(selected.length, 1);
			assert.equal(selected[0].organisation.id, 7);
			assert.equal(selected[0].domain, "barrault.fr");
		});

		it("attribue un même candidat à une seule organisation", () => {
			const double = { ...candidate, url: "https://www.barrault-thouars.fr/" };
			const selected = selectByRootToken(
				[double],
				new Map([
					["barrault", [org]],
					["thouars", [{ ...org, id: 8, siren: "888888888" }]],
				]),
			);
			assert.equal(selected.length, 1);
		});

		it("skips pairs whose SIREN is already matched by the first route", () => {
			const selected = selectByRootToken([candidate], new Map([["barrault", [{ ...org, siren: "111111111" }]]]));
			assert.deepEqual(selected, []);
		});

		it("confirms a pairing only when the Wikidata label names the organisation", () => {
			assert.equal(labelMatches("EQUIPE PREV SPECIALISEE GRANDANGOULEME", "Grand Angoulême"), true);
			assert.equal(labelMatches("GROUPE TELECOMS DE L OUEST (KOESIO)", "Koesio"), true);
			assert.equal(labelMatches("OLANO VESOUL", "communauté d'agglomération de Vesoul"), false);
			assert.equal(labelMatches("SMICTOM DU PERIGORD NOIR", "Smictom d'Alsace Centrale"), false);
			assert.equal(labelMatches("Collège Joseph Kessel", "Kessel GmbH"), false);
			assert.equal(labelMatches("BARRAULT (THOUARS)", null), false);
		});

		it("does not reuse a candidate already attributed by a verified-domain route", () => {
			const other = { ...candidate, qid: "Q456", url: "https://www.autre.fr/" };
			const remaining = excludeAttributedCandidates(
				[
					{ candidate, organisation: org, domain: "barrault.fr" },
					{ candidate: other, organisation: { ...org, id: 8 }, domain: "autre.fr" },
				],
				new Set(["Q123"]),
			);
			assert.deepEqual(remaining.map((entry) => entry.candidate.qid), ["Q456"]);
		});

		it("reuses labels recorded by a previous dry run", () => {
			const labels = labelsFromReport({
				domains: [{ qid: "Q123", label: "Barrault" }, { qid: "Q456", label: "" }],
			});
			assert.equal(labels.get("Q123"), "Barrault");
			assert.equal(labels.size, 1);
		});

		it("records the root-match route in traceable provenance", () => {
			const proof = provenanceForRacine(
				{ candidate, organisation: org, domain: "barrault.fr" }, verdict, "barrault", "Barrault",
			);
			assert.equal(proof.source, "wikidata:P856:racine:http200");
			assert.equal(proof.preuve.appariement, "racine");
			assert.equal(proof.preuve.jeton, "barrault");
			assert.equal(proof.preuve.label, "Barrault");
			assert.equal(proof.preuve.statut, 200);
		});
	});

	describe("expand domains from geographic Wikidata labels (geo)", () => {
		const candidate: GeoCandidate = {
			qid: "Q1000796", url: "https://www.ville-boulazac.fr/", label: "Boulazac",
		};
		const org: Organisation = {
			id: 7, name: "MAIRIE DE BOULAZAC", city: "BOULAZAC", dept: "24", siren: "999999999", domain: null,
		};
		const verdict = pageVerdict(
			`<html><head><title>Boulazac</title></head><body><p>${"La ville de Boulazac vous accueille. ".repeat(5)}</p></body></html>`,
			200, "https://www.ville-boulazac.fr/", org, "ville-boulazac.fr",
		);

		it("normalises labels without accents or punctuation", () => {
			assert.equal(compact("L'Île-d'Yeu"), "liledyeu");
			assert.equal(compact("Saint-Abit"), "saintabit");
		});

		it("keeps only distinctive words of a label", () => {
			assert.deepEqual(labelTokens("Communauté de communes du Périgord Noir"), ["perigord", "noir"]);
		});

		it("parses cached candidate rows and rejects malformed ones", () => {
			const parsed = parseGeoCandidates(`${candidate.qid}\t${candidate.url}\t${candidate.label}\nINVALID\trow\n`);
			assert.deepEqual(parsed, [candidate]);
		});

		it("extracts a candidate from a public SPARQL result row", () => {
			assert.deepEqual(parseSparqlBinding({
				item: { value: "http://www.wikidata.org/entity/Q1000796" },
				site: { value: candidate.url },
				itemLabel: { value: "Boulazac" },
			}), candidate);
		});

		it("pairs a site only when the full label names one organisation", () => {
			const selected = selectByLabel([candidate], new Map([["boulazac", [org]]]));
			assert.equal(selected.length, 1);
			assert.equal(selected[0].organisation.id, 7);
			assert.equal(selected[0].domain, "ville-boulazac.fr");
		});

		it("skips ambiguous labels and names too short to identify an organisation", () => {
			const other = { ...org, id: 8, siren: "888888888" };
			const short: GeoCandidate = { ...candidate, label: "Yeu" };
			const selected = selectByLabel([candidate, short], new Map([["boulazac", [org, other]]]));
			assert.deepEqual(selected, []);
		});

		it("uses one QID and one domain root per organisation", () => {
			const duplicate = { ...candidate, url: "http://www.ville-boulazac.fr/accueil" };
			const selected = selectByLabel([candidate, duplicate], new Map([["boulazac", [org]]]));
			assert.equal(selected.length, 1);
		});

		it("drops candidates already verified or examined by the SIREN routes", () => {
			const other: GeoCandidate = { ...candidate, qid: "Q2000796", url: "https://www.autre.fr/" };
			const selections: GeoSelection[] = [
				{ candidate, organisation: org, domain: "ville-boulazac.fr" },
				{ candidate: other, organisation: { ...org, id: 8 }, domain: "autre.fr" },
			];
			const remaining = excludeKnownCandidates(selections, new Set(["Q1000796"]), new Set(["Q2000796"]));
			assert.deepEqual(remaining, []);
		});

		it("traces the geographic label route and the HTTP proof", () => {
			const proof = provenanceForGeo(
				{ candidate, organisation: org, domain: "ville-boulazac.fr" }, verdict,
			);
			assert.equal(proof.source, "wikidata:P856:geographie:http200");
			assert.equal(proof.preuve.qid, "Q1000796");
			assert.equal(proof.preuve.label, "Boulazac");
			assert.equal(proof.preuve.appariement, "libelle");
			assert.equal(proof.preuve.statut, 200);
			assert.match(String(proof.preuve.requete), /Q18678082/);
		});
	});

	describe("expand domains from head-office Wikidata sites (hq)", () => {
		const candidate = {
			qid: "Q1117543", url: "https://www.grand-cognac.fr/", label: "Grand Cognac",
		};
		const organisation: Organisation = {
			id: 42, name: "COMMUNAUTE DE COMMUNES DU GRAND COGNAC", city: "COGNAC",
			dept: "16", siren: "123456789", domain: null,
		};

		it("reads the QID column of a cached candidate row and skips malformed rows", () => {
			const qids = parsePriorQids("Q1\thttps://a.fr\tQ100\nINVALID\trow\nQ2\thttps://b.fr\tQ200\n");
			assert.deepEqual([...qids], ["Q100", "Q200"]);
		});

		it("unions QIDs examined by both prior routes", async (t) => {
			const dir = await mkdtemp(join(tmpdir(), "hq-prior-"));
			t.after(() => rm(dir, { recursive: true, force: true }));
			const sirenPath = join(dir, "siren.tsv");
			const geoPath = join(dir, "geo.tsv");
			await writeFile(sirenPath, "Q1\tu\tQ100\n");
			await writeFile(geoPath, "Q2\tu\tQ200\nQ3\tu\tQ100\n");
			assert.deepEqual([...(await loadPriorQids([sirenPath, geoPath]))].sort(), ["Q100", "Q200"]);
		});

		it("records the head-office query and HTTP proof in the provenance", () => {
			const verdict = pageVerdict(
				`<html><head><title>Grand Cognac</title></head><body><p>${"Le Grand Cognac vous accueille. ".repeat(6)}</p></body></html>`,
				200, candidate.url, organisation, "grand-cognac.fr",
			);
			const selection: GeoSelection = { candidate, organisation, domain: "grand-cognac.fr" };
			const proof = provenanceForHq(selection, verdict);
			assert.equal(proof.source, HQ_SOURCE);
			assert.match(String(proof.preuve.requete), /wdt:P159/);
			assert.match(String(proof.preuve.requete), /Q18678082/);
			assert.equal(proof.preuve.statut, 200);
			assert.equal(proof.preuve.urlFinale, candidate.url);
			assert.match(SPARQL_QUERY, /wdt:P856/);
		});
	});

	describe("regional Wikidata root route (racine-regionale)", () => {
		const boulazac: GeoCandidate = {
			qid: "Q1000796", url: "http://www.ville-boulazac.fr", label: "Boulazac",
		};
		const organisation: Organisation = {
			id: 42, name: "BOULAZAC ISLE MIREAU", city: "BOULAZAC", dept: "24",
			siren: "111111111", domain: null,
		};
		const groups = new Map<string, Organisation[]>([["boulazac", [organisation]]]);

		it("pairs a site only when the root token and the full Wikidata label agree", () => {
			const wrongLabel: GeoCandidate = { ...boulazac, qid: "Q2", url: "http://ville-vesoul.fr", label: "Vesoul" };
			const wrongOrg: GeoCandidate = { ...boulazac, qid: "Q3", url: "http://autre-boulazac.fr", label: "Autre Boulazac" };
			const selected = selectRegionalRootMatches([boulazac, wrongLabel, wrongOrg], groups, new Set());
			assert.deepEqual(selected.map((entry) => entry.candidate.qid), ["Q1000796"]);
			assert.equal(selected[0].domain, "ville-boulazac.fr");
		});

		it("does not reuse a QID already attributed by another verified route", () => {
			const selected = selectRegionalRootMatches(
				[boulazac], groups, new Set([boulazac.qid]),
			);
			assert.deepEqual(selected, []);
		});

		it("traces the regional root match and the HTTP proof", () => {
			const selection: GeoSelection = { candidate: boulazac, organisation, domain: "ville-boulazac.fr" };
			const verdict = pageVerdict(
				`<html><head><title>Boulazac</title></head><body><p>${"Boulazac ville et services ".repeat(6)}</p></body></html>`,
				200, "http://www.ville-boulazac.fr/", organisation, "ville-boulazac.fr",
			);
			const proof = provenanceForRegionalRoot(selection, verdict, "boulazac");
			assert.equal(proof.source, "wikidata:P856:racine-regionale:http200");
			assert.equal(proof.preuve.appariement, "racine-regionale");
			assert.equal(proof.preuve.jeton, "boulazac");
			assert.equal(proof.preuve.statut, 200);
			assert.equal(proof.preuve.urlFinale, "http://www.ville-boulazac.fr/");
		});
	});

	describe("exposition-backed domain route (exposition)", () => {
		function row(overrides: Partial<ExpositionRow> = {}): ExpositionRow {
			return {
				serviceId: 1, orgId: 10, name: "COMMUNE DE BOULAZAC", city: "Boulazac", dept: "24",
				siren: "111111111", source: "osm-http-200", sourceUrl: "https://www.ville-boulazac.fr/",
				provider: "osm:website", evidenceDomain: "ville-boulazac.fr",
				consultedAt: "2026-11-23T10:00:00Z",
				...overrides,
			};
		}

		it("keeps one candidate per organisation and per domain root", () => {
			const selected = selectExpositionCandidates([
				row(), row({ serviceId: 2, sourceUrl: "https://ville-boulazac.fr/contact" }),
				row({ serviceId: 3, orgId: 11, sourceUrl: "https://autre.fr", evidenceDomain: "autre.fr" }),
			], new Set());
			assert.deepEqual(selected.map((entry) => entry.row.serviceId), [1, 3]);
		});

		it("rejects marketplace hosts and URLs whose root differs from the evidence", () => {
			const selected = selectExpositionCandidates([
				row({ serviceId: 2, evidenceDomain: "orpi.com", sourceUrl: "https://www.orpi.com" }),
				row({ serviceId: 3, sourceUrl: "https://autre.fr/mairie" }),
			], new Set());
			assert.deepEqual(selected, []);
		});

		it("does not reuse a domain already attributed to another organisation", () => {
			const selected = selectExpositionCandidates([row()], new Set(["ville-boulazac.fr"]));
			assert.deepEqual(selected, []);
		});

		it("traces the registry and the live HTTP proof", () => {
			const [selection] = selectExpositionCandidates([row()], new Set());
			const proof = provenanceForExposition(selection, {
				ok: true, motif: "http200-title-and-body", token: "boulazac", confidence: 0.95,
				title: "Boulazac", status: 200, finalUrl: "https://ville-boulazac.fr/", htmlLength: 900,
			});
			assert.equal(proof.source, "exposition-service:http200");
			assert.equal(proof.preuve.registre, "osm-http-200");
			assert.equal(proof.preuve.provider, "osm:website");
			assert.equal(proof.preuve.statut, 200);
			assert.equal(proof.preuve.urlFinale, "https://ville-boulazac.fr/");
		});
	});

	describe("exposition retry route (retry)", () => {
		const html = "<html><head><title>Les Tilleuls</title></head><body>"
			+ "Bienvenue sur le site officiel des Tilleuls, une association de Périgueux en Nouvelle-Aquitaine."
			+ " Retrouvez nos horaires, nos activités et nos coordonnées toute l'année.</body></html>";

		function selection() {
			const row: ExpositionRow = {
				serviceId: 42, orgId: 10, name: "SCI DES TILLEULS", city: "Périgueux", dept: "24",
				siren: "111111111", source: "osm-siret-http-200", sourceUrl: "https://tilleuls.fr/",
				provider: "osm:website", evidenceDomain: "tilleuls.fr",
				consultedAt: "2026-11-23T10:00:00Z",
			};
			const [entry] = selectExpositionCandidates([row], new Set());
			return entry;
		}

		function page(status: number, url: string, body = html) {
			return { html: body, status, finalUrl: url };
		}

		it("proposes only the www variant of the same official host", () => {
			assert.deepEqual(retryUrls("https://tilleuls.fr/"), [
				"https://tilleuls.fr/", "https://www.tilleuls.fr/",
			]);
		});

		it("accepts the www variant when the registry URL answered without proof", async () => {
			const fetcher: PageFetch = async (url) => url.includes("www.")
				? page(200, "https://www.tilleuls.fr/")
				: page(503, url);
			const result = await verifyWithRetry(selection(), fetcher);
			assert.equal(result?.url, "https://www.tilleuls.fr/");
			assert.equal(result?.tried.length, 2);
		});

		it("rejects candidates whose variants never return HTTP 200", async () => {
			const fetcher: PageFetch = async (url) => page(404, url);
			assert.equal(await verifyWithRetry(selection(), fetcher), null);
		});

		it("traces the registry URL and the answering URL in the proof", () => {
			const result = { verdict: {
				ok: true, motif: "http200-title-and-body", token: "tilleuls", confidence: 0.95,
				title: "Les Tilleuls", status: 200, finalUrl: "https://www.tilleuls.fr/", htmlLength: html.length,
			}, url: "https://www.tilleuls.fr/", tried: ["https://tilleuls.fr/", "https://www.tilleuls.fr/"] };
			const proof = provenanceForRetry(selection(), result);
			assert.equal(proof.source, RETRY_SOURCE);
			assert.equal(proof.preuve.urlSource, "https://tilleuls.fr/");
			assert.equal(proof.preuve.urlReponse, "https://www.tilleuls.fr/");
			assert.equal(proof.preuve.statut, 200);
			assert.equal(proof.preuve.tentatives, 2);
		});
	});

	describe("directory dedicated-page route (annuaire)", () => {
		const html = "<html><head><title>Agence Boulazac immobilier</title></head><body>"
			+ "L'agence Boulazac immobilier accompagne les vendeurs et les acheteurs a Boulazac "
			+ "et dans toute la Nouvelle-Aquitaine. Retrouvez nos annonces, nos horaires et "
			+ "les coordonnees de nos conseillers tout au long de l'annee.</body></html>";

		function row(sourceUrl = "https://www.orpi.com/agences/agence-boulazac", orgId = 42): ExpositionRow {
			return {
				serviceId: 9, orgId, name: "AGENCE BOULAZAC IMMOBILIER", city: "Boulazac", dept: "24",
				siren: "222222222", source: "osm-http-200", sourceUrl,
				provider: "osm-siret", evidenceDomain: "orpi.com",
				consultedAt: "2026-11-24T10:00:00Z",
			};
		}

		function selected(sourceUrl?: string, orgId = 42) {
			return selectAnnuaireCandidates([row(sourceUrl, orgId)], new Set())[0];
		}

		it("accepts a page whose address names the organisation on a platform root", () => {
			assert.equal(selected()?.domain, "orpi.com");
		});

		it("refuses a directory homepage that does not name the organisation", () => {
			assert.equal(selectAnnuaireCandidates([row("https://www.orpi.com/")], new Set()).length, 0);
		});

		it("refuses a page named only by the city", () => {
			assert.equal(selectAnnuaireCandidates([row("https://www.orpi.com/boulazac")], new Set()).length, 0);
		});

		it("skips an organisation that already carries a domain proof", () => {
			assert.equal(selectAnnuaireCandidates([row()], new Set([42])).length, 0);
		});

		it("keeps only one dedicated page per organisation", () => {
			const second = row("https://www.orpi.com/agences/boulazac-immobilier");
			assert.equal(selectAnnuaireCandidates([row(), second], new Set()).length, 1);
		});

		it("refuses a dedicated URL redirected to the directory homepage", async () => {
			const fetcher = async () => ({ html, status: 200, finalUrl: "https://www.orpi.com/" });
			assert.equal(await verifyAnnuaireCandidate(selected(), fetcher), null);
		});

		it("refuses a page whose body names only the city", async () => {
			const cityOnly = "<html><body>Boulazac, commune du departement de la Dordogne en Nouvelle-Aquitaine. "
				+ "Retrouvez les actualites, les services municipaux, les horaires et les coordonnees "
				+ "de la mairie pour toutes vos demarches administratives en ligne.</body></html>";
			const fetcher = async () => ({ html: cityOnly, status: 200, finalUrl: row().sourceUrl });
			assert.equal(await verifyAnnuaireCandidate(selected(), fetcher), null);
		});

		it("traces the answering directory page in the proof", () => {
			const url = row().sourceUrl;
			const proof = provenanceForAnnuaire(selected(), {
				verdict: {
					ok: true, motif: "http200-title-and-body", token: "boulazac", confidence: 0.95,
					title: "Agence Boulazac immobilier", status: 200, finalUrl: url, htmlLength: html.length,
				},
				url,
				tried: [url],
			});
			assert.equal(proof.source, ANNUAIRE_SOURCE);
			assert.equal(proof.preuve.urlReponse, url);
			assert.equal(proof.preuve.statut, 200);
		});
	});

	describe("named domain route (domain-label)", () => {
		const html = "<html><head><title>Aussac-Vadalle</title></head><body>"
			+ "Bienvenue sur le site de la commune d'Aussac-Vadalle en Charente."
			+ " Retrouvez les services municipaux, les horaires et les actualités toute l'année.</body></html>";

		function row(sourceUrl = "https://aussac-vadalle.fr"): ExpositionRow {
			return {
				serviceId: 7, orgId: 12, name: "Commune de Aussac-Vadalle", city: "Aussac-Vadalle", dept: "16",
				siren: "111111111", source: "osm-siret-http-200", sourceUrl,
				provider: "osm:way/1", evidenceDomain: "aussac-vadalle.fr",
				consultedAt: "2026-11-24T10:00:00Z",
			};
		}

		function selection() {
			return selectNamedDomainCandidates([row()])[0];
		}

		function result(): NamedDomainResult {
			return {
				verdict: {
					ok: true, motif: "http200-title-and-body", token: "aussac", confidence: 0.85,
					title: "Aussac-Vadalle", status: 200, finalUrl: row().sourceUrl, htmlLength: html.length,
				},
				url: row().sourceUrl,
				tried: [row().sourceUrl],
			};
		}

		it("accepts a registrable domain that names the organisation", () => {
			assert.equal(isNamedDomainUrl("Commune de Aussac-Vadalle", "Aussac-Vadalle", row().sourceUrl), true);
		});

		it("rejects an unrelated registrable domain", () => {
			assert.equal(isNamedDomainUrl("Commune de Aussac-Vadalle", "Aussac-Vadalle", "https://exemple.fr/"), false);
		});

		it("keeps a named root already attributed to another organisation", () => {
			assert.equal(selection()?.domain, "aussac-vadalle.fr");
		});

		it("refuses an HTTP 200 page redirected to an unnamed address", async () => {
			const redirected = {
				...row("https://ch-agen-nerac.fr/centre-de-gerontologie-de-pompeyrie"),
				orgId: 13, name: "EHPAD POMPEYRIE", city: "Nérac", evidenceDomain: "ch-agen-nerac.fr",
			};
			const candidate = selectNamedDomainCandidates([redirected])[0];
			const fetcher = async () => ({ html, status: 200, finalUrl: "https://ch-agen-nerac.fr/" });
			assert.equal(await verifyNamedDomain(candidate, fetcher), null);
		});

		it("traces the answering named page in the proof", () => {
			const proof = provenanceForNamedDomain(selection(), result());
			assert.equal(proof.source, NAMED_DOMAIN_SOURCE);
			assert.equal(proof.preuve.urlReponse, row().sourceUrl);
			assert.equal(proof.preuve.domaineNommant, true);
			assert.equal(proof.preuve.statut, 200);
		});
	});

	describe("group-site dedicated page route (groupe)", () => {
		const html = "<html><head><title>Maison médicalisee Pasteur</title></head><body>"
			+ "La maison medicalisee Pasteur accueille des residents a Poitiers en Nouvelle-Aquitaine."
			+ " Retrouvez les horaires, l'equipe et les coordonnees de l'etablissement toute l'annee.</body></html>";

		function row(sourceUrl = "https://colisee.fr/residences/maison-medicalisee-poitiers-residence-pasteur"): ExpositionRow {
			return {
				serviceId: 9, orgId: 42, name: "MAISON MEDICALISEE PASTEUR", city: "Poitiers", dept: "86",
				siren: "222222222", source: "finess-site-http-200", sourceUrl,
				provider: "finess", evidenceDomain: "colisee.fr",
				consultedAt: "2026-11-24T10:00:00Z",
			};
		}

		function selection(sourceUrl?: string) {
			return selectGroupCandidates([row(sourceUrl)])[0];
		}

		function result(sourceUrl: string): GroupResult {
			return {
				verdict: {
					ok: true, motif: "http200-title-and-body", token: "pasteur", confidence: 0.95,
					title: "Maison medicalisee Pasteur", status: 200, finalUrl: sourceUrl, htmlLength: html.length,
				},
				url: sourceUrl,
				tried: [sourceUrl],
			};
		}

		it("accepts a group page whose address names the establishment", () => {
			assert.equal(selection()?.domain, "colisee.fr");
		});

		it("refuses a marketplace page even when its address names the establishment", () => {
			assert.equal(selectGroupCandidates([row("https://www.orpi.com/agence/pasteur-poitiers")]).length, 0);
		});

		it("refuses a page named only by the establishment's city", () => {
			assert.equal(selectGroupCandidates([row("https://colisee.fr/etablissements/poitiers-autre")]).length, 0);
		});

		it("refuses an HTTP 200 page redirected to the group homepage", async () => {
			const fetcher = async () => ({ html, status: 200, finalUrl: "https://colisee.fr/" });
			assert.equal(await verifyGroupCandidate(selection(), fetcher), null);
		});

		it("traces the answering group page in the proof", () => {
			const proof = provenanceForGroup(selection(), result(row().sourceUrl));
			assert.equal(proof.source, GROUPE_SOURCE);
			assert.equal(proof.preuve.urlReponse, row().sourceUrl);
			assert.equal(proof.preuve.statut, 200);
		});
	});

	describe("shared group domain route (shared)", () => {
		const html = "<html><head><title>Marius Lacroix</title></head><body>"
			+ "L'établissement Marius Lacroix accueille des patients à La Rochelle en Nouvelle-Aquitaine."
			+ " Retrouvez les horaires, l'équipe et les coordonnées de l'établissement toute l'année.</body></html>";

		function row(sourceUrl = "https://ch-larochelle.fr/etablissement/marius-lacroix"): ExpositionRow {
			return {
				serviceId: 7, orgId: 12, name: "HOPITAL MARIUS LACROIX", city: "La Rochelle", dept: "17",
				siren: "111111111", source: "finess-site-http-200", sourceUrl,
				provider: "finess", evidenceDomain: "ch-larochelle.fr",
				consultedAt: "2026-11-24T10:00:00Z",
			};
		}

		function selection(sourceUrl?: string) {
			return selectSharedCandidates([row(sourceUrl)])[0];
		}

		function result(sourceUrl: string): SharedResult {
			return {
				verdict: {
					ok: true, motif: "http200-title-and-body", token: "marius", confidence: 0.95,
					title: "Marius Lacroix", status: 200, finalUrl: sourceUrl, htmlLength: html.length,
				},
				url: sourceUrl,
				tried: [sourceUrl],
			};
		}

		it("accepts a page whose address names the organisation", () => {
			assert.equal(isDedicatedPageUrl("HOPITAL MARIUS LACROIX", "La Rochelle", row().sourceUrl), true);
		});

		it("rejects a generic group homepage", () => {
			assert.equal(isDedicatedPageUrl("HOPITAL MARIUS LACROIX", "La Rochelle", "https://ch-larochelle.fr/"), false);
		});

		it("keeps a dedicated page on a domain already attributed to another organisation", () => {
			assert.equal(selection()?.domain, "ch-larochelle.fr");
		});

		it("refuses an HTTP 200 page redirected to a generic address", async () => {
			const generic = "https://ch-larochelle.fr/";
			const fetcher = async () => ({ html, status: 200, finalUrl: generic });
			assert.equal(await verifySharedCandidate(selection(), fetcher), null);
		});

		it("traces the answering dedicated page in the proof", () => {
			const proof = provenanceForShared(selection(), result(row().sourceUrl));
			assert.equal(proof.source, SHARED_SOURCE);
			assert.equal(proof.preuve.urlReponse, row().sourceUrl);
			assert.equal(proof.preuve.urlDediee, true);
			assert.equal(proof.preuve.statut, 200);
		});
	});

	describe("official host variant route (variantes)", () => {
		const html = "<html><head><title>Aussac-Vadalle</title></head><body>"
			+ "Bienvenue sur le site de la commune d'Aussac-Vadalle en Charente."
			+ " Retrouvez les services municipaux, les horaires et les actualités toute l'année.</body></html>";

		function row(sourceUrl = "https://aussac-vadalle.fr"): ExpositionRow {
			return {
				serviceId: 7, orgId: 12, name: "Commune de Aussac-Vadalle", city: "Aussac-Vadalle", dept: "16",
				siren: "111111111", source: "osm-siret-http-200", sourceUrl,
				provider: "osm:way/1", evidenceDomain: "aussac-vadalle.fr",
				consultedAt: "2026-11-24T10:00:00Z",
			};
		}

		function selection() {
			return selectVariantCandidates([row()])[0];
		}

		const accepted: VariantResult = {
			verdict: {
				ok: true, motif: "http200-title-and-body", token: "aussac", confidence: 0.85,
				title: "Aussac-Vadalle", status: 200, finalUrl: "http://www.aussac-vadalle.fr/", htmlLength: html.length,
			},
			url: "http://www.aussac-vadalle.fr/",
			tried: ["https://aussac-vadalle.fr/", "http://aussac-vadalle.fr/", "http://www.aussac-vadalle.fr/"],
		};

		it("proposes both protocols and both www prefixes of the same host", () => {
			const variants = hostVariants("https://aussac-vadalle.fr");
			assert.deepEqual(variants, [
				"https://aussac-vadalle.fr/", "https://www.aussac-vadalle.fr/",
				"http://aussac-vadalle.fr/", "http://www.aussac-vadalle.fr/",
			]);
		});

		it("accepts the http www variant when the https registry URL never answered", async () => {
			const fetcher = async (url: string) => url === "http://www.aussac-vadalle.fr/"
				? { html, status: 200, finalUrl: url }
				: { html: "", status: 503, finalUrl: url };
			const result = await verifyVariant(selection(), fetcher);
			assert.equal(result?.url, "http://www.aussac-vadalle.fr/");
			assert.equal(result?.verdict.token, "aussac");
		});

		it("rejects a variant redirected to an unnamed root", async () => {
			const fetcher = async (url: string) => ({ html, status: 200, finalUrl: "https://exemple.fr/" });
			assert.equal(await verifyVariant(selection(), fetcher), null);
		});

		it("keeps one candidate per organisation when two URL shapes qualify", () => {
			const dedicated: ExpositionRow = {
				...row("https://pep86.fr/terra-nova"), orgId: 13,
				name: "MAS TERRA NOVA - PEP 86", city: "Poitiers", evidenceDomain: "pep86.fr",
			};
			const candidates = selectVariantCandidates([row(), dedicated]);
			assert.equal(candidates.length, 2);
			assert.equal(new Set(candidates.map((entry) => entry.organisation.id)).size, 2);
			assert.equal(candidates[0].domain, "aussac-vadalle.fr");
		});

		it("traces the registry URL and the answering variant in the proof", () => {
			const proof = provenanceForVariant(selection(), accepted);
			assert.equal(proof.source, VARIANT_SOURCE);
			assert.equal(proof.preuve.urlSource, "https://aussac-vadalle.fr");
			assert.equal(proof.preuve.urlReponse, "http://www.aussac-vadalle.fr/");
			assert.equal(proof.preuve.statut, 200);
			assert.equal(proof.preuve.tentatives, 3);
		});
	});

	describe("published SIREN route (siren)", () => {
		function row(overrides: Partial<ExpositionRow> = {}): ExpositionRow {
			return {
				serviceId: 9, orgId: 42, name: "AGENCE MMA COZES", city: "Cozes", dept: "17",
				siren: "509458493", source: "osm-siret-http-200", sourceUrl: "https://agence.mma.fr/cozes",
				provider: "osm-siret", evidenceDomain: "agma.fr",
				consultedAt: "2026-11-24T10:00:00Z", ...overrides,
			};
		}

		function selection(overrides: Partial<ExpositionRow> = {}) {
			return selectSirenCandidates([row(overrides)])[0];
		}

		const page = `<html><head><title>Agence de Cozes</title></head><body>`
			+ `L'agence de Cozes vous accueille du lundi au vendredi pour vos assurances `
			+ `et vos services. SIREN 509458493 — établissement situé en Charente-Maritime. `
			+ `Retrouvez nos horaires et nos coordonnées sur cette page.</body></html>`;

		it("accepts a shared-root page publishing the organisation's exact SIREN", () => {
			const verdict = sirenVerdict(page, 200, "https://agma.fr/cozes", selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
			assert.equal(verdict.ok, true);
			assert.equal(verdict.motif, "http200-published-siren");
		});

		it("rejects a directory page listing many legal identifiers", () => {
			const many = Array.from({ length: MAX_SIRENS_ON_PAGE + 1 }, (_, i) => `${509458493 + i}`).join(" ");
			const verdict = sirenVerdict(`${page} ${many}`, 200, "https://agma.fr/cozes", selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
			assert.equal(verdict.ok, false);
			assert.equal(verdict.motif, "directory-page");
		});

		it("rejects a real page that does not publish the organisation's SIREN", () => {
			const verdict = sirenVerdict(page, 200, "https://agma.fr/cozes", selection({ siren: "111111111", evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
			assert.equal(verdict.ok, false);
			assert.equal(verdict.motif, "no-published-siren");
		});

		it("rejects a redirect off the registered root", () => {
			const verdict = sirenVerdict(page, 200, "https://autre.fr/cozes", selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }));
			assert.equal(verdict.ok, false);
			assert.equal(verdict.motif, "redirect-off-root");
		});

		it("requires a dedicated address rather than a bare homepage", () => {
			assert.equal(selectSirenCandidates([row({ sourceUrl: "https://agma.fr" })]).length, 0);
		});

		it("re-verifies the registry URL live before accepting it", async () => {
			const result = await verifySirenCandidate(
				selection({ evidenceDomain: "agma.fr", sourceUrl: "https://agma.fr/cozes" }),
				async (url) => ({ html: page, status: 200, finalUrl: url }),
			);
			assert.equal(result?.ok, true);
		});
	});

	describe("incomplete HTTP 200 proof repair (preuve)", () => {
		const html = "<html><head><title>Charmé - Commune de Charmé</title></head><body>"
			+ "Bienvenue sur le site de la commune de Charmé en Charente."
			+ " Retrouvez les services municipaux, les horaires et les actualités toute l'année.</body></html>";

		function row(): UnprovenRow {
			return {
				orgId: 73,
				name: "Commune de Charmé",
				domain: "www.mairie-charme.fr",
				valeur: "www.mairie-charme.fr",
				source: "nom:mairie-<slug>.fr",
				preuve: { statut: 200, url: "https://www.mairie-charme.fr/", titre: "Charmé", token: "charme" },
			};
		}

		it("adds the final URL after re-verifying the stored page", async () => {
			const result = await repairProof(row(), async (url) => ({ html, status: 200, finalUrl: url }));
			assert.equal(result?.verdict.ok, true);
			assert.equal(result?.preuve.urlFinale, "https://www.mairie-charme.fr/");
			assert.equal(result?.preuve.token, "charme");
		});

		it("leaves proofs whose URL was already recorded untouched", () => {
			const complete: UnprovenRow = {
				...row(), preuve: { ...row().preuve, urlFinale: "https://www.mairie-charme.fr/" },
			};
			assert.equal(isRepairable(complete), false);
		});

		it("rejects a live page that does not name the organisation", async () => {
			const unrelated = "<html><body>Bienvenue sur notre portail d'actualités générales"
				+ " de la région Nouvelle-Aquitaine, retrouvez toute l'actualité locale.</body></html>";
			const result = await repairProof(row(), async (url) => ({ html: unrelated, status: 200, finalUrl: url }));
			assert.equal(result, null);
		});

		it("ignores a proof whose recorded value differs from the organisation domain", () => {
			const mismatch: UnprovenRow = { ...row(), valeur: "autre-commune.fr" };
			assert.equal(isRepairable(mismatch), false);
		});
	});

	describe("verified subdomain alignment (sous-domaine)", () => {
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
});
