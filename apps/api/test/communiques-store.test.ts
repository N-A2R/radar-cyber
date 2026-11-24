/**
 * Database behaviour of the official-statement aggregator.
 * Runs against the disposable test database created by test/run.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestQuery } from "../src/db.js";
import { ensureSources, measureWeeks, STATEMENT_FAMILY, storeStatements } from "../src/communiques/store.js";
import { OFFICIAL_SOURCES, type OfficialStatement } from "../src/communiques/model.js";

const source = OFFICIAL_SOURCES.find((s) => s.id === "official-na-cd47-actualites")!;
const NOW = new Date("2026-11-21T12:00:00Z");

function statement(url: string): OfficialStatement {
	return {
		sourceId: source.id,
		department: source.department,
		departmentLabel: source.departmentLabel,
		officialDomain: source.officialDomain,
		title: "Regional council publishes its weekly official statement",
		url,
		publishedAt: new Date("2026-11-20T10:00:00Z"),
	};
}

test("official sources are registered once and stay enabled", async () => {
	assert.equal(await ensureSources(), OFFICIAL_SOURCES.length);
	const { rows } = await ingestQuery<{ id: string }>(
		"SELECT id FROM source WHERE family = $1 AND enabled",
		[STATEMENT_FAMILY],
	);
	assert.deepEqual(rows.map((row) => row.id).sort(), OFFICIAL_SOURCES.map((s) => s.id).sort());
});

test("a repeated statement is stored once and counted in its ISO week", async () => {
	const item = statement("https://www.lotetgaronne.fr/actualites/test-store-once");
	assert.deepEqual(await storeStatements([item]), { inserted: 1, duplicates: 0 });
	assert.deepEqual(await storeStatements([item]), { inserted: 0, duplicates: 1 });

	const measurement = await measureWeeks(4, NOW);
	assert.equal(measurement.currentWeek, "2026-W47");
	assert.equal(measurement.currentWeekCount, 1);
	assert.equal(measurement.total, 1);
	assert.equal(measurement.weeks.length, 4);
	assert.equal(measurement.weeks.find((w) => w.week === "2026-W47")?.byDepartment["47"], 1);
});

test("unrelated event families are excluded from the weekly count", async () => {
	await ingestQuery(
		`INSERT INTO event (dedup_key, family, assertion_type, title, at, valid_at, source_id, source_url, evidence)
		 VALUES ($1,'ransomware','confirmed_incident',$2,$3,$3,'ransomlook','https://example.invalid/event','{"run_id":"1"}'::jsonb)
		 ON CONFLICT (dedup_key) DO NOTHING`,
		["test-official-statements-ransomware", "Unrelated incident", NOW],
	);
	const measurement = await measureWeeks(4, NOW);
	assert.equal(measurement.currentWeekCount, 1);
	assert.equal(measurement.total, 1);
});
