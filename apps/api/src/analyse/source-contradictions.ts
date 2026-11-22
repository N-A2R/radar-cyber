/**
 * Cross-source contradictions on real Nouvelle-Aquitaine events.
 *
 * A contradiction is a disagreement between two *independent publishers*
 * about one subject inside one 72-hour window: either the declared severity
 * differs, or the nature of the claim differs. Grouping follows the subject
 * (organisation, or victim domain) and a shared topic token -- not the event
 * family: the same NGINX advisory is filed as `cert_fr` by one publisher and
 * as `cert` by another. Two feeds of one publisher are one voice, not two.
 *
 * Pure and read-only. Reports carry a hashed subject identifier and internal
 * event ids only: no title, summary or victim personal data leaves this code.
 */
import { createHash } from "node:crypto";
import { query } from "../db.js";
import {
  CLAIM_WINDOW_MS,
  NA_DEPARTMENTS,
  normalizeKey,
  publisherOf,
} from "./incident-corroboration.js";

export type ContradictionEvent = {
  id: string;
  orgId: number | null;
  orgDept: string | null;
  regional: boolean;
  sourceId: string;
  sourceUrl: string | null;
  family: string;
  assertionType: string;
  /** `null` means the source said nothing about severity; it is not zero. */
  severity: number | null;
  observedAt: string;
  /** Input only. Never copied into a contradiction report. */
  title: string;
  evidence?: Record<string, unknown> | null;
};

export type SourcePosition = {
  publisher: string;
  sourceId: string;
  severity: number | null;
  nature: string;
};

export type Contradiction = {
  /** Deterministic identifier: same inputs always produce the same value. */
  id: string;
  /** Truncated SHA-256 of the subject: no victim name or domain in the report. */
  subject: string;
  kind: "severity" | "nature";
  windowStart: string;
  windowEnd: string;
  eventIds: string[];
  positions: SourcePosition[];
};

export type ContradictionReport = {
  contradictions: Contradiction[];
  count: number;
  byKind: { severity: number; nature: number };
  subjectsScanned: number;
  eventsScanned: number;
};

const NATURE_BY_FAMILY: Record<string, string> = {
  cert: "vulnerability",
  cert_fr: "vulnerability",
  vuln: "vulnerability",
  ransomware: "ransomware_claim",
  leaks: "data_leak",
  cti: "threat_intelligence",
};

/** Generic vocabulary is dropped: only topic words can tie two reports together. */
const GENERIC_TOKENS: Record<string, true> = {
  actualite: true, alerte: true, attack: true, attaque: true, avec: true, dans: true,
  data: true, donnees: true, expose: true, exposed: true, failles: true, feed: true,
  flash: true, incident: true, kritische: true, kwetsbaarheden: true, les: true,
  mise: true, multiple: true, multiples: true, networks: true, news: true,
  novembre: true, octobre: true, pour: true, publication: true, published: true,
  ransomware: true, recent: true, release: true, securite: true, security: true,
  sicherheitslucken: true, source: true, several: true, there: true, under: true,
  update: true, updates: true, vulnerabilities: true, vulnerability: true,
  vulnerabilites: true, warning: true, warnings: true, with: true, und: true,
};

export function natureOf(family: string): string {
  return NATURE_BY_FAMILY[family] ?? `other:${family || "unknown"}`;
}

export function isNA(event: ContradictionEvent): boolean {
  return event.regional || (event.orgDept !== null && NA_DEPARTMENTS[event.orgDept] === true);
}

/** Topic words shared by two reports mean they can describe the same fact. */
export function topicTokens(title: string): Set<string> {
  return new Set(
    normalizeKey(title)
      .split(" ")
      .filter((token) => token.length >= 4 && /[a-z]/.test(token) && GENERIC_TOKENS[token] !== true),
  );
}

