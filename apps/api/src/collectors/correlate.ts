/**
 * Corrélation minimale : rattache un événement à une organisation quand le
 * domaine de l'organisation apparaît explicitement dans le titre ou l'URL de
 * l'événement. C'est une preuve textuelle, pas une attribution géolocalisée.
 */
import { query } from "../db.js"

export async function correlateEvents(log: (msg: string) => void): Promise<void> {
  const r = await query<{ n: number }>(`
    WITH matches AS (
      SELECT e.id AS event_id, o.id AS org_id
      FROM event e
      JOIN org o ON o.domain IS NOT NULL AND o.domain <> ''
      WHERE e.org_id IS NULL
        AND (
          position(lower(o.domain) IN lower(coalesce(e.title, ''))) > 0
          OR position(lower(o.domain) IN lower(coalesce(e.source_url, ''))) > 0
        )
      ORDER BY e.id, o.id
    )
    UPDATE event e
    SET org_id = m.org_id
    FROM (SELECT DISTINCT ON (event_id) event_id, org_id FROM matches) m
    WHERE e.id = m.event_id
  `)

  const total = await query<{ n: number }>("SELECT count(*)::int AS n FROM event WHERE org_id IS NOT NULL")
  log(`corrélation : ${r.rows[0]?.n ?? 0} rattachement(s), ${total.rows[0]?.n ?? 0} événement(s) rattaché(s)`)
}
