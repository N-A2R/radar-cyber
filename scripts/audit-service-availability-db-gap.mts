/**
 * Reproducible audit of the real HTTP proofs that could fill the missing days
 * of the seven-day availability window. Read-only on the database, bounded to
 * an explicit UTC window; only public URL, HTTP status and UTC timestamp are
 * selected. No payload, no person field, no inferred day and no paid service.
 *
 *   DATABASE_URL=postgres://… apps/api/node_modules/.bin/tsx \
 *     scripts/audit-service-availability-db-gap.mts \
 *     --from=2026-11-18 --to=2026-11-20
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import {
	classifyHttpProofGap,
	type HttpProofGapRow,
} from "../apps/api/src/serviceAvailability/dbGap.js";
import { parseObservations } from "../apps/api/src/serviceAvailability/observations.js";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required to audit database HTTP proofs");
	}
	const from = option("from", "2026-11-18");
	const to = option("to", "2026-11-20");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
		throw new RangeError("expected --from=YYYY-MM-DD and --to=YYYY-MM-DD");
	}
	const services = readCorpusPerimeter(resolve("bench/corpus/institutions-complet.jsonl"));
	const observationsPath = resolve("bench/results/service-availability-observations.jsonl");
	const observed = new Set(
		(existsSync(observationsPath) ? parseObservations(readFileSync(observationsPath, "utf8")) : [])
			.map((row) => `${row.serviceId}\u0000${row.day}`)
	);

	const sources = [
		{
			table: "source_verification",
			sql: `SELECT url, code_http AS status, verifie_at AS at
			      FROM public.source_verification
			      WHERE verifie_at >= $1::timestamptz AND verifie_at < $2::timestamptz`,
		},
		{
			table: "exposition_service",
			sql: `SELECT source_url AS url, (evidence->>'status')::int AS status, consulted_at AS at
			      FROM public.exposition_service
			      WHERE consulted_at >= $1::timestamptz AND consulted_at < $2::timestamptz
			        AND source_url IS NOT NULL AND evidence->>'status' ~ '^[0-9]+$'`,
		},
		{
			table: "warc_proof",
			sql: `SELECT target_uri AS url, http_status AS status, captured_at AS at
			      FROM public.warc_proof
			      WHERE captured_at >= $1::timestamptz AND captured_at < $2::timestamptz`,
		},
		{
			table: "leak_site_freshness",
			sql: `SELECT site_url AS url, http_status AS status, harvested_at AS at
			      FROM public.leak_site_freshness
			      WHERE harvested_at >= $1::timestamptz AND harvested_at < $2::timestamptz`,
		},
	];
	const rows: HttpProofGapRow[] = [];
	for (const source of sources) {
		const result = await query<HttpProofGapRow>(
			source.sql,
			[`${from}T00:00:00.000Z`, `${to}T00:00:00.000Z`]
		);
		rows.push(...result.rows.map((row) => ({ ...row, table: source.table })));
	}

	const audit = classifyHttpProofGap(rows, services, from, to);
	const newServiceDays = audit.serviceDayKeys.filter((key) => !observed.has(key)).length;
	console.log(
		`window=${from}..${to} tables=${sources.length} rows_in_window=${audit.rowsInWindow} ` +
		`perimeter_rows=${audit.perimeterRows} capturable_service_days=${audit.capturableServiceDays} ` +
		`new_service_days=${newServiceDays} verdict=${audit.perimeterRows === 0 ? "no_http_proof" : "http_proofs_found"}`
	);
	for (const day of audit.byDay) {
		console.log(`day=${day.day} rows=${day.rows} perimeter_rows=${day.perimeterRows}`);
	}
}

try {
	await main();
} finally {
	await closePools();
}
