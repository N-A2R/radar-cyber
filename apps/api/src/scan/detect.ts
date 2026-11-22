/**
 * Passive detection of mass-scan campaigns targeting Nouvelle-Aquitaine IPs.
 *
 * A campaign needs at least two independent public reports naming a scan
 * action against a routable IPv4 address located in the region (either in the
 * public passive-DNS perimeter or next to an explicit NA locality). Only
 * public titles and claim hints are read: no summary, TLP:RED body, victim
 * name, e-mail or phone number. Gray sources stay eligible; every rule is
 * pure and no network call is made, so nothing is ever actively scanned.
 */
import { DEPT_LABELS, PREFECTURES } from "../collectors/relevance.js";

/**
 * SQL prefilter and pure rule share this expression. It is intentionally
 * broad: product names such as "QR scanner" are rejected by the rule below.
 */
export const SCAN_SIGNAL_PATTERN = [
  "(?:^|[^a-z0-9])(?:port|network|subnet|ip|mass|massive|distributed|coordinated)(?:[- ](?:port|network|subnet|ip))?[- ]?scann?(?:ing|ed|s)?(?:[^a-z0-9]|$)",
  "(?:^|[^a-z0-9])scann?(?:ing|ed|s)?[- ]?(?:campaigns?|sweeps?|waves?|activity)(?:[^a-z0-9]|$)",
  "(?:^|[^a-z0-9])(?:masscan|zmap)(?:[^a-z0-9]|$)",
  "(?:^|[^a-z0-9])nmap[^.!?]{0,30}(?:scan|sweep|range|subnet)(?:[^a-z0-9]|$)",
  "campagne de scans?|scans? massifs?|balayage (?:de ports|r[eé]seau|massif)",
].join("|");

const SCAN_ACTION_RE = new RegExp(SCAN_SIGNAL_PATTERN, "i");

const IPV4_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\/(?:[8-9]|[12]\d|3[0-2]))?\b/g;

