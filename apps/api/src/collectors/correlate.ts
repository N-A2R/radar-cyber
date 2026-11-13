/**
 * Corrélation événements → organisations.
 *
 * Trois stratégies de rattachement, appliquées aux événements sans org_id :
 *  1. Domaine : extraction des domaines depuis source_url et le texte
 *     (titre/summary), rapprochement exact avec org.domain et la table asset
 *     (kind domain/subdomain).
 *  2. Nom : normalisation (minuscules, accents, suffixes juridiques) puis
 *     correspondance des mots significatifs du nom d'org dans le texte.
 *  3. Géo : un événement rattaché à une org sans lat/lon propre hérite ceux
 *     de l'org (geo_type 'entity_location').
 *
 * Une relation (org → targeted_by → event, origin 'rule', confidence 'B2')
 * est créée de façon idempotente (ON CONFLICT DO NOTHING).
 *
 * Performance : orgs + assets chargés en mémoire au début du run et indexés
 * par domaine normalisé et par token de nom.
 */
import { query, withClient } from "../db.js"

/** Suffixes de domaine acceptés comme plausibles dans un texte d'événement. */
const TLD_SUFFIXES = [
  ".fr", ".com", ".org", ".net", ".eu", ".io", ".gouv.fr", ".asso.fr",
  ".edu", ".int", ".be", ".ch", ".de", ".es", ".it", ".nl", ".uk",
]

/** Labels multi-parties français : le domaine enregistré garde un label de plus. */
const SECOND_LEVEL_FR: Record<string, true> = { gouv: true, asso: true, education: true, assnat: true, collectivite: true, region: true, agriculture: true, sante: true, finances: true, culture: true, interieur: true, justice: true, defense: true, armee: true, banque: true, cnav: true, ameli: true, urssaf: true }

/** Regex de candidat domaine dans un texte libre. */
const DOMAIN_RE = /[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi

/** Suffixes juridiques / mots vides retirés lors de la normalisation de nom. */
const LEGAL_SUFFIXES = /^(sa|sas|sarl|eurl|snc|sci|scp|gie|group|groupe|holding|commune|ville|metropole|communaute|universite|association|cabinet|clinique|centre|hospitalier|hospitaliere)$/

/** Mots vides français exclus des tokens significatifs. */
const STOPWORDS: Record<string, true> = {
  de: true, du: true, des: true, la: true, le: true, les: true, l: true, d: true,
  et: true, en: true, sur: true, dans: true, pour: true, par: true, au: true,
  aux: true, avec: true, sous: true, ville: true, agglomeration: true,
}

/** Termes géographiques génériques : seuls, ils ne désignent pas une org. */
/**
 * Termes techniques génériques. Un CVE contient presque toujours « code »,
 * « software », « network » ou « server » : ces mots ne désignent aucune
 * organisation et ne doivent jamais fonder un rattachement.
 */
const TECH_GENERICS: Record<string, true> = {
  code: true, software: true, network: true, networks: true, system: true,
  systems: true, server: true, servers: true, service: true, services: true,
  solution: true, solutions: true, digital: true, cyber: true, data: true,
  cloud: true, media: true, group: true, global: true, technolog: true,
  technologies: true, technology: true, security: true, secure: true,
  platform: true, platforms: true, product: true, products: true,
}

/** Termes géographiques génériques : seuls, ils ne désignent pas une org. */
const GEO_GENERICS: Record<string, true> = {
  pays: true, basque: true, nouvelle: true, aquitaine: true, france: true,
  francais: true, europe: true, atlantique: true, sud: true, ouest: true,
  nord: true, est: true, centre: true, grand: true, littoral: true, national: true,
}

interface OrgRow {
  id: number
  name: string
  slug: string
  domain: string | null
  city: string | null
  lat: number | null
  lon: number | null
}

interface AssetRow {
  org_id: number
  kind: string
  value: string
}

interface EventRow {
  id: string
  title: string | null
  summary: string | null
  source_url: string | null
}

/** Supprime les accents et passe en minuscules. */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/** Normalise un nom d'organisation : minuscules, sans accents, sans ponctuation. */
function normalizeName(s: string): string {
  return stripAccents(s).replace(/[^a-z0-9]+/g, " ").trim()
}

/** Tokens significatifs (>= 4 caractères, hors suffixes juridiques et mots vides). */
export function significantTokens(normalizedName: string, exclude?: ReadonlySet<string>): string[] {
  // Déduplication : « CODE 202 (CODE 202) » se normalise en « code 202 code
  // 202 » et produisait deux fois le même jeton. Le garde-fou « au moins deux
  // jetons distincts » était donc contourné par la simple répétition d'un nom
  // entre parenthèses — et n'importe quel texte contenant « code » suffisait.
  return [...new Set(
    normalizedName
      .split(" ")
      .filter((t) => t.length >= 4 && !LEGAL_SUFFIXES.test(t) && !STOPWORDS[t] && !GEO_GENERICS[t] && !TECH_GENERICS[t] && !exclude?.has(t)),
  )]
}

/** Normalise un domaine : minuscules, sans www. final. */
function normalizeDomain(d: string): string {
  return stripAccents(d.trim()).replace(/^www\./, "").replace(/\.$/, "")
}

/**
 * Domaine enregistré (2 labels, 3 si second niveau français type gouv.fr).
 * Renvoie null si le suffixe n'est pas dans la liste acceptée.
 */
function registeredDomain(host: string): string | null {
  const labels = host.split(".")
  if (labels.length < 2) return null
  const last2 = labels.slice(-2).join(".")
  const suffixOk = TLD_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))
  if (!suffixOk) return null
  if (labels.length >= 3 && SECOND_LEVEL_FR[labels[labels.length - 2]]) {
    return labels.slice(-3).join(".")
  }
  return last2
}

