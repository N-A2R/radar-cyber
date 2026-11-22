/**
 * Schémas Zod servant de source unique à la spec OpenAPI et au client
 * généré. Les objets de réponse sont `passthrough` : les champs stables sont
 * déclarés, les champs additionnels restent possibles sans figer le contrat.
 */
import { z } from "zod";
import { JournalQuery } from "../routes/journal.js";
import { QueueQuery, DecisionBody, RefuserSansIndiceBody } from "../routes/review.js";
import { MorteBody } from "../routes/sources.js";
import { CreateKeyBody, KeyIdParams } from "../routes/keys.js";

export { JournalQuery, QueueQuery, DecisionBody, RefuserSansIndiceBody, MorteBody, CreateKeyBody, KeyIdParams };

const Id = z.union([z.string(), z.number().int()]);
const nullableString = z.string().nullable();

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().nullable(),
  }),
});

export const Ok = z.object({ ok: z.boolean() }).passthrough();
export const Health = z.object({ ok: z.boolean(), sources: z.number().int() });
export const Event = z.object({ id: Id, title: z.string(), family: z.string() }).passthrough();
export const EventList = z.object({ events: z.array(Event) }).passthrough();
export const EventRows = z.array(Event);
export const Org = z.object({ id: Id, name: z.string(), slug: nullableString.optional() }).passthrough();
export const OrgList = z.object({ rows: z.array(Org), total: z.number().int() }).passthrough();
export const OrgDetail = z.object({ org: Org }).passthrough();
export const Directory = z.object({
  rows: z.array(Org.passthrough()),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  facets: z.record(z.string(), z.array(z.object({ value: z.string(), count: z.number().int() }))),
}).passthrough();
export const SourceList = z.array(z.object({ id: z.string(), name: z.string(), family: z.string() }).passthrough());
export const Stats = z.object({}).passthrough();
export const Flows = z.object({ arcs: z.array(z.object({}).passthrough()), total: z.number().int(), truncated: z.boolean() }).passthrough();
export const Graph = z.object({ nodes: z.array(z.object({}).passthrough()), links: z.array(z.object({}).passthrough()) }).passthrough();
export const SearchResults = z.object({ orgs: z.array(z.object({}).passthrough()), events: z.array(z.object({}).passthrough()), indicators: z.array(z.object({}).passthrough()) });
export const Today = z.object({
  compteurs: z.object({ evenements24h: z.number().int(), organisations7j: z.number().int(), derniereCollecte: nullableString }).passthrough(),
  evenements: z.array(z.object({}).passthrough()),
}).passthrough();
export const Alerts = z.array(z.object({}).passthrough());
export const Quarantine = z.object({}).passthrough();
export const Journal = z.object({ rows: z.array(z.object({}).passthrough()), limite: z.number().int(), avant: z.number().int().nullable() }).passthrough();
export const ReviewQueue = z.object({}).passthrough();
export const Coverage = z.object({ hashCorpus: z.string(), publiable: z.boolean() }).passthrough();
export const HealthDetail = z.object({}).passthrough();
export const HealthSources = z.object({}).passthrough();
export const Enrichment = z.object({}).passthrough();
export const Dossier = z.object({}).passthrough();
export const Stream = z.string();
export const Csv = z.string();
export const KeyRow = z.object({
  id: z.number().int(), name: z.string(), prefix: z.string(),
  scope: z.enum(["read", "write"]), quota: z.number().int(), used: z.number().int(),
  createdAt: z.string(), lastUsedAt: nullableString, revokedAt: nullableString,
});
export const KeyList = z.object({ keys: z.array(KeyRow) });
export const KeyCreated = KeyRow.extend({ key: z.string() });
export const DecisionResult = z.object({ ok: z.boolean() }).passthrough();
export const AuthLogin = z.object({ token: z.string(), user: z.object({ id: z.number().int(), email: z.string(), role: z.string() }).passthrough() });
export const AuthUser = z.object({ id: z.number().int(), email: z.string(), role: z.string(), displayName: nullableString.optional() });

/** Carte des composants réutilisables : chaque entrée devient un $ref OpenAPI. */
export const SCHEMAS = {
  ErrorBody, Ok, Health, Event, EventList, EventRows, Org, OrgList, OrgDetail, Directory,
  SourceList, Stats, Flows, Graph, SearchResults, Today, Alerts, Quarantine,
  Journal, ReviewQueue, Coverage, HealthDetail, HealthSources, Enrichment, Dossier, Stream, Csv,
  KeyRow, KeyList, KeyCreated, DecisionResult, AuthLogin, AuthUser,
} as const;

export type SchemaName = keyof typeof SCHEMAS;

/** Schémas d'entrée réellement utilisés par les routes (Zod existants). */
export const INPUT_SCHEMAS = {
  JournalQuery, QueueQuery, DecisionBody, RefuserSansIndiceBody, MorteBody, CreateKeyBody, KeyIdParams,
} as const;
