// Généré par scripts/generate-api-client.mts — ne pas éditer à la main.
// API v1.0.0 — 58 opérations.
import type { z } from "zod";
import type * as Schemas from "./schemas.js";
import type * as Catalog from "./catalog.js";

export type ErrorBody = z.infer<typeof Schemas.ErrorBody>;
export type Ok = z.infer<typeof Schemas.Ok>;
export type Health = z.infer<typeof Schemas.Health>;
export type Event = z.infer<typeof Schemas.Event>;
export type EventList = z.infer<typeof Schemas.EventList>;
export type EventRows = z.infer<typeof Schemas.EventRows>;
export type Org = z.infer<typeof Schemas.Org>;
export type OrgList = z.infer<typeof Schemas.OrgList>;
export type OrgDetail = z.infer<typeof Schemas.OrgDetail>;
export type Directory = z.infer<typeof Schemas.Directory>;
export type SourceList = z.infer<typeof Schemas.SourceList>;
export type SourceVerification = z.infer<typeof Schemas.SourceVerification>;
export type Stats = z.infer<typeof Schemas.Stats>;
export type Flows = z.infer<typeof Schemas.Flows>;
export type Graph = z.infer<typeof Schemas.Graph>;
export type SearchResults = z.infer<typeof Schemas.SearchResults>;
export type Today = z.infer<typeof Schemas.Today>;
export type Alerts = z.infer<typeof Schemas.Alerts>;
export type Quarantine = z.infer<typeof Schemas.Quarantine>;
export type Journal = z.infer<typeof Schemas.Journal>;
export type ReviewQueue = z.infer<typeof Schemas.ReviewQueue>;
export type Coverage = z.infer<typeof Schemas.Coverage>;
export type HealthDetail = z.infer<typeof Schemas.HealthDetail>;
export type HealthSources = z.infer<typeof Schemas.HealthSources>;
export type Enrichment = z.infer<typeof Schemas.Enrichment>;
export type Dossier = z.infer<typeof Schemas.Dossier>;
export type Stream = z.infer<typeof Schemas.Stream>;
export type Csv = z.infer<typeof Schemas.Csv>;
export type KeyRow = z.infer<typeof Schemas.KeyRow>;
export type KeyList = z.infer<typeof Schemas.KeyList>;
export type KeyCreated = z.infer<typeof Schemas.KeyCreated>;
export type DecisionResult = z.infer<typeof Schemas.DecisionResult>;
export type AuthLogin = z.infer<typeof Schemas.AuthLogin>;
export type AuthUser = z.infer<typeof Schemas.AuthUser>;
export type EventsQuery = z.infer<typeof Catalog.EventsQuery>;
export type HistoryQuery = z.infer<typeof Catalog.HistoryQuery>;
export type TodayQuery = z.infer<typeof Catalog.TodayQuery>;
export type StreamQuery = z.infer<typeof Catalog.StreamQuery>;
export type DeptQuery = z.infer<typeof Catalog.DeptQuery>;
export type OrgsQuery = z.infer<typeof Catalog.OrgsQuery>;
export type IdParam = z.infer<typeof Catalog.IdParam>;
export type DirectoryQuery = z.infer<typeof Catalog.DirectoryQuery>;
export type DaysQuery = z.infer<typeof Catalog.DaysQuery>;
export type createOrgFromHintSchema = z.infer<typeof Catalog.createOrgFromHintSchema>;
export type SearchQuery = z.infer<typeof Catalog.SearchQuery>;
export type FlowsQuery = z.infer<typeof Catalog.FlowsQuery>;
export type MorteBody = z.infer<typeof Schemas.MorteBody>;
export type IngestBody = z.infer<typeof Catalog.IngestBody>;
export type ValueParam = z.infer<typeof Catalog.ValueParam>;
export type AlertQuery = z.infer<typeof Catalog.AlertQuery>;
export type QuarantineQuery = z.infer<typeof Catalog.QuarantineQuery>;
export type QueueQuery = z.infer<typeof Schemas.QueueQuery>;
export type ReviewBody = z.infer<typeof Catalog.ReviewBody>;
export type RefuserSansIndiceBody = z.infer<typeof Schemas.RefuserSansIndiceBody>;
export type DecisionBody = z.infer<typeof Schemas.DecisionBody>;
export type JournalQuery = z.infer<typeof Schemas.JournalQuery>;
export type RegisterBody = z.infer<typeof Catalog.RegisterBody>;
export type LoginBody = z.infer<typeof Catalog.LoginBody>;
export type CreateKeyBody = z.infer<typeof Schemas.CreateKeyBody>;

export interface RequestOptions {
  /** Racine des requêtes : "/api/v1" par défaut, "/api" pour l’alias historique. */
  baseUrl?: string;
  apiKey?: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`HTTP ${status}`);
    this.name = "ApiClientError";
  }
}

function pathOf(template: string, params: Record<string, string | number | undefined>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) =>
    encodeURIComponent(String(params[key] ?? "")));
}

