/**
 * Cross-source event deduplication: one behaviour per test.
 *
 * The CLI is exercised end to end against the fresh test database, with grey
 * (context) and strict catalogue sources, so detection, the lossless merge and
 * the reported rate all come from the real code path.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query, closePools } from "../src/db.js";
import {
	canonicalEventKey,
	findDuplicateGroups,
	normalizeTitle,
	type EventForIdentity,
} from "../src/dedup/event-duplicates.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const PREFIX = `dedup-cross-${Date.now()}`;
const GREY_SOURCE = `${PREFIX}-grey`;
const STRICT_SOURCE = `${PREFIX}-strict`;
const SCRIPT = fileURLToPath(new URL("../../../scripts/dedup-events-crosssource.mts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const BASELINE = join(tmpdir(), `${PREFIX}-baseline.json`);

type Report = {
	mode: string;
	groupsFound: number;
	duplicatesFound: number;
	duplicatesEliminated: number;
	residualDuplicates: number;
	dedupRatePercent: number | null;
	rateBasis: string;
	verifications: Array<{ ok: boolean; sourceIds: string[]; alertsMoved: number }>;
};

function run(args: string[] = []): string {
	return execFileSync(TSX, [SCRIPT, "--window-days=30", `--source-prefix=${PREFIX}`, ...args], { encoding: "utf8" });
}

function report(args: string[] = []): Report {
	return JSON.parse(run(args)) as Report;
}

async function createSources(): Promise<void> {
	await query(
		`INSERT INTO source (id, name, family, url, kind, relevance)
		 VALUES ($1,$2,'cert_fr','https://example.invalid/grey','narrative','context'),
		        ($3,$4,'cert_fr','https://example.invalid/strict','narrative','strict')`,
		[GREY_SOURCE, `Grey ${PREFIX}`, STRICT_SOURCE, `Strict ${PREFIX}`],
	);
}

async function insertEvent(input: {
	suffix: string;
	title: string;
	sourceId: string;
	day: string;
	orgId?: number | null;
}): Promise<number> {
	const { rows } = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, observed_at, severity, org_id, evidence)
		 VALUES ($1,'cert_fr','ambient_signal',$2,$3,$4,$5,2,$6,'{"run_id":"1"}'::jsonb) RETURNING id`,
		[`${PREFIX}:${input.suffix}`, input.title, input.sourceId, `https://example.invalid/${PREFIX}/${input.suffix}`, `${input.day}T10:00:00Z`, input.orgId ?? null],
	);
	return rows[0]!.id;
}

function event(id: number, title: string, sourceId: string, day: string): EventForIdentity {
	return {
		id,
		family: "cert_fr",
		title,
		observedAt: `${day}T08:00:00Z`,
		collectedAt: `${day}T09:00:00Z`,
		sourceId,
		orgDepartment: null,
		dedupKey: `${PREFIX}:${id}`,
	};
}

after(async () => {
	await query("DELETE FROM alert WHERE rule_id=$1", [PREFIX]).catch(() => {});
	await supprimerEvenementsArchivees("dedup_key LIKE $1", [`${PREFIX}:%`]).catch(() => {});
	await query("DELETE FROM journal WHERE subject LIKE $1", [`${PREFIX}:%`]).catch(() => {});
	await query("DELETE FROM org WHERE slug LIKE $1", [`${PREFIX}%`]).catch(() => {});
	await query("DELETE FROM source WHERE id IN ($1,$2)", [GREY_SOURCE, STRICT_SOURCE]).catch(() => {});
	rmSync(BASELINE, { force: true });
	await closePools().catch(() => {});
});

test("title variants collapse to one identity while another day stays separate", () => {
	const first = event(1, "Multiples vulnérabilités dans le noyau Linux d'Ubuntu", GREY_SOURCE, "2026-11-21");
	const variant = event(2, "MULTIPLES  VULNERABILITES DANS LE NOYAU LINUX D'UBUNTU", STRICT_SOURCE, "2026-11-21");
	const nextDay = event(3, first.title, GREY_SOURCE, "2026-11-22");
	assert.equal(normalizeTitle(first.title), normalizeTitle(variant.title));
	assert.equal(canonicalEventKey(first), canonicalEventKey(variant));
	assert.notEqual(canonicalEventKey(first), canonicalEventKey(nextDay));
	assert.deepEqual(findDuplicateGroups([first, variant, nextDay])[0]?.duplicateIds, [2]);
});

test("the same normalized title in another family is not merged", () => {
	const advisory = event(1, "Multiples vulnérabilités dans le noyau Linux", GREY_SOURCE, "2026-11-21");
	const claim = { ...event(2, "Multiples vulnérabilités dans le noyau Linux", STRICT_SOURCE, "2026-11-21"), family: "ransomware" };
	assert.deepEqual(findDuplicateGroups([advisory, claim]), []);
});

test("read-only report detects a grey-source duplicate without writing", async () => {
	await createSources();
	const title = `Avis CERT-FR doublon ${PREFIX} — validateur unique`;
	await insertEvent({ suffix: "report-1", title, sourceId: GREY_SOURCE, day: "2026-11-21" });
	await insertEvent({ suffix: "report-2", title: title.toUpperCase(), sourceId: STRICT_SOURCE, day: "2026-11-21" });

	const output = run();
	const result = JSON.parse(output) as Report;
	assert.equal(result.mode, "report");
	assert.equal(result.groupsFound, 1);
	assert.equal(result.duplicatesFound, 1);
	assert.equal(result.duplicatesEliminated, 0);
	assert.ok(!output.includes(title), "no event title is written to the report");
	assert.ok(!output.includes("validateur unique"), "no free text from events is written to the report");
	const rows = await query<{ id: number }>("SELECT id FROM event WHERE dedup_key LIKE $1", [`${PREFIX}:report-%`]);
	assert.equal(rows.rows.length, 2, "report mode never deletes a row");
});

test("apply keeps all source provenance, moves alerts and verifies the merge", async () => {
	await supprimerEvenementsArchivees("dedup_key LIKE $1", [`${PREFIX}:report-%`]);
	const title = `Avis CERT-FR fusion ${PREFIX} — conserve les deux provenances`;
	const first = await insertEvent({ suffix: "apply-1", title, sourceId: GREY_SOURCE, day: "2026-11-21" });
	const copy = await insertEvent({ suffix: "apply-2", title: title.toUpperCase(), sourceId: STRICT_SOURCE, day: "2026-11-21" });
	await query(
		`INSERT INTO alert (rule_id, title, severity, event_id) VALUES ($1,$2,2,$3)`,
		[PREFIX, `Alerte ${PREFIX}`, copy],
	);

	const result = report(["--apply"]);
	assert.equal(result.duplicatesFound, 1);
	assert.equal(result.duplicatesEliminated, 1);
	assert.equal(result.residualDuplicates, 0);
	assert.equal(result.dedupRatePercent, 100);
	assert.equal(result.verifications.length, 1);
	assert.ok(result.verifications[0]!.ok);
	assert.equal(result.verifications[0]!.alertsMoved, 1);
	assert.deepEqual(result.verifications[0]!.sourceIds, [GREY_SOURCE, STRICT_SOURCE].sort());

	const survivors = await query<{ id: number; evidence: { dedupSources: string[]; dedupCount: number } }>(
		"SELECT id, evidence FROM event WHERE id=$1", [first],
	);
	assert.equal(survivors.rows.length, 1, "oldest event survives");
	assert.deepEqual(survivors.rows[0]!.evidence.dedupSources, [GREY_SOURCE, STRICT_SOURCE].sort());
	assert.equal(survivors.rows[0]!.evidence.dedupCount, 2);
	const alerts = await query<{ event_id: number }>("SELECT event_id FROM alert WHERE rule_id=$1", [PREFIX]);
	assert.equal(Number(alerts.rows[0]!.event_id), Number(first), "alert now points to the survivor");
	const journal = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM journal WHERE kind='event.dedup' AND subject=$1", [`${PREFIX}:apply-1`],
	);
	assert.equal(journal.rows[0]!.n, 1, "merge is audited in the journal");
});

test("events attached to an organization outside Nouvelle-Aquitaine are excluded", async () => {
	const { rows } = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','75') RETURNING id",
		[`Outside ${PREFIX}`, `${PREFIX}-outside`],
	);
	const orgId = rows[0]!.id;
	const title = `Avis hors périmètre ${PREFIX} — Paris`;
	await insertEvent({ suffix: "out-1", title, sourceId: GREY_SOURCE, day: "2026-11-21", orgId });
	await insertEvent({ suffix: "out-2", title: title.toUpperCase(), sourceId: STRICT_SOURCE, day: "2026-11-21", orgId });

	const result = report();
	assert.equal(result.groupsFound, 0, "no merge outside the twelve NA departments");
	const count = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM event WHERE dedup_key LIKE $1", [`${PREFIX}:out-%`],
	);
	assert.equal(count.rows[0]!.n, 2);
});

test("baseline measurement still reports the published rate after cleanup", () => {
	writeFileSync(BASELINE, JSON.stringify({ duplicatesFound: 1 }), "utf8");
	const result = report([`--baseline=${BASELINE}`]);
	assert.equal(result.rateBasis, "baseline");
	assert.equal(result.dedupRatePercent, 100);
});
