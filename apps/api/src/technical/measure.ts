/**
 * Aggregate measurement of technical sources and claims attached to an NA
 * organization. Only counters, source ids and departments leave the database;
 * no victim names, descriptions or raw claim bodies are read.
 */
import { query } from "../db.js";
import { NA_DEPARTMENTS, TECHNICAL_KINDS, type TechnicalKind } from "./catalog.js";

export const SOURCE_ID_PREFIX = "na-tech-site-";
export const CLAIM_SOURCE = "technical-sites";

export const SQL = {
  sources: `SELECT id, parser->>'kind' AS kind, department
              FROM source
             WHERE id LIKE $1 || '%' AND region = 'nouvelle-aquitaine'
             ORDER BY id`,
  claims: `SELECT count(*)::int AS total,
                  count(DISTINCT c.org_id)::int AS organizations,
                  count(*) FILTER (WHERE c.source = $2)::int AS "fromSlice"
             FROM leak_claim c
             JOIN org o ON o.id = c.org_id
            WHERE c.na AND o.dept = ANY($1::text[])`,
} as const;

export type TechnicalMeasurement = {
  scope: "nouvelle-aquitaine";
  sourceCount: number;
  sourcesByKind: Record<TechnicalKind, number>;
  sources: { id: string; kind: string | null; department: string | null }[];
  claimsAttachedToNaOrg: number;
  organizationsWithClaim: number;
  claimsFromThisCorpus: number;
  measuredAt: string;
};

export async function measureTechnicalCoverage(): Promise<TechnicalMeasurement> {
  const [sourceRows, claimRows] = await Promise.all([
    query<{ id: string; kind: string | null; department: string | null }>(SQL.sources, [SOURCE_ID_PREFIX]),
    query<{ total: number; organizations: number; fromSlice: number }>(SQL.claims, [NA_DEPARTMENTS, CLAIM_SOURCE]),
  ]);

  const sourcesByKind = Object.fromEntries(TECHNICAL_KINDS.map((kind) => [kind, 0])) as Record<TechnicalKind, number>;
  const sources = sourceRows.rows;
  for (const source of sources) {
    if (Object.hasOwn(sourcesByKind, source.kind ?? "")) {
      sourcesByKind[source.kind as TechnicalKind] += 1;
    }
  }

  const claims = claimRows.rows[0] ?? { total: 0, organizations: 0, fromSlice: 0 };
  return {
    scope: "nouvelle-aquitaine",
    sourceCount: sources.length,
    sourcesByKind,
    sources,
    claimsAttachedToNaOrg: Number(claims.total),
    organizationsWithClaim: Number(claims.organizations),
    claimsFromThisCorpus: Number(claims.fromSlice),
    measuredAt: new Date().toISOString(),
  };
}
