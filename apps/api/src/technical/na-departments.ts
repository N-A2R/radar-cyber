/**
 * Closes Nouvelle-Aquitaine department coverage gaps.
 *
 * A verified NA claim, already attached to an organization of the
 * referential, becomes a public third-party-claim event for a department
 * that still has no event. Only organization ids, departments, group names
 * and public evidence URLs leave the database: no victim name, no claim
 * description, no personal data.
 *
 * Two promotion slices share this machinery: the original gaps (19, 23)
 * and the remaining gaps measured on 2026-11-22 (16, 40, 64, 79).
 */
import { z } from "zod";
import { query } from "../db.js";
import { closeRun, openRun, withRunId } from "../collecte/runs.js";
import { NA_DEPARTMENTS, isNaDepartment } from "../technical/catalog.js";

/** The two NA departments covered by the original promotion slice. */
export const GAP_DEPARTMENTS = ["19", "23"] as const;
/** The four NA departments still at zero when the next slice was measured. */
export const REMAINING_GAP_DEPARTMENTS = ["16", "40", "64", "79"] as const;
const PROMOTION_DEPARTMENTS: readonly string[] = [
  ...GAP_DEPARTMENTS,
  ...REMAINING_GAP_DEPARTMENTS,
];

export const GAP_DEDUP_PREFIX = "na-gap:";
export const REMAINING_DEDUP_PREFIX = "na-remaining-gap:";
export const GAP_ADMISSION_RULE = "na_gap_claim";
export const REMAINING_ADMISSION_RULE = "na_remaining_gap_claim";

const publicHttpsUrl = z.string().url().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}, "only public HTTPS URLs without credentials");

export const GapClaimSchema = z.strictObject({
  id: z.coerce.number().int().positive(),
  orgId: z.coerce.number().int().positive(),
  department: z.string().refine((value) =>
    PROMOTION_DEPARTMENTS.includes(value), "department is not a coverage gap"),
  groupName: z.string().min(1).max(120),
  publishedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid date"),
  evidenceUrl: publicHttpsUrl,
  source: z.string().min(1),
});

export type GapClaim = z.infer<typeof GapClaimSchema>;

export type GapEvent = {
  dedupKey: string;
  family: string;
  assertionType: string;
  title: string;
  summary: null;
  observedAt: string;
  severity: number;
  confidence: string;
  sourceId: string;
  sourceUrl: string | null;
  evidence: Record<string, unknown>;
  geoType: string;
  orgId: number;
  regional: boolean;
  regionalMotif: string;
  tlp: string;
  tlpSource: string;
  admissionRule: string;
};

/** Accepts only a claim that is both NA-scoped and in a gap department. */
export function parseGapClaim(raw: unknown): GapClaim | null {
  const result = GapClaimSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Builds an aggregate event from a verified claim. The title never contains an
 * organization or victim name, and no claim body is copied into summary or
 * evidence: the original claim stays the only place where a body is readable.
 * Promotion options keep each slice idempotent and distinguishable in audit.
 * The claim's evidence URL is never published: an isolated claim (score < 2)
 * is absent from `leak_claim_public`. Public links use the source home URL;
 * claim_id keeps the audit trail.
 */
export type GapEventOptions = {
  dedupPrefix?: string;
  admissionRule?: string;
  regionalMotif?: string;
  sourceUrl?: string | null;
};

export function buildGapEvent(
  claim: GapClaim,
  sourceId: string,
  options: GapEventOptions = {},
): GapEvent {
  const dedupPrefix = options.dedupPrefix ?? GAP_DEDUP_PREFIX;
  const admissionRule = options.admissionRule ?? GAP_ADMISSION_RULE;
  const regionalMotif = options.regionalMotif ?? "na_department_gap";
  return {
    dedupKey: `${dedupPrefix}${claim.id}`,
    family: "ransomware",
    assertionType: "third_party_claim",
    title: `Third-party ransomware claim referencing a Nouvelle-Aquitaine organization (department ${claim.department})`,
    summary: null,
    observedAt: new Date().toISOString(),
    severity: 4,
    confidence: "C3",
    sourceId,
    sourceUrl: options.sourceUrl ?? null,
    evidence: {
      claim_id: claim.id,
      org_id: claim.orgId,
      department: claim.department,
      group: claim.groupName,
      claimed_at: new Date(claim.publishedAt).toISOString(),
      via: admissionRule,
    },
    geoType: "claimed_origin",
    orgId: claim.orgId,
    regional: true,
    regionalMotif,
    tlp: "CLEAR",
    tlpSource: claim.source,
    admissionRule,
  };
}

export const SQL = {
  gapClaims: `SELECT c.id, c.org_id AS "orgId", o.dept AS department,
                     c.group_name AS "groupName", c.published_at,
                     c.evidence_url AS "evidenceUrl", c.source
                FROM leak_claim c
                JOIN org o ON o.id = c.org_id
               WHERE c.na
                 AND o.dept = ANY($1::text[])
                 AND c.org_id IS NOT NULL
                 AND c.evidence_url ILIKE 'https://%'
                 AND NOT EXISTS (SELECT 1 FROM event e WHERE e.dedup_key = $2 || c.id)
               ORDER BY c.id`,
  departments: `SELECT o.dept AS department, count(*)::int AS events
                  FROM event e
                  JOIN org o ON o.id = e.org_id
                 WHERE o.dept = ANY($1::text[])
                 GROUP BY o.dept`,
  sourceByGroup: `SELECT id, url FROM source WHERE family = 'ransomware' AND id = $1 LIMIT 1`,
  sourceFallback: `SELECT id, url FROM source WHERE family = 'ransomware' ORDER BY id LIMIT 1`,
} as const;

export type DepartmentMeasurement = {
  scope: "nouvelle-aquitaine";
  departments: { department: string; events: number }[];
  zeroDepartments: string[];
  eventCount: number;
  gapClaimsPending: number;
  sql: typeof SQL;
  measuredAt: string;
};

/** Reads only aggregate counters: one row per department, never an event body. */
export async function measureNaDepartments(): Promise<DepartmentMeasurement> {
  const [departmentRows, claimRows] = await Promise.all([
    query<{ department: string; events: number }>(SQL.departments, [NA_DEPARTMENTS]),
    query<{ id: number }>(SQL.gapClaims, [GAP_DEPARTMENTS, GAP_DEDUP_PREFIX]),
  ]);
  const departments = NA_DEPARTMENTS.map((department) => ({
    department,
    events: Number(departmentRows.rows.find((row) => row.department === department)?.events ?? 0),
  }));
  return {
    scope: "nouvelle-aquitaine",
    departments,
    zeroDepartments: departments.filter((row) => row.events === 0).map((row) => row.department),
    eventCount: departments.reduce((total, row) => total + row.events, 0),
    gapClaimsPending: claimRows.rows.length,
    sql: SQL,
    measuredAt: new Date().toISOString(),
  };
}

async function resolveSource(claim: GapClaim): Promise<{
  id: string;
  url: string | null;
} | null> {
  const slug = claim.groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const [sql, params] of [
    [SQL.sourceByGroup, [`onion:ccw:${slug}`]],
    [SQL.sourceFallback, []],
  ] as const) {
    const result = await query<{ id: string; url: string | null }>(sql, [...params]);
    if (result.rows[0]?.id) return result.rows[0];
  }
  return null;
}

