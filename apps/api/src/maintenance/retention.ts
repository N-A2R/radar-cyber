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
  opts?: { days?: number; dryRun?: boolean; tables?: Table[] },
): Promise<RetentionResult> {
  const days = opts?.days ?? Number(process.env.RADAR_RETENTION_DAYS ?? 90);
  const dryRun = opts?.dryRun ?? false;
  const tables = opts?.tables ?? ["event", "indicator", "collector_run"];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const result: RetentionResult = { events: 0, indicators: 0, collectorRuns: 0 };

  for (const table of tables) {
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