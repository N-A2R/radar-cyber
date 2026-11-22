/**
 * One test per honeypot behaviour: NA-only capture, probe filtering, no victim
 * data, provenance, windowing, aggregation, bounded memory and the API route.
 */
import assert from "node:assert/strict";
import { request as httpRequest, type Server } from "node:http";
import { after, test } from "node:test";
import Fastify from "fastify";
import {
	classifyAgent,
	createNetworkClassifier,
	createScanStore,
	fingerprintAddress,
	summarize,
	WINDOW_24H_MS,
	type HoneypotScan,
	type ScanStore,
} from "../src/honeypot/model.js";
import honeypotRoute from "../src/honeypot/route.js";
import { honeypotStore } from "../src/honeypot/instance.js";
import { startHoneypot } from "../src/honeypot/server.js";

const DECOY_HOST = "sonde1.nouvelle-aquitaine.invalid";
const servers: Server[] = [];
after(() => {
	for (const server of servers) server.close();
});

function send(port: number, path: string, host = DECOY_HOST, headers: Record<string, string> = {}): Promise<number> {
	const { promise, resolve, reject } = Promise.withResolvers<number>();
	const req = httpRequest(
		{ host: "127.0.0.1", port, path, method: "GET", headers: { Host: host, ...headers } },
		(res) => {
			res.resume();
			res.once("end", () => resolve(res.statusCode ?? 0));
		},
	);
	req.once("error", reject);
	req.end();
	return promise;
}

async function withHoneypot<T>(
	options: { store?: ScanStore; now?: () => Date; networkClassifier?: (address: string) => "tor-exit" | "abuse-reported" | "unknown" },
	fn: (context: { port: number; store: ScanStore }) => Promise<T>,
): Promise<T> {
	const store = options.store ?? createScanStore();
	const server = await startHoneypot({
		host: "127.0.0.1",
		port: 0,
		secret: "test-secret",
		store,
		now: options.now,
		networkClassifier: options.networkClassifier,
	});
	servers.push(server);
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("no TCP port");
	return fn({ port: address.port, store });
}

function scan(id: string, receivedAt: string, overrides: Partial<HoneypotScan> = {}): HoneypotScan {
	return {
		id,
		receivedAt,
		host: DECOY_HOST,
		probe: "/.env",
		method: "GET",
		fingerprint: `actor-${id}`,
		provenance: { agent: "curl", network: "unknown", path: "direct" },
		...overrides,
	};
}

test("captures a probe sent to a Nouvelle-Aquitaine decoy host", async () => {
	await withHoneypot({}, async ({ port, store }) => {
		assert.equal(await send(port, "/.env"), 200);
		const scans = store.all();
		assert.equal(scans.length, 1);
		assert.equal(scans[0]?.host, DECOY_HOST);
		assert.equal(scans[0]?.probe, "/.env");
		assert.equal(scans[0]?.method, "GET");
	});
});

test("rejects hosts outside Nouvelle-Aquitaine", async () => {
	await withHoneypot({}, async ({ port, store }) => {
		assert.equal(await send(port, "/.env", "wp-login.example.org"), 404);
		assert.equal(await send(port, "/.env", "example.com"), 404);
		assert.equal(store.all().length, 0);
	});
});

test("rejects paths that are not decoy probes", async () => {
	await withHoneypot({}, async ({ port, store }) => {
		assert.equal(await send(port, "/health"), 404);
		assert.equal(await send(port, "/api/events"), 404);
		assert.equal(await send(port, "/.git/config"), 200);
		assert.equal(store.all().length, 1);
	});
});

test("drops query strings before storing a probe", async () => {
	await withHoneypot({}, async ({ port, store }) => {
		assert.equal(await send(port, "/wp-login.php?user=alice&password=secret123"), 200);
		assert.equal(store.all()[0]?.probe, "/wp-login.php");
		assert.ok(!JSON.stringify(store.all()).includes("alice"));
		assert.ok(!JSON.stringify(store.all()).includes("secret123"));
	});
});

test("stores a pseudonymous fingerprint instead of the source address", async () => {
	await withHoneypot({}, async ({ port, store }) => {
		assert.equal(await send(port, "/.env", DECOY_HOST, { "X-Forwarded-For": "198.51.100.77" }), 200);
		const scans = store.all();
		assert.equal(scans[0]?.fingerprint, fingerprintAddress("198.51.100.77", "test-secret"));
		assert.ok(!JSON.stringify(scans).includes("198.51.100.77"));
	});
});

