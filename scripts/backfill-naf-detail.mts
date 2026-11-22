/**
 * Backfill the detailed NAF classification of Nouvelle-Aquitaine organisations.
 * Rows whose raw `org.naf` is already a valid APE code need no backfill: the
 * measurement counts them directly. Only legacy, truncated and missing codes
 * are visited, which keeps the run short and bounded on a 1.6 M-row table.
 * --max-batches=N caps a run (each command stays under 60 s); --trace prints
 * per-batch timings. Re-running is safe: unchanged rows are not updated.
 *
 * Usage:
 *   DATABASE_URL=... tsx scripts/backfill-naf-detail.mts --dry-run
 *   DATABASE_URL=... tsx scripts/backfill-naf-detail.mts
 */
import { closePools, ingestQuery, withTransaction } from "../apps/api/src/db.js";
import { consignerLot, type JournalEntry } from "../apps/api/src/journal/index.js";
import {
	NA_DEPARTMENTS,
	classifyDetailedNaf,
	type NafDetailSource,
} from "../apps/api/src/analyse/naf-detail.js";

type Row = { id: number; naf: string | null; sector: string | null };

const BATCH_SIZE = 5000;
const WRITE = !process.argv.includes("--dry-run");
const MAX_BATCHES_ARG = process.argv.find((arg) => arg.startsWith("--max-batches="));
const MAX_BATCHES = MAX_BATCHES_ARG ? Number(MAX_BATCHES_ARG.split("=")[1]) : Infinity;
const TRACE = process.argv.includes("--trace");

async function main(): Promise<void> {
	let lastId = 0;
	let batches = 0;
	let processed = 0;
	let written = 0;
	const bySource = new Map<NafDetailSource, number>();

	while (true) {
		if (batches >= MAX_BATCHES) break;
		const started = Date.now();
		const { rows } = await ingestQuery<Row>(
			`SELECT id, naf, sector FROM org
			  WHERE id > $1 AND dept = ANY($3::text[])
			    AND (naf IS NULL OR naf !~ '^[0-9]{2}\\.[0-9]{2}[A-Z]$')
			  ORDER BY id LIMIT $2`,
			[lastId, BATCH_SIZE, [...NA_DEPARTMENTS]],
		);

		if (rows.length === 0) break;
		const ids: number[] = [];
		const codes: (string | null)[] = [];
		const sources: (string | null)[] = [];
		const confidences: (number | null)[] = [];
		for (const row of rows) {
			const result = classifyDetailedNaf(row);
			ids.push(row.id);
			codes.push(result?.code ?? null);
			sources.push(result?.source ?? null);
			confidences.push(result?.confidence ?? null);
			if (result) bySource.set(result.source, (bySource.get(result.source) ?? 0) + 1);
		}

		if (WRITE) {
			await withTransaction(async (client) => {
				const res = await client.query(
					`UPDATE org AS o
					    SET naf_detail = v.code,
					        naf_detail_source = v.source,
					        naf_detail_confidence = v.confidence
					   FROM unnest($1::int[], $2::text[], $3::text[], $4::real[])
					        AS v(id, code, source, confidence)
					  WHERE o.id = v.id
					    AND (o.naf_detail IS DISTINCT FROM v.code
					      OR o.naf_detail_source IS DISTINCT FROM v.source
					      OR o.naf_detail_confidence IS DISTINCT FROM v.confidence)`,
					[ids, codes, sources, confidences],
				);
				written += res.rowCount ?? 0;
			});
		}

		lastId = rows[rows.length - 1]!.id;
		processed += rows.length;
		batches += 1;
		if (TRACE) {
			console.log(`batch ${batches}: last id ${lastId}, ${Date.now() - started} ms`);
		}
	}

	const facts: JournalEntry[] = WRITE
		? [{
			kind: "org.changed",
			subject: "naf-detail:backfill@1",
			summary: `${written} organisations received a detailed NAF classification (source and confidence included)`,
			actor: "backfill:naf-detail@1",
			payload: { processed, written, bySource: Object.fromEntries(bySource) },
		}]
		: [];
	if (facts.length > 0) {
		const lot = await consignerLot(facts);
		console.log(`journal: ${lot.consignes} fact(s), ${lot.lacunes} gap(s), ${lot.erreurs.length} failure(s)`);
	}

	console.log(`${WRITE ? "processed" : "dry run"}: ${processed} organisation(s), ${written} written`);
	for (const [source, count] of [...bySource].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${source.padEnd(20)} ${count}`);
	}
	await closePools();
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
