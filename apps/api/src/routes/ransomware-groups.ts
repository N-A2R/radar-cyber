/**
 * GET /api/ransomware-groups — tracked ransomware groups and their NA victims.
 *
 * Only organisation-level evidence is returned. Claim hints and descriptions
 * are never exposed, so victim personal data cannot leak through this route.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

const SQL_GROUPS = `
  SELECT g.slug, g.name, g.claims_count,
         count(v.id)::int AS na_victims,
         COALESCE(json_agg(
           json_build_object(
             'orgId', v.org_id,
             'orgName', v_org.name,
             'department', v_org.dept,
             'source', v.source,
             'sourceUrl', v.source_url,
             'claimedAt', v.claimed_at,
             'matchType', v.match_type
           ) ORDER BY v.claimed_at DESC NULLS LAST
         ) FILTER (WHERE v.id IS NOT NULL), '[]'::json) AS victims
    FROM ransomware_group g
    LEFT JOIN ransomware_victim v ON v.group_id = g.id
    LEFT JOIN org v_org ON v_org.id = v.org_id
   GROUP BY g.id, g.slug, g.name, g.claims_count
   ORDER BY na_victims DESC, g.name ASC
`;

type GroupRow = {
  slug: string;
  name: string;
  claims_count: number;
  na_victims: number;
  victims: Array<{
    orgId: number;
    orgName: string;
    department: string | null;
    source: string;
    sourceUrl: string | null;
    claimedAt: string | null;
    matchType: string;
  }>;
};

export default async function ransomwareGroupsRoute(app: FastifyInstance): Promise<void> {
  app.get("/ransomware-groups", async () => {
    const result = await query<GroupRow>(SQL_GROUPS);
    const groups = result.rows.map((row) => ({
      name: row.name,
      slug: row.slug,
      claims: row.claims_count,
      naVictims: row.na_victims,
      victims: row.victims,
    }));
    return {
      trackedGroups: groups.length,
      groupsWithNaVictims: groups.filter((g) => g.naVictims > 0).length,
      groups,
    };
  });
}
