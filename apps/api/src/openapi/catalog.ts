/**
 * Catalogue des opérations publiques. Une seule source pour la spec OpenAPI,
 * la page Swagger UI, le quota et le client TypeScript généré : ajouter une
 * opération ici la rend visible partout. Les schémas d'entrée sont les schémas
 * Zod utilisés par les routes, convertis en JSON Schema par z.toJSONSchema.
 */
import { z } from "zod";
import {
  JournalQuery, QueueQuery, DecisionBody, RefuserSansIndiceBody, MorteBody, CreateKeyBody,
  type SchemaName,
} from "./schemas.js";
import { createOrgFromHintSchema } from "../quarantine/from-hint.js";
export { createOrgFromHintSchema };

export type Method = "get" | "post" | "delete";
export type Security = "public" | "session" | "public-or-session" | "key" | "write-key";

export type Operation = {
  method: Method;
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  response: SchemaName;
  status?: number;
  security: Security;
  query?: z.ZodType;
  params?: z.ZodType;
  body?: z.ZodType;
  /** `text/csv` ou `text/event-stream` : la réponse n'est pas du JSON. */
  contentType?: string;
};

const intQuery = (max: number, fallback?: number) => {
  const schema = z.coerce.number().int().min(0).max(max).optional();
  return fallback === undefined ? schema : schema.describe(`Défaut : ${fallback}`);
};

export const EventsQuery = z.object({
  limit: intQuery(500, 100),
  family: z.string().optional(),
  orgId: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  sinceId: z.coerce.number().int().optional(),
  before: z.coerce.number().int().optional(),
  portee: z.enum(["region", "vulnerabilites", "toutes"]).optional(),
  order: z.enum(["regional", "recent"]).optional(),
  sort: z.enum(["observed", "collected"]).optional(),
});

