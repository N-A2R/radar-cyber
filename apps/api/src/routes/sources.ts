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
  disabled_at: string | null;
  disabled_reason: string | null;
  /** Entrées lues sur 30 jours, tous runs confondus. */
  entrees: number | null;
  /** Entrées rejetées sur 30 jours (compteur du collecteur, pas une estimation). */
  rejets: number | null;
  /** Événements attribués à la source, sur 30 jours. */
  evenements_30j: number;
  /** Événements attribués à la source, tout l'historique. */
  evenements_total: number;
  dernier_run: string | null;
  dernier_run_statut: string | null;
  /** Motifs de rejet agrégés du dernier run mesuré. */
  motifs: Record<string, number> | null;
};

export default async function (app: FastifyInstance) {
  app.get("/sources", async () => {
    // Le rendement vient du collecteur (`collector_run`), pas d'une
    // déduction sur `last_ok_at` : une source peut répondre 200 pendant des
    // mois sans produire un seul événement. C'est ce trou qui a fait passer
    // 303 sources pour saines alors qu'elles ne rendaient rien.
    const r = await query<SourceRow>(`
      WITH runs AS (
        SELECT source_id,
               sum(items_in)::int    AS entrees,
               sum(items_skipped)::int AS rejets,
               max(started_at)       AS dernier_run,
               (array_agg(status ORDER BY started_at DESC))[1] AS dernier_run_statut,
               (array_agg(items_rejected ORDER BY started_at DESC))[1] AS motifs
          FROM collector_run
         WHERE started_at >= now() - interval '30 days'
         GROUP BY source_id
      ),
      ev AS (
        SELECT source_id,
               count(*) FILTER (WHERE COALESCE(observed_at, collected_at) >= now() - interval '30 days')::int AS evenements_30j,
               count(*)::int AS evenements_total
          FROM event
         GROUP BY source_id
      )
      SELECT s.id, s.name, s.family, s.url, s.kind, s.format, s.enabled, s.interval_sec,
             s.last_ok_at, s.last_error_at, s.last_error, s.items_total, s.last_items,
             s.disabled_at, s.disabled_reason,
             r.entrees, r.rejets, r.dernier_run, r.dernier_run_statut, r.motifs,
             COALESCE(e.evenements_30j, 0) AS evenements_30j,
             COALESCE(e.evenements_total, 0) AS evenements_total
        FROM source s
        LEFT JOIN runs r ON r.source_id = s.id
        LEFT JOIN ev   e ON e.source_id = s.id
       ORDER BY s.kind, s.family, s.name
    `);
    return r.rows.map((s) => {
      const evenements30j = Number(s.evenements_30j);
      const entrees = s.entrees === null ? null : Number(s.entrees);
      // Rendement : part des entrées lues qui deviennent un événement utile.
      // `null` quand rien n'a été lu — ce n'est pas 0 %, c'est inconnu.
      const rendement = entrees !== null && entrees > 0 ? evenements30j / entrees : null;
      return {
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
        disabledAt: s.disabled_at,
        disabledReason: s.disabled_reason,
        ok: s.last_error_at === null && s.last_ok_at !== null,
        entrees,
        rejets: s.rejets === null ? null : Number(s.rejets),
        evenements30j,
        evenementsTotal: Number(s.evenements_total),
        dernierRun: s.dernier_run,
        dernierRunStatut: s.dernier_run_statut,
        motifs: s.motifs && typeof s.motifs === "object" ? s.motifs : null,
        // Le motif dominant est celui qui coûte le plus d'entrées : c'est lui
        // qui explique le silence, pas la liste complète.
        motifDominant:
          s.motifs && typeof s.motifs === "object"
            ? (Object.entries(s.motifs).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? null)
            : null,
        rendement: rendement === null ? null : Math.round(rendement * 1000) / 1000,
      };
    });
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
