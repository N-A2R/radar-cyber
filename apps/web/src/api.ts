const BASE = "/api";

/** Clé de stockage du jeton de session. */
const TOKEN_KEY = "radar_token";

export function getAuthToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function authHeaders(): HeadersInit {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Erreur d'API portant le code HTTP, pour distinguer 401 de 500 dans l'UI. */
export type ApiError = Error & { status?: number };

function apiError(path: string, status: number): ApiError {
  const err = new Error(`${path} → ${status}`) as ApiError;
  err.status = status;
  return err;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  if (!res.ok) throw apiError(path, res.status);
  return res.json() as Promise<T>;
}

/** POST authentifié (ack / resolve) : le token est relu à chaque appel. */
async function post<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw apiError(path, res.status);
  return res.json() as Promise<T>;
}

/** POST avec corps JSON ; le jeton est joint quand il existe (login : aucun). */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw apiError(path, res.status);
  return res.json() as Promise<T>;
}

/** Utilisateur renvoyé par `POST /auth/login`. */
export type AuthUser = {
  id: number;
  email: string;
  role: string;
  displayName: string | null;
};

/** Réponse de `POST /auth/login`. */
export type LoginResponse = { token: string; user: AuthUser };

/** Mémorise le jeton de session (même clé que `getAuthToken`). */
export function setAuthToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* stockage indisponible */ }
}

/** Oublie le jeton de session. */
export function clearAuthToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
}

export type Org = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  sector: string | null;
  city: string | null;
  dept: string | null;
  lat: number | null;
  lon: number | null;
  eventCount: number;
};

export type Event = {
  id: string;
  dedupKey: string;
  family: string;
  assertionType: string;
  title: string;
  summary: string | null;
  observedAt: string | null;
  severity: number;
  confidence: string | null;
  sourceId: string;
  sourceUrl: string | null;
  evidence?: unknown;
  geoType: string;
  lat: number | null;
  lon: number | null;
  orgId: number | null;
  /** Vrai si l'événement touche une organisation ou une entité de la région. */
  regional: boolean;
};

export type Source = {
  id: string;
  name: string;
  family: string;
  url: string;
  kind: "narrative" | "indicator";
  format: string;
  enabled: boolean;
  intervalSec: number;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  itemsTotal: number | null;
  lastItems: number | null;
  ok: boolean;
};

/** État de santé d'une source, dérivé de ses dates de succès et d'erreur. */
export type SourceStatus = "ok" | "error" | "pending";

/**
 * Détermine l'état d'une source :
 * - "error"   : une erreur est renseignée (la plus récente) ;
 * - "pending" : jamais collectée (ni succès ni erreur) ;
 * - "ok"      : un succès sans erreur.
 */
export function sourceStatus(source: Pick<Source, "lastOkAt" | "lastErrorAt">): SourceStatus {
  if (source.lastErrorAt) return "error";
  if (source.lastOkAt) return "ok";
  return "pending";
}

export type Stats = {
  orgs: number;
  events: number;
  indicators: number;
  sources: { total: number; active: number; ok: number; err: number };
  byFamily: { family: string; n: number }[];
  byAssertion: { assertion_type: string; n: number }[];
};

export type Graph = {
  nodes: { id: string; label: string; kind: "org" | "family" | "group" | "asset" | "dept" }[];
  links: { source: string; target: string; type: string }[];
};

/** Réponse de GET /api/health : vitalité du backend et id des sources connues. */
export type Health = {
  ok: boolean;
  sources: string[];
};

/** Arc géographique pour la carte 3D (GET /api/flows). */
export type FlowArc = {
  id: string;
  from: { lat: number; lon: number; label: string };
  to: { lat: number; lon: number; label: string };
  family: string;
  severity: number;
  observedAt: string | null;
  title: string;
  sourceUrl: string | null;
};

/** Réponse de GET /api/flows. */
export type Flows = {
  arcs: FlowArc[];
  total: number;
  truncated: boolean;
};

export type AlertStatus = "open" | "ack" | "resolved";

/** Ligne de `GET /api/alerts` : alerte + jointures événement / indicateur / org. */
export type Alert = {
  id: number;
  rule_id: string;
  title: string;
  severity: number;
  status: AlertStatus;
  event_id: number | null;
  indicator_id: number | null;
  org_id: number | null;
  evidence: unknown;
  scope?: "organization_incident" | "regional_advisory";
  created_at: string;
  updated_at: string;
  acked_at: string | null;
  acked_by: number | null;
  event_title: string | null;
  event_family: string | null;
  indicator_type: string | null;
  indicator_value: string | null;
  org_name: string | null;
};

