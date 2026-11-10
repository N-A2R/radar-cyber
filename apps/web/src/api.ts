const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
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
  geoType: string;
  lat: number | null;
  lon: number | null;
  orgId: number | null;
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

export type Stats = {
  orgs: number;
  events: number;
  indicators: number;
  sources: { ok: number; err: number; total: number };
  byFamily: { family: string; n: number }[];
  byAssertion: { assertion_type: string; n: number }[];
};

export type Graph = {
  nodes: { id: string; label: string; kind: "org" | "family" | "group" | "asset" }[];
  links: { source: string; target: string; type: string }[];
};

export const api = {
  orgs: () => get<Org[]>("/orgs"),
  events: (limit = 100) => get<Event[]>(`/events?limit=${limit}`),
  graph: (days = 90) => get<Graph>(`/graph?days=${days}`),
  sources: () => get<Source[]>("/sources"),
  stats: () => get<Stats>("/stats"),
  health: () => get<{ ok: boolean; sources: unknown[] }>("/health"),
};
