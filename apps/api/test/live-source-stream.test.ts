/**
 * Continuous stream: eligibility and per-item latency measurement.
 *
 * Both tests read the effects in the database: the source catalogue decides
 * which sources enter the fast lane, and the insert trigger records the delay
 * between a feed publication and its storage. No network is used.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import { listLiveSources, liveTickMs } from "../src/collecte/live.js";

const TAG = `live${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const IDS = {
  naRegion: `test:${TAG}:region`,
  naDepartment: `test:${TAG}:dept`,
  outside: `test:${TAG}:outside`,
  disabled: `test:${TAG}:disabled`,
  ordinary: `test:${TAG}:ordinary`,
};

async function source(id: string, opts: { region: string; department: string; live: boolean; enabled: boolean }): Promise<void> {
  await query(
    `INSERT INTO source (id, name, family, url, format, relevance, region, department, enabled, live, live_interval_ms)
     VALUES ($1, $2, 'cti', 'https://example.invalid/live', 'rss', 'strict', $3, $4, $5, $6, 5000)`,
    [id, `Live Cyber Source ${TAG}`, opts.region, opts.department, opts.enabled, opts.live],
  );
}

test("live tick is bounded and configurable", () => {
  const previous = process.env.RADAR_LIVE_TICK_MS;
  try {
    delete process.env.RADAR_LIVE_TICK_MS;
    assert.equal(liveTickMs(), 15_000);
    process.env.RADAR_LIVE_TICK_MS = "2500";
    assert.equal(liveTickMs(), 2500);
    process.env.RADAR_LIVE_TICK_MS = "-7";
    assert.equal(liveTickMs(), 15_000, "an invalid value must not produce a busy loop");
  } finally {
    if (previous === undefined) delete process.env.RADAR_LIVE_TICK_MS;
    else process.env.RADAR_LIVE_TICK_MS = previous;
  }
});

test("only enabled Nouvelle-Aquitaine sources enter the live lane", async () => {
  await source(IDS.naRegion, { region: "nouvelle-aquitaine", department: "", live: true, enabled: true });
  await source(IDS.naDepartment, { region: "", department: "64", live: true, enabled: true });
  await source(IDS.outside, { region: "occitanie", department: "31", live: true, enabled: true });
  await source(IDS.disabled, { region: "nouvelle-aquitaine", department: "33", live: true, enabled: false });
  await source(IDS.ordinary, { region: "nouvelle-aquitaine", department: "33", live: false, enabled: true });

  const rows = await listLiveSources();
  const ids = rows.filter((row) => Object.values(IDS).includes(row.id)).map((row) => row.id).sort();
  assert.deepEqual(ids, [IDS.naDepartment, IDS.naRegion].sort());
  assert.equal(rows.find((row) => row.id === IDS.naRegion)?.intervalMs, 5000);
});

test("the trigger records publication-to-record latency at insert time", async () => {
  const publishedAt = new Date(Date.now() - 2500);
  for (const id of [IDS.naRegion, IDS.ordinary]) {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, observed_at, date_source, date_confidence, source_url, evidence)
       VALUES ($1, 'cti', 'ambient_signal', $2, $3, $4, 'feed', 'high', 'https://example.invalid/event', '{"run_id":"1"}'::jsonb)`,
      [`live-test:${TAG}:${id}`, `Cyber exercise ${TAG}`, id, publishedAt.toISOString()],
    );
  }
  const { rows } = await query<{ source_id: string; latency_ms: number; published_at: string; recorded_at: string }>(
    `SELECT source_id, latency_ms, published_at, recorded_at FROM source_live_item WHERE source_id = ANY($1::text[])`,
    [Object.values(IDS)],
  );
  assert.equal(rows.length, 1, "a source outside the live lane must not create latency rows");
  const row = rows[0];
  assert.equal(row?.source_id, IDS.naRegion);
  assert.ok((row?.latency_ms ?? 0) >= 2000, `latency must reflect the publication time: ${row?.latency_ms} ms`);
  assert.ok((row?.latency_ms ?? 0) < 60_000, "latency must be measured, not a stale clock");
  assert.equal(new Date(row?.published_at ?? "").getTime(), publishedAt.getTime());
  assert.ok(new Date(row?.recorded_at ?? "").getTime() > publishedAt.getTime());
});

after(async () => {
  await query("DELETE FROM source_live_item WHERE source_id = ANY($1::text[])", [Object.values(IDS)]).catch(() => {});
  await query("DELETE FROM event WHERE source_id = ANY($1::text[])", [Object.values(IDS)]).catch(() => {});
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [Object.values(IDS)]).catch(() => {});
});
