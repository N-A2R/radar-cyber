/**
 * Cold archive scope: Nouvelle-Aquitaine facts only, no victim data.
 *
 * A fact is eligible when its organisation is in the region or the fact is
 * explicitly flagged regional. TLP RED/AMBER and the leaks family are excluded.
 * Grey sources stay eligible: there is no publisher allow-list.
 */
import { DEPT_LABELS } from "../collectors/relevance.js";
import { query } from "../db.js";

export const NA_DEPARTMENTS: readonly string[] = Object.keys(DEPT_LABELS);
export const EXCLUDED_TLP: readonly string[] = ["RED", "AMBER"];
export const EXCLUDED_FAMILIES: readonly string[] = ["leaks"];

export type ArchivedEvent = {
  id: number;
  family: string;
  title: string;
  summary: string | null;
  sourceId: string;
  sourceUrl: string | null;
  sourceKind: string | null;
  dept: string | null;
  regional: boolean;
  tlp: string | null;
  observedAt: string | null;
};

/** Scope clause shared by selection and auditing. */
export function scopeWhere(e = "e", o = "o"): string {
  return `(${o}.dept = ANY($1::text[]) OR ${e}.regional = true)
    AND (${e}.tlp IS NULL OR upper(${e}.tlp) <> ALL($2::text[]))
    AND ${e}.family <> ALL($3::text[])`;
}

export function scopeParams(): unknown[] {
  return [[...NA_DEPARTMENTS], [...EXCLUDED_TLP], [...EXCLUDED_FAMILIES]];
}

export const ARCHIVE_SQL = `
  SELECT e.id, e.family, e.title, e.summary, e.source_id AS "sourceId",
         e.source_url AS "sourceUrl", s.kind AS "sourceKind", o.dept,
         e.regional, e.tlp, e.observed_at AS "observedAt"
  FROM event e
  LEFT JOIN org o ON o.id = e.org_id
  LEFT JOIN source s ON s.id = e.source_id
  WHERE ${scopeWhere()}
  ORDER BY e.id
`;

export async function fetchArchiveEvents(): Promise<ArchivedEvent[]> {
  const { rows } = await query<ArchivedEvent>(ARCHIVE_SQL, scopeParams());
  return rows.map((row) => ({
    ...row,
    observedAt: row.observedAt === null ? null : new Date(row.observedAt).toISOString(),
  }));
}
