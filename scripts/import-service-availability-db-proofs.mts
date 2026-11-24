/**
 * Import the real HTTP verifications already stored in `source_verification`
 * and `exposition_service` into the availability observations file. Read-only
 * on the database, bounded to an explicit UTC date range and to the fixed
 * Nouvelle-Aquitaine perimeter.
 *
 *   DATABASE_URL=postgres://… apps/api/node_modules/.bin/tsx \
 *     scripts/import-service-availability-db-proofs.mts \
 *     --from=2026-11-18 --to=2026-11-25
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import {
	normalizeProofUrl,
	observationsFromDbProofs,
	observationsFromExpositionProofs,
	type DbProofRow,
	type ExpositionProofRow,
} from "../apps/api/src/serviceAvailability/dbProofs.js";
import { mergeDaily, parseObservations, serializeObservations } from "../apps/api/src/serviceAvailability/observations.js";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required to import real database proofs");
	}
	const from = option("from", "2026-11-18");
	const to = option("to", "2026-11-25");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
		throw new RangeError("expected --from=YYYY-MM-DD and --to=YYYY-MM-DD");
	}
	const out = resolve(option("out", "bench/results/service-availability-observations.jsonl"));
	const perimeter = readCorpusPerimeter(resolve("bench/corpus/institutions-complet.jsonl"));
	const existing = existsSync(out) ? parseObservations(readFileSync(out, "utf8")) : [];
	const before = new Map(existing.map((row) => [`${row.serviceId}\u0000${row.day}`, row.ok]));

	const dbProofs = await query<DbProofRow>(
		`SELECT url, code_http, verifie_at, ms FROM public.source_verification
		 WHERE verifie_at >= $1::timestamptz AND verifie_at < $2::timestamptz
		   AND code_http >= 200 AND code_http < 400
		   AND regexp_replace(lower(url), '/+$', '') = ANY($3::text[])
		 ORDER BY verifie_at`,
		[`${from}T00:00:00.000Z`, `${to}T00:00:00.000Z`, perimeter.map((service) => normalizeProofUrl(service.url))]
	);
	const expositionProofs = await query<ExpositionProofRow>(
		`SELECT source_url AS url, (evidence->>'status')::int AS status, consulted_at
		 FROM public.exposition_service
		 WHERE consulted_at >= $1::timestamptz AND consulted_at < $2::timestamptz
		   AND source_url IS NOT NULL
		   AND evidence->>'status' ~ '^[0-9]+$'
		   AND (evidence->>'status')::int >= 200 AND (evidence->>'status')::int < 400
		 ORDER BY consulted_at`,
		[`${from}T00:00:00.000Z`, `${to}T00:00:00.000Z`]
	);
	const dbMapped = observationsFromDbProofs(dbProofs.rows, perimeter);
	const expositionMapped = observationsFromExpositionProofs(expositionProofs.rows, perimeter);
	const imported = [...dbMapped, ...expositionMapped];
	const deduped = mergeDaily(imported);
	const merged = mergeDaily([...existing, ...imported]);
	let added = 0;
	let upgraded = 0;
	for (const row of deduped) {
		const prior = before.get(`${row.serviceId}\u0000${row.day}`);
		if (prior === undefined) added += 1;
		else if (!prior && row.ok) upgraded += 1;
	}
	writeFileSync(out, serializeObservations(merged), "utf8");
	console.log(
		`db_rows=${dbProofs.rows.length} db_mapped=${dbMapped.length} ` +
		`exposition_rows=${expositionProofs.rows.length} exposition_mapped=${expositionMapped.length} ` +
		`new_service_days=${added} upgraded=${upgraded} total_stored=${merged.length}`
	);
}

try {
	await main();
} finally {
	await closePools();
}
