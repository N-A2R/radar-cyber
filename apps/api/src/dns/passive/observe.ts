/**
 * Passive DNS observation: read public DNS answers for a known NA domain and
 * turn them into dated resolution records. The sensor never probes a target
 * service and never invents an answer; a failed query yields no resolution.
 */
export const RECORD_TYPES = ["A", "AAAA", "MX", "NS"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface DnsAnswer {
  status: number;
  answers: string[];
}

export interface DnsResolver {
  query(domain: string, type: RecordType): Promise<DnsAnswer>;
}

export interface Resolution {
  domain: string;
  observedOn: string;
  recordType: RecordType;
  value: string;
}

export interface DomainObservation {
  domain: string;
  resolutions: Resolution[];
  errors: string[];
}

export interface CollectionOptions {
  now?: Date;
  limit?: number;
  offset?: number;
  concurrency?: number;
}

export interface CollectionResult {
  observedOn: string;
  domains: number;
  resolutions: Resolution[];
  errors: string[];
}

const HOST_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Keeps only usable answer values; CNAME entries are not resolutions. */
export function normalizeAnswer(type: RecordType, raw: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (type === "A") {
    const parts = value.split(".");
    return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255) ? value : null;
  }
  if (type === "AAAA") {
    const lowered = value.toLowerCase();
    return lowered.includes(":") && /^[0-9a-f:.]+$/.test(lowered) && lowered.length <= 39 ? lowered : null;
  }
  if (type === "MX") {
    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || !/^\d+$/.test(parts[0]!)) return null;
    const target = parts[parts.length - 1]!.toLowerCase().replace(/\.$/, "");
    return HOST_RE.test(target) ? target : null;
  }
  const target = value.toLowerCase().replace(/\.$/, "");
  return HOST_RE.test(target) ? target : null;
}

/** One observation per domain; duplicate answers collapse to one record. */
export async function observeDomain(
  domain: string,
  resolver: DnsResolver,
  now: Date = new Date(),
): Promise<DomainObservation> {
  const observedOn = now.toISOString().slice(0, 10);
  const resolutions: Resolution[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const recordType of RECORD_TYPES) {
    try {
      const answer = await resolver.query(domain, recordType);
      // 3 = NXDOMAIN: a legitimate "no record" result, not a sensor failure.
      if (answer.status !== 0 && answer.status !== 3) {
        errors.push(`${recordType}: DNS status ${answer.status}`);
        continue;
      }
      for (const raw of answer.answers) {
        const value = normalizeAnswer(recordType, raw);
        if (!value) continue;
        const key = `${recordType}|${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        resolutions.push({ domain, observedOn, recordType, value });
      }
    } catch (error) {
      errors.push(`${recordType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { domain, resolutions, errors };
}

/** Bounded worker pool: keeps public resolver pressure flat. */
export async function collectResolutions(
  domains: readonly string[],
  resolver: DnsResolver,
  options: CollectionOptions = {},
): Promise<CollectionResult> {
  const now = options.now ?? new Date();
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit && options.limit > 0 ? options.limit : domains.length;
  const selected = domains.slice(offset, offset + limit);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 10, 25));
  const resolutions: Resolution[] = [];
  const errors: string[] = [];
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, Math.max(selected.length, 1)) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= selected.length) return;
      const domain = selected[index]!;
      const result = await observeDomain(domain, resolver, now);
      resolutions.push(...result.resolutions);
      for (const error of result.errors) errors.push(`${domain}: ${error}`);
    }
  });
  await Promise.all(workers);

  return { observedOn: now.toISOString().slice(0, 10), domains: selected.length, resolutions, errors };
}

interface DohJson {
  Status?: number;
  Answer?: { data?: string }[];
}

/** Free DNS-over-HTTPS resolver, no key and no paid service. */
export function createDohResolver(): DnsResolver {
  const endpoint = process.env.RADAR_DOH_URL ?? "https://dns.cloudflare.com/dns-query";
  const timeoutMs = Number(process.env.RADAR_DNS_TIMEOUT_MS ?? 5000);
  return {
    async query(domain, type) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = `${endpoint}?name=${encodeURIComponent(domain)}&type=${type}`;
        const response = await fetch(url, {
          headers: { accept: "application/dns-json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`DoH HTTP ${response.status}`);
        const json = (await response.json()) as DohJson;
        return {
          status: json.Status ?? 0,
          answers: (json.Answer ?? []).flatMap((answer) => (answer.data ? [answer.data] : [])),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
