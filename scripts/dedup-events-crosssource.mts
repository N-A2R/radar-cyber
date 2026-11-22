#!/usr/bin/env -S npx tsx
/**
 * Deduplicate radar events that the per-source fingerprint cannot catch.
 *
 * Identity: family + normalized title + UTC day, across all catalogue sources
 * (grey/context sources included). Events attached to an organization outside
 * Nouvelle-Aquitaine are out of scope. No title, summary or victim data is
 * ever written to the JSON report.
 *
 * Usage:
 *   tsx scripts/dedup-events-crosssource.mts [--apply] [--window-days=30]
 *       [--baseline=FILE] [--json=FILE]
 *
 * Default mode is read-only. --apply merges each group in one transaction:
 * alerts and archive keys are reassigned, all source provenance is kept on the
 * survivor, an audit fact is appended, and every group is verified before
 * commit. The measure command uses a committed baseline so the published rate
 * stays reproducible after the cleanup has been applied.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PoolClient } from "pg";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	DEDUP_RULE_VERSION,
	findDuplicateGroups,
	isInScope,
	type DuplicateGroup,
	type EventForIdentity,
} from "../apps/api/src/dedup/event-duplicates.js";

type EventRow = {
	id: number;
	family: string;
	title: string;
	observed_at: string | null;
	collected_at: string;
	source_id: string;
	org_department: string | null;
	dedup_key: string;
};

type Verification = {
	survivorId: number;
	duplicateIds: number[];
	sourceIds: string[];
	alertsMoved: number;
	alertsMerged: number;
	ok: boolean;
	detail: string;
};

type Report = {
	rule: string;
	windowDays: number;
	windowStart: string;
	generatedAt: string;
	scope: { region: string; greySources: boolean; victimData: boolean };
	mode: "report" | "apply";
	eventsScanned: number;
	groupsFound: number;
	duplicatesFound: number;
	duplicatesEliminated: number;
	residualDuplicates: number;
	dedupRatePercent: number | null;
	rateBasis: "baseline" | "apply" | "none";
	baseline: { source: string; duplicatesFound: number } | null;
	verifications: Verification[];
};

type Options = {
	apply: boolean;
	windowDays: number;
	jsonFile: string | null;
	sourcePrefix: string | null;
	baselineFile: string | null;
};

const USAGE = [
	"Usage: tsx scripts/dedup-events-crosssource.mts [options]",
	"  --apply              merge detected groups (default: read-only report)",
	"  --window-days=N      sliding window on collected_at (default: 30)",
	"  --source-prefix=PREFIX   restrict scanning to source ids starting with PREFIX",
	"  --baseline=FILE      committed before-cleanup report for the rate",
	"  --json=FILE          write the JSON report to FILE",
	"  --help               show this help",
].join("\n");

function parseOptions(argv: string[]): Options {
	const options: Options = { apply: false, windowDays: 30, jsonFile: null, baselineFile: null, sourcePrefix: null };
	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			console.log(USAGE);
			process.exit(0);
		} else if (arg === "--apply") {
			options.apply = true;
		} else if (arg.startsWith("--window-days=")) {
			const value = Number(arg.slice("--window-days=".length));
			if (!Number.isInteger(value) || value < 1 || value > 3650) throw new Error(`invalid --window-days: ${arg}`);
			options.windowDays = value;
		} else if (arg.startsWith("--json=")) {
			options.jsonFile = arg.slice("--json=".length) || null;
		} else if (arg.startsWith("--source-prefix=")) {
			options.sourcePrefix = arg.slice("--source-prefix=".length) || null;
		} else if (arg.startsWith("--baseline=")) {
			options.baselineFile = arg.slice("--baseline=".length) || null;
		} else {
			throw new Error(`unknown option: ${arg}\n${USAGE}`);
		}
	}
	return options;
}

function toEvent(row: EventRow): EventForIdentity {
	return {
		id: row.id,
		family: row.family,
		title: row.title,
		observedAt: row.observed_at,
		collectedAt: row.collected_at,
		sourceId: row.source_id,
		orgDepartment: row.org_department,
		dedupKey: row.dedup_key,
	};
}

async function scan(windowDays: number, sourcePrefix: string | null): Promise<{
	events: EventForIdentity[];
	groups: DuplicateGroup[];
	windowStart: string;
}> {
	const { rows } = await query<EventRow>(
		`SELECT e.id, e.family, e.title, e.observed_at, e.collected_at,
		        e.source_id, e.dedup_key, o.dept AS org_department
		   FROM event e
		   LEFT JOIN org o ON o.id = e.org_id
		  WHERE e.collected_at >= now() - ($1::int * interval '1 day')
		    AND ($2::text IS NULL OR e.source_id LIKE $2)
		  ORDER BY e.id`,
		[windowDays, sourcePrefix === null ? null : `${sourcePrefix}%`],
	);
	const events = rows.map(toEvent).filter(isInScope);
	return { events, groups: findDuplicateGroups(events), windowStart: new Date(Date.now() - windowDays * 86_400_000).toISOString() };
}

async function mergeGroup(
	client: PoolClient,
	group: DuplicateGroup,
	events: readonly EventForIdentity[],
	windowDays: number,
): Promise<Verification> {
	const survivor = events.find((event) => event.id === group.survivorId);
	if (!survivor) throw new Error(`survivor ${group.survivorId} is missing`);
	const ids = group.duplicateIds;
	const duplicateAlerts = await client.query<{ id: number; rule_id: string }>(
		"SELECT id, rule_id FROM alert WHERE event_id = ANY($1::bigint[]) ORDER BY id", [ids],
	);
	const survivorAlerts = await client.query<{ rule_id: string }>(
		"SELECT rule_id FROM alert WHERE event_id=$1", [survivor.id],
	);
	const rulesOnSurvivor = new Set(survivorAlerts.rows.map((row) => row.rule_id));
	let alertsMoved = 0;
	let alertsMerged = 0;
	for (const alert of duplicateAlerts.rows) {
		if (rulesOnSurvivor.has(alert.rule_id)) {
			// Same rule on the copy and on the survivor: the copy alert is
			// redundant. No alert of this database has been delivered yet.
			await client.query("DELETE FROM alert WHERE id=$1", [alert.id]);
			alertsMerged++;
		} else {
			await client.query("UPDATE alert SET event_id=$1 WHERE id=$2", [survivor.id, alert.id]);
			rulesOnSurvivor.add(alert.rule_id);
			alertsMoved++;
		}
	}
	await client.query(
		"UPDATE event_archive SET dedup_key=$1 WHERE dedup_key = ANY($2::text[])",
		[survivor.dedupKey, group.memberIds.map((id) => events.find((event) => event.id === id)!.dedupKey)],
	);

	const current = await client.query<{ evidence: Record<string, unknown> }>(
		"SELECT evidence FROM event WHERE id=$1", [survivor.id],
	);
	const evidence = current.rows[0]?.evidence ?? {};
	const previousSources = Array.isArray(evidence.dedupSources) ? evidence.dedupSources : [];
	const provenance = [...new Set([...previousSources, ...group.sourceIds])].sort();
	await client.query(
		`UPDATE event SET evidence = jsonb_set(
		     jsonb_set(
		       jsonb_set(COALESCE(evidence, '{}'::jsonb), '{dedupSources}', $2::jsonb, true),
		       '{dedupCount}', to_jsonb($3::int), true),
		     '{dedupRule}', to_jsonb($4::text), true)
		   WHERE id=$1`,
		[survivor.id, JSON.stringify(provenance), group.memberIds.length, DEDUP_RULE_VERSION],
	);
	await client.query(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
		 VALUES ('event.dedup', $1, $2, $3, $4, NULL)`,
		[
			survivor.dedupKey,
			`Merged ${ids.length} duplicate event(s) from ${group.sourceIds.join(", ")}`,
			JSON.stringify({
				rule: DEDUP_RULE_VERSION,
				windowDays,
				survivorId: survivor.id,
				duplicateIds: ids,
				sourceIds: group.sourceIds,
				alertsMoved,
				alertsMerged,
			}),
			`dedup:${DEDUP_RULE_VERSION}`,
		],
	);
	await client.query("DELETE FROM event WHERE id = ANY($1::bigint[])", [ids]);

	const left = await client.query<{ n: number }>(
		"SELECT count(*)::int AS n FROM event WHERE id = ANY($1::bigint[])", [ids],
	);
	const dangling = await client.query<{ n: number }>(
		"SELECT count(*)::int AS n FROM alert WHERE event_id = ANY($1::bigint[])", [ids],
	);
	const after = await client.query<{ evidence: { dedupSources?: string[] } }>(
		"SELECT evidence FROM event WHERE id=$1", [survivor.id],
	);
	const kept = after.rows[0]?.evidence.dedupSources ?? [];
	const ok = (left.rows[0]?.n ?? 0) === 0
		&& (dangling.rows[0]?.n ?? 0) === 0
		&& group.sourceIds.every((source) => kept.includes(source));
	return {
		survivorId: survivor.id,
		duplicateIds: ids,
		sourceIds: group.sourceIds,
		alertsMoved,
		alertsMerged,
		ok,
		detail: ok ? "copies removed, provenance kept, alerts reassigned" : "lossless check failed",
	};
}

function clampRate(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

async function main(): Promise<number> {
	const options = parseOptions(process.argv.slice(2));
	const before = await scan(options.windowDays, options.sourcePrefix);
	const duplicatesFound = before.groups.reduce((sum, group) => sum + group.duplicateIds.length, 0);
	let duplicatesEliminated = 0;
	let residualDuplicates = duplicatesFound;
	const verifications: Verification[] = [];

	if (options.apply) {
		await withTransaction(async (client) => {
			for (const group of before.groups) {
				verifications.push(await mergeGroup(client, group, before.events, options.windowDays));
			}
		});
		duplicatesEliminated = verifications.reduce((sum, item) => sum + item.duplicateIds.length, 0);
		residualDuplicates = (await scan(options.windowDays, options.sourcePrefix)).groups.reduce((sum, group) => sum + group.duplicateIds.length, 0);
	}
	if (verifications.some((item) => !item.ok)) throw new Error("at least one merge failed its lossless check");

	let baseline: Report["baseline"] = null;
	if (options.baselineFile) {
		const path = resolve(options.baselineFile);
		const raw = JSON.parse(readFileSync(path, "utf8")) as { duplicatesFound?: number; duplicatesEliminated?: number };
		const value = raw.duplicatesFound ?? raw.duplicatesEliminated;
		if (typeof value !== "number" || value <= 0) throw new Error(`baseline has no positive duplicatesFound: ${path}`);
		baseline = { source: options.baselineFile, duplicatesFound: value };
	}

	let dedupRatePercent: number | null = null;
	let rateBasis: Report["rateBasis"] = "none";
	if (options.apply) {
		dedupRatePercent = duplicatesFound > 0 ? clampRate((100 * duplicatesEliminated) / duplicatesFound) : 100;
		rateBasis = "apply";
	} else if (baseline) {
		dedupRatePercent = clampRate((100 * (baseline.duplicatesFound - duplicatesFound)) / baseline.duplicatesFound);
		rateBasis = "baseline";
	}

	const report: Report = {
		rule: DEDUP_RULE_VERSION,
		windowDays: options.windowDays,
		windowStart: before.windowStart,
		generatedAt: new Date().toISOString(),
		scope: { region: "nouvelle-aquitaine", greySources: true, victimData: false },
		mode: options.apply ? "apply" : "report",
		eventsScanned: before.events.length,
		groupsFound: before.groups.length,
		duplicatesFound,
		duplicatesEliminated,
		residualDuplicates,
		dedupRatePercent,
		rateBasis,
		baseline,
		verifications,
	};
	const output = `${JSON.stringify(report, null, 2)}\n`;
	if (options.jsonFile) {
		mkdirSync(dirname(resolve(options.jsonFile)), { recursive: true });
		writeFileSync(resolve(options.jsonFile), output, "utf8");
	} else {
		process.stdout.write(output);
	}
	return 0;
}

try {
	const code = await main();
	await closePools().catch(() => {});
	process.exit(code);
} catch (error) {
	console.error(`Deduplication failed: ${(error as Error).message}`);
	await closePools().catch(() => {});
	process.exit(1);
}