function withQuery(path: string, query?: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function request<T>(path: string, method: string, body: unknown, options?: RequestOptions): Promise<T> {
  const base = (options?.baseUrl ?? "/api/v1").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (options?.token) headers.authorization = `Bearer ${options.token}`;
  if (options?.apiKey) headers["x-api-key"] = options.apiKey;
  const res = await (options?.fetch ?? globalThis.fetch)(`${base}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: options?.signal,
  });
  const text = await res.text();
  const type = res.headers.get("content-type") ?? "";
  const parsed = type.includes("json") && text.length > 0 ? JSON.parse(text) : text;
  if (!res.ok) throw new ApiClientError(res.status, parsed);
  return parsed as T;
}

export function createRadarClient(options?: RequestOptions) {
  return {
    getHealth: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Health>("/health", "GET", undefined, { ...options, ...call }),
    getHealthDetail: (args?: Record<string, never>, call?: RequestOptions) =>
      request<HealthDetail>("/health/detail", "GET", undefined, { ...options, ...call }),
    getHealthSources: (args?: Record<string, never>, call?: RequestOptions) =>
      request<HealthSources>("/health/sources", "GET", undefined, { ...options, ...call }),
    getHealthCauses: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/health/causes", "GET", undefined, { ...options, ...call }),
    getEvents: (args: { query?: EventsQuery }, call?: RequestOptions) =>
      request<EventRows>(withQuery("/events", args?.query), "GET", undefined, { ...options, ...call }),
    getHistory: (args: { query?: HistoryQuery }, call?: RequestOptions) =>
      request<EventList>(withQuery("/history", args?.query), "GET", undefined, { ...options, ...call }),
    getToday: (args: { query?: TodayQuery }, call?: RequestOptions) =>
      request<Today>(withQuery("/today", args?.query), "GET", undefined, { ...options, ...call }),
    getTodayDepartements: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/today/departements", "GET", undefined, { ...options, ...call }),
    streamEvents: (args: { query?: StreamQuery }, call?: RequestOptions) =>
      request<Stream>(withQuery("/stream", args?.query), "GET", undefined, { ...options, ...call }),
    getNaOverview: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/na/overview", "GET", undefined, { ...options, ...call }),
    getNaEvents: (args: { query?: DeptQuery }, call?: RequestOptions) =>
      request<EventList>(withQuery("/na/events", args?.query), "GET", undefined, { ...options, ...call }),
    getOrgs: (args: { query?: OrgsQuery }, call?: RequestOptions) =>
      request<OrgList>(withQuery("/orgs", args?.query), "GET", undefined, { ...options, ...call }),
    getOrg: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<OrgDetail>(pathOf("/orgs/{id}", args.params), "GET", undefined, { ...options, ...call }),
    getDirectory: (args: { query?: DirectoryQuery }, call?: RequestOptions) =>
      request<Directory>(withQuery("/directory", args?.query), "GET", undefined, { ...options, ...call }),
    getOrgsLiees: (args?: Record<string, never>, call?: RequestOptions) =>
      request<OrgList>("/orgs/liees", "GET", undefined, { ...options, ...call }),
    getOrgsLieesHistorique: (args: { query?: DaysQuery }, call?: RequestOptions) =>
      request<Stats>(withQuery("/orgs/liees/historique", args?.query), "GET", undefined, { ...options, ...call }),
    createOrgFromHint: (args: { body: createOrgFromHintSchema }, call?: RequestOptions) =>
      request<OrgDetail>("/orgs/from-hint", "POST", args.body, { ...options, ...call }),
    search: (args: { query?: SearchQuery }, call?: RequestOptions) =>
      request<SearchResults>(withQuery("/search", args?.query), "GET", undefined, { ...options, ...call }),
    getGraph: (args: { query?: DaysQuery }, call?: RequestOptions) =>
      request<Graph>(withQuery("/graph", args?.query), "GET", undefined, { ...options, ...call }),
    getDossier: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Dossier>("/dossier", "GET", undefined, { ...options, ...call }),
    getStats: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/stats", "GET", undefined, { ...options, ...call }),
    getStatsDepartements: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/stats/departements", "GET", undefined, { ...options, ...call }),
    getCouverture: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Coverage>("/couverture", "GET", undefined, { ...options, ...call }),
    getFlows: (args: { query?: FlowsQuery }, call?: RequestOptions) =>
      request<Flows>(withQuery("/flows", args?.query), "GET", undefined, { ...options, ...call }),
    getSources: (args?: Record<string, never>, call?: RequestOptions) =>
      request<SourceList>("/sources", "GET", undefined, { ...options, ...call }),
    getSourcesVerification: (args?: Record<string, never>, call?: RequestOptions) =>
      request<SourceVerification>("/sources/verification", "GET", undefined, { ...options, ...call }),
    recollectSource: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<Ok>(pathOf("/sources/{id}/collecte", args.params), "POST", undefined, { ...options, ...call }),
    markSourceDead: (args: { params: { id: string | number }; body: MorteBody }, call?: RequestOptions) =>
      request<Ok>(pathOf("/sources/{id}/morte", args.params), "POST", args.body, { ...options, ...call }),
    reactivateSource: (args: { params: { id: string | number }; body: MorteBody }, call?: RequestOptions) =>
      request<Ok>(pathOf("/sources/{id}/reactiver", args.params), "POST", args.body, { ...options, ...call }),
    ingestEvents: (args: { body: IngestBody }, call?: RequestOptions) =>
      request<DecisionResult>("/ingest", "POST", args.body, { ...options, ...call }),
    getIndicatorEnrichment: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<Enrichment>(pathOf("/enrich/indicator/{id}", args.params), "GET", undefined, { ...options, ...call }),
    getDomainEnrichment: (args: { params: { value: string | number } }, call?: RequestOptions) =>
      request<Enrichment>(pathOf("/enrich/domain/{value}", args.params), "GET", undefined, { ...options, ...call }),
    getEventEnrichment: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<Enrichment>(pathOf("/enrich/events/{id}", args.params), "GET", undefined, { ...options, ...call }),
    getAlerts: (args: { query?: AlertQuery }, call?: RequestOptions) =>
      request<Alerts>(withQuery("/alerts", args?.query), "GET", undefined, { ...options, ...call }),
    getAlertStats: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/alerts/stats", "GET", undefined, { ...options, ...call }),
    getAlert: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<Stats>(pathOf("/alerts/{id}", args.params), "GET", undefined, { ...options, ...call }),
    ackAlert: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<Ok>(pathOf("/alerts/{id}/ack", args.params), "POST", undefined, { ...options, ...call }),
    resolveAlert: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<Ok>(pathOf("/alerts/{id}/resolve", args.params), "POST", undefined, { ...options, ...call }),
    getQuarantine: (args: { query?: QuarantineQuery }, call?: RequestOptions) =>
      request<Quarantine>(withQuery("/quarantine", args?.query), "GET", undefined, { ...options, ...call }),
    getQuarantineStats: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/quarantine/stats", "GET", undefined, { ...options, ...call }),
    getQuarantineQueue: (args: { query?: QueueQuery }, call?: RequestOptions) =>
      request<ReviewQueue>(withQuery("/quarantine/queue", args?.query), "GET", undefined, { ...options, ...call }),
    reviewQuarantine: (args: { body: ReviewBody }, call?: RequestOptions) =>
      request<DecisionResult>("/quarantine/review", "POST", args.body, { ...options, ...call }),
    promoteQuarantine: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<DecisionResult>(pathOf("/quarantine/{id}/promote", args.params), "POST", undefined, { ...options, ...call }),
    getReviewQueue: (args: { query?: QueueQuery }, call?: RequestOptions) =>
      request<ReviewQueue>(withQuery("/review/queue", args?.query), "GET", undefined, { ...options, ...call }),
    getReviewStats: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Stats>("/review/stats", "GET", undefined, { ...options, ...call }),
    rejectWithoutHint: (args: { body: RefuserSansIndiceBody }, call?: RequestOptions) =>
      request<DecisionResult>("/review/refuser-sans-indice", "POST", args.body, { ...options, ...call }),
    decideReview: (args: { params: { id: string | number }; body: DecisionBody }, call?: RequestOptions) =>
      request<DecisionResult>(pathOf("/review/{id}/decision", args.params), "POST", args.body, { ...options, ...call }),
    getReviewJournal: (args: { query?: JournalQuery }, call?: RequestOptions) =>
      request<Journal>(withQuery("/journal/review", args?.query), "GET", undefined, { ...options, ...call }),
    exportReviewJournal: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Csv>("/journal/review/export.csv", "GET", undefined, { ...options, ...call }),
    exportRegistreTraitements: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Csv>("/registre-traitements/export.csv", "GET", undefined, { ...options, ...call }),
    exportViolationsRgpd: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Csv>("/violations-rgpd/export.csv", "GET", undefined, { ...options, ...call }),
    register: (args: { body: RegisterBody }, call?: RequestOptions) =>
      request<AuthUser>("/auth/register", "POST", args.body, { ...options, ...call }),
    login: (args: { body: LoginBody }, call?: RequestOptions) =>
      request<AuthLogin>("/auth/login", "POST", args.body, { ...options, ...call }),
    logout: (args?: Record<string, never>, call?: RequestOptions) =>
      request<Ok>("/auth/logout", "POST", undefined, { ...options, ...call }),
    getMe: (args?: Record<string, never>, call?: RequestOptions) =>
      request<AuthUser>("/auth/me", "GET", undefined, { ...options, ...call }),
    createApiKey: (args: { body: CreateKeyBody }, call?: RequestOptions) =>
      request<KeyCreated>("/keys", "POST", args.body, { ...options, ...call }),
    listApiKeys: (args?: Record<string, never>, call?: RequestOptions) =>
      request<KeyList>("/keys", "GET", undefined, { ...options, ...call }),
    revokeApiKey: (args: { params: { id: string | number } }, call?: RequestOptions) =>
      request<Ok>(pathOf("/keys/{id}", args.params), "DELETE", undefined, { ...options, ...call }),
  };
}
