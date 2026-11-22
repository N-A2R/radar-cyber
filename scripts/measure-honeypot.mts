/**
 * Reproducible honeypot measurement on the real database baseline.
 *
 * A local decoy listener receives real HTTP requests on a reserved NA host.
 * The replay clock spreads them across one fixed 24 h window (no sleeping),
 * then the same aggregation used by GET /honeypot/scans counts the captures.
 * Provenance comes from a committed snapshot of two free grey lists. Nothing
 * is written to the database and no request body is read.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:honeypot
 */
import { readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { closePools, query } from "../apps/api/src/db.js";
import { startHoneypot } from "../apps/api/src/honeypot/server.js";
import {
	createNetworkClassifier,
	createScanStore,
	DECOY_PROBES,
	WINDOW_24H_MS,
	type AgentFamily,
	type KnownNetworkLabel,
	type NetworkDataset,
	type NetworkLabel,
} from "../apps/api/src/honeypot/model.js";

const SCANS = Number(process.env.RADAR_HONEYPOT_MEASURE_SCANS ?? 144);
const OUT_OF_WINDOW = Number(process.env.RADAR_HONEYPOT_MEASURE_OLD ?? 8);
const OUTPUT = process.env.RADAR_HONEYPOT_MEASURE_OUTPUT ?? "bench/results/honeypot-2026-11-22.json";
const FIXTURE = "bench/fixtures/honeypot-networks.json";
const END_MS = Date.parse("2026-11-22T12:00:00.000Z");
const START_MS = END_MS - WINDOW_24H_MS;
const DECOY_HOST = "sonde1.nouvelle-aquitaine.invalid";

const AGENTS: { family: AgentFamily; header: string }[] = [
	{ family: "nmap", header: "Nmap Scripting Engine" },
	{ family: "curl", header: "curl/8.5.0" },
	{ family: "script", header: "python-requests/2.31.0" },
	{ family: "masscan", header: "masscan/1.0" },
	{ family: "browser", header: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0" },
];
const NETWORKS: NetworkLabel[] = ["tor-exit", "abuse-reported", "unknown"];

function send(port: number, path: string, host: string, headers: Record<string, string>): Promise<number> {
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

async function main(): Promise<void> {
	const dataset = JSON.parse(await readFile(FIXTURE, "utf8")) as NetworkDataset;
	const pools: Record<KnownNetworkLabel, string[]> = {
		"tor-exit": [],
		"abuse-reported": [],
	};
	for (const source of dataset.sources) pools[source.label] = source.addresses;
	for (const label of ["tor-exit", "abuse-reported"] as const) {
		if (pools[label].length === 0) throw new Error(`empty ${label} pool in ${FIXTURE}`);
	}

	let clock = new Date(START_MS);
	const store = createScanStore();
	const server = await startHoneypot({
		host: "127.0.0.1",
		port: 0,
		now: () => clock,
		secret: "replay-secret",
		networkClassifier: createNetworkClassifier(dataset),
		store,
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("local decoy has no TCP port");
	const port = address.port;

	try {
		for (let i = 0; i < SCANS; i++) {
			clock = new Date(START_MS + Math.round(((i + 0.5) * WINDOW_24H_MS) / SCANS));
			const network = NETWORKS[i % NETWORKS.length] as NetworkLabel;
			const agent = AGENTS[i % AGENTS.length]!;
			const pool = network === "unknown" ? null : pools[network];
			const forwarded = pool === null ? `203.0.113.${(i % 200) + 1}` : (pool[i % pool.length] as string);
			const probe = DECOY_PROBES[i % DECOY_PROBES.length] as string;
			const status = await send(port, probe, DECOY_HOST, {
				"User-Agent": agent.header,
				"X-Forwarded-For": forwarded,
			});
			if (status !== 200) throw new Error(`capture ${i}: expected 200, got ${status}`);
		}

		// Older than the window and ordinary traffic must not be counted.
		for (let j = 0; j < OUT_OF_WINDOW; j++) {
			clock = new Date(START_MS - (j + 1) * 60 * 60 * 1000);
			await send(port, "/.env", DECOY_HOST, { "User-Agent": "curl/8.5.0" });
		}
		const ignored: number[] = [];
		clock = new Date(END_MS);
		ignored.push(await send(port, "/health", DECOY_HOST, { "User-Agent": "curl/8.5.0" }));
		ignored.push(await send(port, "/.env", "example.com", { "User-Agent": "curl/8.5.0" }));

		const summary = store.summary(new Date(END_MS), WINDOW_24H_MS);
		if (summary.scans !== SCANS) {
			throw new Error(`expected ${SCANS} scans in 24 h, measured ${summary.scans}`);
		}
		if (store.all().length !== SCANS + OUT_OF_WINDOW) {
			throw new Error("out-of-window or ignored requests were captured");
		}

		const { rows } = await query<{ orgs: string; sources: string; events: string }>(
			`SELECT (SELECT count(*) FROM org)::text AS orgs,
			        (SELECT count(*) FROM source)::text AS sources,
			        (SELECT count(*) FROM event)::text AS events`,
		);
		const baseline = rows[0];
		if (!baseline) throw new Error("no baseline row from the database");

		const result = {
			measuredAt: new Date().toISOString(),
			method: "local NA decoy listener -> real HTTP requests -> 24 h in-memory aggregation",
			region: "nouvelle-aquitaine",
			windowHours: 24,
			window: { from: summary.from, to: summary.to },
			scansCaptured24h: summary.scans,
			distinctActors: summary.distinctActors,
			provenance: {
				byNetwork: summary.byNetwork,
				byAgent: summary.byAgent,
				byPath: summary.byPath,
				byProbe: summary.byProbe,
			},
			replay: {
				scansSent: SCANS,
				outOfWindowSent: OUT_OF_WINDOW,
				ignoredRequests: ignored.length,
				capturedTotal: store.all().length,
			},
			baseline: {
				organisations: Number(baseline.orgs),
				sources: Number(baseline.sources),
				events: Number(baseline.events),
			},
			networkDataset: {
				generatedAt: dataset.generatedAt,
				addresses: dataset.sources.reduce((sum, source) => sum + source.addresses.length, 0),
			},
		};
		await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
		console.log(
			`NA honeypot: ${result.scansCaptured24h} scans captured in 24 h; ` +
				`tor-exit=${summary.byNetwork["tor-exit"]}, ` +
				`abuse-reported=${summary.byNetwork["abuse-reported"]}, ` +
				`unknown=${summary.byNetwork.unknown} -> ${OUTPUT}`,
		);
	} finally {
		server.close();
	}
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
