/**
 * Géocodage des organisations et héritage géographique des événements.
 *
 * Deux étapes indépendantes, idempotentes :
 *  1. geocodeOrgs : résout lat/lon pour chaque org via des API publiques
 *     gratuites, dans l'ordre recherche-entreprises (siège SIRENE) →
 *     BAN/Géoplateforme (adresse) → commune-centre (INSEE), et enregistre
 *     la provenance dans org.geo_source.
 *  2. geocodePendingEvents : recopie les coordonnées de l'org sur ses
 *     événements dépourvus de lat/lon, par lots de 500, avec
 *     geo_type='entity_location' et geo_source='org'.
 *
 * Voir docs/geo.md pour les sources, licences et quotas.
 */
import { ingestQuery, query } from "../db.js"

/** Source de la coordonnée d'une org (manuel = saisie humaine, jamais écrasée). */
export type GeoSource = "BAN" | "recherche-entreprises" | "commune-centre" | "manuel"

/** User-Agent explicite : les API publiques exigent une identification. */
const API_USER_AGENT = "RadarCyberNA/0.2 (+https://github.com/j0ltdevv/radar-cyber; geocodage interne)"

/** Espacement minimal entre deux appels : plafonne à ~4,5 req/s (≤ 5 req/s). */
const MIN_GAP_MS = 220
const TIMEOUT_MS = 8000
const BATCH = 500

const SEARCH_ENTREPRISES_URL = "https://recherche-entreprises.api.gouv.fr/search"
/** Géoplateforme : endpoint officiel de la BAN (l'ancien api-adresse.data.gouv.fr est déprécié). */
const BAN_URL = "https://data.geopf.fr/geocodage/search/"
const COMMUNES_URL = "https://geo.api.gouv.fr/communes"

interface OrgRow {
  id: number
  name: string
  city: string | null
  dept: string | null
  lat: number | null
  lon: number | null
  geo_source: string | null
}

interface Coord {
  lat: number
  lon: number
}

interface GeoHit extends Coord {
  source: GeoSource
  /** Libellé lisible de la correspondance, pour la journalisation. */
  label: string
}

export interface GeocodeOptions {
  /** Nombre maximal d'orgs examinées (utile pour un run de contrôle). */
  limit?: number
  /** Résout sans écrire en base, pour inspecter les correspondances. */
  dryRun?: boolean
  /** Réexamine les orgs déjà géocodées (les saisies manuelles restent protégées). */
  force?: boolean
}

export interface GeocodeSummary {
  examined: number
  geocoded: number
  skipped: number
  unresolved: number
  bySource: Record<GeoSource, number>
}

/** File d'attente sérialisée : un seul appel réseau à la fois, espacé. */
let lastRequestAt = 0
let throttleQueue: Promise<void> = Promise.resolve()

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

function throttle(): Promise<void> {
  const slot = throttleQueue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt)
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
  })
  throttleQueue = slot.catch(() => {})
  return slot
}

