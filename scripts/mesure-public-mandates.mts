/**
 * Reproducible measurement of the role-level public office referential.
 *
 *   tsx scripts/mesure-public-mandates.mts                 # versioned dataset only
 *   tsx scripts/mesure-public-mandates.mts --with-db       # add read-only baseline
 *
 * The office count comes from the real Nouvelle-Aquitaine dataset shipped in
 * db/data/referentiel-na.json. With --with-db, the baseline counts are read
 * from localhost:5433/radar inside a READ ONLY transaction; nothing is written.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { personalDataFindings, planPublicMandates } from "../apps/api/src/public-mandates/plan.js";
import { planReferentiel } from "../apps/api/src/referentiel/plan.js";
import type { ReferentielNA } from "../apps/api/src/referentiel/model.js";

const argv = process.argv.slice(2);
const WITH_DB = argv.includes("--with-db");
const DB_URL = process.env.RADAR_MESURE_DB_URL ?? "postgres://radar:radar@localhost:5433/radar";
const DATA_PATH = argv.find((a) => a.startsWith("--data="))?.split("=")[1]
	?? fileURLToPath(new URL("../db/data/referentiel-na.json", import.meta.url));

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
	const data = JSON.parse(readFileSync(DATA_PATH, "utf8")) as ReferentielNA;
	const plan = planPublicMandates(planReferentiel(data));
	const findings = personalDataFindings(plan.mandates);
	const source = data.meta.sources[0];

	console.log(`dataset: ${data.meta.titre} (${data.meta.genereLe})`);
	console.log(`source: ${source?.nom ?? "unknown"} (${source?.licence ?? "unknown"})`);
	console.log(`public_offices: ${plan.counts.total}`);
	for (const [role, total] of Object.entries(plan.counts.byRole)) {
		console.log(`  ${role}: ${total}`);
	}
	console.log(`personal_data_findings: ${findings.length}`);
	console.log(`plan_warnings: ${plan.warnings.length}`);
	if (WITH_DB) {
		const state = await baseline();
		console.log(`baseline_orgs: ${state.orgs}`);
		console.log(`baseline_sources: ${state.sources}`);
		console.log(`baseline_events: ${state.events}`);
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
