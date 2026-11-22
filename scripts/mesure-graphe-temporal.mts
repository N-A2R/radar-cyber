#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the complete temporal graph.
 *
 * Reads the real regional database (default: the local radar instance on
 * port 5433, 1,673,151 organizations / 312 sources / ~26,000 events). No row
 * is written and no personal data is read: only counts and relation types.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-graphe-temporal.mts
 *
 * Writes bench/results/graphe-temporal.json.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const displayed = new URL(url);
displayed.password = "***";

const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query("SET statement_timeout = '15000ms'");

  const totals = await client.query<{ total: string; dated: string; closed: string }>(`
    SELECT count(*)::text AS total,
           count(*) FILTER (WHERE valid_from IS NOT NULL)::text AS dated,
           count(*) FILTER (WHERE valid_to IS NOT NULL)::text AS closed
      FROM graph_relation`);
  const byType = await client.query<{ type: string; count: string }>(`
    SELECT type, count(*)::text AS count FROM graph_relation GROUP BY type ORDER BY type`);
  const entities = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM graph_entity`);
  const scope = await client.query<{ total: string }>(`
    SELECT count(*)::text AS total FROM graph_entity
     WHERE kind = 'org' AND NOT (props ->> 'dept' = ANY (ARRAY[
       '16','17','19','23','24','33','40','47','64','79','86','87',
       'Charente','Charente-Maritime','Correze','Corrèze','Creuse','Dordogne',
       'Gironde','Landes','Lot-et-Garonne','Pyrenees-Atlantiques',
       'Pyrénées-Atlantiques','Deux-Sevres','Deux-Sèvres','Vienne','Haute-Vienne'
     ]))`);
  const baseline = await client.query<{ orgs: string; events: string; sources: string }>(`
    SELECT (SELECT reltuples::bigint::text FROM pg_class WHERE relname = 'org') AS orgs,
           (SELECT count(*)::text FROM event) AS events,
           (SELECT count(*)::text FROM source) AS sources`);

  const result = {
    measuredAt: new Date().toISOString(),
    database: displayed.toString(),
    baseline: baseline.rows[0],
    relations: {
      total: Number(totals.rows[0]!.total),
      dated: Number(totals.rows[0]!.dated),
      withEndDate: Number(totals.rows[0]!.closed),
      byType: Object.fromEntries(byType.rows.map((row) => [row.type, Number(row.count)])),
    },
    entities: Number(entities.rows[0]!.total),
    organizationsOutsideNouvelleAquitaine: Number(scope.rows[0]!.total),
  };

  const out = join(process.cwd(), "bench/results/graphe-temporal.json");
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(`timestamped relations: ${result.relations.dated} / ${result.relations.total}`);
  console.log(`entities: ${result.entities}`);
  console.log(`types: ${byType.rows.map((row) => `${row.type}=${row.count}`).join(", ")}`);
  console.log(`written: ${out}`);
} finally {
  await client.end();
}
