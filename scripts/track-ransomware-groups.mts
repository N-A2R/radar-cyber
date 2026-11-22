/**
 * Rebuild the ransomware group tracker from collected evidence (chantier D1).
 *
 * Sources: quarantine claims, our own ransomware events and the curated NA
 * corpus. No external/paid service is called. Only organisation-level evidence
 * is stored: the raw claim hint is used for matching and then discarded.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/track-ransomware-groups.mts
 */
import { readFileSync } from "node:fs";
import { withTransaction, closePools, query } from "../apps/api/src/db.js";
import {
  CORPUS_DEPARTMENTS,
  CURATED_NAME_THRESHOLD,
  NA_DEPARTMENTS,
  TRACKED_GROUP_LIMIT,
  deduplicateVictims,
  distinctiveNameFromHint,
  domainFromHint,
  groupSlug,
  normalizeGroupName,
  safeHint,
  safeSourceUrl,
  selectTrackedGroups,
  type VictimEvidence,
} from "../apps/api/src/ransomware/groups.js";

const LIMIT = Number(process.env.RANSOMWARE_GROUP_LIMIT ?? TRACKED_GROUP_LIMIT);
if (!Number.isInteger(LIMIT) || LIMIT < 1) throw new Error("RANSOMWARE_GROUP_LIMIT must be a positive integer");
const IN_NA = NA_DEPARTMENTS.map((d) => `'${d}'`).join(",");

type GroupMeta = {
  slug: string;
  name: string;
  claims: number;
  first_seen: string | null;
  last_seen: string | null;
};

type OrgRow = { id: number; name: string; dept: string; key: string };

type CorpusRow = {
  organisation: string;
  departement: string;
  groupe: string;
  date: string;
  url: string;
};

const meta = new Map<string, GroupMeta>();
function addGroup(rawGroup: string | null | undefined): string {
  const name = normalizeGroupName(rawGroup);
  const slug = groupSlug(name);
  if (!meta.has(slug)) {
    meta.set(slug, { slug, name, claims: 0, first_seen: null, last_seen: null });
  }
  return slug;
}

const victims: VictimEvidence[] = [];

const counts = await query<{
  raw_group: string;
  claims: number;
  first_seen: string | null;
  last_seen: string | null;
}>(`
  SELECT lower(btrim(groupe)) AS raw_group, count(*)::int AS claims,
         min(claimed_at)::text AS first_seen, max(claimed_at)::text AS last_seen
    FROM quarantine_raw
   WHERE groupe IS NOT NULL AND btrim(groupe) <> ''
   GROUP BY 1
`);
for (const row of counts.rows) {
  const slug = addGroup(row.raw_group);
  const group = meta.get(slug)!;
  group.claims = row.claims;
  group.first_seen = row.first_seen;
  group.last_seen = row.last_seen;
}

// Evidence 1: events already attached to an organisation of the region.
const eventRows = await query<{
  raw_group: string;
  org_id: number;
  org_name: string;
  dept: string;
  source_url: string | null;
  observed_at: string | null;
}>(`
  SELECT lower(btrim(e.evidence->>'group')) AS raw_group, e.org_id,
         o.name AS org_name, o.dept, e.source_url, e.observed_at::text AS observed_at
    FROM event e
    JOIN org o ON o.id = e.org_id
   WHERE e.family = 'ransomware'
     AND e.evidence ? 'group'
     AND btrim(e.evidence->>'group') <> ''
     AND o.dept IN (${IN_NA})
`);
for (const row of eventRows.rows) {
  victims.push({
    slug: addGroup(row.raw_group),
    orgId: row.org_id,
    orgName: row.org_name,
    dept: row.dept,
    source: "event",
    sourceUrl: safeSourceUrl(row.source_url),
    claimId: null,
    claimedAt: row.observed_at,
    matchType: "event",
  });
}

// Evidence 2: curated NA claims, matched only with a strong trigram score.
const corpusPath = new URL("../bench/corpus/ransomware-na.jsonl", import.meta.url);
const corpus = readFileSync(corpusPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as CorpusRow);
for (const row of corpus) {
  const dept = CORPUS_DEPARTMENTS[row.departement];
  if (!dept) continue;
  const name = normalizeNameForCorpus(row.organisation);
  const match = await query<{ id: number; name: string; dept: string; score: number }>(`
    SELECT id, name, dept, similarity(name_norm, $2)::float8 AS score
      FROM org
     WHERE dept = $1 AND name_norm % $2
     ORDER BY score DESC
     LIMIT 1
  `, [dept, name]);
  const best = match.rows[0];
  if (!best || best.score < CURATED_NAME_THRESHOLD) continue;
  victims.push({
    slug: addGroup(row.groupe),
    orgId: best.id,
    orgName: best.name,
    dept: best.dept,
    source: "curated-corpus",
    sourceUrl: safeSourceUrl(row.url),
    claimId: null,
    claimedAt: row.date,
    matchType: "curated",
    score: best.score,
  });
}

