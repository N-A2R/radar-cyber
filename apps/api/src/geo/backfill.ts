/**
 * Backfills missing organisation coordinates from the local commune reference.
 *
 * Only Nouvelle-Aquitaine organisations with no lat/lon are touched. Each
 * written coordinate keeps its provenance (INSEE commune code) in
 * `org_enrichissement`, and existing coordinates are never overwritten.
 */
import { ingestPool, query } from "../db.js";
import {
  buildCommuneIndex,
  NA_DEPARTMENTS,
  resolveCommune,
  type CommuneRecord,
} from "./commune-index.js";

const BATCH_SIZE = 20_000;
const CONFIDENCE = 0.8;
const REFERENCE = "db/data/referentiel-na.json";

export interface BackfillOptions {
  communes: readonly CommuneRecord[];
  /** Maximum number of organisations to update in this run. */
  limit?: number;
  /** Report candidates without writing anything. */
  dryRun?: boolean;
}

export interface BackfillSummary {
  candidateOrgs: number;
  resolvedOrgs: number;
  updated: number;
  unresolvedOrgs: number;
  pairsMatched: number;
}

interface PairRow {
  city: string;
  dept: string;
  n: number;
}

interface CityPair {
  city: string;
  dept: string;
  code: string;
  lat: number;
  lon: number;
  orgs: number;
}

/** Lists distinct (raw city, department) pairs still lacking coordinates. */
async function pendingPairs(): Promise<PairRow[]> {
  const { rows } = await query<PairRow>(
    `SELECT city, dept, count(*)::int AS n
       FROM org
      WHERE (lat IS NULL OR lon IS NULL)
        AND dept = ANY($1::text[])
        AND city IS NOT NULL
        AND btrim(city) <> ''
      GROUP BY city, dept
      ORDER BY n DESC, city, dept`,
    [[...NA_DEPARTMENTS]],
  );
  return rows;
}

/**
 * Resolves and writes the backfill. A single pooled client holds the temporary
 * lookup table; each batch commits separately so an interrupted run is safe.
 */
export async function backfillOrgGeo(
  log: (msg: string) => void,
  options: BackfillOptions,
): Promise<BackfillSummary> {
  const index = buildCommuneIndex(options.communes);
  const pairs = await pendingPairs();

  const resolved: CityPair[] = [];
  let unresolvedOrgs = 0;
  for (const pair of pairs) {
    const match = resolveCommune(index, pair.city, pair.dept);
    if (match) {
      resolved.push({ city: pair.city, dept: pair.dept, ...match, orgs: pair.n });
    } else {
      unresolvedOrgs += pair.n;
    }
  }
  const candidateOrgs = pairs.reduce((sum, pair) => sum + pair.n, 0);
  const resolvedOrgs = resolved.reduce((sum, pair) => sum + pair.orgs, 0);

  const summary: BackfillSummary = {
    candidateOrgs,
    resolvedOrgs,
    updated: 0,
    unresolvedOrgs,
    pairsMatched: resolved.length,
  };
  log(
    `commune lookup: ${resolved.length}/${pairs.length} city-department pairs resolved ` +
      `(${resolvedOrgs}/${candidateOrgs} organisations)`,
  );

  if (options.dryRun || resolved.length === 0) return summary;

  const client = await ingestPool.connect();
  try {
    await client.query("DROP TABLE IF EXISTS pg_temp.geo_backfill_pairs");
    await client.query(
      `CREATE TEMP TABLE geo_backfill_pairs (
         city text NOT NULL,
         dept text NOT NULL,
         commune_code text NOT NULL,
         lat double precision NOT NULL,
         lon double precision NOT NULL,
         PRIMARY KEY (city, dept)
       )`,
    );

    for (let offset = 0; offset < resolved.length; offset += 500) {
      const chunk = resolved.slice(offset, offset + 500);
      await client.query(
        `INSERT INTO geo_backfill_pairs (city, dept, commune_code, lat, lon)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[],
                              $4::double precision[], $5::double precision[])`,
        [
          chunk.map((p) => p.city),
          chunk.map((p) => p.dept),
          chunk.map((p) => p.code),
          chunk.map((p) => p.lat),
          chunk.map((p) => p.lon),
        ],
      );
    }

    for (;;) {
      const remaining =
        options.limit === undefined ? BATCH_SIZE : Math.min(BATCH_SIZE, options.limit - summary.updated);
      if (remaining <= 0) break;

      const { rows } = await client.query<{ updated: number; traced: number }>(
        `WITH targets AS (
           SELECT o.id, g.commune_code, g.lat, g.lon
             FROM org o
             JOIN geo_backfill_pairs g ON g.city = o.city AND g.dept = o.dept
            WHERE (o.lat IS NULL OR o.lon IS NULL)
              AND o.dept = ANY($1::text[])
            ORDER BY o.id
            LIMIT $2
         ), written AS (
           UPDATE org o
              SET lat = t.lat, lon = t.lon, geo_source = 'commune-centre'
             FROM targets t
            WHERE o.id = t.id
         RETURNING o.id, t.commune_code, t.lat, t.lon
         ), traced AS (
           INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
           SELECT id, 'geo', concat(lat, ',', lon), 'commune-centre-local', $3,
                  jsonb_build_object('codeCommune', commune_code, 'reference', $4::text)
             FROM written
           ON CONFLICT (org_id, champ) DO NOTHING
         RETURNING org_id
         )
         SELECT (SELECT count(*) FROM written)::int AS updated,
                (SELECT count(*) FROM traced)::int AS traced`,
        [[...NA_DEPARTMENTS], remaining, CONFIDENCE, REFERENCE],
      );
      const updated = rows[0]?.updated ?? 0;
      const traced = rows[0]?.traced ?? 0;
      summary.updated += updated;
      log(`backfill batch: ${updated} organisations updated, ${traced} provenance rows written`);
      if (updated < remaining) break;
    }
  } finally {
    await client.query("DROP TABLE IF EXISTS pg_temp.geo_backfill_pairs");
    client.release();
  }

  log(
    `backfill done: ${summary.updated} organisations geocoded from local commune centres ` +
      `(${summary.unresolvedOrgs} candidates left unresolved)`,
  );
  return summary;
}
