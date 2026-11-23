#!/usr/bin/env -S npx tsx
/**
 * Archive eligible NA facts into local WARC files (no paid service).
 * Time-bounded: rerun until the measurement reports 100% coverage.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/archive-warc-proofs.mts --max-seconds 45
 */
import { closePools } from "../apps/api/src/db.js";
import { archiveWarcFacts } from "../apps/api/src/warc/service.js";

const argv = process.argv.slice(2);
function option(name: string, fallback: number): number {
	const raw = argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
	const value = raw === undefined ? fallback : Number(raw);
	if (!Number.isFinite(value) || value < 0) throw new Error(`invalid --${name}`);
	return value;
}

async function main(): Promise<void> {
	const report = await archiveWarcFacts({
		limit: option("limit", 600),
		maxSeconds: option("max-seconds", 45),
		concurrency: option("concurrency", 6),
	});
	console.log(JSON.stringify(report, null, 2));
}

try {
	await main();
} finally {
	await closePools();
}
