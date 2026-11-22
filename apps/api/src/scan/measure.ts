/**
 * Measurement of mass-scan campaigns targeting Nouvelle-Aquitaine IPs.
 *
 * The SQL prefilter narrows the real corpus (1.67 M organisations, 312 public
 * sources, ~26 k events) to public titles and claim hints that mention a scan
 * action. The pure rule then requires a routable target address and an
 * in-region attribution. No body, e-mail, phone number or victim name is
 * selected; gray sources remain eligible and no network call is made.
 */
import { query } from "../db.js";
import { readFile } from "node:fs/promises";
import {
  SCAN_SIGNAL_PATTERN,
  extractScanSignals,
  groupScanCampaigns,
  isPublicIpv4,
  type ScanCampaign,
  type ScanCandidate,
  type ScanSignal,
} from "./detect.js";

const EXPOSITION_RESULTS = new URL("../../../../bench/results/exposition-2026-11-21.json", import.meta.url);
type ExpositionResult = { lignes?: Array<{ ip?: string }> };

/** NA IPs already observed by the free Shodan InternetDB consultation. */
async function expositionIpPerimeter(): Promise<Set<string>> {
  try {
    const payload = JSON.parse(await readFile(EXPOSITION_RESULTS, "utf8")) as ExpositionResult;
    return new Set(
      (payload.lignes ?? [])
        .map((line) => String(line.ip ?? "").trim())
        .filter((ip) => isPublicIpv4(ip)),
    );
  } catch {
    return new Set<string>();
  }
}

/** `$2` is an optional source-id filter used by the reproducible test. */
export const SQL = {
  events: `SELECT e.id::text AS id, e.source_id AS source, e.title AS text,
                  e.family AS family, COALESCE(e.observed_at, e.at)::text AS "observedAt",
                  'event' AS origin
           FROM event e
           WHERE e.family <> 'vuln' AND e.title ~* $1
             AND ($2::text[] IS NULL OR e.source_id = ANY($2::text[]))`,
  claims: `SELECT q.id::text AS id, q.source AS source, q.org_hint AS text,
                  NULL::text AS family, q.claimed_at::text AS "observedAt",
                  'claim' AS origin
           FROM quarantine_raw q
           WHERE q.kind = 'claim' AND q.org_hint IS NOT NULL AND q.org_hint ~* $1
             AND ($2::text[] IS NULL OR q.source = ANY($2::text[]))`,
  perimeterAvailable: `SELECT to_regclass('public.dns_passive_resolution') IS NOT NULL AS present`,
  perimeter: `SELECT DISTINCT value FROM dns_passive_resolution WHERE record_type = 'A'`,
  baseline: `SELECT (SELECT count(*) FROM org)::int AS organizations,
                    (SELECT count(*) FROM source)::int AS sources,
                    (SELECT count(*) FROM event)::int AS events,
                    (SELECT count(*) FROM quarantine_raw WHERE kind = 'claim')::int AS claims`,
  signals: `SELECT ((SELECT count(*) FROM event
                       WHERE family <> 'vuln' AND title ~* $1) +
                    (SELECT count(*) FROM quarantine_raw
                       WHERE kind = 'claim' AND org_hint IS NOT NULL AND org_hint ~* $1))::int AS total`,
} as const;

export type ScanMeasurement = {
  scope: "nouvelle-aquitaine";
  basis: "public-scan-signals";
  count: number;
  campaigns: ScanCampaign[];
  signals: ScanSignal[];
  signalsScanned: number;
  perimeterIps: number;
  expositionIps: number;
  passiveDnsIps: number;
  sources: string[];
  baseline: { organizations: number; sources: number; events: number; claims: number };
  measuredAt: string;
};

/** NA IPs from public passive sources: InternetDB evidence and, when present, passive DNS. */
async function naIpPerimeter(): Promise<{ ips: Set<string>; expositionIps: number; passiveDnsIps: number }> {
  const exposition = await expositionIpPerimeter();
  try {
    const available = await query<{ present: boolean }>(SQL.perimeterAvailable);
    if (!available.rows[0]?.present) {
      return { ips: exposition, expositionIps: exposition.size, passiveDnsIps: 0 };
    }
    const rows = await query<{ value: string }>(SQL.perimeter);
    const dns = new Set(
      rows.rows
        .map((row) => String(row.value).trim())
        .filter((value) => isPublicIpv4(value)),
    );
    return {
      ips: new Set([...exposition, ...dns]),
      expositionIps: exposition.size,
      passiveDnsIps: dns.size,
    };
  } catch {
    // A deployment without the passive-DNS migration still works: reports
    // carrying an explicit Nouvelle-Aquitaine locality remain detectable.
    return { ips: exposition, expositionIps: exposition.size, passiveDnsIps: 0 };
  }
}

/**
 * Reproducible, read-only measurement from the real corpus. `sourceIds`
 * restricts the analysis to chosen public sources without changing the rule.
 */
export async function measureScanCampaigns(
  options: { sourceIds?: readonly string[] } = {},
): Promise<ScanMeasurement> {
  const sourceIds = options.sourceIds ? [...options.sourceIds] : null;
  const params: [string, string[] | null] = [SCAN_SIGNAL_PATTERN, sourceIds];
  const [events, claims, totals, baseline, perimeter] = await Promise.all([
    query<ScanCandidate>(SQL.events, params),
    query<ScanCandidate>(SQL.claims, params),
    query<{ total: number }>(SQL.signals, [SCAN_SIGNAL_PATTERN]),
    query<ScanMeasurement["baseline"]>(SQL.baseline),
    naIpPerimeter(),
  ]);

  const signals = extractScanSignals([...events.rows, ...claims.rows], { naIps: perimeter.ips });
  const campaigns = groupScanCampaigns(signals);
  const counts = baseline.rows[0] ?? { organizations: 0, sources: 0, events: 0, claims: 0 };

  return {
    scope: "nouvelle-aquitaine",
    basis: "public-scan-signals",
    count: campaigns.length,
    campaigns,
    signals,
    signalsScanned: Number(totals.rows[0]?.total ?? 0),
    perimeterIps: perimeter.ips.size,
    expositionIps: perimeter.expositionIps,
    passiveDnsIps: perimeter.passiveDnsIps,
    sources: [...new Set(signals.map((signal) => signal.source))].sort(),
    baseline: {
      organizations: Number(counts.organizations),
      sources: Number(counts.sources),
      events: Number(counts.events),
      claims: Number(counts.claims),
    },
    measuredAt: new Date().toISOString(),
  };
}