/** Extrait les domaines plausibles d'une URL (hôte) et d'un texte libre. */
function extractDomains(url: string | null, text: string): Set<string> {
  const found = new Set<string>()
  if (url) {
    try {
      const host = new URL(url).hostname
      if (host) found.add(host)
    } catch {
      // URL malformée : le regex texte ci-dessous la rattrapera.
    }
  }
  for (const m of text.matchAll(DOMAIN_RE)) {
    const host = normalizeDomain(m[0])
    // Écarte les faux positifs numériques (IP, versions) et trop courts.
    if (!/[a-z]/.test(host) || host.length < 5) continue
    found.add(host)
  }
  // Ne garde que les domaines dont le suffixe est plausible.
  return new Set([...found].filter((h) => TLD_SUFFIXES.some((s) => h === s.slice(1) || h.endsWith(s))))
}

interface DomainIndexEntry {
  orgId: number
  lat: number | null
  lon: number | null
}

interface OrgIndex {
  /** domaine enregistré normalisé → org. */
  byDomain: Map<string, DomainIndexEntry>
  /** token significatif normalisé → orgs candidates. */
  byToken: Map<string, DomainIndexEntry[]>
}

export function buildOrgIndex(orgs: OrgRow[], assets: AssetRow[]): OrgIndex {
  const byDomain = new Map<string, DomainIndexEntry>()
  const byToken = new Map<string, DomainIndexEntry[]>()
  const addDomain = (domain: string, org: OrgRow) => {
    const key = normalizeDomain(domain)
    if (!key || !key.includes(".")) return
    const reg = registeredDomain(key) ?? key
    if (!byDomain.has(reg)) byDomain.set(reg, { orgId: org.id, lat: org.lat, lon: org.lon })
  }
  for (const o of orgs) {
    if (o.domain) addDomain(o.domain, o)
    for (const t of significantTokens(normalizeName(o.name))) {
      const list = byToken.get(t) ?? []
      list.push({ orgId: o.id, lat: o.lat, lon: o.lon })
      byToken.set(t, list)
    }
  }
  for (const a of assets) {
    if (a.kind !== "domain" && a.kind !== "subdomain") continue
    const org = orgs.find((o) => o.id === a.org_id)
    if (org) addDomain(a.value, org)
  }
  return { byDomain, byToken }
}

/**
 * Résout l'org d'un événement : essai par domaine (suffixe le plus long
 * d'abord), puis par nom. Renvoie l'entrée d'index gagnante ou null.
 */
export function resolveOrg(ev: EventRow, index: OrgIndex): DomainIndexEntry | null {
  const text = `${ev.title ?? ""} ${ev.summary ?? ""}`
  // 1. Domaine : on remonte label par label (sous-domaine → domaine de base).
  for (const host of extractDomains(ev.source_url, text)) {
    const labels = host.split(".")
    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = registeredDomain(labels.slice(i).join(".")) ?? labels.slice(i).join(".")
      const hit = index.byDomain.get(candidate)
      if (hit) return hit
    }
  }
  // 2. Nom : tous les tokens significatifs de l'org doivent apparaître
  //    (frontières de mots) dans le texte normalisé. On exige au moins
  //    2 tokens significatifs pour éviter les faux positifs sur des noms
  //    génériques réduits à un seul mot (France, Poste, nom de ville seul…).
  const normText = ` ${normalizeName(text)} `
  let best: DomainIndexEntry | null = null
  let bestTokens = 0
  const seenTokens = new Set<string>()
  for (const t of normText.split(" ")) {
    if (!t || t.length < 4 || seenTokens.has(t)) continue
    seenTokens.add(t)
    const candidates = index.byToken.get(t)
    if (!candidates) continue
    for (const c of candidates) {
      const org = orgTokensCache.get(c.orgId)
      if (!org || org.length < 2) continue
      if (org.every((tok) => normText.includes(` ${tok} `))) {
        // Préfère l'org avec le plus de tokens corroborés.
        if (org.length > bestTokens) {
          best = c
          bestTokens = org.length
        }
      }
    }
  }
  return best
}

