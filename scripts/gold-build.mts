#!/usr/bin/env node
/**
 * Build the frozen gold corpus of 500 Nouvelle-Aquitaine incidents.
 *
 * Usage: pnpm gold:build [--size=500] [--seed=20261122]
 * Reads the live radar database plus versioned curated corpora; writes
 * bench/gold/incidents-na-500.jsonl and bench/gold/manifest.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import {
	normaliseEvidenceUrl,
	selectGoldSample,
	summariseGoldCorpus,
	toGoldJsonl,
	validateGoldCorpus,
	withGoldIds,
	type GoldCandidate,
} from "../apps/api/src/gold/corpus.js";
import {
	collectClaimCandidates,
	collectCuratedCandidates,
	collectDatabaseCounts,
	collectEventCandidates,
	collectPrecisionClaimCandidates,
} from "../apps/api/src/gold/sources.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name: string, fallback: number): number => {
	const found = process.argv.find((argument) => argument.startsWith(`--${name}=`));
	return found ? Number(found.split("=")[1]) : fallback;
};
const size = option("size", 500);
const seed = option("seed", 20261122);
const outputDir = join(root, "bench", "gold");

/** One evidence URL means one incident; claims share a URL, so keep their ids. */
function dedupe(candidates: readonly GoldCandidate[]): GoldCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		if (candidate.sourceRef.startsWith("claim:") || candidate.sourceRef.startsWith("precision:")) {
			return true;
		}
		const url = normaliseEvidenceUrl(candidate.sourceUrl);
		if (seen.has(url)) return false;
		seen.add(url);
		return true;
	});
}

try {
	const curated = collectCuratedCandidates(root);
	const events = await collectEventCandidates();
	const claims = await collectClaimCandidates();
	const precision = collectPrecisionClaimCandidates(root);
	console.log(`Candidate pools: curated=${curated.length} events=${events.length} claims=${claims.length} precision=${precision.length}`);
	const unique = dedupe([...curated, ...events, ...claims, ...precision]);
	const sample = selectGoldSample(unique, size, seed);
	const incidents = withGoldIds(sample);
	const validation = validateGoldCorpus(incidents);
	if (validation.errors.length > 0) {
		throw new Error(`Generated corpus is invalid:\n${validation.errors.slice(0, 10).join("\n")}`);
	}
	const summary = summariseGoldCorpus(incidents);
	const counts = await collectDatabaseCounts();
	const manifest = {
		procedure: "gold-corpus-v1",
		generatedAt: new Date().toISOString(),
		seed,
		requestedSize: size,
		population: {
			...counts,
			curatedCandidates: curated.length,
			eventCandidates: events.length,
			claimCandidates: claims.length,
			precisionCandidates: precision.length,
			uniqueCandidates: unique.length,
		},
		summary,
		command: "pnpm gold:build",
		commandLine: process.argv.slice(1).join(" "),
	};
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(join(outputDir, "incidents-na-500.jsonl"), toGoldJsonl(incidents), "utf8");
	writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	console.log(`Gold corpus written: ${summary.incidents} incidents`);
	console.log(`Tiers: verified=${summary.verified} reported=${summary.reported} claimed=${summary.claimed}`);
	console.log(`Departments: ${summary.departments}/12`);
	console.log(`SHA-256: ${summary.sha256}`);
} finally {
	await closePools();
}
