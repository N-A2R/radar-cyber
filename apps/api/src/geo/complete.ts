/**
 * Final-mile geocoding for Nouvelle-Aquitaine organisations.
 *
 * The first backfill (see ./backfill.ts) resolves exact commune names. This
 * stage handles the residual SIRENE labels: abbreviations, delegated communes,
 * spelling variants and a versioned complement built from the free French
 * address database. Every written coordinate keeps its provenance and stays
 * inside the regional bounding box. No coordinate is ever invented.
 */
import { ratio, tokenSortRatio, weightedRatio } from "rapidfuzz-js/fuzz";
import { ingestPool, query } from "../db.js";
import { NA_BOUNDS, isNaCoordinate } from "./commune-index.js";
import { naDepartmentCode, naDepartmentsIn } from "./na-departments.js";

const BATCH_SIZE = 20_000;
const FUZZY_THRESHOLD = 92;
const FUZZY_GAP = 3;
const REFERENCE = "db/data/referentiel-na.json";
const COMPLEMENT = "db/data/referentiel-complement-geo-na.json";

/** Minimal commune shape used from the local territorial reference. */
export interface ReferenceCommune {
  code: string;
  nom: string;
  departement: string;
  parent: string | null;
  lat: number | null;
  lon: number | null;
}

/** One manually verified BAN resolution, versioned alongside the reference. */
export interface GeoComplementEntry {
  city: string;
  dept: string;
  code: string;
  nom: string;
  lat: number;
  lon: number;
  source: string;
}

export interface GeoMatch {
  code: string;
  nom: string;
  lat: number;
  lon: number;
  method: "exact" | "parent" | "fuzzy" | "complement" | "department";
  confidence: number;
}

export interface GeoLookup {
  readonly exact: ReadonlyMap<string, GeoMatch>;
  readonly byDept: ReadonlyMap<string, readonly { normalized: string; match: GeoMatch }[]>;
  readonly complement: ReadonlyMap<string, GeoMatch>;
  readonly departments: ReadonlyMap<string, GeoMatch>;
}

/**
 * Expands the abbreviations used by SIRENE city labels before normalisation.
 * Both sides of a comparison go through the same function.
 */
export function expandGeoName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[-'’]/g, " ")
    .replace(/\b(st|saint)\b/g, "saint")
    .replace(/\b(ste|sainte)\b/g, "sainte")
    .replace(/\b(gt|grand)\b/g, "grand")
    .replace(/\b(pt|petit)\b/g, "petit");
}

/** Compact comparison key: letters and digits only. */
export function normalizeGeoName(value: string): string {
  return expandGeoName(value).replace(/[^a-z0-9]/g, "");
}

function keyFor(dept: string, name: string): string {
  return `${dept}|${normalizeGeoName(name)}`;
}

/**
 * Builds the lookup from the versioned commune reference. A delegated commune
 * without a centroid inherits the centre of its INSEE parent; a key shared by
 * several communes is dropped instead of guessed.
 */
export function buildGeoLookup(
  communes: readonly ReferenceCommune[],
  complement: readonly GeoComplementEntry[] = [],
): GeoLookup {
  const byCode = new Map(communes.map((commune) => [commune.code, commune]));
  const centreCache = new Map<string, GeoMatch | null>();

  const centreOf = (commune: ReferenceCommune): GeoMatch | null => {
    const cached = centreCache.get(commune.code);
    if (cached !== undefined) return cached;
    let current: ReferenceCommune | undefined = commune;
    const seen = new Set<string>();
    while (current && !seen.has(current.code)) {
      seen.add(current.code);
      if (current.lat !== null && current.lon !== null && isNaCoordinate(current.lat, current.lon)) {
        const match: GeoMatch = {
          code: current.code,
          nom: current.nom,
          lat: current.lat,
          lon: current.lon,
          method: current.code === commune.code ? "exact" : "parent",
          confidence: current.code === commune.code ? 1 : 0.8,
        };
        centreCache.set(commune.code, match);
        return match;
      }
      current = current.parent ? byCode.get(current.parent) : undefined;
    }
    centreCache.set(commune.code, null);
    return null;
  };

  const exact = new Map<string, GeoMatch>();
  const ambiguous = new Set<string>();
  const byDept = new Map<string, { normalized: string; match: GeoMatch }[]>();
  const sums = new Map<string, { lat: number; lon: number; n: number; code: string }>();

  for (const commune of communes) {
    const dept = naDepartmentCode(commune.departement);
    if (!dept) continue;
    const centre = centreOf(commune);
    if (!centre) continue;

    const key = keyFor(dept, commune.nom);
    if (ambiguous.has(key)) continue;
    const previous = exact.get(key);
    if (previous && previous.code !== centre.code) {
      exact.delete(key);
      ambiguous.add(key);
    } else if (!previous) {
      exact.set(key, centre);
    }

    const candidates = byDept.get(dept) ?? [];
    candidates.push({ normalized: normalizeGeoName(commune.nom), match: centre });
    byDept.set(dept, candidates);

    const aggregate = sums.get(dept) ?? { lat: 0, lon: 0, n: 0, code: dept };
    aggregate.lat += centre.lat;
    aggregate.lon += centre.lon;
    aggregate.n += 1;
    sums.set(dept, aggregate);
  }

  const departments = new Map<string, GeoMatch>();
  for (const [dept, aggregate] of sums) {
    const lat = aggregate.lat / aggregate.n;
    const lon = aggregate.lon / aggregate.n;
    if (isNaCoordinate(lat, lon)) {
      departments.set(dept, {
        code: dept,
        nom: `department ${dept} centre`,
        lat,
        lon,
        method: "department",
        confidence: 0.4,
      });
    }
  }

  const complementMap = new Map<string, GeoMatch>();
  for (const entry of complement) {
    const dept = naDepartmentCode(entry.dept);
    if (!dept || !isNaCoordinate(entry.lat, entry.lon)) continue;
    complementMap.set(keyFor(dept, entry.city), {
      code: entry.code,
      nom: entry.nom,
      lat: entry.lat,
      lon: entry.lon,
      method: "complement",
      confidence: 0.9,
    });
  }

  return { exact, byDept, complement: complementMap, departments };
}

