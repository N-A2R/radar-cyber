/**
 * Executable examples for every operation of the public API.
 *
 * Values come from the same Zod schemas that validate the real routes, with
 * curated overrides for the documented Nouvelle-Aquitaine baseline. Every
 * organisation and domain below is synthetic: no victim personal data is used.
 */
import { z } from "zod";
import { OPERATIONS, type Operation } from "./catalog.js";
import { SCHEMAS, type SchemaName } from "./schemas.js";

type Doc = Record<string, any>;

/** Counters published in docs/couverture-mesuree.md, not recomputed here. */
export const BASELINE = {
  organisations: 1_673_151,
  sources: 312,
  evenements: 26_719,
  archivedEvenements: 4_710,
  region: "Nouvelle-Aquitaine",
  provenance: "docs/couverture-mesuree.md",
} as const;

export type OperationExample = {
  operationId: string;
  params: Record<string, string>;
  query: Record<string, string | number>;
  body?: unknown;
  response: unknown;
};

const SAMPLES: Record<string, unknown> = {
  id: 1,
  ids: [1],
  value: "example.org",
  q: "hospital",
  dept: "33",
  limit: 5,
  limite: 20,
  page: 0,
  offset: 0,
  days: 7,
  jours: 7,
  sinceId: 0,
  before: 0,
  from: "2026-11-01",
  to: "2026-11-22",
  du: "2026-11-01",
  au: "2026-11-22",
  acteur: "demo-user",
  org: "example-hospital",
  family: "phishing",
  bucket: "tiede",
  action: "review",
  decision: "refuser",
  raison: "Reviewed from public sources in Nouvelle-Aquitaine",
  reason: "Reviewed from public sources in Nouvelle-Aquitaine",
  name: "demo-key",
  email: "demo@example.org",
  password: "demo-password",
  displayName: "Demo User",
  role: "lecteur",
  scope: "read",
  quota: 60,
  token: "demo-session-token",
  key: "rdk_demo-key",
  nom: "Example Hospital",
  ville: "Bordeaux",
  source: "public bulletin",
  preuve: "Public source reviewed in Nouvelle-Aquitaine",
  hashCorpus: "e2ad03ba4407d3d134d3108187dd7983fdb6f9c51167c38e9c4160ef84ffb3a1",
  title: "Phishing campaign against a Nouvelle-Aquitaine organisation",
  slug: "example-hospital",
  sources: BASELINE.sources,
  organisations: BASELINE.organisations,
  evenements: BASELINE.evenements,
  total: BASELINE.organisations,
};

function sampleJson(schema: Doc, defs: Doc, field?: string): unknown {
  if (schema.$ref && typeof schema.$ref === "string") {
    const name = schema.$ref.split("/").pop() ?? "";
    return sampleJson(defs[name] ?? {}, defs, field);
  }
  if (field && Object.hasOwn(SAMPLES, field)) return SAMPLES[field];
  if (Object.hasOwn(schema, "default")) return schema.default;
  if (Object.hasOwn(schema, "const")) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  const variants = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(variants)) {
    const usable = variants.filter((variant: Doc) => variant.type !== "null");
    return sampleJson(usable[0] ?? variants[0] ?? {}, defs, field);
  }
  if (Array.isArray(schema.allOf)) {
    return Object.assign({}, ...schema.allOf.map((part: Doc) => sampleJson(part, defs, field)));
  }
  const type = Array.isArray(schema.type)
    ? schema.type.find((candidate: string) => candidate !== "null") ?? "string"
    : schema.type;
  if (type === "object" || schema.properties) {
    const properties: Doc = schema.properties ?? {};
    const out: Doc = {};
    for (const [name, property] of Object.entries(properties)) {
      out[name] = sampleJson(property as Doc, defs, name);
    }
    return out;
  }
  if (type === "array") return [sampleJson(schema.items ?? {}, defs, field)];
  if (type === "integer" || type === "number") {
    const min = typeof schema.minimum === "number" ? schema.minimum : 1;
    const max = typeof schema.maximum === "number" ? schema.maximum : min + 1;
    return Math.min(Math.max(min, 1), max);
  }
  if (type === "boolean") return true;
  if (typeof schema.format === "string" && schema.format.includes("date")) return "2026-11-22";
  if (field && typeof SAMPLES[field] === "string") return SAMPLES[field];
  return "example";
}

function jsonSchema(schema: z.ZodType, io: "input" | "output"): Doc {
  return z.toJSONSchema(schema, { target: "openapi-3.1", io }) as Doc;
}

function inputSample(schema: z.ZodType): Doc {
  const converted = jsonSchema(schema, "input");
  return sampleJson(converted, converted.$defs ?? {}) as Doc;
}