/** Cache des tokens significatifs par org (rempli au chargement). */
const orgTokensCache = new Map<number, string[]>()

export async function correlateEvents(log: (msg: string) => void): Promise<void> {
  const before = await query<{ n: number }>("SELECT count(*)::int AS n FROM event WHERE org_id IS NOT NULL")

  // Charge orgs + assets en mémoire (392 orgs, volume faible).
  const orgs = (await query<OrgRow>("SELECT id, name, slug, domain, city, lat, lon FROM org")).rows
  const assets = (await query<AssetRow>(
    "SELECT org_id, kind, value FROM asset WHERE kind IN ('domain', 'subdomain')",
  )).rows
  for (const o of orgs) {
    // Les tokens repris du nom de la ville de l'org ne sont pas discriminants
    // (ex. « CH de Brive-la-Gaillarde » vs la ville elle-même).
    const cityTokens = new Set(o.city ? significantTokens(normalizeName(o.city)) : [])
    orgTokensCache.set(o.id, significantTokens(normalizeName(o.name), cityTokens))
  }
  const index = buildOrgIndex(orgs, assets)

  const events = (await query<EventRow>(
    "SELECT id::text AS id, title, summary, source_url FROM event WHERE org_id IS NULL",
  )).rows

  const eventIds: string[] = []
  const orgIds: number[] = []
  const lats: (number | null)[] = []
  const lons: (number | null)[] = []
  for (const ev of events) {
    const hit = resolveOrg(ev, index)
    if (!hit) continue
    eventIds.push(ev.id)
    orgIds.push(hit.orgId)
    // Héritage géo : l'event sans lat/lon propre reprend ceux de l'org.
    lats.push(hit.lat)
    lons.push(hit.lon)
  }

  if (eventIds.length > 0) {
    await withClient(async (client) => {
      await client.query("BEGIN")
      // Rattachement + héritage géo (entity_location quand l'event n'a pas de lat/lon).
      await client.query(
        `UPDATE event e
         SET org_id = d.org_id,
             lat = coalesce(e.lat, d.lat),
             lon = coalesce(e.lon, d.lon),
             geo_type = CASE WHEN e.lat IS NULL AND d.lat IS NOT NULL THEN 'entity_location' ELSE e.geo_type END
         FROM unnest($1::text[], $2::int[], $3::float8[], $4::float8[]) AS d(event_id, org_id, lat, lon)
         WHERE e.id = d.event_id::bigint`,
        [eventIds, orgIds, lats, lons],
      )
      // Relation org → targeted_by → event, idempotente (UNIQUE en base).
      await client.query(
        `INSERT INTO relation (src_kind, src_id, dst_kind, dst_id, relation_type, origin, confidence)
         SELECT 'org', d.org_id::text, 'event', d.event_id, 'targeted_by', 'rule', 'B2'
         FROM unnest($1::text[], $2::int[]) AS d(event_id, org_id)
         ON CONFLICT DO NOTHING`,
        [eventIds, orgIds],
      )
      // La correlation est une decision de rattachement : elle se consigne
      // comme les autres, dans la meme transaction. Sans cela, 1 921
      // evenements ont org_id sans qu'aucun fait ne dise qui l'a pose.
      await client.query(
        `INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
         SELECT 'event.rattachement', e.dedup_key,
                'correlation : rattache par regle de domaine ou de nom',
                jsonb_build_object('orgId', d.org_id, 'regle', 'correlate'),
                'moteur:correlate', e.observed_at
           FROM unnest($1::text[], $2::int[]) AS d(event_id, org_id)
           JOIN event e ON e.id = d.event_id::bigint`,
        [eventIds, orgIds],
      )
      await client.query("COMMIT")
    })
  }

  const after = await query<{ n: number }>("SELECT count(*)::int AS n FROM event WHERE org_id IS NOT NULL")
  log(`corrélation : ${eventIds.length} rattachement(s), ${before.rows[0]?.n ?? 0} → ${after.rows[0]?.n ?? 0} événement(s) rattaché(s)`)
}
