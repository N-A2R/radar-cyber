/**
 * Reads the minimum set of columns needed to count leaks attached to an
 * Nouvelle-Aquitaine organization by domain.
 *
 * The queries never select quarantine raw bodies, victim names, e-mails or
 * passwords. The NA predicate lives in `by-domain.ts`; only organizations
 * carrying a domain or a website are fetched, so the 1.67 M-row referential is
 * reduced to a handful of candidates before matching.
 */
import { query } from "../db.js";
import {
  attachLeaksByDomain,
  countLeaksByDomain,
  type DomainAttachment,
  type DomainOrganization,
  type LeakClaim,
} from "./by-domain.js";

export const SQL = {
  organizations: `SELECT id, dept AS department, domain, website
                  FROM org
                  WHERE domain IS NOT NULL OR website IS NOT NULL`,
  claims: `SELECT id::text AS id, source, org_hint AS "domainHint", status
           FROM quarantine_raw
           WHERE kind = 'claim' AND org_hint IS NOT NULL`,
  baseline: `SELECT (SELECT count(*) FROM org)::int AS organizations,
                    (SELECT count(*) FROM source)::int AS sources,
                    (SELECT count(*) FROM event)::int AS events`,
} as const;

export type LeakMeasurement = {
  scope: "nouvelle-aquitaine";
  basis: "domain";
  count: number;
  claimsRead: number;
  domainOrganizationsRead: number;
  matchedOrganizations: number;
  baseline: { organizations: number; sources: number; events: number };
  attachments: DomainAttachment[];
  measuredAt: string;
};

export async function measureLeaksByDomain(): Promise<LeakMeasurement> {
  const [orgs, claims, totals] = await Promise.all([
    query<DomainOrganization>(SQL.organizations),
    query<LeakClaim>(SQL.claims),
    query<{ organizations: number; sources: number; events: number }>(SQL.baseline),
  ]);

  const attachments = attachLeaksByDomain(claims.rows, orgs.rows);
  const baseline = totals.rows[0] ?? { organizations: 0, sources: 0, events: 0 };
  return {
    scope: "nouvelle-aquitaine",
    basis: "domain",
    count: countLeaksByDomain(claims.rows, orgs.rows),
    claimsRead: claims.rows.length,
    domainOrganizationsRead: orgs.rows.length,
    matchedOrganizations: new Set(attachments.map((a) => a.orgId)).size,
    baseline: {
      organizations: Number(baseline.organizations),
      sources: Number(baseline.sources),
      events: Number(baseline.events),
    },
    attachments,
    measuredAt: new Date().toISOString(),
  };
}