function domainIn(value: string): string | null {
  const match = value.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Organisation first, then the claimed victim domain. Null subjects are unresolvable. */
export function subjectKey(event: ContradictionEvent): string | null {
  if (event.orgId !== null && Number.isFinite(event.orgId)) return `org:${event.orgId}`;
  const hint = event.evidence?.org_hint;
  const hinted = typeof hint === "string" ? domainIn(hint.split(/[\\|]/)[0] ?? "") : null;
  const domain = hinted ?? domainIn(event.title);
  return domain === null ? null : `domain:${normalizeKey(domain)}`;
}

function timeOf(event: ContradictionEvent): number {
  const value = Date.parse(event.observedAt);
  return Number.isFinite(value) ? value : 0;
}

function byTime(a: ContradictionEvent, b: ContradictionEvent): number {
  return timeOf(a) - timeOf(b) || String(a.id).localeCompare(String(b.id));
}

/** Greedy chronological windows, anchored on the first event of each window. */
function timeClusters(events: readonly ContradictionEvent[]): ContradictionEvent[][] {
  const sorted = [...events].sort(byTime);
  const clusters: ContradictionEvent[][] = [];
  let current: ContradictionEvent[] = [];
  for (const event of sorted) {
    if (current.length > 0 && timeOf(event) - timeOf(current[0] as ContradictionEvent) > CLAIM_WINDOW_MS) {
      clusters.push(current);
      current = [];
    }
    current.push(event);
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/** Connected components of events sharing at least one specific topic word. */
function topicComponents(cluster: readonly ContradictionEvent[]): ContradictionEvent[][] {
  const seen = new Set<number>();
  const components: ContradictionEvent[][] = [];
  for (let i = 0; i < cluster.length; i += 1) {
    if (seen.has(i)) continue;
    seen.add(i);
    const tokens = topicTokens((cluster[i] as ContradictionEvent).title);
    if (tokens.size === 0) continue;
    const component: ContradictionEvent[] = [cluster[i] as ContradictionEvent];
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < cluster.length; j += 1) {
        if (seen.has(j)) continue;
        const other = topicTokens((cluster[j] as ContradictionEvent).title);
        if (![...tokens].some((token) => other.has(token))) continue;
        component.push(cluster[j] as ContradictionEvent);
        seen.add(j);
        for (const token of other) tokens.add(token);
        grew = true;
      }
    }
    components.push(component);
  }
  return components;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function positionsOf(component: readonly ContradictionEvent[]): SourcePosition[] {
  const positions = new Map<string, SourcePosition>();
  for (const event of [...component].sort(byTime)) {
    const publisher = publisherOf(event.sourceUrl, event.sourceId);
    // First statement of a publisher is its position; later reposts do not
    // silently overwrite what that publisher originally said.
    if (positions.has(publisher)) continue;
    positions.set(publisher, {
      publisher,
      sourceId: event.sourceId,
      severity: typeof event.severity === "number" && Number.isFinite(event.severity)
        ? event.severity
        : null,
      nature: natureOf(event.family),
    });
  }
  return [...positions.values()].sort((a, b) => a.publisher.localeCompare(b.publisher));
}

function makeContradiction(
  subject: string,
  kind: "severity" | "nature",
  component: readonly ContradictionEvent[],
  positions: SourcePosition[],
): Contradiction {
  const dates = component.map(timeOf);
  const windowStart = new Date(Math.min(...dates)).toISOString();
  return {
    id: hash(`${subject}|${windowStart}|${kind}`),
    subject: hash(subject),
    kind,
    windowStart,
    windowEnd: new Date(Math.max(...dates)).toISOString(),
    eventIds: component.map((event) => String(event.id)).sort(),
    positions,
  };
}

/** Pure aggregation over already-loaded events: no writes, no network. */
export function detectContradictions(events: readonly ContradictionEvent[]): ContradictionReport {
  const subjects = new Map<string, ContradictionEvent[]>();
  let scanned = 0;
  for (const event of events) {
    if (!isNA(event)) continue;
    const subject = subjectKey(event);
    if (subject === null) continue;
    scanned += 1;
    const list = subjects.get(subject) ?? [];
    list.push(event);
    subjects.set(subject, list);
  }

  const contradictions: Contradiction[] = [];
  for (const [subject, list] of subjects) {
    for (const cluster of timeClusters(list)) {
      for (const component of topicComponents(cluster)) {
        const positions = positionsOf(component);
        if (positions.length < 2) continue;

        const severities = new Set(positions.map((p) => p.severity).filter((v): v is number => v !== null));
        if (severities.size >= 2) {
          contradictions.push(makeContradiction(subject, "severity", component, positions));
        }
        const natures = new Set(positions.map((p) => p.nature));
        if (natures.size >= 2) {
          contradictions.push(makeContradiction(subject, "nature", component, positions));
        }
      }
    }
  }
  contradictions.sort((a, b) => a.id.localeCompare(b.id));
  return {
    contradictions,
    count: contradictions.length,
    byKind: {
      severity: contradictions.filter((c) => c.kind === "severity").length,
      nature: contradictions.filter((c) => c.kind === "nature").length,
    },
    subjectsScanned: subjects.size,
    eventsScanned: scanned,
  };
}

type RawEvent = {
  id: string;
  source_id: string;
  source_url: string | null;
  family: string;
  assertion_type: string;
  severity: number | null;
  observed_at: string;
  org_id: number | null;
  dept: string | null;
  regional: boolean;
  title: string;
  evidence: Record<string, unknown> | null;
};

const EVENT_COLUMNS = `
  SELECT e.id::text AS id, e.source_id, s.url AS source_url, e.family,
         e.assertion_type, e.severity,
         COALESCE(e.observed_at, e.collected_at)::text AS observed_at,
         e.org_id, e.regional, e.title, e.evidence`;

/** Real events only: NA organisations plus events flagged regional. Read-only. */
export async function loadNAContradictionEvents(): Promise<ContradictionEvent[]> {
  const departments = Object.keys(NA_DEPARTMENTS);
  const attached = await query<RawEvent>(
    `${EVENT_COLUMNS}, o.dept
       FROM event e
       JOIN org o ON o.id = e.org_id AND o.dept = ANY($1::text[])
       LEFT JOIN source s ON s.id = e.source_id`,
    [departments],
  );
  const regional = await query<RawEvent>(
    `${EVENT_COLUMNS}, NULL::text AS dept
       FROM event e
       LEFT JOIN source s ON s.id = e.source_id
      WHERE e.regional`,
  );

  const rows = new Map<string, RawEvent>();
  for (const row of [...attached.rows, ...regional.rows]) rows.set(row.id, row);
  return [...rows.values()].map((row) => ({
    id: row.id,
    orgId: row.org_id === null ? null : Number(row.org_id),
    orgDept: row.dept,
    regional: Boolean(row.regional),
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    family: row.family,
    assertionType: row.assertion_type,
    severity: row.severity ?? null,
    observedAt: row.observed_at,
    title: row.title,
    evidence: row.evidence ?? null,
  }));
}