/** Ligne de `GET /api/alerts/stats` : une entrée par couple statut × sévérité. */
export type AlertStatRow = {
  status: AlertStatus;
  severity: number;
  count: string;
};

export type AlertQuery = {
  status?: AlertStatus;
  severity?: number;
  limit?: number;
};

/** Branches enrichies d'un indicateur (whois, DNS, certificats, réputation…). */
export type Enrichment = {
  errors: string[];
  domain?: {
    registrar?: string;
    created?: string;
    expires?: string;
    updated?: string;
    nameServers?: string[];
    status?: string[];
  } | null;
  dns?: { a?: string[]; aaaa?: string[] } | null;
  certs?: { name: string; issuer: string; notBefore: string; notAfter: string }[] | null;
  reverse?: string[] | null;
  reputation?: unknown;
};

/** Réponse de `GET /api/enrich/indicator/:id`. */
export type IndicatorEnrichment = {
  indicator: {
    id: string;
    type: string;
    value: string;
    confidence?: string | null;
    first_seen?: string | null;
    source_id?: string;
  } | null;
  enrichment: Enrichment;
  score: number;
  error?: string;
};

/** Événement brut tel que renvoyé par `GET /api/enrich/events/:id`. */
export type EnrichedEvent = {
  id: string;
  dedup_key: string;
  family: string;
  assertion_type: string;
  title: string;
  summary: string | null;
  observed_at: string | null;
  collected_at: string | null;
  severity: number;
  confidence: string | null;
  source_id: string;
  source_url: string | null;
  evidence?: unknown;
  geo_type: string;
  lat: number | null;
  lon: number | null;
  org_id: number | null;
};

/** Réponse de `GET /api/enrich/events/:id`. */
export type EventEnrichment = {
  event: EnrichedEvent | null;
  indicators: { id: string; type: string; value: string }[];
  org: Org | null;
  enrichment: Enrichment | null;
  error?: string;
};

/** Actif (domaine, sous-domaine, IP…) rattaché à une organisation. */
export type OrgAsset = {
  value: string;
  kind: string;
  createdAt: string;
  source: string | null;
};

/** Compteur d'actifs par type. */
export type OrgAssetKind = { kind: string; n: number };

/** Compteur d'événements par famille. */
export type OrgEventFamily = { family: string; n: number };

/** Revendication (ligne de quarantaine) rattachée à une organisation. */
export type OrgClaim = {
  id: number;
  source: string;
  orgHint: string | null;
  groupe: string | null;
  tlp: string;
  claimedAt: string | null;
};

/** Point de la courbe d'exposition : un mois et son nombre d'événements. */
export type OrgExposurePoint = { month: string; count: number };

/** Réponse de `GET /api/orgs/:id` : fiche complète d'une organisation. */
export type OrgDetail = {
  org: Org;
  assets: { total: number; byKind: OrgAssetKind[]; recent: OrgAsset[] };
  events: { total: number; byFamily: OrgEventFamily[]; recent: Event[] };
  claims: { total: number; recent: OrgClaim[] };
  exposure: OrgExposurePoint[];
};

export const api = {
  login: (email: string, password: string) => postJson<LoginResponse>("/auth/login", { email, password }),
  logout: () => post<{ ok: boolean }>("/auth/logout"),
  orgs: () => get<Org[]>("/orgs"),
  orgDetail: (id: number) => get<OrgDetail>(`/orgs/${id}`),
  events: (limit = 100, order: "regional" | "recent" = "regional") =>
    get<Event[]>(`/events?limit=${limit}&order=${order}`),
  graph: (days = 90) => get<Graph>(`/graph?days=${days}`),
  sources: () => get<Source[]>("/sources"),
  stats: () => get<Stats>("/stats"),
  health: () => get<Health>("/health"),
  flows: (days = 30, limit = 300, mode = "arcs") => get<Flows>(`/flows?days=${days}&limit=${limit}&mode=${mode}`),
  alerts: (params: AlertQuery = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.severity) qs.set("severity", String(params.severity));
    qs.set("limit", String(params.limit ?? 500));
    return get<Alert[]>(`/alerts?${qs.toString()}`);
  },
  alertStats: () => get<AlertStatRow[]>("/alerts/stats"),
  ackAlert: (id: number) => post<{ ok: boolean }>(`/alerts/${id}/ack`),
  resolveAlert: (id: number) => post<{ ok: boolean }>(`/alerts/${id}/resolve`),
  enrichIndicator: (id: number) => get<IndicatorEnrichment>(`/enrich/indicator/${id}`),
  enrichEvent: (id: number) => get<EventEnrichment>(`/enrich/events/${id}`),
};