const RESPONSE_EXAMPLES: Partial<Record<SchemaName, unknown>> = {
  Ok: { ok: true },
  Health: { ok: true, sources: BASELINE.sources },
  HealthDetail: { ok: true, sources: BASELINE.sources, failing: [] },
  Stats: {
    region: BASELINE.region,
    organisations: BASELINE.organisations,
    sources: BASELINE.sources,
    evenements: BASELINE.evenements,
    archivedEvenements: BASELINE.archivedEvenements,
  },
  Event: { id: 1, title: SAMPLES.title, family: "phishing" },
  EventList: { events: [{ id: 1, title: SAMPLES.title, family: "phishing" }] },
  EventRows: [{ id: 1, title: SAMPLES.title, family: "phishing" }],
  Org: { id: 1, name: "Example Hospital", slug: "example-hospital" },
  OrgList: { rows: [{ id: 1, name: "Example Hospital", slug: "example-hospital" }], total: BASELINE.organisations },
  OrgDetail: { org: { id: 1, name: "Example Hospital", slug: "example-hospital" } },
  Directory: {
    rows: [{ id: 1, name: "Example Hospital", slug: "example-hospital" }],
    total: BASELINE.organisations,
    page: 0,
    limit: 5,
    facets: { dept: [{ value: "33", count: 12 }] },
  },
  SourceList: [{ id: "src-1", name: "Example public bulletin", family: "institution" }],
  Coverage: {
    hashCorpus: SAMPLES.hashCorpus,
    publiable: true,
    organisations: BASELINE.organisations,
    sources: BASELINE.sources,
    evenements: BASELINE.evenements,
  },
  Flows: { arcs: [], total: 0, truncated: false },
  Graph: { nodes: [], links: [] },
  SearchResults: { orgs: [], events: [], indicators: [] },
  Today: {
    compteurs: { evenements24h: 12, organisations7j: 3, derniereCollecte: "2026-11-22" },
    evenements: [],
  },
  Alerts: [],
  Quarantine: { total: 0, rows: [] },
  Journal: { rows: [], limite: 20, avant: null },
  ReviewQueue: { rows: [], total: 0 },
  Enrichment: { indicators: [], domains: [] },
  Dossier: { organisation: { id: 1, name: "Example Hospital" }, events: [] },
  DecisionResult: { ok: true, promoted: 0 },
  KeyRow: {
    id: 1, name: "demo-key", prefix: "rdk_demo", scope: "read",
    quota: 60, used: 0, createdAt: "2026-11-22T00:00:00.000Z",
    lastUsedAt: null, revokedAt: null,
  },
  KeyList: {
    keys: [{
      id: 1, name: "demo-key", prefix: "rdk_demo", scope: "read",
      quota: 60, used: 0, createdAt: "2026-11-22T00:00:00.000Z",
      lastUsedAt: null, revokedAt: null,
    }],
  },
  KeyCreated: {
    id: 1, name: "demo-key", prefix: "rdk_demo", scope: "read",
    quota: 60, used: 0, createdAt: "2026-11-22T00:00:00.000Z",
    lastUsedAt: null, revokedAt: null, key: "rdk_demo-key",
  },
  AuthLogin: {
    token: "demo-session-token",
    user: { id: 1, email: "demo@example.org", role: "lecteur" },
  },
  AuthUser: { id: 1, email: "demo@example.org", role: "lecteur", displayName: "Demo User" },
  Stream: "event: update\ndata: {\"id\":1,\"family\":\"phishing\"}\n\n",
  Csv: "date,organisation\n2026-11-22,Example Hospital\n",
};

function responseSample(name: SchemaName): unknown {
  if (Object.hasOwn(RESPONSE_EXAMPLES, name)) return RESPONSE_EXAMPLES[name];
  const converted = jsonSchema(SCHEMAS[name], "output");
  return sampleJson(converted, converted.$defs ?? {});
}

const CACHE = new Map<string, OperationExample>();

export function exampleFor(op: Operation): OperationExample {
  const cached = CACHE.get(op.operationId);
  if (cached) return cached;

  const params: Record<string, string> = {};
  if (op.params) {
    const converted = jsonSchema(op.params, "input");
    for (const name of Object.keys(converted.properties ?? {})) {
      params[name] = String(sampleJson(converted.properties![name] as Doc, converted.$defs ?? {}, name));
    }
  }
  const query = op.query ? (inputSample(op.query) as Record<string, string | number>) : {};
  const body = op.body ? inputSample(op.body) : undefined;
  const example: OperationExample = {
    operationId: op.operationId,
    params,
    query,
    ...(body === undefined ? {} : { body }),
    response: responseSample(op.response),
  };
  CACHE.set(op.operationId, example);
  return example;
}

export function buildExamples(): Map<string, OperationExample> {
  return new Map(OPERATIONS.map((op) => [op.operationId, exampleFor(op)]));
}

/** The documented example as a ready-to-send HTTP request. */
export function exampleRequest(
  op: Operation,
  example: OperationExample,
  prefix = "/api/v1",
): { method: string; url: string; headers: Record<string, string>; payload?: unknown } {
  let path = op.path;
  for (const [name, value] of Object.entries(example.params)) {
    path = path.replace(`:${name}`, encodeURIComponent(value));
  }
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(example.query)) search.set(name, String(value));
  const query = search.toString();

  const mediaType = op.contentType ?? "application/json";
  const headers: Record<string, string> = { accept: mediaType };
  if (op.contentType === "application/json" || op.body) headers["content-type"] = mediaType;
  if (op.security === "session" || op.security === "write-key") {
    headers.authorization = "Bearer demo-session-token";
  }
  if (op.security === "key" || op.security === "write-key") {
    headers["x-api-key"] = "rdk_demo-key";
  }
  return {
    method: op.method.toUpperCase(),
    url: `${prefix}${path}${query ? `?${query}` : ""}`,
    headers,
    ...(op.body ? { payload: example.body } : {}),
  };
}
