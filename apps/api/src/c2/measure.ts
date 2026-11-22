/**
 * Measurement of presumed C2 servers hosted in Nouvelle-Aquitaine.
 *
 * The SQL prefilter narrows 1.67 M organizations, 312 sources and ~26 k events
 * to public titles and claim hints that name a C2 capability. The pure rule
 * then requires an explicit in-region hosting location. No summary, TLP:RED
 * body, victim name, e-mail or phone number is selected.
 */
import { query } from "../db.js";
import { C2_PATTERN, detectC2Servers, type C2Candidate, type C2Detection } from "./detect.js";

export const C2_SOURCE_PATTERN = "c2|cybercrime|feodo|threatfox|botnet";

export const SQL = {
  /** Event titles only; summaries may contain victim-supplied text. */
  events: `SELECT e.id::text AS id, e.source_id AS source, e.title AS text,
                  e.family AS family, 'event' AS origin
           FROM event e
           WHERE e.family <> 'vuln' AND e.title ~* $1`,
  /** Claim hints only; raw bodies stay in the TLP:RED quarantine. */
  claims: `SELECT q.id::text AS id, q.source AS source, q.org_hint AS text,
                  NULL::text AS family, 'claim' AS origin
           FROM quarantine_raw q
           WHERE q.kind = 'claim' AND q.org_hint IS NOT NULL AND q.org_hint ~* $1`,
  /** Sources whose catalogue id or name advertises a C2 feed (URLs contain
   *  incidental strings, e.g. an .onion address, so they are not matched). */
  sources: `SELECT id, name, family FROM source
            WHERE id ~* $1 OR name ~* $1 ORDER BY id`,
  baseline: `SELECT (SELECT count(*) FROM org)::int AS organizations,
                    (SELECT count(*) FROM source)::int AS sources,
                    (SELECT count(*) FROM event)::int AS events,
                    (SELECT count(*) FROM quarantine_raw WHERE kind = 'claim')::int AS claims`,
  signals: `SELECT ((SELECT count(*) FROM event
                      WHERE family <> 'vuln' AND title ~* $1) +
                     (SELECT count(*) FROM quarantine_raw
                      WHERE kind = 'claim' AND org_hint IS NOT NULL AND org_hint ~* $1))::int AS total`,
} as const;

export type C2Source = { id: string; name: string; family: string };
export type C2Signal = { id: string; source: string; origin: string; family: string | null };

export type C2Measurement = {
  scope: "nouvelle-aquitaine";
  basis: "explicit-c2-hosting";
  count: number;
  detections: C2Detection[];
  /** Source-attributed signals, without any text or victim field. */
  signals: C2Signal[];
  signalsScanned: number;
  c2Sources: C2Source[];
  baseline: { organizations: number; sources: number; events: number; claims: number };
  measuredAt: string;
};

export async function measureC2Servers(): Promise<C2Measurement> {
  const [events, claims, c2Sources, totals, signals] = await Promise.all([
    query<C2Candidate>(SQL.events, [C2_PATTERN]),
    query<C2Candidate>(SQL.claims, [C2_PATTERN]),
    query<C2Source>(SQL.sources, [C2_SOURCE_PATTERN]),
    query<{ organizations: number; sources: number; events: number; claims: number }>(SQL.baseline),
    query<{ total: number }>(SQL.signals, [C2_PATTERN]),
  ]);

  const candidates = [...events.rows, ...claims.rows];
  const detections = detectC2Servers(candidates);
  const signalSources: C2Signal[] = candidates.map((candidate) => ({
    id: String(candidate.id),
    source: candidate.source,
    origin: candidate.origin ?? "event",
    family: candidate.family ?? null,
  }));
  const baseline = totals.rows[0] ?? { organizations: 0, sources: 0, events: 0, claims: 0 };
  return {
    scope: "nouvelle-aquitaine",
    basis: "explicit-c2-hosting",
    count: detections.length,
    detections,
    signals: signalSources,
    signalsScanned: Number(signals.rows[0]?.total ?? 0),
    c2Sources: c2Sources.rows,
    baseline: {
      organizations: Number(baseline.organizations),
      sources: Number(baseline.sources),
      events: Number(baseline.events),
      claims: Number(baseline.claims),
    },
    measuredAt: new Date().toISOString(),
  };
}
