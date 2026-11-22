/**
 * Reproducible measurement for the ransomware group tracker (chantier D1).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/mesure-groupes-ransomware.mts \
 *     --json=bench/results/groupes-ransomware.json
 *
 * Every number comes from a SQL query printed in the JSON output.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const OUTPUT = argv.find((a) => a.startsWith("--json="))?.split("=")[1]
  ?? "bench/results/groupes-ransomware.json";

const SQL_TOTALS = `
  SELECT count(*)::int AS tracked_groups,
         count(*) FILTER (WHERE na_victims > 0)::int AS groups_with_na_victims,
         COALESCE(sum(na_victims), 0)::int AS na_victims
    FROM (
      SELECT g.id, count(v.id) AS na_victims
        FROM ransomware_group g
        LEFT JOIN ransomware_victim v ON v.group_id = g.id
       GROUP BY g.id
    ) t
`;

const SQL_BY_GROUP = `
  SELECT g.name, g.slug, g.claims_count, count(v.id)::int AS na_victims
    FROM ransomware_group g
    LEFT JOIN ransomware_victim v ON v.group_id = g.id
   GROUP BY g.id, g.name, g.slug, g.claims_count
   ORDER BY na_victims DESC, g.name ASC
`;

const SQL_BY_MATCH = `
  SELECT match_type, count(*)::int AS victims
    FROM ransomware_victim
   GROUP BY match_type
   ORDER BY match_type
`;

const totals = await query<{
  tracked_groups: number;
  groups_with_na_victims: number;
  na_victims: number;
}>(SQL_TOTALS);
const byGroup = await query<{
  name: string;
  slug: string;
  claims_count: number;
  na_victims: number;
}>(SQL_BY_GROUP);
const byMatch = await query<{ match_type: string; victims: number }>(SQL_BY_MATCH);

const result = {
  measuredAt: new Date().toISOString(),
  command: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx scripts/mesure-groupes-ransomware.mts",
  definitions: {
    trackedGroups: "rows of ransomware_group",
    groupsWithNaVictims: "tracked groups with at least one row of ransomware_victim",
    naVictims: "distinct group/organisation pairs, always an org in one of the 12 NA departments",
  },
  sql: { totals: SQL_TOTALS, byGroup: SQL_BY_GROUP, byMatch: SQL_BY_MATCH },
  trackedGroups: totals.rows[0].tracked_groups,
  groupsWithNaVictims: totals.rows[0].groups_with_na_victims,
  naVictims: totals.rows[0].na_victims,
  byMatchType: Object.fromEntries(byMatch.rows.map((r) => [r.match_type, r.victims])),
  groups: byGroup.rows.map((r) => ({
    name: r.name,
    slug: r.slug,
    claims: r.claims_count,
    naVictims: r.na_victims,
  })),
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
await closePools();
