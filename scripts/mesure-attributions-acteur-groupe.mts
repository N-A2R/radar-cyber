/**
 * Reproducible measurement for actor-to-group attribution (chantier E8).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-attributions-acteur-groupe.mts \
 *     --json=bench/results/attributions-acteur-groupe.json
 *
 * Every printed number comes from a SQL query on the persisted attributions.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const OUTPUT = argv.find((arg) => arg.startsWith("--json="))?.split("=")[1]
  ?? "bench/results/attributions-acteur-groupe.json";

const SQL_TOTAL = `
  SELECT count(*)::int AS attributions,
         count(*) FILTER (WHERE level = 'high')::int AS high,
         count(*) FILTER (WHERE level = 'medium')::int AS medium,
         count(*) FILTER (WHERE level = 'low')::int AS low,
         COALESCE(round(avg(confidence)::numeric, 1), 0)::float8 AS average_confidence
    FROM actor_group_attribution
`;

const SQL_BY_METHOD = `
  SELECT method, count(*)::int AS attributions
    FROM actor_group_attribution
   GROUP BY method
   ORDER BY method
`;

const SQL_BY_GROUP = `
  SELECT group_slug, group_name, count(*)::int AS attributions,
         max(confidence)::int AS best_confidence
    FROM actor_group_attribution
   GROUP BY group_slug, group_name
   ORDER BY attributions DESC, group_slug ASC
`;

const SQL_ROWS = `
  SELECT actor, group_slug AS "groupSlug", group_name AS "groupName",
         confidence, level, method, sources, claims
    FROM actor_group_attribution
   ORDER BY confidence DESC, actor ASC
`;

type TotalRow = {
  attributions: number;
  high: number;
  medium: number;
  low: number;
  average_confidence: number;
};
type MethodRow = { method: string; attributions: number };
type GroupRow = { group_slug: string; group_name: string; attributions: number; best_confidence: number };
type AttributionRow = {
  actor: string;
  groupSlug: string;
  groupName: string;
  confidence: number;
  level: string;
  method: string;
  sources: number;
  claims: number;
};

async function main(): Promise<void> {
  const [total, methods, groups, rows] = await Promise.all([
    query<TotalRow>(SQL_TOTAL),
    query<MethodRow>(SQL_BY_METHOD),
    query<GroupRow>(SQL_BY_GROUP),
    query<AttributionRow>(SQL_ROWS),
  ]);
  const t = total.rows[0]!;
  const report = {
    scope: "Nouvelle-Aquitaine",
    attributions: t.attributions,
    byLevel: { high: t.high, medium: t.medium, low: t.low },
    byMethod: Object.fromEntries(methods.rows.map((row) => [row.method, row.attributions])),
    averageConfidence: t.average_confidence,
    byGroup: groups.rows,
    attributionsDetail: rows.rows,
    sql: { total: SQL_TOTAL, byMethod: SQL_BY_METHOD, byGroup: SQL_BY_GROUP, rows: SQL_ROWS },
  };
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  writeFileSync(OUTPUT, `${json}\n`);
}

try {
  await main();
} finally {
  await closePools();
}
