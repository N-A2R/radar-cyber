/**
 * Organisation duplicate merges: one behaviour per test.
 *
 * The CLI is exercised end to end against the fresh test database so the
 * detection prefilter, the canonical identity rule, the transaction and the
 * lossless checks are all covered.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { query, closePools } from "../src/db.js";

const SCRIPT = fileURLToPath(new URL("../../../scripts/doublons-orgs.mts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const PREFIX = `dedup-orgs-${Date.now()}`;
const SOURCE = `${PREFIX}-source`;

type Report = {
	groupsFound: number;
	duplicatesFound: number;
	duplicatesMerged: number;
	verification: Array<{ group: string; ok: boolean; detail: string }>;
	groups: Array<{ id: string; siren: string; memberIds: number[]; survivor: number }>;
};

function sirenFor(offset: number): string {
	const base = String(Date.now()).slice(-6);
	return `${base}${String(offset).padStart(3, "0")}`;
}

async function insertOrg(input: {
	name: string;
	slug: string;
	dept: string;
	siren?: string;
	entitySource: string;
}): Promise<number> {
	const { rows } = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, siren, entity_source)
		 VALUES ($1, $2, 'entreprise', 'Bordeaux', $3, $4, $5) RETURNING id`,
		[input.name, input.slug, input.dept, input.siren ?? null, input.entitySource],
	);
	return rows[0]!.id;
}

async function idsForSiren(siren: string): Promise<number[]> {
	const { rows } = await query<{ id: number }>(
		"SELECT id FROM org WHERE siren=$1 OR slug LIKE $2 ORDER BY id",
		[siren, `%${siren}%`],
	);
	return rows.map((row) => row.id);
}

function run(siren: string, args: string[] = []): Report {
	const output = execFileSync(TSX, [SCRIPT, `--siren=${siren}`, ...args], {
		encoding: "utf8",
	});
	return JSON.parse(output) as Report;
}

after(async () => {
	await query("DELETE FROM event WHERE source_id=$1", [SOURCE]).catch(() => {});
	await query("DELETE FROM source WHERE id=$1", [SOURCE]).catch(() => {});
	await query("DELETE FROM org WHERE slug LIKE $1", [`${PREFIX}%`]).catch(() => {});
	await closePools().catch(() => {});
});

test("same SIREN and normalized name in Nouvelle-Aquitaine are reported", async () => {
	const siren = sirenFor(1);
	const first = await insertOrg({
		name: `${PREFIX} Alpha`, slug: `${PREFIX}-alpha-${siren}`, dept: "33",
		siren, entitySource: "sirene",
	});
	const second = await insertOrg({
		name: `${PREFIX} (ALPHA)`, slug: `${PREFIX}-alpha-${siren}00001`, dept: "33",
		entitySource: "sirene-site",
	});

	const report = run(siren);
	const group = report.groups.find((item) => item.memberIds.includes(first));
	assert.ok(group, "the duplicate group is found");
	assert.deepEqual(group.memberIds, [first, second]);
	assert.equal(group.survivor, first);
	assert.equal(report.duplicatesFound >= 1, true);
	assert.equal(report.duplicatesMerged, 0, "report mode writes nothing");
	assert.equal((await idsForSiren(siren)).length, 2);
});

test("applying one group preserves dependent rows and identity aliases", async () => {
	const siren = sirenFor(2);
	const first = await insertOrg({
		name: `${PREFIX} Beta`, slug: `${PREFIX}-beta-${siren}`, dept: "64",
		siren, entitySource: "sirene",
	});
	const second = await insertOrg({
		name: `${PREFIX} (BETA)`, slug: `${PREFIX}-beta-${siren}00002`, dept: "64",
		entitySource: "sirene-site",
	});
	await query("INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti','https://example.invalid')", [
		SOURCE, `${PREFIX} source`,
	]);
	await query("INSERT INTO org_alias (org_id, alias, source) VALUES ($1,$2,'first'),($3,$2,'second')", [
		first, `${PREFIX}-shared`, second,
	]);
	await query(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id, source_url, evidence)
		 VALUES ($1,'cti','ambient_signal','event',$2,$3,'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
		[`${PREFIX}-event`, SOURCE, second],
	);
	await query("INSERT INTO alert (rule_id, title, severity, org_id) VALUES ($1,$2,2,$3)", [
		`${PREFIX}-rule`, `${PREFIX} alert`, second,
	]);
	await query("INSERT INTO asset (org_id, kind, value) VALUES ($1,'domain',$2)", [second, `${PREFIX}.invalid`]);
	await query(
		`INSERT INTO org_history (org_id, name, slug, kind, status, valid_from)
		 VALUES ($1,$2,$3,'entreprise','confirme',now())`,
		[second, `${PREFIX} (BETA)`, `${PREFIX}-beta-${siren}00002`],
	);

	const report = run(siren);
	const group = report.groups.find((item) => item.memberIds.includes(first) && item.memberIds.includes(second));
	assert.ok(group, "the group exists before application");
	const applied = run(siren, ["--apply", `--group=${group.id}`]);
	assert.equal(applied.duplicatesMerged, 1);
	assert.equal(applied.verification.length, 1);
	assert.equal(applied.verification[0]!.ok, true, applied.verification[0]!.detail);

	const remaining = await query<{ id: number }>("SELECT id FROM org WHERE id=$1 OR id=$2", [first, second]);
	assert.deepEqual(remaining.rows.map((row) => row.id), [first]);
	const events = await query<{ org_id: number }>("SELECT org_id FROM event WHERE title='event' AND source_id=$1", [SOURCE]);
	assert.equal(events.rows[0]!.org_id, first);
	const alerts = await query<{ org_id: number }>("SELECT org_id FROM alert WHERE rule_id=$1", [`${PREFIX}-rule`]);
	assert.equal(alerts.rows[0]!.org_id, first);
	const histories = await query<{ org_id: number }>("SELECT org_id FROM org_history WHERE org_id=$1", [first]);
	assert.equal(histories.rows.length, 1);
	const aliases = await query<{ alias: string; source: string }>("SELECT alias, source FROM org_alias WHERE org_id=$1", [first]);
	const shared = aliases.rows.find((row) => row.alias === `${PREFIX}-shared`);
	assert.ok(shared?.source?.includes("first") && shared.source.includes("second"), "alias provenance is merged");
	assert.ok(aliases.rows.some((row) => row.alias === `${PREFIX}-beta-${siren}00002`), "retired slug stays searchable");
	const journal = await query<{ subject: string }>("SELECT subject FROM journal WHERE kind='org.fusion' AND subject=$1", [String(first)]);
	assert.equal(journal.rows.length, 1, "one audit fact per merged duplicate");
});

test("SIRET-only establishments of one company are not merged", async () => {
	const siren = sirenFor(3);
	const first = await insertOrg({
		name: `${PREFIX} Gamma`, slug: `${PREFIX}-gamma-${siren}00001`, dept: "33",
		entitySource: "sirene-site",
	});
	const second = await insertOrg({
		name: `${PREFIX} Gamma`, slug: `${PREFIX}-gamma-${siren}00002`, dept: "33",
		entitySource: "sirene-site",
	});
	const report = run(siren);
	assert.equal(report.groups.some((item) => item.memberIds.includes(first) || item.memberIds.includes(second)), false);
});

test("duplicates outside Nouvelle-Aquitaine are not merged", async () => {
	const siren = sirenFor(4);
	const first = await insertOrg({
		name: `${PREFIX} Delta`, slug: `${PREFIX}-delta-${siren}`, dept: "75",
		siren, entitySource: "sirene",
	});
	await insertOrg({
		name: `${PREFIX} (DELTA)`, slug: `${PREFIX}-delta-${siren}00001`, dept: "75",
		entitySource: "sirene-site",
	});
	const report = run(siren);
	assert.equal(report.groups.some((item) => item.memberIds.includes(first)), false);
});

test("same SIREN with a different name is not a duplicate", async () => {
	const siren = sirenFor(5);
	const first = await insertOrg({
		name: `${PREFIX} Epsilon`, slug: `${PREFIX}-epsilon-${siren}`, dept: "33",
		siren, entitySource: "sirene",
	});
	await insertOrg({
		name: `${PREFIX} Zeta`, slug: `${PREFIX}-zeta-${siren}00001`, dept: "33",
		entitySource: "sirene-site",
	});
	const report = run(siren);
	assert.equal(report.groups.some((item) => item.memberIds.includes(first)), false);
});
