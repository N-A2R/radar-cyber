#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement: number of NA facts holding a verifiable WARC
 * proof (file + hashes + scope).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/measure-warc-proofs.mts
 */
import { closePools } from "../apps/api/src/db.js";
import { measureWarcProofs } from "../apps/api/src/warc/measure.js";

async function main(): Promise<void> {
	const measure = await measureWarcProofs();
	console.log(
		`WARC proofs: ${measure.factsWithArchivableProof} / ${measure.target} facts ` +
		`(${measure.coveragePercent}%), scope=${measure.scope}`,
	);
	console.log(JSON.stringify(measure, null, 2));
}

try {
	await main();
} finally {
	await closePools();
}
