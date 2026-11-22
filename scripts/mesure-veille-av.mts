#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the audio/video watch: number of transcriptions
 * processed and share judged relevant. Reads the frozen corpus only: no network,
 * no database needed unless --apply is requested.
 *
 *   tsx scripts/mesure-veille-av.mts
 *   tsx scripts/mesure-veille-av.mts --apply --json=bench/results/audio-video.json
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { processMediaItems, type MediaItem } from "../apps/api/src/media/transcription.js";

interface Corpus {
	meta: { sha256: string; items: number; mediaSources: number; baseline: Record<string, number> };
	items: MediaItem[];
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const corpusPath = fileURLToPath(new URL("../bench/audio-video/items.json", import.meta.url));
const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as Corpus;
const digest = createHash("sha256").update(JSON.stringify(corpus.items)).digest("hex");
if (digest !== corpus.meta.sha256) {
	throw new Error(`corpus SHA-256 mismatch: ${digest} != ${corpus.meta.sha256}`);
}
if (corpus.items.length !== corpus.meta.items) {
	throw new Error(`corpus size mismatch: ${corpus.items.length} != ${corpus.meta.items}`);
}

const result = processMediaItems(corpus.items);
const relevantRate = result.processed === 0 ? null : result.relevant / result.processed;
const jsonArg = process.argv.find((a) => a.startsWith("--json="));
let applied: number | null = null;

if (process.argv.includes("--apply")) {
	const { applyTranscriptions } = await import("../apps/api/src/media/store.js");
	const { closePools } = await import("../apps/api/src/db.js");
	applied = await applyTranscriptions(result.transcriptions);
	await closePools();
}

const output = {
	date: new Date().toISOString(),
	corpus: corpusPath,
	sha256: digest,
	baseline: corpus.meta.baseline,
	mediaSources: corpus.meta.mediaSources,
	processed: result.processed,
	relevant: result.relevant,
	relevantRate,
	blocked: result.blocked,
	outsideNa: result.outsideNa,
	byDept: result.transcriptions.reduce<Record<string, number>>((acc, row) => {
		acc[row.dept] = (acc[row.dept] ?? 0) + 1;
		return acc;
	}, {}),
	byMethod: result.transcriptions.reduce<Record<string, number>>((acc, row) => {
		acc[row.method] = (acc[row.method] ?? 0) + 1;
		return acc;
	}, {}),
	byReason: result.transcriptions.reduce<Record<string, number>>((acc, row) => {
		acc[row.reason] = (acc[row.reason] ?? 0) + 1;
		return acc;
	}, {}),
	applied,
};

console.log(`Corpus: ${corpus.items.length} real media items from ${corpus.meta.mediaSources} NA radio/TV sources`);
console.log(`SHA-256 verified: ${digest}`);
console.log(`Transcriptions processed: ${result.processed}`);
console.log(`Relevant: ${result.relevant} (${relevantRate === null ? "n/a" : `${(relevantRate * 100).toFixed(1)} %`})`);
console.log(`Blocked for victim data: ${result.blocked}; outside Nouvelle-Aquitaine: ${result.outsideNa}`);
console.log(`By department: ${JSON.stringify(output.byDept)}`);
console.log(`By method: ${JSON.stringify(output.byMethod)}`);
if (applied !== null) console.log(`Rows written (idempotent): ${applied}`);
console.log(`By relevance rule: ${JSON.stringify(output.byReason)}`);

if (jsonArg) {
	const target = new URL(jsonArg.slice(7), `file://${ROOT}`);
	await writeFile(target, `${JSON.stringify(output, null, 2)}\n`);
	console.log(`Result written: ${jsonArg.slice(7)}`);
}