/**
 * Resolves a city label to a traceable Nouvelle-Aquitaine position.
 * Returns null for departments outside the region or missing references.
 */
export function resolveGeo(lookup: GeoLookup, city: string | null | undefined, dept: string | null | undefined): GeoMatch | null {
  const code = naDepartmentCode(dept);
  if (!code) return null;

  if (!city || !city.trim()) return lookup.departments.get(code) ?? null;

  const key = keyFor(code, city);
  const direct = lookup.exact.get(key) ?? lookup.complement.get(key);
  if (direct) return direct;

  const query = normalizeGeoName(city);
  const scored = (lookup.byDept.get(code) ?? [])
    .map((candidate) => ({
      candidate,
      score: Math.max(
        ratio(query, candidate.normalized),
        tokenSortRatio(query, candidate.normalized),
        weightedRatio(query, candidate.normalized),
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  if (
    best &&
    best.score >= FUZZY_THRESHOLD &&
    (!runnerUp ||
      best.score - runnerUp.score >= FUZZY_GAP ||
      best.candidate.match.code === runnerUp.candidate.match.code)
  ) {
    return { ...best.candidate.match, confidence: best.score / 100 };
  }

  return lookup.departments.get(code) ?? null;
}

interface TargetRow {
  city: string | null;
  dept: string;
  n: number;
}

/** NA organisations still missing a coordinate or carrying one outside the region. */
async function pendingTargets(): Promise<TargetRow[]> {
  const { rows: deptRows } = await query<{ dept: string }>(
    `SELECT DISTINCT dept FROM org WHERE dept IS NOT NULL`,
  );
  const depts = naDepartmentsIn(deptRows.map((row) => row.dept));
  if (depts.length === 0) return [];
  const { rows } = await query<TargetRow>(
    `SELECT city, dept, count(*)::int AS n
       FROM org
      WHERE dept = ANY($1::text[])
        AND (lat IS NULL OR lon IS NULL
             OR lat NOT BETWEEN $2 AND $3
             OR lon NOT BETWEEN $4 AND $5)
      GROUP BY city, dept
      ORDER BY n DESC, city, dept`,
    [depts, NA_BOUNDS.minLat, NA_BOUNDS.maxLat, NA_BOUNDS.minLon, NA_BOUNDS.maxLon],
  );
  return rows;
}

export interface CompleteOptions {
  lookup: GeoLookup;
  limit?: number;
  dryRun?: boolean;
}

export interface CompleteSummary {
  candidateOrgs: number;
  resolved: number;
  updated: number;
  byMethod: Record<string, number>;
}

/** Writes the resolved coordinates in bounded, idempotent, traced batches. */
export async function backfillRemainingGeo(
  log: (msg: string) => void,
  options: CompleteOptions,
): Promise<CompleteSummary> {
  const targets = await pendingTargets();
  const resolved = new Map<string, { city: string | null; dept: string; match: GeoMatch; orgs: number }>();
  const summary: CompleteSummary = { candidateOrgs: 0, resolved: 0, updated: 0, byMethod: {} };

  for (const target of targets) {
    summary.candidateOrgs += target.n;
    const match = resolveGeo(options.lookup, target.city, target.dept);
    if (!match) continue;
    resolved.set(`${target.dept}|${target.city ?? ""}`, {
      city: target.city,
      dept: target.dept,
      match,
      orgs: target.n,
    });
    summary.resolved += target.n;
    summary.byMethod[match.method] = (summary.byMethod[match.method] ?? 0) + target.n;
  }
  log(`lookup: ${resolved.size}/${targets.length} city-department groups resolved (${summary.resolved}/${summary.candidateOrgs} organisations)`);
  log(`precision: ${JSON.stringify(summary.byMethod)}`);

  if (options.dryRun || resolved.size === 0) return summary;

  const client = await ingestPool.connect();
  try {
    await client.query("DROP TABLE IF EXISTS pg_temp.geo_complete_pairs");
    await client.query(
      `CREATE TEMP TABLE geo_complete_pairs (
         city text,
         dept text NOT NULL,
         code text NOT NULL,
         nom text NOT NULL,
         lat double precision NOT NULL,
         lon double precision NOT NULL,
         method text NOT NULL,
         confidence double precision NOT NULL,
         PRIMARY KEY (dept, city)
       )`,
    );
    const rows = [...resolved.values()];
    for (let offset = 0; offset < rows.length; offset += 500) {
      const chunk = rows.slice(offset, offset + 500);
      await client.query(
        `INSERT INTO geo_complete_pairs (city, dept, code, nom, lat, lon, method, confidence)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                              $5::double precision[], $6::double precision[],
                              $7::text[], $8::double precision[])`,
        [
          chunk.map((r) => r.city ?? ""),
          chunk.map((r) => r.dept),
          chunk.map((r) => r.match.code),
          chunk.map((r) => r.match.nom),
          chunk.map((r) => r.match.lat),
          chunk.map((r) => r.match.lon),
          chunk.map((r) => r.match.method),
          chunk.map((r) => r.match.confidence),
        ],
      );
    }

    for (;;) {
      const remaining = options.limit === undefined ? BATCH_SIZE : Math.min(BATCH_SIZE, options.limit - summary.updated);
      if (remaining <= 0) break;
      const { rows: writtenRows } = await client.query<{ updated: number; traced: number }>(
        `WITH targets AS (
           SELECT o.id, g.code, g.nom, g.lat, g.lon, g.method, g.confidence
             FROM org o
             JOIN geo_complete_pairs g
               ON g.dept = o.dept AND g.city = COALESCE(o.city, '')
            WHERE o.dept = ANY($1::text[])
              AND (o.lat IS NULL OR o.lon IS NULL
                   OR o.lat NOT BETWEEN $2 AND $3
                   OR o.lon NOT BETWEEN $4 AND $5)
            ORDER BY o.id
            LIMIT $6
         ), written AS (
           UPDATE org o
              SET lat = t.lat, lon = t.lon, geo_source = 'geo-complete'
             FROM targets t
            WHERE o.id = t.id
         RETURNING o.id, t.code, t.nom, t.lat, t.lon, t.method, t.confidence
         ), traced AS (
           INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
           SELECT id, 'geo', concat(lat, ',', lon),
                  concat('geo-complete-', method), confidence,
                  jsonb_build_object('codeCommune', code, 'nomCommune', nom,
                                     'method', method, 'reference', $7::text)
             FROM written
           ON CONFLICT (org_id, champ) DO UPDATE
             SET source = excluded.source,
                 valeur = excluded.valeur,
                 preuve = excluded.preuve,
                 confiance = excluded.confiance
            WHERE org_enrichissement.source <> excluded.source
         RETURNING org_id
         )
         SELECT (SELECT count(*) FROM written)::int AS updated,
                (SELECT count(*) FROM traced)::int AS traced`,
        [
          [...new Set([...resolved.values()].map((row) => row.dept))],
          NA_BOUNDS.minLat,
          NA_BOUNDS.maxLat,
          NA_BOUNDS.minLon,
          NA_BOUNDS.maxLon,
          remaining,
          REFERENCE,
        ],
      );
      const updated = writtenRows[0]?.updated ?? 0;
      summary.updated += updated;
      log(`backfill batch: ${updated} organisations updated`);
      if (updated < remaining) break;
    }
  } finally {
    await client.query("DROP TABLE IF EXISTS pg_temp.geo_complete_pairs");
    client.release();
  }

  log(`backfill done: ${summary.updated} organisations geocoded from local references`);
  return summary;
}

export { BATCH_SIZE, COMPLEMENT, REFERENCE };
