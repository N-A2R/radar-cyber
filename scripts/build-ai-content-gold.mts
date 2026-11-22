/**
 * Freeze the AI-content gold corpus from the live Nouvelle-Aquitaine database.
 *
 * Read-only on the database. Each AI sample is paired with the real event it
 * was written from, so a detector cannot rely on topic or source to decide.
 * The output file is frozen: the measurement reads it, never rebuilds it.
 *
 *   DATABASE_URL=... tsx scripts/build-ai-content-gold.mts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { naDepartmentCode } from "../apps/api/src/geo/na-departments.js";

const SAMPLES = "bench/ai-content/ai-samples.json";
const OUTPUT = "bench/ai-content/gold-v1.json";

type Sample = { eventId: number; split: "dev" | "test"; language: string; text: string; hard?: boolean };
type HardNegative = { id: string; split: "dev" | "test"; department: string; text: string; provenance: Record<string, unknown> };
type EventRow = {
	id: number;
	source_id: string;
	family: string;
	title: string;
	summary: string | null;
	department: string | null;
};

type GoldEntry = {
	id: string;
	split: string;
	label: "ai" | "human";
	department: string;
	sourceKind: "public" | "gray";
	text: string;
	provenance: Record<string, unknown>;
};

function clean(value: string | null): string {
	return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function main(): Promise<void> {
	const raw = JSON.parse(readFileSync(SAMPLES, "utf8")) as {
		generator: string;
		prompt: string;
		hardNegatives: HardNegative[];
		samples: Sample[];
	};
	const ids = raw.samples.map((sample) => sample.eventId);
	const rows = await query<EventRow>(
		`SELECT e.id, e.source_id, e.family, e.title, e.summary, o.dept AS department
		   FROM event e JOIN org o ON o.id = e.org_id
		  WHERE e.id = ANY($1::bigint[])`,
		[ids]
	);
	const byId = new Map(rows.rows.map((row) => [Number(row.id), row]));
	const entries: GoldEntry[] = [];

	for (const sample of raw.samples) {
		const row = byId.get(sample.eventId);
		if (!row) throw new Error(`event ${sample.eventId} missing from database`);
		const department = naDepartmentCode(row.department);
		if (!department) throw new Error(`event ${sample.eventId} is outside Nouvelle-Aquitaine`);
		const sourceKind = row.family === "leaks" || row.family === "ransomware" ? "gray" : "public";
		const common = {
			split: sample.split,
			department,
			sourceKind,
		};
		entries.push({
			...common,
			id: `event-${sample.eventId}-human`,
			label: "human",
			text: clean(`${row.title}. ${row.summary ?? ""}`),
			provenance: {
				kind: "real_event",
				eventId: row.id,
				sourceId: row.source_id,
				family: row.family,
			},
		});
		entries.push({
			...common,
			id: `event-${sample.eventId}-ai`,
			label: "ai",
			text: sample.text,
			provenance: {
				kind: "llm_rewrite",
				eventId: row.id,
				sourceId: row.source_id,
				family: row.family,
				generator: raw.generator,
				prompt: raw.prompt,
			},
		});
	}
	for (const negative of raw.hardNegatives ?? []) {
		entries.push({
			id: negative.id,
			split: negative.split,
			department: negative.department,
			sourceKind: "public",
			label: "human",
			text: negative.text,
			provenance: negative.provenance,
		});
	}

	const counts = await query<{ organisations: string; sources: string; events: string; na_events: string }>(
		`SELECT (SELECT count(*)::text FROM org) AS organisations,
		        (SELECT count(*)::text FROM source) AS sources,
		        (SELECT count(*)::text FROM event) AS events,
		        (SELECT count(*)::text FROM event e JOIN org o ON o.id = e.org_id
		          WHERE o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')) AS na_events`
	);
	const gold = {
		version: 1,
		date: "2026-11-22",
		protocol:
			"28 paired cases from live Nouvelle-Aquitaine events: the human text is the real title and summary, the AI text is a language-model rewrite of that same event. Eight AI cases keep dates and identifiers. One real human press excerpt with formulaic phrasing is added as a hard negative. The split is frozen in ai-samples.json; the detector is calibrated on dev only.",
		database: counts.rows[0],
		sha256AiSamples: sha256(SAMPLES),
		effectifs: {
			cases: raw.samples.length,
			hardNegatives: (raw.hardNegatives ?? []).length,
			entries: entries.length,
			dev: entries.filter((entry) => entry.split === "dev").length,
			test: entries.filter((entry) => entry.split === "test").length,
		},
		entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
	};
	writeFileSync(OUTPUT, `${JSON.stringify(gold, null, 2)}\n`);
	console.log(JSON.stringify({ output: OUTPUT, ...gold.effectifs }, null, 2));
}

try {
	await main();
} finally {
	await closePools();
}