test("normalizes scanner user agents into agent families", () => {
	assert.equal(classifyAgent("Nmap Scripting Engine"), "nmap");
	assert.equal(classifyAgent("masscan/1.0"), "masscan");
	assert.equal(classifyAgent("curl/8.5.0"), "curl");
	assert.equal(classifyAgent("python-requests/2.31.0"), "script");
	assert.equal(classifyAgent("Mozilla/5.0 Chrome/120.0"), "browser");
	assert.equal(classifyAgent(undefined), "unknown");
});

test("labels declared provenance from the offline network snapshot", async () => {
	const classifier = createNetworkClassifier({
		generatedAt: "2026-11-22",
		sources: [{ label: "tor-exit", url: "https://example.invalid/list", addresses: ["203.0.113.5"] }],
	});
	await withHoneypot({ networkClassifier: classifier }, async ({ port, store }) => {
		await send(port, "/.env", DECOY_HOST, {
			"X-Forwarded-For": "203.0.113.5, 10.0.0.1",
			"User-Agent": "curl/8.5.0",
		});
		const provenance = store.all()[0]?.provenance;
		assert.equal(provenance?.network, "tor-exit");
		assert.equal(provenance?.path, "forwarded");
		assert.equal(provenance?.agent, "curl");
	});
});

test("counts only scans inside the requested 24 hour window", () => {
	const now = new Date("2026-11-22T12:00:00.000Z");
	const stamps = [-60, -23 * 60, -25 * 60, +60].map((minutes) => new Date(now.getTime() + minutes * 60_000).toISOString());
	const scans = stamps.map((stamp, index) => scan(`s${index}`, stamp));
	const summary = summarize(scans, now, WINDOW_24H_MS);
	assert.equal(summary.scans, 2);
	assert.equal(summary.windowMs, WINDOW_24H_MS);
	assert.equal(summary.firstAt, stamps[1]);
	assert.equal(summary.lastAt, stamps[0]);
});

test("groups 24 hour scans by provenance and probe", () => {
	const now = new Date("2026-11-22T12:00:00.000Z");
	const scans = [
		scan("a", now.toISOString(), { probe: "/.env", provenance: { agent: "nmap", network: "tor-exit", path: "direct" } }),
		scan("b", now.toISOString(), { probe: "/xmlrpc.php", provenance: { agent: "nmap", network: "tor-exit", path: "direct" } }),
		scan("c", now.toISOString(), { probe: "/.env", provenance: { agent: "curl", network: "unknown", path: "forwarded" } }),
	];
	const summary = summarize(scans, now);
	assert.deepEqual(summary.byNetwork, { "tor-exit": 2, "abuse-reported": 0, unknown: 1 });
	assert.deepEqual(summary.byAgent, { nmap: 2, masscan: 0, curl: 1, script: 0, browser: 0, unknown: 0 });
	assert.deepEqual(summary.byProbe, { "/.env": 2, "/xmlrpc.php": 1 });
	assert.equal(summary.distinctActors, 3);
});

test("caps the in-memory store so the decoy stays lightweight", () => {
	const store = createScanStore({ max: 3 });
	for (let i = 0; i < 5; i++) store.add(scan(`s${i}`, new Date().toISOString()));
	assert.equal(store.all().length, 3);
	assert.deepEqual(store.all().map((entry) => entry.id), ["s2", "s3", "s4"]);
});

test("serves the English JSON summary route", async () => {
	honeypotStore.add(scan("a", new Date().toISOString()));
	const app = Fastify();
	await app.register(honeypotRoute);
	try {
		const response = await app.inject({ method: "GET", url: "/honeypot/scans?window=24h" });
		assert.equal(response.statusCode, 200);
		const body = response.json<{ region: string; scans: number; byNetwork: Record<string, number> }>();
		assert.equal(body.region, "nouvelle-aquitaine");
		assert.equal(body.scans, 1);
		assert.equal(body.byNetwork.unknown, 1);
		const invalid = await app.inject({ method: "GET", url: "/honeypot/scans?window=7d" });
		assert.equal(invalid.statusCode, 400);
	} finally {
		await app.close();
	}
});
