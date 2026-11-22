/**
 * Database reads feeding the organisation report.
 *
 * The HTTP route issues a handful of bounded aggregate queries per request.
 * The exhaustive measurement preloads the same aggregates in one index and
 * reuses it for every organisation, so no report needs another SQL roundtrip.
 */
import { query } from "../db.js";
import { NA_DEPARTMENTS, type CountItem, type OrgReportInput } from "./org-report.js";

export const NA_DEPARTMENT_LIST = Object.keys(NA_DEPARTMENTS).sort();

export type OrgRow = {
  id: number;
  name: string;
  kind: string;
  sector: string | null;
  city: string | null;
  dept: string | null;
  domain: string | null;
  created_at: string | Date;
  status: string;
  parent_org_id: number | null;
};

type EventTotals = {
  total: number;
  regional: number;
  exposure: number;
  last: string | Date | null;
  used: number;
};

type SourceTotals = { total: number; gray: number; na: number };

const EMPTY_TOTALS: EventTotals = { total: 0, regional: 0, exposure: 0, last: null, used: 0 };
const EMPTY_SOURCES: SourceTotals = { total: 0, gray: 0, na: 0 };

function isoDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : value.toISOString();
}

/** Last twelve calendar months, oldest first. */
export function recentMonths(now = new Date()): string[] {
  const labels: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    labels.push(d.toISOString().slice(0, 7));
  }
  return labels;
}

function monthItems(labels: string[], counts: Readonly<Record<string, number>> = {}): CountItem[] {
  return labels.map((label) => ({ label, count: counts[label] ?? 0 }));
}

/** Keys matching a claim hint to an organisation; no free text is retained. */
function hints(org: Pick<OrgRow, "name" | "domain">): string[] {
  const values = [org.name, org.domain, org.domain ? `www.${org.domain}` : null]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());
  return [...new Set(values)];
}

export type GlobalBaseline = { orgs: number; sources: number; events: number };

/** Real corpus figures, read once per command, never hard-coded. */
export async function loadBaseline(): Promise<GlobalBaseline> {
  const res = await query<GlobalBaseline>(
    `SELECT (SELECT count(*)::int FROM org WHERE valid_to IS NULL) AS orgs,
            (SELECT count(*)::int FROM source) AS sources,
            (SELECT count(*)::int FROM event) AS events`,
  );
  const row = res.rows[0];
  return { orgs: row?.orgs ?? 0, sources: row?.sources ?? 0, events: row?.events ?? 0 };
}

const SOURCE_TOTALS_SQL = `SELECT count(*)::int AS total,
  count(*) FILTER (WHERE relevance='context')::int AS gray,
  (SELECT count(DISTINCT e.source_id)::int
     FROM event e JOIN org o ON o.id=e.org_id
    WHERE o.dept = ANY($1::text[])) AS na
  FROM source`;

const EVENT_TOTALS_SQL = `SELECT count(*)::int AS total,
  count(*) FILTER (WHERE regional)::int AS regional,
  count(*) FILTER (WHERE family IN ('exposition', 'vuln'))::int AS exposure,
  max(observed_at) AS last,
  count(DISTINCT source_id)::int AS used
  FROM event WHERE org_id=$1`;

const EVENT_TOTALS_BY_ORG_SQL = `SELECT org_id, count(*)::int AS total,
  count(*) FILTER (WHERE regional)::int AS regional,
  count(*) FILTER (WHERE family IN ('exposition', 'vuln'))::int AS exposure,
  max(observed_at) AS last,
  count(DISTINCT source_id)::int AS used
  FROM event WHERE org_id IS NOT NULL GROUP BY org_id`;