// Evidence 3: claim hints, joined to the referential in two bounded batches.
const claimRows = await query<{
  id: number;
  raw_group: string;
  source: string;
  org_hint: string;
  source_url: string | null;
  claimed_at: string | null;
}>(`
  SELECT id, lower(btrim(groupe)) AS raw_group, source, org_hint,
         source_url, claimed_at::text AS claimed_at
    FROM quarantine_raw
   WHERE groupe IS NOT NULL AND btrim(groupe) <> ''
     AND org_hint IS NOT NULL AND btrim(org_hint) <> ''
     AND status <> 'rejected'
`);

const byDomain = new Map<string, OrgRow[]>();
const byName = new Map<string, OrgRow[]>();
for (const claim of claimRows.rows) {
  const hint = safeHint(claim.org_hint);
  if (!hint) continue;
  const domain = domainFromHint(hint);
  const name = domain ? null : distinctiveNameFromHint(hint);
  if (domain) {
    const key = domain.toLowerCase();
    if (!byDomain.has(key)) byDomain.set(key, []);
  } else if (name) {
    if (!byName.has(name)) byName.set(name, []);
  }
}

async function loadOrgs(keys: string[], column: "domain" | "name_norm"): Promise<Map<string, OrgRow[]>> {
  const found = new Map<string, OrgRow[]>();
  if (keys.length === 0) return found;
  const expression = column === "domain" ? "lower(domain)" : "name_norm";
  const result = await query<OrgRow & { key: string }>(`
    SELECT id, name, dept, ${expression} AS key
      FROM org
     WHERE ${expression} = ANY($1::text[]) AND dept IN (${IN_NA})
  `, [keys]);
  for (const row of result.rows) {
    const list = found.get(row.key) ?? [];
    list.push(row);
    found.set(row.key, list);
  }
  return found;
}

const domainOrgs = await loadOrgs([...byDomain.keys()], "domain");
const nameOrgs = await loadOrgs([...byName.keys()], "name_norm");
for (const claim of claimRows.rows) {
  const hint = safeHint(claim.org_hint);
  if (!hint) continue;
  const domain = domainFromHint(hint);
  const name = domain ? null : distinctiveNameFromHint(hint);
  const matches = domain ? domainOrgs.get(domain.toLowerCase()) : name ? nameOrgs.get(name) : undefined;
  if (!matches) continue;
  for (const org of matches) {
    victims.push({
      slug: addGroup(claim.raw_group),
      orgId: org.id,
      orgName: org.name,
      dept: org.dept,
      source: claim.source,
      sourceUrl: safeSourceUrl(claim.source_url),
      claimId: claim.id,
      claimedAt: claim.claimed_at,
      matchType: domain ? "domain" : "name",
    });
  }
}

const uniqueVictims = deduplicateVictims(victims);
const tracked = selectTrackedGroups(
  uniqueVictims.map((v) => v.slug),
  [...meta.values()].map(({ slug, claims }) => ({ slug, claims })),
  LIMIT,
);

await withTransaction(async (client) => {
  for (const slug of tracked) {
    const group = meta.get(slug)!;
    await client.query(`
      INSERT INTO ransomware_group (slug, name, claims_count, first_seen, last_seen)
      VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        claims_count = EXCLUDED.claims_count,
        first_seen = COALESCE(ransomware_group.first_seen, EXCLUDED.first_seen),
        last_seen = COALESCE(EXCLUDED.last_seen, ransomware_group.last_seen),
        updated_at = now()
    `, [group.slug, group.name, group.claims, group.first_seen, group.last_seen]);
  }
  await client.query(`
    DELETE FROM ransomware_victim
     WHERE group_id IN (SELECT id FROM ransomware_group WHERE slug = ANY($1::text[]))
  `, [tracked]);
  for (const victim of uniqueVictims) {
    if (!tracked.includes(victim.slug)) continue;
    const group = await client.query<{ id: number }>(
      "SELECT id FROM ransomware_group WHERE slug = $1", [victim.slug],
    );
    await client.query(`
      INSERT INTO ransomware_victim
        (group_id, org_id, source, source_url, claim_id, claimed_at, match_type)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)
    `, [
      group.rows[0].id, victim.orgId, victim.source, victim.sourceUrl,
      victim.claimId, victim.claimedAt, victim.matchType,
    ]);
  }
});

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  trackedGroups: tracked.length,
  groupsWithNaVictims: new Set(uniqueVictims.map((v) => v.slug)).size,
  naVictims: uniqueVictims.length,
  byMatchType: Object.fromEntries(
    ["domain", "name", "event", "curated"].map((type) => [
      type, uniqueVictims.filter((v) => v.matchType === type).length,
    ]),
  ),
}, null, 2));
await closePools();

/** Normalisation identical to the API one, kept local for the corpus reader. */
function normalizeNameForCorpus(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}
