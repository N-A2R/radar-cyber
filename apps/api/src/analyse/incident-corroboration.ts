/**
 * Two-source corroboration of Nouvelle-Aquitaine incidents.
 *
 * An incident is corroborated when two independent publishers report the same
 * victim, the same claimant and the same claim window. Publisher identity comes
 * from the source URL: two feeds of the same publisher are one source, not two.
 * Only public organisational facts are used; no victim personal data is kept.
 */
import { createHash } from "node:crypto";
import { query } from "../db.js";

/** The twelve departments of Nouvelle-Aquitaine. */
export const NA_DEPARTMENTS: Record<string, true> = {
  "16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

/** Same claim, republished within three days: still the same incident. */
export const CLAIM_WINDOW_MS = 72 * 3_600_000;

export const INCIDENT_ASSERTIONS: Record<string, true> = {
  confirmed_incident: true,
  third_party_claim: true,
};

type JsonRecord = Record<string, unknown>;

export type CorroborationEvent = {
  id: number;
  sourceId: string;
  sourceUrl: string | null;
  family: string;
  assertionType: string;
  orgId: number | null;
  orgDept: string | null;
  regional: boolean;
  observedAt: string | null;
  evidence: JsonRecord | null;
  title: string;
};

export type CorroboratedCluster = {
  incidentKey: string;
  victimHash: string;
  eventIds: number[];
  sourceIds: string[];
  publishers: string[];
  incidentEvents: number;
  firstClaimAt: string;
  lastClaimAt: string;
  corroborated: boolean;
  /** True when this cluster counts towards the Nouvelle-Aquitaine incident total. */
  naIncident: boolean;
};

export type CorroborationReport = {
  incidentsTotal: number;
  incidentsCorroborated: number;
  incidentsSingleSource: number;
  ratePercent: number;
  clusters: CorroboratedCluster[];
};

export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Feeds of one publisher collapse into one independent source. */
export function publisherOf(sourceUrl: string | null | undefined, sourceId: string): string {
  if (!sourceUrl) return sourceId;
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "raw.githubusercontent.com" || host === "github.com") {
      const owner = url.pathname.split("/").filter(Boolean)[0];
      return owner ? `${host}/${owner.toLowerCase()}` : host;
    }
    return host || sourceId;
  } catch {
    return sourceId;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function domainIn(value: string): string | null {
  const match = value.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Victim identity: claimed domain first, attached organisation second, title last. */
export function victimKey(event: CorroborationEvent): string {
  const hint = text(event.evidence?.org_hint);
  const hinted = hint ? domainIn(hint.split(/[\\|]/)[0] ?? "") : null;
  if (hinted) return normalizeKey(hinted);
  const titled = domainIn(event.title);
  if (titled) return normalizeKey(titled);
  if (event.orgId !== null) return `org:${event.orgId}`;
  return `title:${normalizeKey(event.title).slice(0, 120)}`;
}

/** Claimant identity: the ransomware group or the issuing publisher family. */
export function claimGroup(event: CorroborationEvent): string {
  const fromEvidence = text(event.evidence?.group);
  if (fromEvidence) return normalizeKey(fromEvidence);
  const title = event.title;
  const press = title.match(/^([^—:]+?)\s+has just published a new victim/i);
  const claim = title.match(/revendiqu\w+\s+par\s+([^\s—]+)/i);
  return normalizeKey(press?.[1] ?? claim?.[1] ?? event.family);
}
/**
 * The claimant often lands in a different event family when a publisher relays
 * it (ransomware claim vs leak feed): identity is victim + claimant, not family.
 */
export function incidentKey(event: CorroborationEvent): string {
  return `${victimKey(event)}|${claimGroup(event)}`;
}

export function claimTime(event: CorroborationEvent): number {
  const claimed = text(event.evidence?.claimed_at);
  const at = claimed ? Date.parse(claimed) : Number.NaN;
  if (Number.isFinite(at)) return at;
  const observed = event.observedAt ? Date.parse(event.observedAt) : Number.NaN;
  return Number.isFinite(observed) ? observed : 0;
}

export function isIncident(event: CorroborationEvent): boolean {
  return INCIDENT_ASSERTIONS[event.assertionType] === true;
}

export function isNA(event: CorroborationEvent): boolean {
  return event.regional || (event.orgDept !== null && NA_DEPARTMENTS[event.orgDept] === true);
}

function buildCluster(key: string, items: readonly CorroborationEvent[]): CorroboratedCluster {
  const publishers = [...new Set(items.map((event) => publisherOf(event.sourceUrl, event.sourceId)))].sort();
  const times = items.map(claimTime);
  return {
    incidentKey: key,
    victimHash: createHash("sha256").update(key).digest("hex").slice(0, 12),
    eventIds: [...new Set(items.map((event) => event.id))].sort((a, b) => a - b),
    sourceIds: [...new Set(items.map((event) => event.sourceId))].sort(),
    publishers,
    incidentEvents: items.filter(isIncident).length,
    firstClaimAt: new Date(Math.min(...times)).toISOString(),
    lastClaimAt: new Date(Math.max(...times)).toISOString(),
    corroborated: false,
    naIncident: false,
  };
}

/** Pure aggregation: no writes, no network, no reportable victim data. */
export function corroborateNAIncidents(events: readonly CorroborationEvent[]): CorroborationReport {
  const naIncidentKeys = new Set<string>();
  const byKey = new Map<string, CorroborationEvent[]>();
  for (const event of events) {
    const key = incidentKey(event);
    if (isIncident(event) && isNA(event)) naIncidentKeys.add(key);
    const current = byKey.get(key);
    if (current) current.push(event);
    else byKey.set(key, [event]);
  }

  const clusters: CorroboratedCluster[] = [];
  for (const [key, grouped] of byKey) {
    const ordered = [...grouped].sort((a, b) => claimTime(a) - claimTime(b) || a.id - b.id);
    let window: CorroborationEvent[] = [];
    let anchor = 0;
    const flush = (): void => {
      if (window.length > 0) clusters.push(buildCluster(key, window));
    };
    for (const event of ordered) {
      const at = claimTime(event);
      if (window.length === 0) {
        window = [event];
        anchor = at;
      } else if (at - anchor <= CLAIM_WINDOW_MS) {
        window.push(event);
      } else {
        flush();
        window = [event];
        anchor = at;
      }
    }
    flush();
  }

  const naIncidents = clusters.filter(
    (cluster) => cluster.incidentEvents > 0 && naIncidentKeys.has(cluster.incidentKey),
  );
  for (const cluster of naIncidents) {
    cluster.corroborated = cluster.publishers.length >= 2;
    cluster.naIncident = true;
  }
  const corroborated = naIncidents.filter((cluster) => cluster.corroborated).length;
  return {
    incidentsTotal: naIncidents.length,
    incidentsCorroborated: corroborated,
    incidentsSingleSource: naIncidents.length - corroborated,
    ratePercent: naIncidents.length === 0 ? 0 : Math.round((corroborated / naIncidents.length) * 10_000) / 100,
    clusters,
  };
}

/** Loads real events, their publisher URL and their organisation's department. */
export async function loadCorroborationEvents(): Promise<CorroborationEvent[]> {
  const result = await query<CorroborationEvent>(`
    SELECT e.id::int AS "id", e.source_id AS "sourceId", s.url AS "sourceUrl",
           e.family, e.assertion_type AS "assertionType", e.org_id AS "orgId",
           e.regional, e.observed_at AS "observedAt", e.evidence, e.title,
           o.dept AS "orgDept"
      FROM event e
      JOIN source s ON s.id = e.source_id
      LEFT JOIN org o ON o.id = e.org_id
     ORDER BY e.id`);
  return result.rows.map((row) => ({
    ...row,
    orgId: row.orgId === null ? null : Number(row.orgId),
    orgDept: row.orgDept === null || row.orgDept.trim() === "" ? null : row.orgDept,
    evidence: (row.evidence ?? null) as JsonRecord | null,
    regional: Boolean(row.regional),
  }));
}
