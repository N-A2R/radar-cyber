/**
 * Behaviour tests for the TLS certificate audit.
 *
 * No external network: the scanner receives an injected probe, and the corpus
 * is the versioned file already shipped with the repository.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildTargets,
	classifyObservation,
	configurationReasons,
	expiryReasons,
	hostFromUrl,
	isDefectiveStatus,
	matchesHostname,
	summarizeFindings,
	weakReasons,
	type CertificateObservation,
	type Finding,
	type SiteTarget,
} from "../src/tlsAudit/index.js";
import { scanTargets } from "../src/tlsAudit/scan.js";
import { loadCorpusSites, sitesFromCorpus } from "../src/tlsAudit/corpus.js";
import { CORPUS, measureTlsAudit, renderMarkdown } from "../../../scripts/mesure-tls-na.mts";

const NOW = new Date("2026-11-22T00:00:00Z");

function target(overrides: Partial<SiteTarget> = {}): SiteTarget {
	return {
		host: "ville.fr",
		port: 443,
		entries: 1,
		departments: ["33"],
		httpsRequired: true,
		...overrides,
	};
}

function observation(overrides: Partial<CertificateObservation> = {}): CertificateObservation {
	return {
		host: "ville.fr",
		port: 443,
		scannedAt: NOW.toISOString(),
		ok: true,
		protocol: "TLSv1.3",
		validFrom: "2026-01-01T00:00:00Z",
		validTo: "2027-01-01T00:00:00Z",
		signatureAlgorithm: "sha256WithRSAEncryption",
		keyType: "rsa",
		keyBits: 2048,
		subject: "CN=ville.fr",
		issuer: "CN=Test CA",
		subjectAltName: "DNS:ville.fr",
		authorizationError: null,
		selfSigned: false,
		chainComplete: true,
		...overrides,
	};
}

function finding(overrides: Partial<Finding> = {}): Finding {
	return { host: "a.fr", status: "clean", reasons: [], entries: 1, departments: ["33"], ...overrides };
}

describe("TLS audit targets", () => {
	it("groups URLs by host and keeps one entry per corpus source", () => {
		const targets = buildTargets([
			{ url: "https://www.ville.fr/a", departement: "33" },
			{ url: "http://www.ville.fr/b", departement: "24" },
			{ url: "https://www.ville.fr/c", departement: "33" },
			{ url: "https://autre.fr/", departement: "33" },
			{ url: "mailto:contact@ville.fr" },
		]);
		assert.equal(targets.length, 2);
		const ville = targets.find((entry) => entry.host === "www.ville.fr");
		assert.ok(ville);
		assert.equal(ville.entries, 3);
		assert.deepEqual(ville.departments, ["33", "24"]);
		assert.equal(ville.httpsRequired, true);
		assert.equal(hostFromUrl("HTTPS://WWW.Ville.FR./actualites"), "www.ville.fr");
	});
});

describe("TLS certificate rules", () => {
	it("matches exact names, one-label wildcards and a CN fallback", () => {
		assert.equal(matchesHostname("DNS:ville.fr, DNS:*.ville.fr", undefined, "www.ville.fr"), true);
		assert.equal(matchesHostname("DNS:*.ville.fr", undefined, "www.ville.fr"), true);
		assert.equal(matchesHostname("DNS:*.ville.fr", undefined, "a.b.ville.fr"), false);
		assert.equal(matchesHostname("DNS:*.ville.fr", undefined, "ville.fr"), false);
		assert.equal(matchesHostname(undefined, "CN=ville.fr, O=Ville", "ville.fr"), true);
	});

	it("reports expired and not-yet-valid certificates from dates or the handshake", () => {
		assert.deepEqual(expiryReasons(observation({ validTo: "2026-01-01T00:00:00Z" }), NOW), ["certificate_expired"]);
		assert.deepEqual(expiryReasons(observation({ validFrom: "2027-01-01T00:00:00Z" }), NOW), ["certificate_not_yet_valid"]);
		assert.deepEqual(
			expiryReasons(observation({ validTo: undefined, authorizationError: "CERT_HAS_EXPIRED" }), NOW),
			["certificate_expired"],
		);
		assert.deepEqual(expiryReasons(observation(), NOW), []);
	});

	it("reports weak signatures, keys and deprecated TLS versions", () => {
		assert.deepEqual(weakReasons(observation({ signatureAlgorithm: "sha1WithRSAEncryption" })), ["weak_signature"]);
		assert.deepEqual(weakReasons(observation({ keyBits: 1024 })), ["small_key"]);
		assert.deepEqual(
			weakReasons(observation({ keyType: "ec", keyBits: undefined, namedCurve: "prime192v1" })),
			["small_ec_curve"],
		);
		assert.deepEqual(weakReasons(observation({ protocol: "TLSv1.1" })), ["deprecated_tls_version"]);
		assert.deepEqual(weakReasons(observation()), []);
	});

	it("reports hostname, self-signed, chain and incomplete-chain defects", () => {
		assert.deepEqual(
			configurationReasons(observation({ subjectAltName: "DNS:autre.fr", subject: "CN=autre.fr" })),
			["hostname_mismatch"],
		);
		assert.deepEqual(configurationReasons(observation({ selfSigned: true })), ["self_signed_certificate"]);
		assert.deepEqual(
			configurationReasons(observation({ authorizationError: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" })),
			["untrusted_chain"],
		);
		assert.deepEqual(configurationReasons(observation({ chainComplete: false })), ["incomplete_chain"]);
		assert.deepEqual(configurationReasons(observation({ authorizationError: "CERT_HAS_EXPIRED" })), []);
	});
});

describe("TLS verdicts", () => {
	it("classifies clean, expired, misconfigured and weak certificates", () => {
		assert.equal(classifyObservation(observation(), target(), NOW).status, "clean");
		assert.equal(
			classifyObservation(observation({ validTo: "2026-01-01T00:00:00Z" }), target(), NOW).status,
			"expired",
		);
		assert.equal(
			classifyObservation(observation({ subjectAltName: "DNS:autre.fr" }), target(), NOW).status,
			"misconfigured",
		);
		assert.equal(
			classifyObservation(observation({ signatureAlgorithm: "sha1WithRSAEncryption" }), target(), NOW).status,
			"weak",
		);
	});

	it("separates an HTTPS handshake failure from a site with no TLS", () => {
		const failed = observation({ ok: false, error: "ECONNREFUSED" });
		const https = classifyObservation(failed, target({ httpsRequired: true }), NOW);
		const http = classifyObservation(failed, target({ httpsRequired: false }), NOW);
		assert.equal(https.status, "misconfigured");
		assert.deepEqual(https.reasons, ["tls_handshake_failed"]);
		assert.equal(http.status, "no_tls");
		assert.deepEqual(http.reasons, ["no_tls_service"]);
	});

	it("keeps a transient failure as unknown, not as a certificate defect", () => {
		const result = classifyObservation(observation({ ok: false, error: "ETIMEDOUT" }), target(), NOW);
		assert.equal(result.status, "unknown");
		assert.deepEqual(result.reasons, ["endpoint_unreachable"]);
		assert.equal(isDefectiveStatus(result.status), false);
	});

	it("counts defective sources and distinct hosts without double counting", () => {
		const summary = summarizeFindings([
			finding({ host: "a.fr", status: "expired", reasons: ["certificate_expired"], entries: 3 }),
			finding({ host: "b.fr", status: "weak", reasons: ["weak_signature"], entries: 1 }),
			finding({ host: "c.fr", status: "clean", entries: 2 }),
			finding({ host: "d.fr", status: "no_tls", reasons: ["no_tls_service"], entries: 1 }),
		]);
		assert.deepEqual(summary, {
			sites: 7,
			hosts: 4,
			defectiveSites: 4,
			defectiveHosts: 2,
			byStatus: { expired: 3, misconfigured: 0, weak: 1, clean: 2, no_tls: 1, unknown: 0 },
			byReason: { certificate_expired: 3, weak_signature: 1, no_tls_service: 1 },
		});
	});
});

describe("TLS scanner", () => {
	it("bounds concurrency and probes every target", async () => {
		let active = 0;
		let maxActive = 0;
		const gate = Promise.withResolvers<void>();
		const targets = Array.from({ length: 12 }, (_, index) => target({ host: `site-${index}.fr` }));
		const scan = scanTargets(targets, {
			concurrency: 3,
			retries: 0,
			budgetMs: 1_000,
			now: () => NOW,
			probe: async (entry) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await gate.promise;
				active -= 1;
				return observation({ host: entry.host });
			},
		});
		for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
		assert.equal(maxActive, 3);
		gate.resolve();
		const results = await scan;
		assert.equal(results.length, 12);
		assert.ok(results.every((result) => result.ok));
	});

	it("retries a transient failure once, then keeps the successful probe", async () => {
		let attempts = 0;
		const results = await scanTargets([target()], {
			concurrency: 1,
			retries: 1,
			budgetMs: 1_000,
			now: () => NOW,
			probe: async () => {
				attempts += 1;
				return attempts === 1 ? observation({ ok: false, error: "ENOTFOUND" }) : observation();
			},
		});
		assert.equal(attempts, 2);
		assert.equal(results[0]?.ok, true);
	});

	it("stops probing when the global budget is exhausted", async () => {
		let calls = 0;
		const results = await scanTargets([target()], {
			concurrency: 1,
			retries: 0,
			budgetMs: 0,
			now: () => NOW,
			probe: async () => {
				calls += 1;
				return observation();
			},
		});
		assert.equal(calls, 0);
		assert.equal(results[0]?.error, "BUDGET_EXCEEDED");
	});
});

describe("TLS corpus and report", () => {
	it("retains only verified Nouvelle-Aquitaine sources", () => {
		const sites = sitesFromCorpus([
			{ url: "https://ville.fr/", departement: "33", preuve: { http_status: 200, url_finale: "https://ville.fr/" } },
			{ url: "https://ville.fr/", departement: "33", preuve: { http_status: 404 } },
			{ url: "https://paris.fr/", departement: "75", preuve: { http_status: 200 } },
			{ url: undefined, departement: "33" },
		]);
		assert.deepEqual(sites, [{ url: "https://ville.fr/", departement: "33" }]);
	});

	it("reads 1 000 sources across 760 hosts and 12 departments", async () => {
		const sites = await loadCorpusSites(CORPUS);
		assert.equal(sites.length, 1_000);
		assert.equal(new Set(sites.map((site) => site.departement)).size, 12);
		assert.equal(buildTargets(sites).length, 760);
		assert.ok(sites.every((site) => /^https?:\/\//.test(site.url)));
	});

	it("measures defective sources and renders the French report", async () => {
		const report = await measureTlsAudit({
			sites: [
				{ url: "https://a.fr/", departement: "33" },
				{ url: "https://a.fr/contact", departement: "33" },
				{ url: "https://b.fr/", departement: "33" },
			],
			concurrency: 2,
			retries: 0,
			budgetMs: 1_000,
			now: () => NOW,
			probe: async (entry) =>
				entry.host === "a.fr"
					? observation({ host: entry.host, validTo: "2026-01-01T00:00:00Z" })
					: observation({ host: entry.host, subjectAltName: `DNS:${entry.host}`, subject: `CN=${entry.host}` }),
		});
		assert.equal(report.sites, 3);
		assert.equal(report.hosts, 2);
		assert.equal(report.defectiveSites, 2);
		assert.equal(report.defectiveHosts, 1);
		assert.equal(report.byDepartment["33"]?.defective, 2);
		const markdown = renderMarkdown(report);
		assert.match(markdown, /2 sites/);
		assert.match(markdown, /66,7 %/);
	});
});
