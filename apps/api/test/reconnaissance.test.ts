/**
 * One behavior per test for reconnaissance-phase detection in Nouvelle-Aquitaine.
 *
 * Pure rules run on fixtures. One database test checks that the measurement
 * reads the real observation stores through the same rule, and one HTTP test
 * checks the English contract. No organization name, hostname, IP address or
 * victim payload is inserted into or read from the detector.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
	attributableService,
	attributableSubdomains,
	detectReconnaissance,
	hasDnsObservable,
	hasServiceObservable,
	isPlausibleDomain,
	normalizeHostname,
	type DnsRow,
	type ExposureRow,
	type SubdomainRow,
} from "../src/reconnaissance/detect.js";
import { measureReconnaissance } from "../src/reconnaissance/measure.js";
import reconnaissanceRoute from "../src/routes/reconnaissance.js";
import { installAccessControl } from "../src/security/rbac.js";

const TAG = `rc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const orgIds: number[] = [];
let serviceOrgId: number;
let unownedOrgId: number;
let sharedAOrgId: number;
let sharedBOrgId: number;
let uniqueCtOrgId: number;
let ambiguousCtaOrgId: number;
let ambiguousCtbOrgId: number;
let dnsOrgId: number;
let pendingDnsOrgId: number;
let nonNaOrgId: number;
let app: FastifyInstance;

function exposureRow(overrides: Partial<ExposureRow> = {}): ExposureRow {
	return {
		orgId: 1,
		dept: "33",
		domain: "example.fr",
		website: "https://www.example.fr/",
		hostnames: ["www.example.fr"],
		fingerprintPorts: 2,
		sharedIp: false,
		...overrides,
	};
}

function subdomainRow(overrides: Partial<SubdomainRow> = {}): SubdomainRow {
	return {
		orgId: 1,
		dept: "33",
		registeredDomain: "example.fr",
		observedDomain: "example.fr",
		subdomainCount: 3,
		ambiguous: false,
		...overrides,
	};
}

function dnsRow(overrides: Partial<DnsRow> = {}): DnsRow {
	return {
		orgId: 1,
		dept: "33",
		domain: "example.fr",
		active: true,
		lastSuccess: "2026-11-22T00:00:00.000Z",
		...overrides,
	};
}

async function insertOrg(
	slug: string,
	dept: string,
	domain: string,
	website: string | null = null,
): Promise<number> {
	const inserted = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, dept, domain, website, status)
		 VALUES ($1, $2, 'entreprise', $3, $4, $5, 'confirme') RETURNING id`,
		[`Recon Fixture ${slug}`, `${TAG}-${slug}`, dept, domain, website],
	);
	const id = Number(inserted.rows[0]!.id);
	orgIds.push(id);
	return id;
}

async function insertExposure(
	orgId: number,
	ip: string,
	hostnames: string[],
	technology = "nginx",
): Promise<void> {
	await query(
		`INSERT INTO exposition_service
		   (org_id, ip, port, category, service, technology, source, source_url, consulted_at, evidence)
		 VALUES ($1, $2, 443, 'web', 'https', $3, 'shodan-internetdb',
		         'https://example.invalid/internetdb', now(), $4::jsonb)`,
		[orgId, ip, technology, JSON.stringify({ hostnames })],
	);
}

before(async () => {
	serviceOrgId = await insertOrg(
		"service",
		"33",
		`svc-${TAG}.example`,
		`https://www.svc-${TAG}.example/`,
	);
	unownedOrgId = await insertOrg("unowned", "17", `unowned-${TAG}.example`);
	sharedAOrgId = await insertOrg("shared-a", "40", `shared-a-${TAG}.example`);
	sharedBOrgId = await insertOrg("shared-b", "40", `shared-b-${TAG}.example`);
	uniqueCtOrgId = await insertOrg("ctu", "64", `ctu-${TAG}.example`);
	ambiguousCtaOrgId = await insertOrg("cta", "86", `cta-${TAG}.example`);
	ambiguousCtbOrgId = await insertOrg("ctb", "86", `cta-${TAG}.example`);
	dnsOrgId = await insertOrg("dns", "79", `dns-${TAG}.example`);
	pendingDnsOrgId = await insertOrg("dnsp", "16", `dnsp-${TAG}.example`);
	nonNaOrgId = await insertOrg("non-na", "75", `non-na-${TAG}.example`);

	await insertExposure(
		serviceOrgId,
		"203.0.113.1",
		[`www.svc-${TAG}.example`, "hosted.invalid"],
	);
	await insertExposure(unownedOrgId, "203.0.113.2", ["hosted.invalid"]);
	await insertExposure(sharedAOrgId, "203.0.113.3", [`www.shared-a-${TAG}.example`]);
	await insertExposure(sharedBOrgId, "203.0.113.3", [`www.shared-b-${TAG}.example`]);
	await insertExposure(nonNaOrgId, "203.0.113.4", [`www.non-na-${TAG}.example`]);

	await query(
		`INSERT INTO ct_sous_domaine
		   (sous_domaine, domaine, organisation, source, premiere_vue)
		 VALUES ($1, $2, 'Recon Fixture', 'crt.sh', now()),
		        ($3, $2, 'Recon Fixture', 'crt.sh', now())`,
		[`a.ctu-${TAG}.example`, `ctu-${TAG}.example`, `b.ctu-${TAG}.example`],
	);
	await query(
		`INSERT INTO ct_sous_domaine
		   (sous_domaine, domaine, organisation, source, premiere_vue)
		 VALUES ($1, $2, 'Recon Fixture', 'certspotter', now())`,
		[`shared.cta-${TAG}.example`, `cta-${TAG}.example`],
	);
	await query(
		`INSERT INTO dns_domaine
		   (domain, label, org_ids, active, last_try, last_success, last_state)
		 VALUES ($1, 'Recon Fixture', ARRAY[$2]::integer[], true, now(), now(), 'ok'),
		        ($3, 'Recon Fixture', ARRAY[$4]::integer[], true, now(), NULL, 'jamais')`,
		[`dns-${TAG}.example`, dnsOrgId, `dnsp-${TAG}.example`, pendingDnsOrgId],
	);

	app = Fastify({ logger: false });
	installAccessControl(app);
	await app.register(reconnaissanceRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	if (orgIds.length > 0) {
		await query("DELETE FROM exposition_service WHERE org_id = ANY($1::int[])", [orgIds]);
		await query("DELETE FROM org WHERE id = ANY($1::int[])", [orgIds]);
	}
	await query("DELETE FROM ct_sous_domaine WHERE domaine LIKE $1", [`%${TAG}%`]);
	await query("DELETE FROM dns_domaine WHERE domain LIKE $1", [`%${TAG}%`]);
	await closePools();
});

test("hostnames are normalised before any ownership check", () => {
	assert.equal(normalizeHostname("https://WWW.Example.FR:8443/path?q=1"), "example.fr");
	assert.equal(normalizeHostname("*.sub.example.fr."), "sub.example.fr");
	assert.equal(normalizeHostname(null), "");
});

test("a public suffix is never treated as an organization domain", () => {
	assert.equal(isPlausibleDomain("example.fr"), true);
	assert.equal(isPlausibleDomain("fr"), false);
	assert.equal(isPlausibleDomain("co.uk"), false);
	assert.equal(isPlausibleDomain(""), false);
});

test("a service is attributable through its domain or one of its subdomains", () => {
	assert.equal(attributableService(exposureRow()), true);
	assert.equal(attributableService(exposureRow({ hostnames: ["mail.example.fr"] })), true);
	assert.equal(
		attributableService(exposureRow({ hostnames: ["other.invalid"] })),
		false,
	);
});

test("a shared IP or an unfingerprinted port is not ownership evidence", () => {
	assert.equal(attributableService(exposureRow({ sharedIp: true })), false);
	assert.equal(attributableService(exposureRow({ fingerprintPorts: 0 })), false);
	assert.equal(hasServiceObservable(exposureRow({ fingerprintPorts: 0 })), false);
});

test("CT subdomains need an exact, unambiguous registered domain", () => {
	assert.equal(attributableSubdomains(subdomainRow()), true);
	assert.equal(attributableSubdomains(subdomainRow({ ambiguous: true })), false);
	assert.equal(
		attributableSubdomains(subdomainRow({ observedDomain: "mail.example.fr" })),
		false,
	);
});

test("DNS is observable only after a successful active lookup", () => {
	assert.equal(hasDnsObservable(dnsRow()), true);
	assert.equal(hasDnsObservable(dnsRow({ active: false })), false);
	assert.equal(hasDnsObservable(dnsRow({ lastSuccess: null })), false);
});

test("an organization outside Nouvelle-Aquitaine is never a candidate", () => {
	const result = detectReconnaissance({
		exposures: [exposureRow({ dept: "75" })],
		subdomains: [subdomainRow({ dept: "75" })],
		dns: [dnsRow({ dept: "75" })],
	});
	assert.equal(result.candidates, 0);
	assert.equal(result.detections.length, 0);
});

test("the false-positive rate is measured over candidates, not survivors", () => {
	const result = detectReconnaissance({
		exposures: [
			exposureRow({ orgId: 1 }),
			exposureRow({ orgId: 2, hostnames: ["other.invalid"] }),
		],
		subdomains: [],
		dns: [],
	});
	assert.equal(result.candidates, 2);
	assert.equal(result.detections.length, 1);
	assert.equal(result.falsePositives, 1);
	assert.equal(result.falsePositiveRate, 0.5);
});

test("the strongest signal wins while every verified signal is counted", () => {
	const result = detectReconnaissance({
		exposures: [exposureRow({ orgId: 5, fingerprintPorts: 3 })],
		subdomains: [subdomainRow({ orgId: 5, subdomainCount: 4 })],
		dns: [dnsRow({ orgId: 5 })],
	});
	assert.equal(result.detections.length, 1);
	assert.equal(result.detections[0]!.signal, "service_fingerprint");
	assert.equal(result.detections[0]!.evidence, 3);
	assert.deepEqual(result.signals, {
		service_fingerprint: 1,
		subdomain_enumeration: 1,
		dns_observation: 1,
	});
	assert.deepEqual(result.candidateSignals, {
		service_fingerprint: 1,
		subdomain_enumeration: 1,
		dns_observation: 1,
	});
});

test("a DNS row that never resolved is a pending lookup, not a candidate", () => {
	const result = detectReconnaissance({
		exposures: [],
		subdomains: [],
		dns: [dnsRow({ lastSuccess: null })],
	});
	assert.equal(result.candidates, 0);
	assert.equal(result.falsePositives, 0);
});

test("the measurement reads the stored tables through the same rule", async () => {
	const measurement = await measureReconnaissance();
	assert.equal(measurement.scope, "nouvelle-aquitaine");
	assert.equal(measurement.basis, "observable-attack-surface");
	assert.equal(measurement.count, 3);
	assert.equal(measurement.candidates, 8);
	assert.equal(measurement.falsePositives, 5);
	assert.equal(measurement.falsePositiveRate, 5 / 8);
	assert.deepEqual(measurement.signals, {
		service_fingerprint: 1,
		subdomain_enumeration: 1,
		dns_observation: 1,
	});
	assert.deepEqual(measurement.candidateSignals, {
		service_fingerprint: 4,
		subdomain_enumeration: 3,
		dns_observation: 1,
	});
	assert.deepEqual(Object.keys(measurement.baseline).sort(), [
		"departments", "dnsDomains", "dnsResolved", "events", "exposures", "organizations",
		"sources", "subdomains",
	]);

	const detected = new Set(measurement.detections.map((detection) => detection.orgId));
	assert.ok(detected.has(serviceOrgId));
	assert.ok(detected.has(uniqueCtOrgId));
	assert.ok(detected.has(dnsOrgId));
	assert.ok(!detected.has(unownedOrgId));
	assert.ok(!detected.has(sharedAOrgId));
	assert.ok(!detected.has(sharedBOrgId));
	assert.ok(!detected.has(ambiguousCtaOrgId));
	assert.ok(!detected.has(ambiguousCtbOrgId));
	assert.ok(!detected.has(pendingDnsOrgId));
	assert.ok(!detected.has(nonNaOrgId));

	for (const detection of measurement.detections) {
		assert.deepEqual(Object.keys(detection).sort(), ["dept", "evidence", "orgId", "signal"]);
	}
	assert.doesNotMatch(
		JSON.stringify(measurement.detections),
		/hostname|203\.0\.113|example|invalid|www\./i,
	);
});

test("GET /api/reconnaissance publishes the English contract without observables", async () => {
	const response = await app.inject({ method: "GET", url: "/api/reconnaissance" });
	assert.equal(response.statusCode, 200);
	const body = response.json<Record<string, unknown>>();
	assert.deepEqual(Object.keys(body).sort(), [
		"basis",
		"candidateSignals",
		"candidates",
		"count",
		"detections",
		"falsePositiveRate",
		"falsePositives",
		"measuredAt",
		"observations",
		"scope",
		"signals",
	]);
	assert.equal(body.scope, "nouvelle-aquitaine");
	assert.equal(body.basis, "observable-attack-surface");
	assert.equal(body.count, 3);
	assert.doesNotMatch(response.body, /hostname|203\.0\.113|\.example|\.invalid/i);
});
