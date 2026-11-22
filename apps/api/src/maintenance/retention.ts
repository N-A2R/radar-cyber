import { ingestQuery } from "../db.js";
import { consigner, MOTEURS } from "../journal/index.js";

type Table = "event" | "indicator" | "collector_run" | "collecte_cycle";

export interface RetentionResult {
  events: number;
  indicators: number;
  collectorRuns: number;
  /** Cycles de supervision purgés (même fenêtre que les runs). */
  cyclesSupervision: number;
  archived: number;
  /** Lignes du journal des accès supprimées par la rétention RGPD. */
  accessLog: number;
}

const BATCH = 10000;

function cutoffExpr(table: Table): string {
  if (table === "event") return "COALESCE(observed_at, collected_at) < $1";
  if (table === "indicator") return "last_seen < $1";
  if (table === "collector_run" || table === "collecte_cycle") {
    return "finished_at < $1::timestamptz - interval '60 days'";
  }
  return "finished_at < $1::timestamptz";
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
  const auditDays = Number(process.env.RADAR_AUDIT_RETENTION_DAYS ?? 90);
  const tables = opts?.tables ?? ["event", "indicator", "collector_run", "collecte_cycle"];

  const result: RetentionResult = { events: 0, indicators: 0, collectorRuns: 0, cyclesSupervision: 0, archived: 0, accessLog: 0 };

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
        // Résumé historique : continue d'alimenter `v_event_all` et le dossier.
        await ingestQuery(
          `INSERT INTO event_archive
             (dedup_key, family, assertion_type, org_id, org_name, org_kind, dept,
              source_id, source_url, severity, confidence, admission_rule,
              observed_at, collected_at, valid_at, at)
           SELECT e.dedup_key, e.family, e.assertion_type, e.org_id, o.name, o.kind,
                  COALESCE(e.dept, o.dept),
                  e.source_id, e.source_url, e.severity, e.confidence, e.admission_rule,
                  e.observed_at, e.collected_at, e.valid_at, e.at
             FROM event e
             LEFT JOIN org o ON o.id = e.org_id
            WHERE COALESCE(e.observed_at, e.collected_at) < $1
           ON CONFLICT (dedup_key) DO NOTHING`,
          [cutoff],
        );
        // Copie intégrale : seul endroit où survivent le titre, le résumé et
        // les preuves de l'événement une fois purgé. Même filtre que la
        // suppression : un événement encore cité par une alerte reste en brut.
        const archivage = await ingestQuery(
          `INSERT INTO archive_event
             (id, dedup_key, family, assertion_type, title, summary,
              observed_at, collected_at, valid_at, at, severity, confidence, source_id,
              source_url, evidence, geo_type, lat, lon, org_id, asset_id, created_at)
           SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.title, e.summary,
                  e.observed_at, e.collected_at, e.valid_at, e.at, e.severity, e.confidence, e.source_id,
                  e.source_url, e.evidence, e.geo_type, e.lat, e.lon, e.org_id, e.asset_id, e.created_at
             FROM event e
            WHERE COALESCE(e.observed_at, e.collected_at) < $1
              AND NOT EXISTS (SELECT 1 FROM alert a WHERE a.event_id = e.id)
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
    else if (table === "collecte_cycle") result.cyclesSupervision = total;
    else result.collectorRuns = total;
  }

  // Rétention du journal des accès : seule suppression autorisée sur cette
  // table. Les refus restent dans le journal de vérité, non soumis à cette
  // rétention, ce qui conserve la preuve d'un incident même après 90 jours.
  if (dryRun) {
    const { rows } = await ingestQuery<{ c: string }>(
      "SELECT count(*)::text AS c FROM access_log WHERE recorded_at < now() - ($1 || ' days')::interval",
      [auditDays],
    );
    result.accessLog = Number(rows[0]?.c ?? 0);
  } else {
    const { rows } = await ingestQuery<{ n: number }>("SELECT purger_access_log($1) AS n", [auditDays]);
    result.accessLog = Number(rows[0]?.n ?? 0);
  }
  if (result.accessLog > 0) log(`journal des accès : ${result.accessLog} ligne(s) purgée(s) (${auditDays} j)`);

  return result;
}