/** RFC1918, loopback, link-local, CGNAT, multicast and reserved space. */
export function isPublicIpv4(value: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/\d{1,2})?$/.exec(value);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((part) => part > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const NA_PLACES: readonly string[] = [
  "nouvelle aquitaine",
  ...Object.values(DEPT_LABELS),
  ...PREFECTURES.map(fold),
];

const NA_PLACE_RE = new RegExp(
  `\\b(?:${[...new Set(NA_PLACES)]
    .sort((a, b) => b.length - a.length)
    .map((place) => place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\b`,
  "i",
);

/** A foreign place vetoes an in-region reading of the same report. */
const FOREIGN_PLACE_RE =
  /\b(?:paris|lyon|marseille|toulouse|lille|nantes|rennes|strasbourg|montpellier|nice|brussels|germany|netherlands|ukraine|russia|china|iran|india|singapore|brazil|canada|united states|usa)\b/i;

/** Removes victim e-mails and phone-like digit runs before classification. */
export function redactPersonalData(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ")
    .replace(/\b(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/g, " ");
}

/** The scan tool explicitly named by the report, when any. */
export function scanTool(text: string): string | null {
  const value = fold(redactPersonalData(text));
  return /\bmasscan\b/.test(value)
    ? "masscan"
    : /\bzmap\b/.test(value)
      ? "zmap"
      : /\bnmap\b/.test(value)
        ? "nmap"
        : null;
}

export type ScanCandidate = {
  id: string | number;
  source: string;
  /** Public title or claim hint only. */
  text: string | null;
  family?: string | null;
  origin?: "event" | "claim";
  /** ISO timestamp or date of the public report. */
  observedAt?: string | null;
};

export type ScanSignal = {
  id: string;
  source: string;
  origin: "event" | "claim";
  /** Routable target address or CIDR named by the public report. */
  target: string;
  /** Stable /24 grouping key. */
  subnet: string;
  attribution: "na-ip-perimeter" | "na-locality";
  locality: string | null;
  observedAt: string | null;
  tool: string | null;
};

function subnetOf(target: string): string {
  const address = target.split("/")[0]!;
  return `${address.split(".").slice(0, 3).join(".")}.0/24`;
}

function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Extracts source-attributed signals. A signal is kept only when a scan
 * action, a routable IPv4 target and an in-region attribution all appear in
 * the same public text. Repeated reports of the same target by one source on
 * one day collapse into one signal.
 */
export function extractScanSignals(
  candidates: readonly ScanCandidate[],
  options: { naIps?: ReadonlySet<string> } = {},
): ScanSignal[] {
  const naIps = options.naIps ?? new Set<string>();
  const signals: ScanSignal[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.family === "vuln" || !candidate.text) continue;
    const text = redactPersonalData(candidate.text);
    if (/^\s*cve-\d{4}-\d+/i.test(text) || !SCAN_ACTION_RE.test(text)) continue;
    const cleaned = fold(text);
    if (FOREIGN_PLACE_RE.test(cleaned)) continue;

    const targets = [...new Set(text.match(IPV4_RE) ?? [])].filter(isPublicIpv4);
    if (targets.length === 0) continue;
    const locality = NA_PLACE_RE.exec(cleaned)?.[0] ?? null;

    for (const target of targets) {
      const inPerimeter = naIps.has(target.split("/")[0]!);
      if (!inPerimeter && locality === null) continue;
      const origin = candidate.origin ?? "event";
      const day = dayOf(candidate.observedAt);
      const key = `${origin}:${candidate.source}:${target}:${day ?? "unknown"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      signals.push({
        id: `${origin}:${candidate.id}`,
        source: candidate.source,
        origin,
        target,
        subnet: subnetOf(target),
        attribution: inPerimeter ? "na-ip-perimeter" : "na-locality",
        locality,
        observedAt: candidate.observedAt ?? null,
        tool: scanTool(text),
      });
    }
  }
  return signals;
}

export type ScanCampaign = {
  id: string;
  subnet: string;
  sources: string[];
  signals: ScanSignal[];
  firstSeen: string;
  lastSeen: string;
  spanHours: number;
};

/**
 * Groups source-attributed signals into campaigns per /24 target. Two
 * distinct public sources inside the rolling window are required: one report
 * is an observation, not a campaign.
 */
export function groupScanCampaigns(
  signals: readonly ScanSignal[],
  options: { windowDays?: number; minSources?: number } = {},
): ScanCampaign[] {
  const windowDays = options.windowDays ?? 30;
  const minSources = options.minSources ?? 2;
  const bySubnet = new Map<string, ScanSignal[]>();
  for (const signal of signals) {
    const bucket = bySubnet.get(signal.subnet) ?? [];
    bucket.push(signal);
    bySubnet.set(signal.subnet, bucket);
  }

  const campaigns: ScanCampaign[] = [];
  for (const [subnet, bucket] of bySubnet) {
    const ordered = [...bucket].sort((a, b) => {
      const left = a.observedAt ? Date.parse(a.observedAt) : Number.POSITIVE_INFINITY;
      const right = b.observedAt ? Date.parse(b.observedAt) : Number.POSITIVE_INFINITY;
      return left - right || a.id.localeCompare(b.id);
    });
    let window: ScanSignal[] = [];
    const flush = (): void => {
      const sources = [...new Set(window.map((signal) => signal.source))];
      if (sources.length < minSources) return;
      const dated = window
        .map((signal) => signal.observedAt)
        .filter((value): value is string => value !== null)
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value));
      if (dated.length < 2) return;
      const first = Math.min(...dated);
      const last = Math.max(...dated);
      campaigns.push({
        id: `${subnet}:${new Date(first).toISOString().slice(0, 10)}`,
        subnet,
        sources,
        signals: window,
        firstSeen: new Date(first).toISOString(),
        lastSeen: new Date(last).toISOString(),
        spanHours: Math.round(((last - first) / 3_600_000) * 100) / 100,
      });
    };

    for (const signal of ordered) {
      const time = signal.observedAt ? Date.parse(signal.observedAt) : Number.NaN;
      const previous = window.at(-1);
      const previousTime = previous?.observedAt ? Date.parse(previous.observedAt) : Number.NaN;
      if (
        window.length > 0 &&
        Number.isFinite(time) &&
        Number.isFinite(previousTime) &&
        time - previousTime > windowDays * 86_400_000
      ) {
        flush();
        window = [];
      }
      window.push(signal);
    }
    flush();
  }
  return campaigns.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.subnet.localeCompare(b.subnet));
}

/** Number of distinct mass-scan campaigns in the public signals. */
export function countScanCampaigns(
  candidates: readonly ScanCandidate[],
  options: { naIps?: ReadonlySet<string>; windowDays?: number; minSources?: number } = {},
): number {
  return groupScanCampaigns(
    extractScanSignals(candidates, { naIps: options.naIps }),
    { windowDays: options.windowDays, minSources: options.minSources },
  ).length;
}
