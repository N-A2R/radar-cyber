/**
 * Reproducible measurement of BGP hijack detection for Nouvelle-Aquitaine operators.
 *
 *   tsx scripts/measure-bgp-hijack.mts
 *   tsx scripts/measure-bgp-hijack.mts --with-db
 *
 * The detector and the versioned historical fixture are offline. With --with-db,
 * the real baseline counts are read from localhost:5433/radar in a READ ONLY
 * transaction; nothing is written.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	detectPrefixHijacks,
	personalDataFindings,
	type BgpAnnouncement,
	type BgpOperator,
} from "../apps/api/src/bgp/hijack.js";

const argv = process.argv.slice(2);
const WITH_DB = argv.includes("--with-db");
const DB_URL = process.env.RADAR_MESURE_DB_URL ?? "postgres://radar:radar@localhost:5433/radar";
const FIXTURE_PATH = argv.find((a) => a.startsWith("--fixture="))?.split("=")[1]
	?? fileURLToPath(new URL("../bench/fixtures/bgp-na-historical.json", import.meta.url));

type HistoricalFixture = {
	meta: {
		title: string;
		source: string;
		window: { start: string; end: string };
	};
	operators: BgpOperator[];
	announcements: BgpAnnouncement[];
	replay: BgpAnnouncement[];
};

type ClientLecture = {
	connect(): Promise<void>;
	query<T>(text: string): Promise<{ rows: T[] }>;
	end(): Promise<void>;
};

async function baseline(): Promise<{ orgs: number; sources: number; events: number }> {
	const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
	const { Client } = require("pg") as {
		Client: new (options: { connectionString: string; connectionTimeoutMillis: number }) => ClientLecture;
	};
	const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 10_000 });
	await client.connect();
	try {
		await client.query("BEGIN READ ONLY");
		const { rows } = await client.query<{ orgs: string; sources: string; events: string }>(
			`SELECT (SELECT count(*) FROM org)::text AS orgs,
			        (SELECT count(*) FROM source)::text AS sources,
			        (SELECT count(*) FROM event)::text AS events`,
		);
		return {
			orgs: Number(rows[0].orgs),
			sources: Number(rows[0].sources),
			events: Number(rows[0].events),
		};
	} finally {
		await client.end();
	}
}

async function main(): Promise<void> {
	const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as HistoricalFixture;
	const alerts = detectPrefixHijacks(
		[...fixture.announcements, ...fixture.replay],
		fixture.operators,
	);
	const detected = alerts.filter((alert) => alert.source === "documented-replay").length;
	const falsePositives = alerts.filter((alert) => alert.source !== "documented-replay").length;
	const injected = fixture.replay.length;
	const precision = detected + falsePositives === 0 ? 1 : detected / (detected + falsePositives);
	const recall = injected === 0 ? 0 : detected / injected;
	const personal = personalDataFindings(alerts);

	console.log(`dataset: ${fixture.meta.title}`);
	console.log(`source: ${fixture.meta.source}`);
	console.log(`window: ${fixture.meta.window.start} → ${fixture.meta.window.end}`);
	for (const operator of fixture.operators) {
		console.log(`operator: ${operator.name} (AS${operator.asn}, ${operator.region})`);
	}
	console.log(`real_announcements: ${fixture.announcements.length}`);
	console.log(`injected_hijacks: ${injected}`);
	console.log(`hijacks_detected: ${detected}`);
	console.log(`false_positives: ${falsePositives}`);
	console.log(`precision: ${precision.toFixed(4)}`);
	console.log(`recall: ${recall.toFixed(4)}`);
	console.log(`personal_data_findings: ${personal.length}`);
	for (const alert of alerts) {
		console.log(
			`alert: ${alert.kind} ${alert.prefix} origin=AS${alert.observedAs} expected=AS${alert.expectedAs} operator="${alert.operator}" at ${alert.timestamp}`,
		);
	}
	if (WITH_DB) {
		const state = await baseline();
		console.log(`baseline_orgs: ${state.orgs}`);
		console.log(`baseline_sources: ${state.sources}`);
		console.log(`baseline_events: ${state.events}`);
	}

	if (detected !== injected || falsePositives !== 0 || personal.length !== 0) {
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
