/**
 * Reproducible measurement of cyber public contracts in Nouvelle-Aquitaine.
 *
 *   apps/api/node_modules/.bin/tsx scripts/measure-cyber-contracts.mts \
 *     --json=bench/results/cyber-contracts-na-2026-11-22.json --with-db --check
 *
 * Reads only the versioned corpus collected from the free BOAMP open-data API.
 * No network call and no clock in the computation. `--with-db` adds the real
 * baseline counts from localhost:5433/radar inside a READ ONLY transaction.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
	groupContracts,
	isCyberObject,
	isNaDepartments,
	measureContracts,
	safeNoticeKeys,
	type ContractNotice,
} from "../apps/api/src/procurement/cyber-contracts.js";

const argv = process.argv.slice(2);
const option = (name: string): string | null =>
	argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const WITH_DB = argv.includes("--with-db");
const CHECK = argv.includes("--check");
const OUT = option("json");
const DATA = option("data") ?? "bench/corpus/cyber-contracts-na.json";
const DB_URL = process.env.RADAR_MESURE_DB_URL ?? "postgres://radar:radar@localhost:5433/radar";

type Corpus = {
	meta: { source: string; license: string; window: { from: string; to: string }; collectedAt: string };
	notices: ContractNotice[];
};

type ClientLecture = {
	connect(): Promise<void>;
	query<T>(text: string): Promise<{ rows: T[] }>;
	end(): Promise<void>;
};

async function baseline(): Promise<{ organisations: number; sources: number; events: number }> {
	const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
	const { Client } = require("pg") as {
		Client: new (options: { connectionString: string; connectionTimeoutMillis: number }) => ClientLecture;
	};
	const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 10_000 });
	await client.connect();
	try {
		await client.query("BEGIN READ ONLY");
		const { rows } = await client.query<{ organisations: string; sources: string; events: string }>(
			`SELECT (SELECT count(*)::int FROM org) AS organisations,
			        (SELECT count(*)::int FROM source) AS sources,
			        (SELECT count(*)::int FROM event) AS events`,
		);
		return {
			organisations: Number(rows[0].organisations),
			sources: Number(rows[0].sources),
			events: Number(rows[0].events),
		};
	} finally {
		await client.end();
	}
}

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(DATA, "utf8")) as Corpus;
	const { from, to } = corpus.meta.window;
	const notices = corpus.notices;
	const measure = measureContracts(groupContracts(notices), from, to);
	const windowDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
	const checks = {
		twelveMonthWindow: windowDays === 365,
		naOnly: notices.every((n) => isNaDepartments(n.departments)),
		cyberOnly: notices.every((n) => isCyberObject(n.object)),
		uniqueNotices: new Set(notices.map((n) => n.id)).size === notices.length,
		noPersonalFields: notices.every((n) => safeNoticeKeys(n as unknown as Record<string, unknown>)),
		noVictimData: !/victim|victime/i.test(JSON.stringify(measure.contracts)),
		amountsPublished: measure.withAmount > 0,
		awardeesPublished: measure.withAwardee > 0,
	};
	const report = {
		objective: "number of cyber public contracts published in Nouvelle-Aquitaine over 12 months, with amounts and awardees",
		command: `apps/api/node_modules/.bin/tsx scripts/measure-cyber-contracts.mts --json=${OUT ?? "-"} --with-db --check`,
		source: { name: corpus.meta.source, license: corpus.meta.license, collectedAt: corpus.meta.collectedAt },
		notices: notices.length,
		window: measure.window,
		contracts: measure.count,
		amount: { published: measure.withAmount, totalEur: measure.totalAmountEur },
		awardees: { published: measure.withAwardee, byName: measure.awardees },
		byMonth: measure.byMonth,
		byDepartment: measure.byDepartment,
		markets: measure.contracts.map((c) => ({
			firstPublished: c.firstPublished,
			department: c.department,
			buyer: c.buyer,
			object: c.object,
			amountEur: c.amountEur,
			amountKind: c.amountKind,
			awardees: c.awardees,
			noticeIds: c.noticeIds,
		})),
		checks,
		baseline: WITH_DB ? await baseline() : null,
	};
	if (OUT) writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify({
		window: report.window,
		notices: report.notices,
		contracts: report.contracts,
		amount: report.amount,
		awardees: { published: report.awardees.published, names: report.awardees.byName.map((a) => a.name) },
		byDepartment: report.byDepartment,
		checks,
		baseline: report.baseline,
	}, null, 2));
	if (CHECK && Object.values(checks).some((ok) => !ok)) {
		console.error("cyber-contracts: objective not met", checks);
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
