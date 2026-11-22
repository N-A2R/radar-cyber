/**
 * Measurement of resale listings attached to Nouvelle-Aquitaine.
 *
 * The SQL prefilter narrows 1.67 M organizations, 312 sources and ~26 k events
 * to a handful of public titles and claim hints. No summary, TLP:RED body,
 * victim name, e-mail or phone number is selected: the database itself applies
 * the shared sale regex, and the pure rule runs again on the reduced set.
 */
import { query } from "../db.js";
import { organizationRoots } from "../leaks/by-domain.js";
import {
  detectResaleListings,
  isNaDepartment,
  SALE_PATTERN,
  type ResaleCandidate,
  type ResaleListing,
} from "./detect.js";

export const NA_DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

export const SQL = {
  /** Event titles only; summaries may contain victim-supplied text. */
  events: `SELECT e.id::text AS id, e.source_id AS source, e.title AS text,
                  o.dept AS department, NULL::text AS "domainHint", 'event' AS origin
           FROM event e LEFT JOIN org o ON o.id = e.org_id
           WHERE e.family <> 'vuln' AND e.title ~* $1`,
  /** Claim hints only; raw bodies stay in the TLP:RED quarantine. */
  claims: `SELECT q.id::text AS id, q.source AS source, q.org_hint AS text,
                  NULL::text AS department, q.org_hint AS "domainHint", 'claim' AS origin
           FROM quarantine_raw q
           WHERE q.kind = 'claim' AND q.org_hint IS NOT NULL AND q.org_hint ~* $1`,
  organizations: `SELECT id, dept AS department, domain, website
                  FROM org WHERE domain IS NOT NULL OR website IS NOT NULL`,
  baseline: `SELECT (SELECT count(*) FROM org)::int AS organizations,
                    (SELECT count(*) FROM source)::int AS sources,
                    (SELECT count(*) FROM event)::int AS events,
                    (SELECT count(*) FROM quarantine_raw WHERE kind = 'claim')::int AS claims`,
  allOffers: `SELECT ((SELECT count(*) FROM event WHERE title ~* $1) +
                     (SELECT count(*) FROM quarantine_raw
                      WHERE kind = 'claim' AND org_hint IS NOT NULL AND org_hint ~* $1))::int AS total`,
} as const;

export type ResaleMeasurement = {
  scope: "nouvelle-aquitaine";
  basis: "explicit-sale";
  count: number;
  candidatesScanned: number;
  saleOffersAll: number;
  naDomains: number;
  baseline: { organizations: number; sources: number; events: number; claims: number };
  listings: ResaleListing[];
  measuredAt: string;
};

export async function measureResaleListings(): Promise<ResaleMeasurement> {
  const [events, claims, orgs, totals, offers] = await Promise.all([
    query<ResaleCandidate>(SQL.events, [SALE_PATTERN]),
    query<ResaleCandidate>(SQL.claims, [SALE_PATTERN]),
    query<{ id: number; department: string | null; domain: string | null; website: string | null }>(SQL.organizations),
    query<{ organizations: number; sources: number; events: number; claims: number }>(SQL.baseline),
    query<{ total: number }>(SQL.allOffers, [SALE_PATTERN]),
  ]);

  const naDomains = new Set<string>();
  for (const org of orgs.rows) {
    if (!isNaDepartment(org.department)) continue;
    for (const root of organizationRoots(org)) naDomains.add(root);
  }

  const listings = detectResaleListings([...events.rows, ...claims.rows], naDomains);
  const baseline = totals.rows[0] ?? { organizations: 0, sources: 0, events: 0, claims: 0 };
  return {
    scope: "nouvelle-aquitaine",
    basis: "explicit-sale",
    count: listings.length,
    candidatesScanned: events.rows.length + claims.rows.length,
    saleOffersAll: Number(offers.rows[0]?.total ?? 0),
    naDomains: naDomains.size,
    baseline: {
      organizations: Number(baseline.organizations),
      sources: Number(baseline.sources),
      events: Number(baseline.events),
      claims: Number(baseline.claims),
    },
    listings,
    measuredAt: new Date().toISOString(),
  };
}