/** GET JSON tolérant : null sur erreur définitive ; un réessai sur 429/5xx/réseau. */
async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await throttle()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": API_USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      })
      if (res.ok) return (await res.json()) as unknown
      if (res.status !== 429 && res.status < 500) return null
    } catch {
      // Réseau ou timeout : on retente une fois.
    } finally {
      clearTimeout(timer)
    }
    await sleep(500 + attempt * 1000)
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Coordonnée « lat,lon » (format SIRENE) → Coord. */
function parseLatLonPair(raw: string): Coord | null {
  const parts = raw.split(",")
  if (parts.length !== 2) return null
  const lat = Number(parts[0]?.trim())
  const lon = Number(parts[1]?.trim())
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

/** Coordonnée GeoJSON [lon, lat] → Coord. */
function parseLonLatPair(value: unknown): Coord | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const lon = Number(value[0])
  const lat = Number(value[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Mots trop génériques pour prouver une correspondance de nom. */
const GENERIC_TOKENS: Record<string, true> = {
  region: true, departement: true, commune: true, ville: true,
  metropole: true, agglomeration: true, conseil: true, general: true,
  national: true, nationale: true, centre: true, hospitalier: true,
  hospitaliere: true, universite: true, institut: true, groupe: true,
  societe: true, service: true,
}

function distinctiveTokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((token) => token.length >= 4 && GENERIC_TOKENS[token] !== true)
}

/**
 * Refuse les correspondances manifestement hors sujet : au moins un mot
 * distinctif du nom d'org doit apparaître dans le candidat. Sans mot
 * distinctif (nom très court), on fait confiance à l'API.
 */
function nameMatches(orgName: string, candidate: string): boolean {
  const own = distinctiveTokens(orgName)
  if (own.length === 0) return true
  const cand = new Set(normalizeName(candidate).split(" "))
  return own.some((token) => cand.has(token))
}

/**
 * Étape 1 : siège déclaré à l'INSEE (SIRENE), coordonnées précises.
 * Le candidat doit partager un mot distinctif avec le nom ET rester dans la
 * ville ou le département connus de l'org : sans cette garde, « Ville de
 * Limoges » se rattache à une SCI homonyme des Alpes-de-Haute-Provence.
 */
async function geocodeSearchEntreprises(org: OrgRow): Promise<GeoHit | null> {
  const name = org.name
  const data = asRecord(await fetchJson(`${SEARCH_ENTREPRISES_URL}?q=${encodeURIComponent(name)}&per_page=5`))
  const results = Array.isArray(data?.results) ? data.results : []
  for (const item of results) {
    const row = asRecord(item)
    if (!row) continue
    const candidate = asString(row.nom_complet) || asString(row.nom_raison_sociale)
    const siege = asRecord(row.siege)
    const coord = parseLatLonPair(asString(siege?.coordonnees))
    if (!coord) continue
    if (!nameMatches(name, candidate)) continue

    const candidateCity = normalizeName(asString(siege?.libelle_commune))
    const candidateDept = asString(siege?.code_postal).slice(0, 2)
    const cityMatches = org.city === null || candidateCity === normalizeName(org.city)
    const deptMatches = org.dept === null || candidateDept === org.dept.padStart(2, "0")
    if (!cityMatches && !deptMatches) continue

    return { ...coord, source: "recherche-entreprises", label: `${candidate} — ${asString(siege?.adresse)}` }
  }
  return null
}

/**
 * Étape 2 : adresse ou lieu-dit via la BAN. Les types « municipality » sont
 * exclus : le centre de commune est couvert par l'étape 3, avec une provenance
 * distincte, plus honnête qu'une adresse inventée.
 */
async function geocodeBan(name: string): Promise<GeoHit | null> {
  const data = asRecord(await fetchJson(`${BAN_URL}?q=${encodeURIComponent(name)}&limit=5`))
  const features = Array.isArray(data?.features) ? data.features : []
  for (const item of features) {
    const feature = asRecord(item)
    if (!feature) continue
    const props = asRecord(feature.properties)
    const coord = parseLonLatPair(asRecord(feature.geometry)?.coordinates)
    const score = asNumber(props?.score) ?? 0
    const type = asString(props?.type)
    const label = asString(props?.label)
    if (!coord || score < 0.4) continue
    if (type !== "housenumber" && type !== "street" && type !== "locality") continue
    if (!nameMatches(name, label)) continue
    return { ...coord, source: "BAN", label: `${label} (score ${score.toFixed(2)})` }
  }
  return null
}

/** Étape 3 : centre de la commune du siège (INSEE), repli grossier mais fiable. */
async function geocodeCommune(city: string, dept: string | null): Promise<GeoHit | null> {
  const suffix = dept ? `&codeDepartement=${encodeURIComponent(dept)}` : ""
  const url = `${COMMUNES_URL}?nom=${encodeURIComponent(city)}&fields=nom,code,centre,population&limit=5&boost=population${suffix}`
  const data = await fetchJson(url)
  const rows = Array.isArray(data) ? data : []
  const wanted = normalizeName(city)
  const candidates: Array<{ row: Record<string, unknown>; coord: Coord }> = []
  for (const item of rows) {
    const row = asRecord(item)
    if (!row) continue
    const coord = parseLonLatPair(asRecord(row.centre)?.coordinates)
    if (coord) candidates.push({ row, coord })
  }
  if (candidates.length === 0) return null
  const exact = candidates.find(({ row }) => normalizeName(asString(row.nom)) === wanted) ?? candidates[0]!
  return {
    ...exact.coord,
    source: "commune-centre",
    label: `${asString(exact.row.nom)} (${asString(exact.row.code)})`,
  }
}

/** Chaîne de repli : siège SIRENE → adresse BAN → centre de commune. */
async function resolveCoordinates(org: OrgRow): Promise<GeoHit | null> {
  // Une ville ou une région n'a pas de siège exploitable dans SIRENE : les
  // homonymes associatifs y pullulent. Le centre de commune est la réponse
  // juste et traçable.
  const normalized = normalizeName(org.name)
  const territorial = /^(ville|commune|region) /.test(normalized)
  if (!territorial) {
    const byCompany = await geocodeSearchEntreprises(org)
    if (byCompany) return byCompany
    const byAddress = await geocodeBan(org.name)
    if (byAddress) return byAddress
  }
  if (org.city) return geocodeCommune(org.city, org.dept)
  return null
}

function emptySummary(): GeocodeSummary {
  return {
    examined: 0,
    geocoded: 0,
    skipped: 0,
    unresolved: 0,
    bySource: { BAN: 0, "recherche-entreprises": 0, "commune-centre": 0, manuel: 0 },
  }
}

/**
 * Géocode les organisations. Idempotent : une org déjà géocodée est ignorée
 * sauf `force`; une provenance « manuel » n'est jamais écrasée.
 */
export async function geocodeOrgs(
  log: (msg: string) => void,
  opts: GeocodeOptions = {},
): Promise<GeocodeSummary> {
  const summary = emptySummary()
  const { rows } = await query<OrgRow>(
    "SELECT id, name, city, dept, lat, lon, geo_source FROM org ORDER BY id",
  )

  for (const org of rows) {
    if (org.geo_source === "manuel") {
      summary.skipped += 1
      continue
    }
    const alreadyGeocoded = org.geo_source !== null && org.lat !== null && org.lon !== null
    if (!opts.force && alreadyGeocoded) {
      summary.skipped += 1
      continue
    }
    if (opts.limit !== undefined && summary.examined >= opts.limit) break

    summary.examined += 1
    const hit = await resolveCoordinates(org)
    if (!hit) {
      summary.unresolved += 1
      log(`  ${org.id} ${org.name} : aucune correspondance`)
      continue
    }

    summary.geocoded += 1
    summary.bySource[hit.source] += 1
    if (!opts.dryRun) {
      await query("UPDATE org SET lat=$2, lon=$3, geo_source=$4 WHERE id=$1", [
        org.id,
        hit.lat,
        hit.lon,
        hit.source,
      ])
    }
    log(
      `  ${org.id} ${org.name} → ${hit.lat.toFixed(5)},${hit.lon.toFixed(5)} ` +
        `[${hit.source}] ${hit.label}${opts.dryRun ? " (dry-run)" : ""}`,
    )
  }

  const sources = Object.entries(summary.bySource)
    .filter(([, n]) => n > 0)
    .map(([source, n]) => `${source}=${n}`)
    .join(", ") || "aucune"
  log(
    `orgs : ${summary.geocoded} géocodée(s) sur ${summary.examined} examinée(s), ` +
      `${summary.unresolved} sans correspondance, ${summary.skipped} ignorée(s) — ${sources}`,
  )
  return summary
}

/**
 * Copie les coordonnées de l'org sur les événements rattachés qui n'en ont
 * pas. Lots de 500, idempotent : seuls les événements à lat NULL sont touchés.
 */
export async function geocodePendingEvents(log: (msg: string) => void): Promise<{ updated: number }> {
  let updated = 0
  for (;;) {
    const result = await ingestQuery(
      `WITH batch AS (
         SELECT e.id
         FROM event e
         JOIN org o ON o.id = e.org_id
         WHERE e.org_id IS NOT NULL
           AND e.lat IS NULL
           AND o.lat IS NOT NULL
           AND o.lon IS NOT NULL
         ORDER BY e.id
         LIMIT ${BATCH}
       )
       UPDATE event e
       SET lat = o.lat,
           lon = o.lon,
           geo_type = 'entity_location',
           geo_source = 'org'
       FROM batch b, org o
       WHERE e.id = b.id AND o.id = e.org_id`,
    )
    const n = result.rowCount ?? 0
    if (n === 0) break
    updated += n
    log(`héritage géo : ${updated} événement(s) mis à jour`)
    if (n < BATCH) break
  }
  log(`héritage géo : ${updated} événement(s) au total`)
  return { updated }
}
