// Rapport de confiance des sources de collecte (lecture seule).
//
// Score sur 100, trois critères :
//   - fraîcheur (40) : âge du dernier run, réussi ou non ;
//   - erreurs (30)   : part des runs en échec sur 30 jours ;
//   - volume (30)    : items_new sur 30 jours, échelle logarithmique.
//
// Une source jamais exécutée obtient un score d'erreur neutre (15/30).

import { query } from "../db.js";

export interface SourceHealth {
  id: string;
  name: string;
  family: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  runs: number;
  errors: number;
  errorRate: number;
  itemsNew: number;
  freshness: number;
  score: number;
}

const RUN_WINDOW = "30 days";

function freshnessPoints(lastRunAt: Date | null): number {
  if (!lastRunAt) return 0;
  const ageHours = (Date.now() - lastRunAt.getTime()) / 3_600_000;
  if (ageHours <= 1) return 40;
  if (ageHours <= 24) return 30;
  if (ageHours <= 168) return 20;
  if (ageHours <= 720) return 10;
  return 0;
}

function errorPoints(runs: number, errors: number): number {
  if (runs === 0) return 15;
  return Math.round(30 * (1 - Math.min(1, errors / runs)));
}

function volumePoints(itemsNew: number): number {
  if (itemsNew <= 0) return 0;
  return Math.min(30, Math.round((30 * Math.log10(1 + itemsNew)) / 6));
}

export async function sourceHealth(): Promise<SourceHealth[]> {
  const res = await query<{
    id: string;
    name: string;
    family: string;
    enabled: boolean;
    last_run_at: string | null;
    last_ok_at: string | null;
    last_error_at: string | null;
    runs: string;
    errors: string;
    items_new: string;
  }>(`
    SELECT s.id, s.name, s.family, s.enabled,
           s.last_ok_at, s.last_error_at,
           coalesce(cr.last_run_at, s.last_ok_at) AS last_run_at,
           coalesce(cr.runs, 0)::int AS runs,
           coalesce(cr.errors, 0)::int AS errors,
           coalesce(cr.items_new, 0)::bigint AS items_new
    FROM source s
    LEFT JOIN (
      SELECT source_id,
             max(started_at) AS last_run_at,
             count(*) AS runs,
             count(*) FILTER (WHERE status = 'error') AS errors,
             coalesce(sum(items_new), 0) AS items_new
      FROM collector_run
      WHERE started_at > now() - interval '${RUN_WINDOW}'
      GROUP BY source_id
    ) cr ON cr.source_id = s.id
    ORDER BY s.id
  `);

  return res.rows.map((row) => {
    const lastRunAt = row.last_run_at ? new Date(row.last_run_at) : null;
    const runs = Number(row.runs);
    const errors = Number(row.errors);
    const itemsNew = Number(row.items_new);
    const freshness = freshnessPoints(lastRunAt);
    return {
      id: row.id,
      name: row.name,
      family: row.family,
      enabled: row.enabled,
      lastRunAt: row.last_run_at,
      lastOkAt: row.last_ok_at,
      lastErrorAt: row.last_error_at,
      runs,
      errors,
      errorRate: runs > 0 ? errors / runs : 0,
      itemsNew,
      freshness,
      score: freshness + errorPoints(runs, errors) + volumePoints(itemsNew),
    };
  });
}

function formatAge(at: Date, when: Date): string {
  const hours = Math.max(0, (at.getTime() - when.getTime()) / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} j`;
}

export function renderSourceReport(rows: SourceHealth[], at = new Date()): string {
  const enabled = rows.filter((r) => r.enabled);
  const stale = enabled.filter(
    (r) => !r.lastRunAt || at.getTime() - Date.parse(r.lastRunAt) > 7 * 86_400_000,
  );
  const average =
    rows.length === 0 ? 0 : Math.round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length);
  const sorted = [...rows].sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  const lines = [
    `# Rapport de confiance des sources — ${at.toISOString()}`,
    "",
    `Sources : ${rows.length} (${enabled.length} activées) · sans run depuis 7 j : ${stale.length} · score moyen : ${average}/100`,
    "",
    "Score = fraîcheur (40) + erreurs (30) + volume utile (30).",
    "",
    "| id | famille | dernier run | fraîcheur | runs 30 j | erreurs | taux | items nouveaux | score |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of sorted) {
    const age = r.lastRunAt ? formatAge(at, new Date(r.lastRunAt)) : "jamais";
    const taux = r.runs > 0 ? `${Math.round(r.errorRate * 100)} %` : "—";
    lines.push(
      `| ${r.id} | ${r.family} | ${age} | ${r.freshness}/40 | ${r.runs} | ${r.errors} | ${taux} | ${r.itemsNew} | ${r.score} |`,
    );
  }
  return lines.join("\n");
}
