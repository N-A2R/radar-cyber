/**
 * Radar Cyber Nouvelle-Aquitaine SDK (TypeScript).
 *
 * Read-only, standard-library client for the public API. No paid service, no
 * dependency, no victim personal data: the regional event projection drops
 * free-text titles and summaries before they leave the SDK.
 */

/** The twelve departments of Nouvelle-Aquitaine (INSEE codes). */
export const NA_DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] as const;

export type NaDepartment = (typeof NA_DEPARTMENTS)[number];

export function isNaDepartment(value: string): value is NaDepartment {
  return (NA_DEPARTMENTS as readonly string[]).includes(value);
}

export type Health = { ok: boolean; sources: number };

export type Stats = {
  orgs: number;
  events: number;
  indicators: number;
  sources: { total: number; active: number; ok: number; err: number };
  byFamily: Array<{ family: string; n: number }>;
};

export type DepartmentSummary = {
  department: string;
  organisations: number;
  organisationsWithEvents: number;
  events: number;
};

export type NaOverview = {
  departments: DepartmentSummary[];
  total: {
    organisations: number;
    organisationsWithEvents: number;
    events: number;
    departmentsWithoutEvents: string[];
  };
  lastCollectionAt: string | null;
};

/** Safe projection: no title, summary, victim name or other free text. */
export type NaEvent = {
  id: number;
  family: string;
  observedAt: string | null;
  collectedAt: string;
  source: string;
  orgId: number;
};

export type SourceSummary = {
  id: string;
  name: string;
  family: string;
  kind: string;
  enabled: boolean;
  lastOkAt: string | null;
};

type RawDepartment = {
  dept: string;
  orgs: number;
  orgsAvecEvenement: number;
  evenements: number;
};

type RawNaOverview = {
  depts: RawDepartment[];
  derniereCollecte: string | null;
  total: {
    orgs: number;
    orgsAvecEvenement: number;
    evenements: number;
    deptsSansEvenement: string[];
  };
};

type RawNaEvent = {
  id: number;
  title: string;
  family: string;
  observed_at: string | null;
  collected_at: string;
  source: string;
  orgId: number;
  orgName: string;
};

type RawSource = {
  id: string;
  name: string;
  family: string;
  kind: string;
  enabled: boolean;
  lastOkAt: string | null;
};

export class RadarApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RadarApiError";
  }
}

export type RadarClientOptions = {
  /** Root of the public API, e.g. `http://127.0.0.1:8080/api`. */
  baseUrl?: string;
  /** Optional write-scoped key; public reads work without one. */
  apiKey?: string;
  /** Injectable fetch (tests, custom transports). */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function absoluteBase(baseUrl: string): string {
  if (/^https?:\/\//.test(baseUrl)) return baseUrl.replace(/\/+$/, "");
  const path = baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
  return `http://localhost${path}`.replace(/\/+$/, "");
}

export class RadarClient {
  readonly baseUrl: string;

  constructor(private readonly options: RadarClientOptions = {}) {
    this.baseUrl = absoluteBase(options.baseUrl ?? process.env.RADAR_API_BASE_URL ?? "http://127.0.0.1:8080/api");
  }

  getHealth(): Promise<Health> {
    return this.get<Health>("/health");
  }

  getStats(): Promise<Stats> {
    return this.get<Stats>("/stats");
  }

  async getNaOverview(): Promise<NaOverview> {
    const raw = await this.get<RawNaOverview>("/na/overview");
    return {
      departments: raw.depts.map((d) => ({
        department: d.dept,
        organisations: d.orgs,
        organisationsWithEvents: d.orgsAvecEvenement,
        events: d.evenements,
      })),
      total: {
        organisations: raw.total.orgs,
        organisationsWithEvents: raw.total.orgsAvecEvenement,
        events: raw.total.evenements,
        departmentsWithoutEvents: raw.total.deptsSansEvenement,
      },
      lastCollectionAt: raw.derniereCollecte,
    };
  }

  /** Regional feed, restricted to Nouvelle-Aquitaine departments. */
  async getNaEvents(department: string): Promise<NaEvent[]> {
    if (!isNaDepartment(department)) {
      throw new RangeError(`department must be one of ${NA_DEPARTMENTS.join(", ")}`);
    }
    const raw = await this.get<{ dept: string; events: RawNaEvent[] }>("/na/events", { dept: department });
    // Drop title and orgName: free text can name a victim, which is out of scope.
    return raw.events.map((event) => ({
      id: event.id,
      family: event.family,
      observedAt: event.observed_at,
      collectedAt: event.collected_at,
      source: event.source,
      orgId: event.orgId,
    }));
  }

  /** All configured sources, including gray ones; no origin allowlist. */
  async getSources(): Promise<SourceSummary[]> {
    const raw = await this.get<RawSource[]>("/sources");
    return raw.map((source) => ({
      id: source.id,
      name: source.name,
      family: source.family,
      kind: source.kind,
      enabled: source.enabled,
      lastOkAt: source.lastOkAt ?? null,
    }));
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const search = new URLSearchParams(query).toString();
    const url = `${this.baseUrl}${path}${search ? `?${search}` : ""}`;
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.options.apiKey) headers["x-api-key"] = this.options.apiKey;

    const response = await (this.options.fetch ?? globalThis.fetch)(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
      throw new RadarApiError(
        response.status,
        error?.code ?? "HTTP_ERROR",
        error?.message ?? `HTTP ${response.status}`,
      );
    }
    return body as T;
  }
}

export function createRadarClient(options?: RadarClientOptions): RadarClient {
  return new RadarClient(options);
}