export const DirectoryQuery = z.object({
  q: z.string().max(120).optional(),
  kind: z.string().optional(),
  sector: z.string().optional(),
  dept: z.string().regex(/^[0-9ABab]{2,3}$/).optional(),
  withEvents: z.enum(["0", "1", "true", "false"]).optional(),
  withoutEvents: z.enum(["0", "1", "true", "false"]).optional(),
  sort: z.enum(["relevance", "name", "eventCount", "city", "dept"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: intQuery(1000, 0),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const OrgsQuery = z.object({
  limit: intQuery(500),
  offset: intQuery(100000),
  asOf: z.string().optional(),
  as_of: z.string().optional(),
});

export const SearchQuery = z.object({ q: z.string().max(200).optional() });
export const FlowsQuery = z.object({
  mode: z.enum(["arcs", "departements", "secteurs"]).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const DaysQuery = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });
export const HistoryQuery = z.object({
  from: z.string().optional(), to: z.string().optional(),
  org: z.string().optional(), limit: intQuery(500),
});
export const QuarantineQuery = z.object({
  limit: intQuery(200), page: intQuery(1000), q: z.string().max(200).optional(),
  bucket: z.enum(["chaud", "tiede", "froid"]).optional(),
});
export const StreamQuery = z.object({ token: z.string().optional(), sinceId: z.coerce.number().int().optional() });
export const TodayQuery = z.object({ jours: intQuery(365), dept: z.string().optional() });
export const DeptQuery = z.object({ jours: intQuery(365) });
export const IdParam = z.object({ id: z.string().min(1) });
export const ValueParam = z.object({ value: z.string().min(1) });
export const IngestBody = z.object({ events: z.array(z.object({}).passthrough()) });
export const RegisterBody = z.object({
  email: z.string().trim(), password: z.string().min(1),
  role: z.enum(["admin", "analyste", "lecteur"]).optional(), displayName: z.string().optional(),
});
export const LoginBody = z.object({ email: z.string().trim(), password: z.string().min(1) });
export const ReviewBody = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
  action: z.enum(["promote", "reject", "review", "undo"]),
  reason: z.string().max(500).optional(),
});

/** Chaque entrée = une opération réellement enregistrée dans app.ts. */
export const OPERATIONS: Operation[] = [
  { method: "get", path: "/health", operationId: "getHealth", summary: "Santé de l'API et nombre de sources", tag: "Système", response: "Health", security: "public" },
  { method: "get", path: "/health/detail", operationId: "getHealthDetail", summary: "État détaillé des collecteurs et des sources", tag: "Système", response: "HealthDetail", security: "public" },
  { method: "get", path: "/health/sources", operationId: "getHealthSources", summary: "Page du tableau des sources (écran Santé)", tag: "Système", response: "HealthSources", security: "public" },
  { method: "get", path: "/health/causes", operationId: "getHealthCauses", summary: "Causes des sources en échec", tag: "Système", response: "Stats", security: "public" },

  { method: "get", path: "/events", operationId: "getEvents", summary: "Événements filtrés et paginés", tag: "Événements", response: "EventRows", security: "public-or-session", query: EventsQuery },
  { method: "get", path: "/history", operationId: "getHistory", summary: "Historique des événements", tag: "Événements", response: "EventList", security: "public", query: HistoryQuery },
  { method: "get", path: "/today", operationId: "getToday", summary: "Compteurs et événements du jour", tag: "Événements", response: "Today", security: "public", query: TodayQuery },
  { method: "get", path: "/today/departements", operationId: "getTodayDepartements", summary: "Activité par département aujourd'hui", tag: "Territoire", response: "Stats", security: "public" },
  { method: "get", path: "/stream", operationId: "streamEvents", summary: "Flux SSE des nouveaux événements", tag: "Événements", response: "Stream", security: "public-or-session", query: StreamQuery, contentType: "text/event-stream" },
  { method: "get", path: "/na/overview", operationId: "getNaOverview", summary: "Vue d'ensemble Nouvelle-Aquitaine", tag: "Territoire", response: "Stats", security: "public" },
  { method: "get", path: "/na/events", operationId: "getNaEvents", summary: "Événements régionaux", tag: "Territoire", response: "EventList", security: "public", query: DeptQuery },

  { method: "get", path: "/orgs", operationId: "getOrgs", summary: "Organisations du référentiel", tag: "Organisations", response: "OrgList", security: "public", query: OrgsQuery },
  { method: "get", path: "/orgs/:id", operationId: "getOrg", summary: "Fiche d'une organisation", tag: "Organisations", response: "OrgDetail", security: "public-or-session", params: IdParam },
  { method: "get", path: "/directory", operationId: "getDirectory", summary: "Annuaire paginé et facetté", tag: "Organisations", response: "Directory", security: "public", query: DirectoryQuery },
  { method: "get", path: "/orgs/liees", operationId: "getOrgsLiees", summary: "Organisations reliées entre elles", tag: "Organisations", response: "OrgList", security: "session" },
  { method: "get", path: "/orgs/liees/historique", operationId: "getOrgsLieesHistorique", summary: "Historique des organisations reliées", tag: "Organisations", response: "Stats", security: "public", query: DaysQuery },
  { method: "post", path: "/orgs/from-hint", operationId: "createOrgFromHint", summary: "Créer une organisation depuis un indice", tag: "Organisations", response: "OrgDetail", security: "session", status: 201, body: createOrgFromHintSchema },

  { method: "get", path: "/search", operationId: "search", summary: "Recherche organisations, événements, indicateurs", tag: "Recherche", response: "SearchResults", security: "public", query: SearchQuery },
  { method: "get", path: "/graph", operationId: "getGraph", summary: "Graphe des relations", tag: "Recherche", response: "Graph", security: "public", query: DaysQuery },
  { method: "get", path: "/dossier", operationId: "getDossier", summary: "Dossier de reprise au format JSON", tag: "Recherche", response: "Dossier", security: "public" },
  { method: "get", path: "/stats", operationId: "getStats", summary: "Statistiques globales", tag: "Statistiques", response: "Stats", security: "public" },
  { method: "get", path: "/stats/departements", operationId: "getStatsDepartements", summary: "Statistiques par département sur 7 jours", tag: "Statistiques", response: "Stats", security: "public" },
  { method: "get", path: "/couverture", operationId: "getCouverture", summary: "Couverture mesurée du corpus", tag: "Statistiques", response: "Coverage", security: "public" },
  { method: "get", path: "/flows", operationId: "getFlows", summary: "Flux d'attaques et de signalements", tag: "Statistiques", response: "Flows", security: "public", query: FlowsQuery },

  { method: "get", path: "/sources", operationId: "getSources", summary: "Registre des sources", tag: "Sources", response: "SourceList", security: "public" },
  { method: "post", path: "/sources/:id/collecte", operationId: "recollectSource", summary: "Relancer la collecte d'une source", tag: "Sources", response: "Ok", security: "session", params: IdParam, status: 202 },
  { method: "post", path: "/sources/:id/morte", operationId: "markSourceDead", summary: "Déclarer une source morte", tag: "Sources", response: "Ok", security: "session", params: IdParam, body: MorteBody },
  { method: "post", path: "/sources/:id/reactiver", operationId: "reactivateSource", summary: "Réactiver une source", tag: "Sources", response: "Ok", security: "session", params: IdParam, body: MorteBody },
  { method: "post", path: "/ingest", operationId: "ingestEvents", summary: "Ingérer des événements", tag: "Écriture", response: "DecisionResult", security: "session", body: IngestBody, status: 200 },

  { method: "get", path: "/enrich/indicator/:id", operationId: "getIndicatorEnrichment", summary: "Enrichissement d'un indicateur", tag: "Enrichissement", response: "Enrichment", security: "public", params: IdParam },
  { method: "get", path: "/enrich/domain/:value", operationId: "getDomainEnrichment", summary: "Enrichissement d'un domaine", tag: "Enrichissement", response: "Enrichment", security: "public", params: ValueParam },
  { method: "get", path: "/enrich/events/:id", operationId: "getEventEnrichment", summary: "Enrichissement d'un événement", tag: "Enrichissement", response: "Enrichment", security: "public", params: IdParam },

  { method: "get", path: "/alerts", operationId: "getAlerts", summary: "Alertes ouvertes", tag: "Alertes", response: "Alerts", security: "public", query: QuarantineQuery },
  { method: "get", path: "/alerts/stats", operationId: "getAlertStats", summary: "Compteurs d'alertes", tag: "Alertes", response: "Stats", security: "public" },
  { method: "get", path: "/alerts/:id", operationId: "getAlert", summary: "Détail d'une alerte", tag: "Alertes", response: "Stats", security: "session", params: IdParam },
  { method: "post", path: "/alerts/:id/ack", operationId: "ackAlert", summary: "Accuser réception d'une alerte", tag: "Alertes", response: "Ok", security: "session", params: IdParam },
  { method: "post", path: "/alerts/:id/resolve", operationId: "resolveAlert", summary: "Résoudre une alerte", tag: "Alertes", response: "Ok", security: "session", params: IdParam },

  { method: "get", path: "/quarantine", operationId: "getQuarantine", summary: "Faits en quarantaine", tag: "Quarantaine", response: "Quarantine", security: "public", query: QuarantineQuery },
  { method: "get", path: "/quarantine/stats", operationId: "getQuarantineStats", summary: "Statistiques de la quarantaine", tag: "Quarantaine", response: "Stats", security: "public" },
  { method: "get", path: "/quarantine/queue", operationId: "getQuarantineQueue", summary: "File de revue de la quarantaine", tag: "Quarantaine", response: "ReviewQueue", security: "public", query: QueueQuery },
  { method: "post", path: "/quarantine/review", operationId: "reviewQuarantine", summary: "Décider d'un fait en quarantaine", tag: "Quarantaine", response: "DecisionResult", security: "session", body: ReviewBody },
  { method: "post", path: "/quarantine/:id/promote", operationId: "promoteQuarantine", summary: "Promouvoir un fait en événement", tag: "Quarantaine", response: "DecisionResult", security: "session", params: IdParam },

  { method: "get", path: "/review/queue", operationId: "getReviewQueue", summary: "File de revue", tag: "Revue", response: "ReviewQueue", security: "session", query: QueueQuery },
  { method: "get", path: "/review/stats", operationId: "getReviewStats", summary: "Statistiques de revue", tag: "Revue", response: "Stats", security: "session" },
  { method: "post", path: "/review/refuser-sans-indice", operationId: "rejectWithoutHint", summary: "Refuser tous les faits sans indice", tag: "Revue", response: "DecisionResult", security: "session", body: RefuserSansIndiceBody },
  { method: "post", path: "/review/:id/decision", operationId: "decideReview", summary: "Décider d'une revue", tag: "Revue", response: "DecisionResult", security: "session", params: IdParam, body: DecisionBody },

  { method: "get", path: "/journal/review", operationId: "getReviewJournal", summary: "Journal des décisions de revue", tag: "Revue", response: "Journal", security: "session", query: JournalQuery },
  { method: "get", path: "/journal/review/export.csv", operationId: "exportReviewJournal", summary: "Exporter le journal en CSV", tag: "Revue", response: "Csv", security: "session", contentType: "text/csv" },

  { method: "post", path: "/auth/register", operationId: "register", summary: "Créer un compte (admin requis après le bootstrap)", tag: "Authentification", response: "AuthUser", security: "public", status: 201, body: RegisterBody },
  { method: "post", path: "/auth/login", operationId: "login", summary: "Obtenir un jeton de session", tag: "Authentification", response: "AuthLogin", security: "public", body: LoginBody },
  { method: "post", path: "/auth/logout", operationId: "logout", summary: "Révoquer le jeton de session", tag: "Authentification", response: "Ok", security: "session" },
  { method: "get", path: "/auth/me", operationId: "getMe", summary: "Compte authentifié", tag: "Authentification", response: "AuthUser", security: "session" },

  { method: "post", path: "/keys", operationId: "createApiKey", summary: "Créer une clé d'API avec quota", tag: "Clés d'API", response: "KeyCreated", security: "session", status: 201, body: CreateKeyBody },
  { method: "get", path: "/keys", operationId: "listApiKeys", summary: "Lister ses clés d'API", tag: "Clés d'API", response: "KeyList", security: "session" },
  { method: "delete", path: "/keys/:id", operationId: "revokeApiKey", summary: "Révoquer une clé d'API", tag: "Clés d'API", response: "Ok", security: "session", params: IdParam },
];
