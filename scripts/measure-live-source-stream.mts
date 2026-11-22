/**
 * Measure the continuous source stream on a real database.
 *
 * The script runs a local RSS publisher (public, synthetic, no personal data),
 * registers it as several Nouvelle-Aquitaine "live" sources, publishes one item
 * per source per cycle, and calls the same collection function the API loop
 * uses. It then reads the per-item latency rows written by the database trigger
 * and reports the number of sources collected and the publication-to-record
 * delay. All fixture rows are removed in `finally`.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-live-source-stream.mts
 *
 * Optional env: RADAR_LIVE_MEASURE_SOURCES (6), RADAR_LIVE_MEASURE_CYCLES (4),
 * RADAR_LIVE_MEASURE_GAP_MS (1200), RADAR_LIVE_MEASURE_OUTPUT (result path).
 */
import { createServer, type Server } from "node:http";
import { writeFile } from "node:fs/promises";
import { closePools, query } from "../apps/api/src/db.js";
import { collectLiveSourcesOnce } from "../apps/api/src/collecte/live.js";

const SOURCES = Number(process.env.RADAR_LIVE_MEASURE_SOURCES ?? 6);
const CYCLES = Number(process.env.RADAR_LIVE_MEASURE_CYCLES ?? 4);
const GAP_MS = Number(process.env.RADAR_LIVE_MEASURE_GAP_MS ?? 1200);
const OUTPUT = process.env.RADAR_LIVE_MEASURE_OUTPUT ?? "bench/results/live-source-stream.json";
const TAG = `live${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DEPARTMENTS = ["33", "40", "64", "87"];
const VERBOSE = process.env.RADAR_LIVE_MEASURE_VERBOSE === "1";
type Published = { title: string; link: string; publishedAt: string };

const published = new Map<string, Published>();
const server: Server = createServer((req, res) => {
  const id = decodeURIComponent((req.url ?? "").replace(/^\/feed\//, "").split("?")[0] ?? "");
  const item = published.get(id);
  if (!item) {
    res.writeHead(404).end("no item");
    return;
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Live test feed ${id}</title><link>https://example.invalid/live</link>
<description>Synthetic cyber feed, Nouvelle-Aquitaine, no personal data</description>
<item><title>${item.title}</title><link>${item.link}</link><guid>${item.link}</guid>
<pubDate>${item.publishedAt}</pubDate><description>Exercise item for latency measurement</description></item>
</channel></rss>`;
  res.writeHead(200, { "Content-Type": "application/rss+xml; charset=utf-8" }).end(xml);
});

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] ?? 0;
}
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("local publisher has no TCP port");
  const base = `http://127.0.0.1:${address.port}`;
  const ids = Array.from({ length: SOURCES }, (_, i) => `test:${TAG}:src${i + 1}`);
  const startedAt = new Date().toISOString();
  const { rows: existing } = await query<{ id: string }>("SELECT id FROM source WHERE id = ANY($1::text[])", [ids]);
  if (existing.length > 0) throw new Error(`fixture ids already present: ${existing.map((r) => r.id).join(", ")}`);

  try {
    for (let i = 0; i < ids.length; i++) {
      await query(
        `INSERT INTO source (id, name, family, url, format, parser, interval_sec, relevance, region, department, enabled, live, live_interval_ms)
         VALUES ($1, $2, 'cti', $3, 'rss', '{}'::jsonb, 60, 'strict', 'nouvelle-aquitaine', $4, true, true, 1000)`,
        [ids[i], `Live Cyber Source ${DEPARTMENTS[i % DEPARTMENTS.length] ?? "33"} ${TAG}`, `${base}/feed/${encodeURIComponent(ids[i] ?? "")}`, DEPARTMENTS[i % DEPARTMENTS.length] ?? "33"],
      );
    }

    let cyclesRun = 0;
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i] as string;
        published.set(id, {
          title: `Cyber exercise Nouvelle-Aquitaine ${TAG} cycle ${cycle} source ${i + 1}: phishing campaign detected`,
          link: `https://example.invalid/live/${TAG}/${cycle}/${i + 1}`,
          publishedAt: new Date().toISOString(),
        });
      }
      await sleep(GAP_MS);
      const result = await collectLiveSourcesOnce((message) => {
        if (VERBOSE) console.error(`[collect] ${message}`);
      });
      if (result.sources !== SOURCES) throw new Error(`expected ${SOURCES} live sources, got ${result.sources}`);
      cyclesRun++;
    }
    await sleep(300);

    const { rows } = await query<{
      source_id: string;
      published_at: string;
      recorded_at: string;
      latency_ms: number;
    }>(
      `SELECT source_id, published_at, recorded_at, latency_ms
         FROM source_live_item WHERE source_id = ANY($1::text[]) ORDER BY latency_ms`,
      [ids],
    );
    const latencies = rows.map((row) => Number(row.latency_ms)).sort((a, b) => a - b);
    const sources = new Set(rows.map((row) => row.source_id));
    const { rows: runs } = await query<{ n: string }>(
      `SELECT count(DISTINCT source_id)::text AS n FROM collector_run
        WHERE source_id = ANY($1::text[]) AND status = 'ok' AND finished_at >= $2::timestamptz`,
      [ids, startedAt],
    );
    const result = {
      measuredAt: new Date().toISOString(),
      method: "local RSS publisher -> continuous live collector -> database trigger on event insert",
      region: "nouvelle-aquitaine",
      cycles: cyclesRun,
      sourcesDeclared: SOURCES,
      sourcesCollected: sources.size,
      sourcesWithSuccessfulRun: Number(runs[0]?.n ?? 0),
      itemsRecorded: rows.length,
      latencyMs: {
        min: latencies[0] ?? 0,
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: latencies[latencies.length - 1] ?? 0,
        negative: latencies.filter((value) => value < 0).length,
      },
      publicationDelayMs: GAP_MS,
    };
    await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(result, null, 2));
    if (sources.size !== SOURCES || rows.length !== SOURCES * CYCLES || result.latencyMs.negative > 0) {
      throw new Error("measurement incomplete: check collector logs and feed admission rules");
    }
  } finally {
    const { rows: events } = await query<{ dedup_key: string }>("SELECT dedup_key FROM event WHERE source_id = ANY($1::text[])", [ids]);
    if (events.length > 0) {
      await query("DELETE FROM journal WHERE subject = ANY($1::text[])", [events.map((e) => e.dedup_key)]);
    }
    await query("DELETE FROM source_live_item WHERE source_id = ANY($1::text[])", [ids]);
    await query("DELETE FROM event WHERE source_id = ANY($1::text[])", [ids]);
    await query("DELETE FROM collector_run WHERE source_id = ANY($1::text[])", [ids]);
    await query("DELETE FROM source WHERE id = ANY($1::text[])", [ids]);
    server.close();
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
