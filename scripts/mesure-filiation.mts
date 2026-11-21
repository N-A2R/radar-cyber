#!/usr/bin/env -S npx tsx
/**
 * Reproducible measure of organisation filiation links with proof.
 *
 * Without `--apply` the script is read-only. With `--apply` it derives links
 * from public SIRENE codes, stores them with their evidence, then measures.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-filiation.mts \
 *     --apply --json=bench/results/filiation-na.json
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/mesure-filiation.mts
 */
import { writeFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";
import { buildFiliationLinks } from "../apps/api/src/filiation/siret.js";
import {
	applyFiliationLinks,
	fetchFiliationCandidates,
	FILIATION_QUERIES,
	measureFiliation,
} from "../apps/api/src/filiation/store.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const JSON_PATH = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ?? null;

async function main(): Promise<void> {
	let derived = 0;
	let changed = 0;
	if (APPLY) {
		const links = buildFiliationLinks(await fetchFiliationCandidates());
		derived = links.length;
		changed = await applyFiliationLinks(links);
	}

	const measure = await measureFiliation();
	const payload = {
		scope: "Nouvelle-Aquitaine (12 departments)",
		rule: "14-digit SIRET establishment -> its 9-digit SIREN prefix, both current and in Nouvelle-Aquitaine",
		source: "INSEE SIRENE stock (public data, no paid service)",
		candidates: measure.candidates,
		established: measure.established,
		byDepartment: measure.byDepartment,
		sql: FILIATION_QUERIES,
	};

	console.log(`candidates: ${measure.candidates}`);
	console.log(`established with proof: ${measure.established}`);
	if (APPLY) console.log(`derived: ${derived}, rows changed: ${changed}`);
	if (JSON_PATH) {
		writeFileSync(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
		console.log(`written: ${JSON_PATH}`);
	}
}

try {
	await main();
} finally {
	await closePools();
}