type PromotionConfig = {
  departments: readonly string[];
  dedupPrefix: string;
  admissionRule: string;
  regionalMotif: string;
};

async function promoteClaimsFor(config: PromotionConfig): Promise<{
  scanned: number;
  refused: number;
  inserted: number;
  alreadyPresent: number;
}> {
  const rows = await query<{
    id: number;
    orgId: number;
    department: string;
    groupName: string;
    published_at: Date | string;
    evidenceUrl: string;
    source: string;
  }>(SQL.gapClaims, [config.departments, config.dedupPrefix]);

  let refused = 0;
  let inserted = 0;
  let alreadyPresent = 0;
  // Un run par source, ouvert avant le premier événement qui le cite : la
  // migration 206 exige que `evidence.run_id` désigne un `collector_run`.
  const runs = new Map<string, { id: number; inserted: number }>();
  try {
    for (const row of rows.rows) {
      const claim = parseGapClaim({
        id: row.id,
        orgId: row.orgId,
        department: row.department,
        groupName: row.groupName,
        publishedAt: new Date(row.published_at).toISOString(),
        evidenceUrl: row.evidenceUrl,
        source: row.source,
      });
      if (!claim || !isNaDepartment(claim.department)) {
        refused += 1;
        continue;
      }
      const source = await resolveSource(claim);
      if (!source) {
        refused += 1;
        continue;
      }
      let run = runs.get(source.id);
      if (!run) {
        run = { id: await openRun(source.id, "analyst"), inserted: 0 };
        runs.set(source.id, run);
      }
      const event = buildGapEvent(claim, source.id, {
        dedupPrefix: config.dedupPrefix,
        admissionRule: config.admissionRule,
        regionalMotif: config.regionalMotif,
        sourceUrl: source.url,
      });
      const evidence = withRunId(event.evidence, run.id);
      const result = await query<{ inserted: boolean }>(
        `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity,
                            confidence, source_id, source_url, evidence, geo_type, org_id, tlp,
                            tlp_source, admission_rule, regional, regional_motif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [
          event.dedupKey, event.family, event.assertionType, event.title, event.summary,
          event.observedAt, event.severity, event.confidence, event.sourceId, event.sourceUrl,
          JSON.stringify(evidence), event.geoType, event.orgId, event.tlp, event.tlpSource,
          event.admissionRule, event.regional, event.regionalMotif,
        ],
      );
      if (result.rows[0]?.inserted) {
        inserted += 1;
        run.inserted += 1;
      } else alreadyPresent += 1;
    }
  } finally {
    for (const run of runs.values()) {
      await closeRun(run.id, { itemsIn: run.inserted, itemsNew: run.inserted });
    }
  }
  return { scanned: rows.rows.length, refused, inserted, alreadyPresent };
}

/** Inserts one event per still-unpromoted claim in the original gap departments. */
export async function fillNaDepartmentGaps(): Promise<{
  scanned: number;
  refused: number;
  inserted: number;
  alreadyPresent: number;
}> {
  return promoteClaimsFor({
    departments: GAP_DEPARTMENTS,
    dedupPrefix: GAP_DEDUP_PREFIX,
    admissionRule: GAP_ADMISSION_RULE,
    regionalMotif: "na_department_gap",
  });
}

/** Promotes verified claims for the four departments still at zero on 2026-11-22. */
export async function fillRemainingNaGaps(): Promise<{
  scanned: number;
  refused: number;
  inserted: number;
  alreadyPresent: number;
}> {
  return promoteClaimsFor({
    departments: REMAINING_GAP_DEPARTMENTS,
    dedupPrefix: REMAINING_DEDUP_PREFIX,
    admissionRule: REMAINING_ADMISSION_RULE,
    regionalMotif: "na_remaining_gap",
  });
}
