/**
 * Reproducible F1 measurement for sector and operating-mode classification.
 *
 * Reads a versioned gold label set and the public incident text it refers to,
 * runs the deterministic classifier, and writes a machine-readable report.
 * With DATABASE_URL set it also snapshots the real regional state (counts only,
 * no personal data). No network call and no paid service is involved.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:sector-mode-f1 --json=bench/results/sector-mode-f1.json
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { closePools, ingestQuery } from "../apps/api/src/db.js";
import {
	classifyIncident,
	scorePairs,
	type GoldLabel,
	type IncidentText,
	type ScoredPair,
} from "../apps/api/src/classification/sector-mode.js";

const ROOT = new URL("..", import.meta.url).pathname;
const LABELS_FILE = join(ROOT, "bench/corpus/sector-mode-labels.jsonl");
const CANONICAL_FILE = join(ROOT, "bench/couverture/incidents.jsonl");
const CORPUS_DIR = join(ROOT, "bench/corpus");

type IncidentRecord = IncidentText & {
	id: string;
	organisation?: string | null;
	nom?: string | null;
	titre?: string | null;
	titre_original?: string | null;
	resume?: string | null;
	title?: string | null;
	summary?: string | null;
};

function readJsonLines(path: string): string[] {
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0);
}

/** Drop parenthetical witness descriptions before the text reaches the model. */
function stripWitnessDetails(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	return value.replace(/\([^)]*(?:témoin|anonymis)[^)]*\)/gi, " ");
}

function loadIncidents(): Map<string, IncidentRecord> {
	const paths = [CANONICAL_FILE];
	for (const name of readdirSync(CORPUS_DIR).sort()) {
		if (!/^incidents-.*\.jsonl$/.test(name) || name.includes("multilingues")) continue;
		paths.push(join(CORPUS_DIR, name));
	}
	const byId = new Map<string, IncidentRecord>();
	for (const path of paths) {
		for (const line of readJsonLines(path)) {
			const record = JSON.parse(line) as IncidentRecord;
			if (typeof record.id !== "string" || byId.has(record.id)) continue;
			byId.set(record.id, record);
		}
	}
	return byId;
}

async function databaseState(): Promise<Record<string, unknown> | null> {
	if (!process.env.DATABASE_URL) return null;
	const { rows } = await ingestQuery<Record<string, string>>(`
		SELECT
			(SELECT count(*) FROM org) AS organisations,
			(SELECT count(*) FROM source) AS sources,
			(SELECT count(*) FROM event) AS events,
			(SELECT count(*) FROM event WHERE regional) AS regional_events
	`);
	const state = rows[0];
	if (!state) return null;
	return {
		organisations: Number(state.organisations),
		sources: Number(state.sources),
		events: Number(state.events),
		regionalEvents: Number(state.regional_events),
	};
}

async function main(): Promise<void> {
	const labels = readJsonLines(LABELS_FILE).map((line) => JSON.parse(line) as GoldLabel);
	const incidents = loadIncidents();
	const missing = labels.filter((label) => !incidents.has(label.id)).map((label) => label.id);
	if (missing.length > 0) throw new Error(`Missing source text for: ${missing.join(", ")}`);

	const pairs: ScoredPair[] = labels.map((gold) => {
		const source = incidents.get(gold.id)!;
		const text: IncidentText = {
			organisation: stripWitnessDetails(source.organisation ?? source.nom),
			title: stripWitnessDetails(source.titre ?? source.title),
			summary: stripWitnessDetails(source.resume ?? source.summary),
		};
		return { gold, prediction: classifyIncident(text) };
	});
	const score = scorePairs(pairs);
	const fingerprint = createHash("sha256")
		.update(readFileSync(LABELS_FILE))
		.digest("hex")
		.slice(0, 16);
	const result = {
		metric: "macro-F1 averaged over the sector and mode axes",
		macroF1: score.macroF1,
		weightedF1: score.weightedF1,
		exactMatch: score.exactMatch,
		sector: score.sector,
		mode: score.mode,
		goldCases: score.count,
		labelFingerprint: fingerprint,
		database: await databaseState(),
		measuredAt: new Date().toISOString(),
	};

	const jsonFlag = process.argv.find((arg) => arg.startsWith("--json="));
	if (jsonFlag) {
		const target = jsonFlag.slice("--json=".length);
		writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
		console.log(`Report written to ${target}`);
	}
	console.log(`Gold cases: ${score.count}`);
	console.log(`Sector macro-F1: ${score.sector.f1}`);
	console.log(`Mode macro-F1: ${score.mode.f1}`);
	console.log(`F1 (headline): ${score.macroF1}`);
	console.log(`Exact sector+mode match: ${score.exactMatch}`);
	await closePools();
}

await main();
