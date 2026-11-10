import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

type SourceRow = {
  id: string;
  name: string;
  family: string;
  url: string;
  kind: string;
  format: string;
  enabled: boolean;
  interval_sec: number;
  last_ok_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  items_total: number | null;
  last_items: number | null;
};

export default async function (app: FastifyInstance) {
  app.get("/sources", async () => {
    const r = await query<SourceRow>(`
      SELECT id, name, family, url, kind, format, enabled, interval_sec,
             last_ok_at, last_error_at, last_error, items_total, last_items
      FROM source
      ORDER BY kind, family, name
    `);
    return r.rows.map((s) => ({
      id: s.id,
      name: s.name,
      family: s.family,
      url: s.url,
      kind: s.kind,
      format: s.format,
      enabled: s.enabled,
      intervalSec: s.interval_sec,
      lastOkAt: s.last_ok_at,
      lastErrorAt: s.last_error_at,
      lastError: s.last_error,
      itemsTotal: s.items_total,
      lastItems: s.last_items,
      ok: s.last_error_at === null && s.last_ok_at !== null,
    }));
  });

  // `indicator` compte des millions de lignes : le count exact reste abordable
  // (quelques centaines de ms) et on sert un court cache pour absorber les
  // chargements concurrents de l'UI.
  let statsCache: { at: number; body: unknown } | null = null
  const STATS_TTL_MS = 20_000

  app.get("/stats", async () => {
    if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) return statsCache.body

    const orgs = await query<{ n: number }>("SELECT count(*)::int AS n FROM org")
    const events = await query<{ n: number }>("SELECT count(*)::int AS n FROM event")
    const indicators = await query<{ n: number }>("SELECT count(*)::int AS n FROM indicator")
    const sources = await query<{ total: number; active: number; ok: number; err: number }>(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE enabled)::int AS active,
             count(*) FILTER (WHERE enabled AND last_error_at IS NULL AND last_ok_at IS NOT NULL)::int AS ok,
             count(*) FILTER (WHERE enabled AND last_error_at IS NOT NULL)::int AS err
      FROM source
    `)
    const byFamily = await query<{ family: string; n: number }>(
      "SELECT family, count(*)::int AS n FROM event GROUP BY family ORDER BY n DESC"
    )
    const byAssertion = await query<{ assertion_type: string; n: number }>(
      "SELECT assertion_type, count(*)::int AS n FROM event GROUP BY assertion_type ORDER BY n DESC"
    )
    const body = {
      orgs: orgs.rows[0]?.n ?? 0,
      events: events.rows[0]?.n ?? 0,
      indicators: indicators.rows[0]?.n ?? 0,
      sources: sources.rows[0] ?? { total: 0, active: 0, ok: 0, err: 0 },
      byFamily: byFamily.rows,
      byAssertion: byAssertion.rows,
    }
    statsCache = { at: Date.now(), body }
    return body
  })
}
