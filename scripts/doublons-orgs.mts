#!/usr/bin/env -S npx tsx
/**
 * Merge duplicate organisations in Nouvelle-Aquitaine, without losing rows.
 *
 * Identity rule (single source of truth: apps/api/src/dedup/org-duplicates.ts):
 * two rows are duplicates only when the same 9-digit SIREN, the same normalized
 * name and the same Nouvelle-Aquitaine department appear in two independent
 * ingestion shapes: an explicit `org.siren` and a SIRET/SIREN-derived slug from
 * a Sirene source. Homonyms, distinct establishments and other departments are
 * never merged. FINESS codes are a different namespace and are not used.
 *
 * The smallest id of a group survives: it is the oldest row and the choice is
 * stable across runs. Every dependent row is moved to the survivor inside one
 * transaction; every group is checked for loss before COMMIT (ROLLBACK on any
 * mismatch). Aliases keep the union of their provenance and retired slugs stay
 * searchable. Only organisation-level fields are read: no victim data.
 *
 * Report mode is the default (stdout, no writes). Merging requires an explicit
 * `--apply --group=<id>` or `--apply --all`.
 *
 * Usage:
 *   tsx scripts/doublons-orgs.mts
 *   tsx scripts/doublons-orgs.mts --siren=123456789 --json=bench/results/before.json
 *   tsx scripts/doublons-orgs.mts --apply --group=org-123456789-abcdef123456
 *   tsx scripts/doublons-orgs.mts --apply --all --json=bench/results/after.json
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PoolClient } from "pg";
import { closePools, pool, withTransaction } from "../apps/api/src/db.js";
import { normalize } from "../apps/api/src/match/core.js";
import {
	buildDuplicateGroups,
	extractSiren,
	isNaDepartment,
	type OrgIdentityRow,
} from "../apps/api/src/dedup/org-duplicates.js";

type Criterion = { type: "siren" | "name" | "department"; value: string };

type DetectedGroup = {
	id: string;
	siren: string;
	department: string;
	nameKey: string;
	size: number;
	memberIds: number[];
	criteria: Criterion[];
};

type OrgDetail = {
	id: number;
	name: string;
	slug: string;
	siren: string | null;
	department: string | null;
};

type Group = DetectedGroup & { survivor: OrgDetail; duplicates: OrgDetail[] };

type Options = {
	apply: boolean;
	group: string | null;
	all: boolean;
	siren: string | null;
	jsonFile: string | null;
};

type Verification = { group: string; ok: boolean; detail: string };

type Report = {
	generatedAt: string;
	totalOrganisations: number;
	groupsFound: number;
	duplicatesFound: number;
	duplicatesMerged: number;
	verification: Verification[];
	mode: "report" | "apply";
	groups: Array<{ id: string; siren: string; memberIds: number[]; survivor: number }>;
	rules: {
		identity: string;
		scope: string;
		survivor: string;
		lossCheck: string;
	};
};

/** Row counts and id sets used to prove that a merge lost nothing. */
type Snapshot = {
	eventIds: string[];
	alertIds: string[];
	historyIds: string[];
	assetIds: string[];
	childIds: string[];
	aliasValues: string[];
	assetPairs: string[];
};

function usage(): never {
	console.error(
		[
			"usage: tsx scripts/doublons-orgs.mts",
			"  [--siren=<9 digits>] [--json] [--json=<file>]",
			"  [--apply (--group=<group id> | --all)]",
			"",
			"Default: JSON report on stdout; the database is never written to.",
		].join("\n"),
	);
	process.exit(2);
}

function parseArgs(argv: string[]): Options {
	const options: Options = { apply: false, group: null, all: false, siren: null, jsonFile: null };
	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") usage();
		else if (arg === "--apply" || arg === "--appliquer") options.apply = true;
		else if (arg === "--all" || arg === "--confirmer=TOUS") options.all = true;
		else if (arg.startsWith("--group=")) options.group = arg.slice("--group=".length);
		else if (arg.startsWith("--groupe=")) options.group = arg.slice("--groupe=".length);
		else if (arg.startsWith("--siren=")) options.siren = arg.slice("--siren=".length);
		else if (arg === "--json") options.jsonFile = "-";
		else if (arg.startsWith("--json=")) options.jsonFile = arg.slice("--json=".length);
		else throw new Error(`unknown argument: ${arg}`);
	}
	if (options.group === "" || options.siren === "" || options.jsonFile === "") {
		throw new Error("an option value is empty");
	}
	if (options.apply && !options.group && !options.all) {
		throw new Error("--apply requires --group=<id> or --all (no implicit global merge)");
	}
	if (!options.apply && (options.group || options.all)) {
		throw new Error("--group/--all require --apply; use --siren to filter a report");
	}
	return options;
}

