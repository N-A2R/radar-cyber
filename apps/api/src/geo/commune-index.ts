/**
 * Offline commune lookup for Nouvelle-Aquitaine geocoding.
 *
 * The reference file `db/data/referentiel-na.json` already carries an INSEE
 * commune centre for every commune of the region. Matching an organisation's
 * city and department against that file is free, deterministic and traceable:
 * no network call, no guessed coordinate, no personal data.
 */

/** Departments of Nouvelle-Aquitaine (INSEE codes). */
export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

/** Bounding box containing every commune centre of the region. */
export const NA_BOUNDS = {
  minLat: 42.7,
  maxLat: 47.2,
  minLon: -2.1,
  maxLon: 2.8,
} as const;

/** Minimal shape of a commune in the local reference file. */
export interface CommuneRecord {
  code: string;
  nom: string;
  departement: string;
  lat: number;
  lon: number;
}

export interface CommuneMatch {
  code: string;
  lat: number;
  lon: number;
}

export type CommuneIndex = ReadonlyMap<string, CommuneMatch>;

/** Accent- and punctuation-insensitive key, aligned with the matcher. */
export function normalizeCommuneName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function departmentCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  return trimmed.padStart(2, "0");
}

function isNaDepartment(value: string | null | undefined): value is string {
  const code = departmentCode(value);
  return code !== null && (NA_DEPARTMENTS as readonly string[]).includes(code);
}

/** True when a coordinate is plausible for Nouvelle-Aquitaine. */
export function isNaCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= NA_BOUNDS.minLat &&
    lat <= NA_BOUNDS.maxLat &&
    lon >= NA_BOUNDS.minLon &&
    lon <= NA_BOUNDS.maxLon
  );
}

function keyFor(nom: string, departement: string): string {
  return `${departement}|${normalizeCommuneName(nom)}`;
}

/**
 * Indexes commune centres by department and normalised name.
 * Ambiguous keys (two different communes with the same key) are dropped:
 * a backfill must never pick one of several possible places.
 */
export function buildCommuneIndex(communes: readonly CommuneRecord[]): Map<string, CommuneMatch> {
  const candidates = new Map<string, CommuneMatch>();
  const ambiguous = new Set<string>();
  const seen = new Set<string>();

  for (const commune of communes) {
    if (!isNaDepartment(commune.departement)) continue;
    if (!isNaCoordinate(commune.lat, commune.lon)) continue;
    if (!commune.code || !commune.nom) continue;

    const dept = departmentCode(commune.departement)!;
    const key = keyFor(commune.nom, dept);
    const identity = `${key}|${commune.code}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const previous = candidates.get(key);
    if (previous && previous.code !== commune.code) {
      candidates.delete(key);
      ambiguous.add(key);
      continue;
    }
    if (!ambiguous.has(key)) {
      candidates.set(key, { code: commune.code, lat: commune.lat, lon: commune.lon });
    }
  }
  return candidates;
}

/** Resolves an organisation's city inside a known NA department. */
export function resolveCommune(
  index: CommuneIndex,
  city: string | null | undefined,
  dept: string | null | undefined,
): CommuneMatch | null {
  if (!city || !isNaDepartment(dept)) return null;
  const code = departmentCode(dept)!;
  return index.get(keyFor(city, code)) ?? null;
}
