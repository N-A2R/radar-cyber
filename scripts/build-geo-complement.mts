#!/usr/bin/env -S npx tsx
/**
 * Builds the versioned commune complement used by the final-mile geocoder.
 *
 * Only city labels that cannot be resolved from the local territorial
 * reference are queried against the free French address database
 * (api-adresse.data.gouv.fr, no key, no paid service). A resolution is kept
 * only when it is unambiguous, in the same department and inside the region.
 * The generated file is committed, so geocoding itself stays offline.
 *
 *   DATABASE_URL=... tsx scripts/build-geo-complement.mts \
 *     --out=db/data/referentiel-complement-geo-na.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
  buildGeoLookup,
  normalizeGeoName,
  resolveGeo,
  type GeoComplementEntry,
  type ReferenceCommune,
} from "../apps/api/src/geo/complete.js";
import { NA_BOUNDS, NA_DEPARTMENTS } from "../apps/api/src/geo/commune-index.js";

const API = "https://api-adresse.data.gouv.fr/search/";
const GEO = "https://geo.api.gouv.fr/communes";

interface PairRow {
  city: string;
  dept: string;
  n: number;
}

interface BanProperties {
  city?: string;
  oldcity?: string;
  citycode?: string;
  depcode?: string;
}

interface Candidate {
  code: string;
  nom: string;
  via: string;
}

const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith("--out="));
if (!outArg) {
  console.error("usage: build-geo-complement.mts --out=<path>");
  process.exit(1);
}
const outPath = fileURLToPath(new URL(`../${outArg.slice("--out=".length)}`, import.meta.url));

async function json(url: URL): Promise<{ features?: { properties: BanProperties }[] } | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as { features?: { properties: BanProperties }[] }) : null;
  } catch {
    return null;
  }
}

async function candidates(city: string, dept: string): Promise<Candidate[]> {
  const found = new Map<string, Candidate>();
  const wanted = normalizeGeoName(city);

  const street = new URL(API);
  street.searchParams.set("q", city);
  street.searchParams.set("limit", "10");
  for (const feature of (await json(street))?.features ?? []) {
    const p = feature.properties;
    if (String(p.depcode) !== dept || !p.citycode || !p.city) continue;
    for (const name of [p.city, p.oldcity]) {
      if (name && normalizeGeoName(name) === wanted) {
        found.set(p.citycode, { code: p.citycode, nom: p.city, via: "ban-street" });
      }
    }
  }

  const municipality = new URL(API);
  municipality.searchParams.set("q", `${city} ${dept}`);
  municipality.searchParams.set("type", "municipality");
  municipality.searchParams.set("limit", "5");
  for (const feature of (await json(municipality))?.features ?? []) {
    const p = feature.properties;
    if (String(p.depcode) !== dept || !p.citycode || !p.city) continue;
    const got = normalizeGeoName(p.city);
    if (got === wanted || got.endsWith(wanted) || wanted.endsWith(got)) {
      found.set(p.citycode, { code: p.citycode, nom: p.city, via: "ban-municipality" });
    }
  }
  return [...found.values()];
}

async function centre(code: string): Promise<{ lat: number; lon: number; nom: string } | null> {
  try {
    const response = await fetch(`${GEO}/${code}?fields=nom,code,centre,departement`);
    if (!response.ok) return null;
    const commune = (await response.json()) as {
      nom?: string;
      centre?: { coordinates: [number, number] };
      departement?: string;
    };
    const coordinates = commune.centre?.coordinates;
    if (!coordinates || !commune.nom) return null;
    const [lon, lat] = coordinates;
    if (lat < NA_BOUNDS.minLat || lat > NA_BOUNDS.maxLat || lon < NA_BOUNDS.minLon || lon > NA_BOUNDS.maxLon) return null;
    return { lat, lon, nom: commune.nom };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const referencePath = fileURLToPath(new URL("../db/data/referentiel-na.json", import.meta.url));
  const reference = JSON.parse(readFileSync(referencePath, "utf8")) as { communes: ReferenceCommune[] };
  const lookup = buildGeoLookup(reference.communes);

  const { rows } = await query<PairRow>(
    `SELECT city, dept, count(*)::int AS n
       FROM org
      WHERE dept = ANY($1::text[])
        AND (lat IS NULL OR lon IS NULL
             OR lat NOT BETWEEN $2 AND $3
             OR lon NOT BETWEEN $4 AND $5)
        AND city IS NOT NULL AND btrim(city) <> ''
      GROUP BY city, dept
      ORDER BY n DESC, city, dept`,
    [[...NA_DEPARTMENTS], NA_BOUNDS.minLat, NA_BOUNDS.maxLat, NA_BOUNDS.minLon, NA_BOUNDS.maxLon],
  );

  const unresolved = rows.filter((row) => resolveGeo(lookup, row.city, row.dept)?.method === "department");
  const entries: GeoComplementEntry[] = [];
  for (let offset = 0; offset < unresolved.length; offset += 8) {
    const batch = unresolved.slice(offset, offset + 8);
    const results = await Promise.all(batch.map((row) => candidates(row.city, row.dept)));
    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i]!;
      const matches = results[i]!;
      if (matches.length !== 1) continue;
      const point = await centre(matches[0]!.code);
      if (!point) continue;
      entries.push({
        city: row.city,
        dept: row.dept,
        code: matches[0]!.code,
        nom: point.nom,
        lat: point.lat,
        lon: point.lon,
        source: `${matches[0]!.via}: ${API} q=${encodeURIComponent(row.city)} + ${GEO}/${matches[0]!.code}`,
      });
    }
  }
  entries.sort((a, b) => a.dept.localeCompare(b.dept) || a.city.localeCompare(b.city));
  const document = {
    meta: {
      titre: "Complément géographique Nouvelle-Aquitaine",
      source: "API Adresse (BAN) + API Géo (IGN/Etalab), services publics gratuits",
      licence: "Licence Ouverte 1.0",
      methode: "Appariement non ambigu du libellé SIRENE au code commune, centroïde communal officiel",
      genereLe: new Date().toISOString(),
      entrees: entries.length,
    },
    entrees: entries,
  };
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(`complement built: ${entries.length} entries written to ${outPath}`);
}

try {
  await main();
} finally {
  await closePools();
}