/**
 * Streaming scan: 1.6 M organisations do not fit in a single `pool.query`.
 * Only rows sharing a candidate key are kept in memory, so the working set
 * stays proportional to the number of duplicates, not to the whole referential.
 */
async function detect(): Promise<{ total: number; groups: DetectedGroup[] }> {
	const buckets = new Map<string, OrgIdentityRow[]>();
	const candidates: OrgIdentityRow[] = [];
	let total = 0;

	await withTransaction(async (client) => {
		await client.query("SET LOCAL statement_timeout = 0");
		await client.query(
			"DECLARE dedup_orgs_cursor CURSOR FOR SELECT id, name, slug, dept, siren, entity_code, entity_source FROM org ORDER BY id",
		);
		try {
			while (true) {
				const { rows } = await client.query<OrgIdentityRow>("FETCH 50000 FROM dedup_orgs_cursor");
				if (rows.length === 0) break;
				for (const row of rows) {
					total += 1;
					if (!isNaDepartment(row.dept)) continue;
					const identity = extractSiren(row);
					if (identity === null) continue;
					const nameKey = normalize(row.name);
					if (nameKey === "") continue;
					const key = `${row.dept!.trim()}|${identity.siren}|${nameKey}`;
					const bucket = buckets.get(key);
					if (bucket === undefined) {
						buckets.set(key, [row]);
					} else {
						bucket.push(row);
						if (bucket.length === 2) candidates.push(...bucket);
					}
				}
			}
		} finally {
			await client.query("CLOSE dedup_orgs_cursor").catch(() => {});
		}
	});

	const found = buildDuplicateGroups(candidates);
	const groups: DetectedGroup[] = found.map((group) => ({
		id: group.id,
		siren: group.siren,
		department: group.dept,
		nameKey: group.nameKey,
		size: group.memberIds.length,
		memberIds: group.memberIds,
		criteria: [
			{ type: "siren", value: group.siren },
			{ type: "name", value: group.nameKey },
			{ type: "department", value: group.dept },
		],
	}));
	groups.sort((a, b) => a.memberIds[0]! - b.memberIds[0]!);
	return { total, groups };
}

function chunks<T>(items: T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
	return batches;
}

async function loadDetails(ids: number[]): Promise<Map<number, OrgDetail>> {
	const details = new Map<number, OrgDetail>();
	for (const batch of chunks(ids, 5_000)) {
		const { rows } = await pool.query<OrgDetail>(
			`SELECT o.id, o.name, o.slug, o.siren, o.dept AS "department"
			   FROM org o WHERE o.id = ANY($1::int[]) ORDER BY o.id`,
			[batch],
		);
		for (const row of rows) details.set(row.id, row);
	}
	return details;
}

/** All ids/values that must still resolve after the merge, before or after it. */
async function snapshot(client: PoolClient, ids: number[]): Promise<Snapshot> {
	const { rows } = await client.query<Snapshot>(
		`SELECT
		   COALESCE((SELECT array_agg(e.id::text ORDER BY e.id) FROM event e WHERE e.org_id = ANY($1::int[])), '{}'::text[]) AS "eventIds",
		   COALESCE((SELECT array_agg(a.id::text ORDER BY a.id) FROM alert a WHERE a.org_id = ANY($1::int[])), '{}'::text[]) AS "alertIds",
		   COALESCE((SELECT array_agg(h.id::text ORDER BY h.id) FROM org_history h WHERE h.org_id = ANY($1::int[])), '{}'::text[]) AS "historyIds",
		   COALESCE((SELECT array_agg(s.id::text ORDER BY s.id) FROM asset s WHERE s.org_id = ANY($1::int[])), '{}'::text[]) AS "assetIds",
		   COALESCE((SELECT array_agg(c.id::text ORDER BY c.id) FROM org c
		              WHERE c.parent_org_id = ANY($1::int[]) AND NOT (c.id = ANY($1::int[]))), '{}'::text[]) AS "childIds",
		   COALESCE((SELECT array_agg(DISTINCT x.alias ORDER BY x.alias) FROM org_alias x WHERE x.org_id = ANY($1::int[])), '{}'::text[]) AS "aliasValues",
		   COALESCE((SELECT array_agg(DISTINCT (s.kind || '|' || s.value) ORDER BY (s.kind || '|' || s.value))
		               FROM asset s WHERE s.org_id = ANY($1::int[])), '{}'::text[]) AS "assetPairs"
		 `,
		[ids],
	);
	return rows[0]!;
}

