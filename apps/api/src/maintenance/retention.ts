import { ingestQuery } from "../db.js";
import { consigner, MOTEURS } from "../journal/index.js";

type Table = "event" | "indicator" | "collector_run";

export interface RetentionResult {
  events: number;
  indicators: number;
  collectorRuns: number;
  /** Événements déplacés vers l'archive avant suppression (chantier 2). */
  archived: number;
}

const BATCH = 10000;

function cutoffExpr(table: Table): string {
  if (table === "event") return "COALESCE(observed_at, collected_at) < $1";
  if (table === "indicator") return "last_seen < $1";
  return "finished_at < $1::timestamptz - interval '60 days'";
}

/**
 * `alert.event_id` est un entier nu, sans clé étrangère : purger un événement
 * encore référencé laisse une alerte qui joint `null` et devient illisible
 * (plus de titre, d'organisation, de source). Ces événements restent donc en
 * base tant qu'une alerte les cite — c'est la preuve, pas le volume, qui prime.
 */
function purgeFilter(table: Table): string {
  if (table === "event") {
    return " AND NOT EXISTS (SELECT 1 FROM alert a WHERE a.event_id = event.id)";
  }
  return "";
}

export async function runRetention(
  log: (msg: string) => void,
  opts?: { days?: number; indicatorDays?: number; dryRun?: boolean; tables?: Table[] },
): Promise<RetentionResult> {
  // Durées distinctes : un événement perd sa valeur vite, un indicateur
  // technique reste utile un an. Décision utilisateur du 10 novembre.
  const days = opts?.days ?? Number(process.env.RADAR_RETENTION_DAYS ?? 90);
  const indicatorDays = opts?.indicatorDays ?? Number(process.env.RADAR_RETENTION_INDICATOR_DAYS ?? 365);
  const dryRun = opts?.dryRun ?? false;
  const tables = opts?.tables ?? ["event", "indicator", "collector_run"];

  const result: RetentionResult = { events: 0, indicators: 0, collectorRuns: 0, archived: 0 };

  for (const table of tables) {
    const tableDays = table === "indicator" && opts?.days === undefined ? indicatorDays : days;
    const cutoff = new Date(Date.now() - tableDays * 24 * 60 * 60 * 1000).toISOString();
    let total = 0;

    // Avant toute suppression d'événements : archiver ce qui va disparaître.
    // C'est ce qui transforme « on jette » en « on résume et on garde ». Une
    // base sans archive reste utilisable : on n'invente pas d'échec bloquant,
    // on signale.
    if (table === "event" && !dryRun) {
      try {
        const archivage = await ingestQuery(
          `INSERT INTO event_archive
             (dedup_key, family, assertion_type, org_id, org_name, org_kind, dept,
              source_id, source_url, severity, confidence, admission_rule,
              observed_at, collected_at)
           SELECT e.dedup_key, e.family, e.assertion_type, e.org_id, o.name, o.kind, o.dept,
                  e.source_id, e.source_url, e.severity, e.confidence, e.admission_rule,
                  e.observed_at, e.collected_at
             FROM event e
             LEFT JOIN org o ON o.id = e.org_id
            WHERE COALESCE(e.observed_at, e.collected_at) < $1
           ON CONFLICT (dedup_key) DO NOTHING`,
          [cutoff],
        );
        result.archived = archivage.rowCount ?? 0;
        if (result.archived > 0) {
          log(`événements archivés avant purge : ${result.archived}`);
          await consigner({
            kind: "referentiel.charged",
            subject: "retention",
            summary: `${result.archived} événement(s) archivé(s) avant purge (${tableDays} j)`,
            actor: `moteur:${MOTEURS.rattachement}`,
            payload: { seuilJours: tableDays, archives: result.archived, cutoff },
          });
        }
      } catch (error) {
        log(`archivage impossible (${String(error).slice(0, 100)}) — purge ignorée par prudence`);
        continue;
      }
    }
    while (true) {
      if (dryRun) {
        const { rows } = await ingestQuery<{ c: string }>(
          `SELECT count(*)::text AS c FROM ${table} WHERE ${cutoffExpr(table)}${purgeFilter(table)}`,
          [cutoff],
        );
        const n = Number(rows[0]?.c ?? 0);
        total += n;
        log(`${table}: ${n} (dry-run)`);
        break;
      }
      const { rowCount } = await ingestQuery(
        `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${cutoffExpr(table)}${purgeFilter(table)} LIMIT ${BATCH})`,
        [cutoff],
      );
      const n = rowCount ?? 0;
      total += n;
      log(`${table} batch: ${n}`);
      if (n === 0) break;
    }
    if (table === "event") result.events = total;
    else if (table === "indicator") result.indicators = total;
    else result.collectorRuns = total;
  }

  return result;
}