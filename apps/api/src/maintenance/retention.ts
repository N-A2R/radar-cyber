import { ingestQuery } from "../db.js";

type Table = "event" | "indicator" | "collector_run";

export interface RetentionResult {
  events: number;
  indicators: number;
  collectorRuns: number;
}

const BATCH = 10000;

function cutoffExpr(table: Table): string {
  if (table === "event") return "COALESCE(observed_at, collected_at) < $1";
  if (table === "indicator") return "last_seen < $1";
  return "finished_at < $1::timestamptz - interval '60 days'";
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

  const result: RetentionResult = { events: 0, indicators: 0, collectorRuns: 0 };

  for (const table of tables) {
    const tableDays = table === "indicator" && opts?.days === undefined ? indicatorDays : days;
    const cutoff = new Date(Date.now() - tableDays * 24 * 60 * 60 * 1000).toISOString();
    let total = 0;
    while (true) {
      if (dryRun) {
        const { rows } = await ingestQuery<{ c: string }>(
          `SELECT count(*)::text AS c FROM ${table} WHERE ${cutoffExpr(table)}`,
          [cutoff],
        );
        const n = Number(rows[0]?.c ?? 0);
        total += n;
        log(`${table}: ${n} (dry-run)`);
        break;
      }
      const { rowCount } = await ingestQuery(
        `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${cutoffExpr(table)} LIMIT ${BATCH})`,
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