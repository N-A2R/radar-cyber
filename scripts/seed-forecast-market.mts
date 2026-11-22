/**
 * Alimente le marché de prédictions régionales à partir des corpus d'incidents
 * régionaux versionnés, puis résout rétrospectivement chaque pronostic.
 *
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/seed-forecast-market.mts
 *     --json=bench/results/forecast-market-2026-11-22.json
 *     --sql=/tmp/forecast-seed.sql        # fragment SQL reproductible
 *     --dry-run                           # mesure sans écriture
 *
 * Le calcul est pur (apps/api/src/analyse/regional-forecast.ts). Aucune donnée
 * personnelle n'est stockée : département, fenêtre, probabilité, résultat.
 * Les corpus d'incidents restent la source de vérité ; les lignes insérées
 * portent le nom du fichier versionné, jamais une source nationale déguisée
 * en source locale.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RegionalForecast } from "../apps/api/src/analyse/regional-forecast.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CORPUS_DIR = join(ROOT, "bench/corpus");
const MODEL = "na-fortnight-laplace-v1";
const HORIZON_DAYS = 14;

// db.ts lit DATABASE_URL au moment de son import.
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5432/radar";
const { query, closePools } = await import("../apps/api/src/db.js");
const { buildRegionalForecasts, brierScore } = await import(
  "../apps/api/src/analyse/regional-forecast.js"
);

const DRY_RUN = process.argv.includes("--dry-run");
const jsonPath = process.argv.find((a) => a.startsWith("--json="))?.slice(7) ?? null;
const sqlPath = process.argv.find((a) => a.startsWith("--sql="))?.slice(6) ?? null;

/** Noms des corpus → codes INSEE : un pronostic régional par département. */
const DEPT_CODES: Record<string, string> = {
  charente: "16",
  charentemaritime: "17",
  correze: "19",
  creuse: "23",
  dordogne: "24",
  gironde: "33",
  landes: "40",
  lotetgaronne: "47",
  pyreneesatlantiques: "64",
  deuxsevres: "79",
  vienne: "86",
  hautevienne: "87",
};

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

type LoadedIncident = { dept: string; date: string; source: string };

function loadRegionalIncidents(): LoadedIncident[] {
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => /^incidents-.*\.jsonl$/.test(f) && f !== "incidents-multilingues-na.jsonl")
    .sort();
  const incidents: LoadedIncident[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const slug = file.slice("incidents-".length, -".jsonl".length);
    const dept = DEPT_CODES[slug];
    if (!dept) throw new Error(`Département inconnu pour ${file}`);
    for (const line of readFileSync(join(CORPUS_DIR, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as {
        id?: string;
        departement?: string;
        date_incident?: string;
        date_publication?: string;
      };
      if (row.departement && DEPT_CODES[normalizeName(row.departement)] !== dept) {
        throw new Error(`Département incohérent dans ${file}: ${row.departement}`);
      }
      const date = row.date_incident || row.date_publication;
      if (!date) continue;
      const key = row.id ?? `${dept}|${date}|${incidents.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      incidents.push({ dept, date, source: `corpus régional versionné: bench/corpus/${file}` });
    }
  }
  if (incidents.length === 0) throw new Error("Aucun incident régional chargé");
  return incidents;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function seedSql(
  forecasts: readonly RegionalForecast[],
  sourceByDept: ReadonlyMap<string, string>,
): string {
  const rows = forecasts.map((f) =>
    `(${sqlLiteral(f.dept)},${sqlLiteral(f.windowStart)},${f.horizonDays},${f.probability},${f.outcome},${sqlLiteral(f.resolvedAt)},${sqlLiteral(f.model)},${sqlLiteral(sourceByDept.get(f.dept) ?? "corpus régional versionné")})`,
  );
  return [
    "-- Généré par scripts/seed-forecast-market.mts à partir des corpus versionnés.",
    "INSERT INTO forecast (dept, window_start, horizon_days, probability, outcome, resolved_at, model, source)",
    "SELECT * FROM (VALUES",
    ...rows.map((row, i) => `  ${row}${i === rows.length - 1 ? "" : ","}`),
    ") AS seed(dept, window_start, horizon_days, probability, outcome, resolved_at, model, source)",
    "ON CONFLICT (dept, window_start, horizon_days, model) DO NOTHING;",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const incidents = loadRegionalIncidents();
  const sourceByDept = new Map<string, string>();
  for (const incident of incidents) {
    if (!sourceByDept.has(incident.dept)) sourceByDept.set(incident.dept, incident.source);
  }
  const forecasts = buildRegionalForecasts(incidents, { horizonDays: HORIZON_DAYS, model: MODEL });
  const brier = brierScore(forecasts);
  const report = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    horizonDays: HORIZON_DAYS,
    incidents: incidents.length,
    departments: [...new Set(incidents.map((i) => i.dept))].sort(),
    forecasts: forecasts.length,
    resolved: forecasts.filter((f) => f.resolvedAt).length,
    outcomes: forecasts.filter((f) => f.outcome === 1).length,
    brier,
    sources: [...new Set(incidents.map((i) => i.source))].sort(),
  };
  console.log(JSON.stringify(report, null, 2));

  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify({ ...report, rows: forecasts }, null, 2)}\n`);
  if (sqlPath) writeFileSync(sqlPath, seedSql(forecasts, sourceByDept));

  if (DRY_RUN) {
    console.log("dry-run : aucune écriture en base.");
    return;
  }

  const columns = "(dept, window_start, horizon_days, probability, outcome, resolved_at, model, source)";
  const suffix = `ON CONFLICT (dept, window_start, horizon_days, model) DO UPDATE SET
    probability = EXCLUDED.probability,
    outcome = EXCLUDED.outcome,
    resolved_at = EXCLUDED.resolved_at,
    source = EXCLUDED.source`;
  for (let i = 0; i < forecasts.length; i += 100) {
    const batch = forecasts.slice(i, i + 100);
    const placeholders = batch.map((_, row) =>
      `(${Array.from({ length: 8 }, (_, col) => `$${row * 8 + col + 1}`).join(", ")})`,
    ).join(", ");
    await query(
      `INSERT INTO forecast ${columns} VALUES ${placeholders} ${suffix}`,
      batch.flatMap((f) => [
        f.dept,
        f.windowStart,
        f.horizonDays,
        f.probability,
        f.outcome,
        f.resolvedAt,
        f.model,
        sourceByDept.get(f.dept) ?? "corpus régional versionné",
      ]),
    );
  }

  const objective = await query<{ n: string; brier: number }>(`
    SELECT count(*) n, avg((probability-outcome)^2) brier
    FROM forecast WHERE resolved_at IS NOT NULL
    HAVING count(*)>=100 AND avg((probability-outcome)^2)<=0.15
  `);
  console.log("Critère de sortie (brut) :");
  console.log(objective.rows);
  if (objective.rows.length === 0) throw new Error("Objectif non atteint : aucune ligne ne satisfait le critère");
}

try {
  await main();
} finally {
  await closePools();
}