/** Full input for one organisation. Returns null for an unknown identifier. */
export async function loadOrgReportInput(
  orgId: number,
  generatedAt = new Date().toISOString(),
): Promise<OrgReportInput | null> {
  if (!Number.isInteger(orgId) || orgId <= 0) return null;
  const orgRes = await query<OrgRow>(
    `SELECT id, name, kind, sector, city, dept, domain, created_at, status, parent_org_id
     FROM org WHERE id=$1 AND valid_to IS NULL`,
    [orgId],
  );
  const org = orgRes.rows[0];
  if (!org) return null;

  const months = recentMonths();
  const [totalsRes, familiesRes, monthsRes, assetsRes, sourcesRes, sourceFamiliesRes,
    claimsRes, aliasesRes, relationsRes, baseline] = await Promise.all([
    query<EventTotals>(EVENT_TOTALS_SQL, [orgId]),
    query<CountItem>(
      `SELECT family AS label, count(*)::int AS count
       FROM event WHERE org_id=$1 GROUP BY family ORDER BY count DESC, family`, [orgId],
    ),
    query<CountItem>(
      `SELECT to_char(observed_at, 'YYYY-MM') AS label, count(*)::int AS count
       FROM event WHERE org_id=$1 AND observed_at IS NOT NULL GROUP BY 1 ORDER BY 1`, [orgId],
    ),
    query<CountItem>(
      `SELECT kind AS label, count(*)::int AS count
       FROM asset WHERE org_id=$1 GROUP BY kind ORDER BY count DESC, kind`, [orgId],
    ),
    query<SourceTotals>(SOURCE_TOTALS_SQL, [NA_DEPARTMENT_LIST]),
    query<CountItem>(
      `SELECT s.family AS label, count(DISTINCT s.id)::int AS count
       FROM event e JOIN source s ON s.id=e.source_id
       WHERE e.org_id=$1 GROUP BY s.family ORDER BY count DESC, s.family`, [orgId],
    ),
    query<{ n: number }>(
      "SELECT count(*)::int AS n FROM quarantine_raw WHERE lower(org_hint) = ANY($1::text[])",
      [hints(org)],
    ),
    query<{ n: number }>(
      `SELECT count(*)::int AS n FROM org_alias
       WHERE org_id=$1 AND status='active' AND valid_to IS NULL`, [orgId],
    ),
    query<{ parents: number; children: number }>(
      `SELECT
         count(*) FILTER (WHERE dst_kind='org' AND dst_id=$1::text)::int AS parents,
         count(*) FILTER (WHERE src_kind='org' AND src_id=$1::text)::int AS children
       FROM relation
       WHERE (dst_kind='org' AND dst_id=$1::text) OR (src_kind='org' AND src_id=$1::text)`,
      [orgId],
    ),
    loadBaseline(),
  ]);

  const totals = totalsRes.rows[0] ?? EMPTY_TOTALS;
  const src = sourcesRes.rows[0] ?? EMPTY_SOURCES;
  const monthCounts: Record<string, number> = {};
  for (const row of monthsRes.rows) monthCounts[row.label] = row.count;
  const assets = assetsRes.rows;
  const relations = relationsRes.rows[0] ?? { parents: 0, children: 0 };

  return {
    org: orgIdentity(org),
    generatedAt,
    aliases: aliasesRes.rows[0]?.n ?? 0,
    events: {
      total: totals.total,
      regional: totals.regional,
      exposure: totals.exposure,
      byFamily: familiesRes.rows,
      byMonth: monthItems(months, monthCounts),
      lastObservedAt: isoDate(totals.last) || null,
    },
    assets: { total: assets.reduce((sum, row) => sum + row.count, 0), byKind: assets },
    sources: {
      total: src.total,
      na: src.na,
      gray: src.gray,
      used: totals.used,
      byFamily: sourceFamiliesRes.rows,
    },
    claims: claimsRes.rows[0]?.n ?? 0,
    relations,
    baseline,
  };
}

function orgIdentity(org: OrgRow): OrgReportInput["org"] {
  return {
    id: org.id,
    name: org.name,
    kind: org.kind,
    sector: org.sector,
    city: org.city,
    dept: org.dept,
    domain: org.domain,
    createdAt: isoDate(org.created_at),
    status: org.status,
    parentId: org.parent_org_id,
  };
}

/** Keyset page of valid organisations, ordered by identifier. */
export async function fetchOrgBatch(afterId: number, limit: number): Promise<OrgRow[]> {
  const res = await query<OrgRow>(
    `SELECT id, name, kind, sector, city, dept, domain, created_at, status, parent_org_id
     FROM org WHERE valid_to IS NULL AND id > $1 ORDER BY id LIMIT $2`,
    [afterId, limit],
  );
  return res.rows;
}

/** Preloaded aggregates for the exhaustive measurement. */
export type ReportIndex = {
  months: string[];
  baseline: GlobalBaseline;
  sources: SourceTotals;
  events: Map<number, EventTotals>;
  families: Map<number, CountItem[]>;
  monthCounts: Map<number, Record<string, number>>;
  assets: Map<number, CountItem[]>;
  sourceFamilies: Map<number, CountItem[]>;
  aliases: Map<number, number>;
  claims: Map<string, number>;
  relations: Map<number, { parents: number; children: number }>;
};

