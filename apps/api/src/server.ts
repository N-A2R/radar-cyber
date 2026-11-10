import Fastify from "fastify";
import cors from "@fastify/cors";
import { pool, query } from "./db.js";
import eventsRoute from "./routes/events.js";
import orgsRoute from "./routes/orgs.js";
import graphRoute from "./routes/graph.js";
import { runGenericSources } from "./collectors/generic.js";
import { runHermesCollector } from "./collectors/hermes.collector.js";
import { correlateEvents } from "./collectors/correlate.js";
import streamRoute from "./routes/stream.js";
import sourcesRoute from "./routes/sources.js";

const port = Number(process.env.PORT ?? 8080);

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/api/health", async () => {
  const r = await query<{ id: string }>("SELECT id FROM source");
  return { ok: true, sources: r.rows.map((x) => x.id) };
});

await app.register(eventsRoute, { prefix: "/api" });
await app.register(orgsRoute, { prefix: "/api" });
await app.register(graphRoute, { prefix: "/api" });
await app.register(streamRoute, { prefix: "/api" });
await app.register(sourcesRoute, { prefix: "/api" });

async function runCollectors() {
  let collectors: { id: string; family: string; run: (ctx: any) => Promise<{ events: any[]; cursor?: Record<string, unknown> }> }[] = [];
  try {
    const mod: any = await import("./collectors/index.js"); // runtime-selected plugin module
    collectors = mod.collectors ?? mod.default ?? [];
  } catch (e) {
    app.log.error(e);
    return;
  }
  for (const c of collectors) {
    let itemsIn = 0;
    let itemsNew = 0;
    let cursor: Record<string, unknown> = {};
    try {
      const srcRes = await query<{ cursor: unknown }>("SELECT cursor FROM source WHERE id=$1", [c.id]);
      const srcRow = srcRes.rows[0];
      const c0 = srcRow?.cursor;
      cursor = (c0 && typeof c0 === "object" ? (c0 as Record<string, unknown>) : {}) ?? {};
      const ctx = {
        fetchJson: async <T = unknown>(url: string, init?: RequestInit) => {
          const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as T;
        },
        fetchText: async (url: string) => {
          const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.text();
        },
        cursor,
        log: (m: string) => app.log.info(m),
        now: () => new Date(),
      };
      const result = await c.run(ctx);
      itemsIn = result.events.length;
      for (const ev of result.events) {
        const r = await query(
          `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (dedup_key) DO NOTHING`,
          [ev.dedupKey, ev.family, ev.assertionType, ev.title, ev.summary ?? null, ev.observedAt ?? null, ev.severity, ev.confidence ?? null, ev.sourceId, ev.sourceUrl ?? null, JSON.stringify(ev.evidence ?? {}), ev.geoType, ev.lat ?? null, ev.lon ?? null]
        );
        if ((r.rowCount ?? 0) > 0) itemsNew++;
      }
      const newCursor = result.cursor ?? cursor;
      await query("UPDATE source SET cursor=$1, last_ok_at=now() WHERE id=$2", [JSON.stringify(newCursor), c.id]);
      await query("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)", [c.id, itemsIn, itemsNew]);
    } catch (e: unknown) {
      const err = String((e as { message?: string })?.message ?? e);
      app.log.error(e);
      await query("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, c.id]).catch(() => {});
      await query("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, now(), 'error', $2, $3, $4)", [c.id, itemsIn, itemsNew, err]).catch(() => {});
    }
  }
}

setInterval(() => {
  runCollectors().catch(() => {});
  correlateEvents((m) => app.log.info(m)).catch(() => {});
  runGenericSources((m) => app.log.info(m)).catch(() => {});
}, 60000);
runCollectors().catch(() => {});
correlateEvents((m) => app.log.info(m)).catch(() => {});
runHermesCollector((m) => app.log.info(m)).catch(() => {});
runGenericSources((m) => app.log.info(m)).catch(() => {});

await app.listen({ port, host: "0.0.0.0" });