function sameSet(before: string[], after: string[]): boolean {
	const a = [...before].sort();
	const b = [...after].sort();
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

function containsAll(before: string[], after: string[]): boolean {
	const present = new Set(after);
	return before.every((value) => present.has(value));
}

function checkLoss(group: Group, before: Snapshot, after: Snapshot): Verification {
	const checks: Array<[string, boolean]> = [
		["events", sameSet(before.eventIds, after.eventIds)],
		["alerts", sameSet(before.alertIds, after.alertIds)],
		["history", sameSet(before.historyIds, after.historyIds)],
		["children", sameSet(before.childIds, after.childIds)],
		["asset values", sameSet(before.assetPairs, after.assetPairs)],
		["aliases", containsAll(before.aliasValues, after.aliasValues)],
	];
	const detail = `${checks.map(([label]) => `${label} ${label === "aliases" ? "kept" : "preserved"}`).join(", ")}`;
	const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
	return {
		group: group.id,
		ok: failed.length === 0,
		detail:
			failed.length === 0
				? `${detail}; ${before.eventIds.length} event(s), ${before.alertIds.length} alert(s), ${before.historyIds.length} history row(s), ${before.assetIds.length} asset(s), ${before.childIds.length} child(ren) intact`
				: `loss detected in: ${failed.join(", ")}`,
	};
}

/** One group, one transaction step; a failed loss check rolls back everything. */
async function mergeGroup(client: PoolClient, group: Group): Promise<Verification> {
	const survivor = group.survivor.id;
	const duplicates = group.duplicates.map((org) => org.id);
	const memberIds = [survivor, ...duplicates];

	const { rows } = await client.query<{ id: number }>(
		"SELECT id FROM org WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
		[memberIds],
	);
	if (rows.length !== memberIds.length || rows.some((row, index) => row.id !== memberIds[index])) {
		throw new Error(`group ${group.id}: an organisation changed since the report`);
	}
	const before = await snapshot(client, memberIds);

	for (const id of duplicates) {
		// Provenance is additive: a shared alias keeps both source names.
		await client.query(
			`INSERT INTO org_alias (org_id, alias, source, valid_from, valid_to, status)
			 SELECT $1, a.alias, a.source, a.valid_from, a.valid_to, a.status
			   FROM org_alias a WHERE a.org_id = $2
			 ON CONFLICT (org_id, alias) DO UPDATE
			    SET source = concat_ws('|', org_alias.source,
			                  CASE WHEN EXCLUDED.source IS NULL OR EXCLUDED.source = org_alias.source
			                       THEN NULL ELSE EXCLUDED.source END),
			        valid_from = LEAST(org_alias.valid_from, EXCLUDED.valid_from),
			        valid_to = GREATEST(org_alias.valid_to, EXCLUDED.valid_to)`,
			[survivor, id],
		);
		await client.query("DELETE FROM org_alias WHERE org_id = $1", [id]);

		// The retired slug remains searchable under the survivor.
		await client.query(
			`INSERT INTO org_alias (org_id, alias, source, valid_from)
			 SELECT $1, o.slug, 'merge:' || o.id::text, COALESCE(o.valid_from, now())
			   FROM org o WHERE o.id = $2
			 ON CONFLICT (org_id, alias) DO NOTHING`,
			[survivor, id],
		);

		await client.query("UPDATE event SET org_id = $1 WHERE org_id = $2", [survivor, id]);
		await client.query("UPDATE alert SET org_id = $1 WHERE org_id = $2", [survivor, id]);
		await client.query("UPDATE org_history SET org_id = $1 WHERE org_id = $2", [survivor, id]);

		// Auto-foreign key: do not turn the survivor into its own child.
		await client.query("UPDATE org SET parent_org_id = NULL WHERE id = $1 AND parent_org_id = $2", [
			survivor,
			id,
		]);
		await client.query("UPDATE org SET parent_org_id = $1 WHERE parent_org_id = $2", [survivor, id]);

		// Move assets that the survivor does not already have, remap events
		// pointing at the discarded duplicates, then remove the duplicates.
		await client.query(
			`UPDATE asset a SET org_id = $1
			  WHERE a.org_id = $2
			    AND NOT EXISTS (SELECT 1 FROM asset c
			                     WHERE c.org_id = $1 AND c.kind = a.kind AND c.value = a.value)`,
			[survivor, id],
		);
		await client.query(
			`UPDATE event e SET asset_id = c.id
			   FROM asset s JOIN asset c ON c.org_id = $1 AND c.kind = s.kind AND c.value = s.value
			  WHERE e.asset_id = s.id AND s.org_id = $2 AND c.id <> s.id`,
			[survivor, id],
		);
		await client.query("DELETE FROM asset WHERE org_id = $1", [id]);
		await client.query("DELETE FROM org WHERE id = $1", [id]);

		await client.query(
			`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
			 VALUES ('org.fusion', $1, $2, $3::jsonb, 'dedup-orgs', now())`,
			[
				String(survivor),
				`merged duplicate organisation #${id} into #${survivor}`,
				JSON.stringify({
					group: group.id,
					duplicate: id,
					survivor,
					siren: group.siren,
					criteria: group.criteria,
				}),
			],
		);
	}

	const after = await snapshot(client, [survivor]);
	const remaining = await client.query<{ id: number }>("SELECT id FROM org WHERE id = ANY($1::int[])", [
		memberIds,
	]);
	if (remaining.rows.length !== 1 || remaining.rows[0]!.id !== survivor) {
		throw new Error(`group ${group.id}: expected exactly the survivor to remain`);
	}
	const verification = checkLoss(group, before, after);
	if (!verification.ok) throw new Error(`group ${group.id}: ${verification.detail}`);
	return verification;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const log = (message: string): void => console.error(`[dedup-orgs] ${message}`);

	log("scanning organisations with the registered SIREN identity rule…");
	const detected = await detect();
	log(`${detected.total.toLocaleString("en-US")} organisations scanned`);

	const groups = options.siren
		? detected.groups.filter((group) => group.siren === options.siren)
		: detected.groups;
	const ids = groups.flatMap((group) => group.memberIds);
	const details = await loadDetails(ids);
	const fullGroups: Group[] = [];
	for (const group of groups) {
		const survivor = details.get(group.memberIds[0]!);
		if (!survivor) throw new Error(`group ${group.id}: survivor not found`);
		const duplicates = group.memberIds.slice(1).map((id) => {
			const org = details.get(id);
			if (!org) throw new Error(`group ${group.id}: duplicate #${id} not found`);
			return org;
		});
		fullGroups.push({ ...group, survivor, duplicates });
	}
	log(`${fullGroups.length} group(s), ${ids.length - fullGroups.length} duplicate(s)`);

	const targets = options.all ? fullGroups : fullGroups.filter((group) => group.id === options.group);
	if (options.group && targets.length === 0) throw new Error(`group "${options.group}" not found`);

	const verification: Verification[] = [];
	let duplicatesMerged = 0;
	if (options.apply) {
		await withTransaction(async (client) => {
			for (const group of targets) {
				verification.push(await mergeGroup(client, group));
				duplicatesMerged += group.size - 1;
			}
		});
		log(`merged ${duplicatesMerged} duplicate(s); loss checks passed`);
	} else {
		log("report mode: no writes; use --apply --group=<id> or --apply --all");
	}

	const report: Report = {
		generatedAt: new Date().toISOString(),
		totalOrganisations: detected.total,
		groupsFound: fullGroups.length,
		duplicatesFound: ids.length - fullGroups.length,
		duplicatesMerged,
		verification,
		mode: options.apply ? "apply" : "report",
		groups: fullGroups.map((group) => ({
			id: group.id,
			siren: group.siren,
			memberIds: group.memberIds,
			survivor: group.survivor.id,
		})),
		rules: {
			identity: "same SIREN + normalized name + Nouvelle-Aquitaine department + two ingestion shapes",
			scope: "Nouvelle-Aquitaine only; source reputation is not used",
			survivor: "smallest org.id (oldest row, stable across runs)",
			lossCheck: "event/alert/history/child ids and asset values intact; aliases additive; rollback on failure",
		},
	};

	const json = `${JSON.stringify(report, null, 2)}\n`;
	if (options.jsonFile && options.jsonFile !== "-") {
		const path = resolve(options.jsonFile);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, json, "utf8");
		log(`report written to ${path}`);
	} else {
		process.stdout.write(json);
	}
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
