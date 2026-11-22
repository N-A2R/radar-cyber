#!/usr/bin/env -S npx tsx
/**
 * Reproducible attack-propagation measurement on the real Nouvelle-Aquitaine
 * knowledge graph. Read-only: no fact is written, no label is selected.
 *
 *   pnpm measure:attack-propagation
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-attack-propagation.mts \
 *     --max-hops=4
 *
 * Writes bench/results/attack-propagation.json (counts and ids only).
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMeasurement,
  simulatePropagation,
  summarizeRuns,
  selectSeedOrg,
  type GraphEdge,
  type GraphNode,
} from "../apps/api/src/attack-propagation.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

function flag(name: string, fallback?: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const maxHops = Number(flag("--max-hops", "4"));
if (!Number.isInteger(maxHops) || maxHops < 0 || maxHops > 12) {
  throw new Error("--max-hops must be an integer between 0 and 12");
}

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const displayed = new URL(url);
displayed.password = "***";

const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query("SET statement_timeout = '15000ms'");

  const nodesResult = await client.query<GraphNode>(`
    SELECT id, kind, props ->> 'dept' AS dept
      FROM graph_entity ORDER BY id`);
  const edgesResult = await client.query<GraphEdge>(`
    SELECT source_id AS source, target_id AS target, type,
           valid_from AS "validFrom", valid_to AS "validTo"
      FROM graph_relation ORDER BY id`);
  const byTypeResult = await client.query<{ type: string; count: string }>(`
    SELECT type, count(*)::text AS count FROM graph_relation GROUP BY type ORDER BY type`);
  const baselineResult = await client.query<{ organizations: string; sources: string; events: string }>(`
    SELECT (SELECT reltuples::bigint::text FROM pg_class WHERE relname = 'org') AS organizations,
           (SELECT count(*)::text FROM source) AS sources,
           (SELECT count(*)::text FROM event) AS events`);
  const atResult = await client.query<{ at: Date }>(`
    SELECT max(valid_from) AS at FROM graph_relation`);
  const scopeResult = await client.query<{ total: string }>(`
    SELECT count(*)::text AS total FROM graph_entity
     WHERE kind = 'org' AND NOT (props ->> 'dept' = ANY (ARRAY[
       '16','17','19','23','24','33','40','47','64','79','86','87',
       'Charente','Charente-Maritime','Correze','Corrèze','Creuse','Dordogne',
       'Gironde','Landes','Lot-et-Garonne','Pyrenees-Atlantiques',
       'Pyrénées-Atlantiques','Deux-Sevres','Deux-Sèvres','Vienne','Haute-Vienne'
     ]))`);

  const nodes: GraphNode[] = nodesResult.rows;
  const edges: GraphEdge[] = edgesResult.rows;
  const at = atResult.rows[0]!.at;
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    throw new Error("No dated relation in the graph snapshot");
  }
  const outsideNa = Number(scopeResult.rows[0]!.total);
  if (outsideNa > 0) throw new Error(`${outsideNa} organization(s) outside Nouvelle-Aquitaine`);

  const seed = selectSeedOrg(nodes, edges, at);
  const reference = simulatePropagation({ nodes, edges, seedOrgId: seed.orgId, at, maxHops });
  const orgIds = nodes.filter((node) => node.kind === "org").map((node) => node.id);
  const allRuns = summarizeRuns(
    orgIds.map((orgId) => simulatePropagation({ nodes, edges, seedOrgId: orgId, at, maxHops })
      .reachedOrgIds.length),
  );

  const measurement = buildMeasurement({
    measuredAt: new Date().toISOString(),
    database: displayed.toString(),
    baseline: {
      organizations: Number(baselineResult.rows[0]!.organizations),
      sources: Number(baselineResult.rows[0]!.sources),
      events: Number(baselineResult.rows[0]!.events),
    },
    graph: {
      entities: nodes.length,
      relations: edges.length,
      relationsByType: Object.fromEntries(
        byTypeResult.rows.map((row) => [row.type, Number(row.count)]),
      ),
      organizationsOutsideNouvelleAquitaine: outsideNa,
    },
    observationTime: at.toISOString(),
    seed,
    reference,
    allRuns,
    nodes,
  });

  const out = join(process.cwd(), "bench/results/attack-propagation.json");
  writeFileSync(out, JSON.stringify(measurement, null, 2) + "\n");
  console.log(`snapshot: ${nodes.length} entities / ${edges.length} relations at ${at.toISOString()}`);
  console.log(`seed: ${seed.orgId} (${seed.targetedEvents} targeted events)`);
  console.log(`reached organizations: ${reference.reachedOrgIds.length} in ${reference.hops.length} hops`);
  console.log(`all organizations: mean ${allRuns.mean} / median ${allRuns.median} / max ${allRuns.max} (${allRuns.seeds} seeds)`);
  console.log(`written: ${out}`);
} finally {
  await client.end();
}