/** Reads every small aggregate once; large org-derived tables are grouped in SQL. */
export async function loadReportIndex(): Promise<ReportIndex> {
  const [baseline, sourcesRes, totalsRes, familiesRes, monthsRes, assetsRes,
    sourceFamiliesRes, aliasesRes, claimsRes, relationsRes] = await Promise.all([
    loadBaseline(),
    query<SourceTotals>(SOURCE_TOTALS_SQL, [NA_DEPARTMENT_LIST]),
    query<EventTotals & { org_id: number }>(EVENT_TOTALS_BY_ORG_SQL, []),
    query<CountItem & { org_id: number }>(
      `SELECT org_id, family AS label, count(*)::int AS count
       FROM event WHERE org_id IS NOT NULL GROUP BY org_id, family`, [],
    ),
    query<{ org_id: number; label: string; count: number }>(
      `SELECT org_id, to_char(observed_at, 'YYYY-MM') AS label, count(*)::int AS count
       FROM event WHERE org_id IS NOT NULL AND observed_at IS NOT NULL
       GROUP BY org_id, label`, [],
    ),
    query<CountItem & { org_id: number }>(
      "SELECT org_id, kind AS label, count(*)::int AS count FROM asset GROUP BY org_id, kind", [],
    ),
    query<CountItem & { org_id: number }>(
      `SELECT e.org_id, s.family AS label, count(DISTINCT s.id)::int AS count
       FROM event e JOIN source s ON s.id=e.source_id
       WHERE e.org_id IS NOT NULL GROUP BY e.org_id, s.family`, [],
    ),
    query<{ org_id: number; n: number }>(
      `SELECT org_id, count(*)::int AS n FROM org_alias
       WHERE status='active' AND valid_to IS NULL GROUP BY org_id`, [],
    ),
    query<{ hint: string; n: number }>(
      `SELECT lower(org_hint) AS hint, count(*)::int AS n
       FROM quarantine_raw WHERE org_hint IS NOT NULL GROUP BY 1`, [],
    ),
    query<{ src_id: string; dst_id: string }>(
      "SELECT src_id, dst_id FROM relation WHERE src_kind='org' OR dst_kind='org'", [],
    ),
  ]);

  const groupByOrg = <T extends { org_id: number }>(rows: T[]): Map<number, T[]> => {
    const map = new Map<number, T[]>();
    for (const row of rows) {
      const list = map.get(row.org_id);
      if (list) list.push(row);
      else map.set(row.org_id, [row]);
    }
    return map;
  };
  const relations = new Map<number, { parents: number; children: number }>();
  for (const row of relationsRes.rows) {
    const parentId = Number(row.dst_id);
    const childId = Number(row.src_id);
    if (Number.isInteger(parentId) && parentId > 0) {
      const entry = relations.get(parentId) ?? { parents: 0, children: 0 };
      entry.children += 1;
      relations.set(parentId, entry);
    }
    if (Number.isInteger(childId) && childId > 0) {
      const entry = relations.get(childId) ?? { parents: 0, children: 0 };
      entry.parents += 1;
      relations.set(childId, entry);
    }
  }
  const monthCounts = new Map<number, Record<string, number>>();
  for (const row of monthsRes.rows) {
    const entry = monthCounts.get(row.org_id) ?? {};
    entry[row.label] = row.count;
    monthCounts.set(row.org_id, entry);
  }

  return {
    months: recentMonths(),
    baseline,
    sources: sourcesRes.rows[0] ?? EMPTY_SOURCES,
    events: new Map(totalsRes.rows.map((row) => [row.org_id, row])),
    families: groupByOrg(familiesRes.rows),
    monthCounts,
    assets: groupByOrg(assetsRes.rows),
    sourceFamilies: groupByOrg(sourceFamiliesRes.rows),
    aliases: new Map(aliasesRes.rows.map((row) => [row.org_id, row.n])),
    claims: new Map(claimsRes.rows.map((row) => [row.hint, row.n])),
    relations,
  };
}

/** Same report input as the HTTP route, assembled from the preloaded index. */
export function inputFromRow(org: OrgRow, index: ReportIndex, generatedAt: string): OrgReportInput {
  const totals = index.events.get(org.id) ?? EMPTY_TOTALS;
  const src = index.sources;
  const claimKeys = hints(org);
  let claims = 0;
  for (const key of claimKeys) claims += index.claims.get(key) ?? 0;
  return {
    org: orgIdentity(org),
    generatedAt,
    aliases: index.aliases.get(org.id) ?? 0,
    events: {
      total: totals.total,
      regional: totals.regional,
      exposure: totals.exposure,
      byFamily: index.families.get(org.id) ?? [],
      byMonth: monthItems(index.months, index.monthCounts.get(org.id)),
      lastObservedAt: isoDate(totals.last) || null,
    },
    assets: {
      total: (index.assets.get(org.id) ?? []).reduce((sum, row) => sum + row.count, 0),
      byKind: index.assets.get(org.id) ?? [],
    },
    sources: {
      total: src.total,
      na: src.na,
      gray: src.gray,
      used: totals.used,
      byFamily: index.sourceFamilies.get(org.id) ?? [],
    },
    claims,
    relations: index.relations.get(org.id) ?? { parents: 0, children: 0 },
    baseline: index.baseline,
  };
}
