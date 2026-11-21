/** Génération de la spec OpenAPI 3.1 à partir des schémas Zod du catalogue. */
import { z } from "zod";
import { OPERATIONS, type Operation, type Security } from "./catalog.js";
import { SCHEMAS } from "./schemas.js";
import { API_VERSION } from "./version.js";

type Doc = Record<string, any>;

const SECURITY: Record<Security, Doc[]> = {
  public: [],
  session: [{ SessionBearer: [] }],
  "public-or-session": [{}, { SessionBearer: [] }],
  key: [{ ApiKeyAuth: [] }],
  "write-key": [{ SessionBearer: [] }, { ApiKeyAuth: [] }],
};

function jsonSchema(schema: z.ZodType): Doc {
  return z.toJSONSchema(schema, { target: "openapi-3.1", io: "output" }) as Doc;
}

function parameters(schema: z.ZodType | undefined, place: "query" | "path"): Doc[] {
  if (!schema) return [];
  const converted = jsonSchema(schema);
  const required: string[] = converted.required ?? [];
  return Object.entries(converted.properties ?? {}).map(([name, s]) => ({
    name,
    in: place,
    required: place === "path" ? true : required.includes(name),
    schema: s,
  }));
}

function operationDoc(op: Operation): Doc {
  const success = String(op.status ?? 200);
  const content = op.contentType ?? "application/json";
  const successSchema: Doc = content === "application/json"
    ? { $ref: `#/components/schemas/${op.response}` }
    : { type: "string" };
  const errorRef = { $ref: "#/components/schemas/ErrorBody" };
  const doc: Doc = {
    tags: [op.tag],
    summary: op.summary,
    operationId: op.operationId,
    security: SECURITY[op.security],
    parameters: [...parameters(op.params, "path"), ...parameters(op.query, "query")],
    responses: {
      [success]: { description: "Succès", content: { [content]: { schema: successSchema } } },
      "400": { description: "Requête invalide", content: { "application/json": { schema: errorRef } } },
      "401": { description: "Authentification requise", content: { "application/json": { schema: errorRef } } },
      "403": { description: "Droits insuffisants", content: { "application/json": { schema: errorRef } } },
      "429": { description: "Quota épuisé", content: { "application/json": { schema: errorRef } } },
    },
  };
  if (op.body) {
    doc.requestBody = {
      required: true,
      content: { "application/json": { schema: jsonSchema(op.body) } },
    };
  }
  return doc;
}

/** Un path Fastify `/orgs/:id` devient `/orgs/{id}` en OpenAPI. */
export function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function buildOpenApi(): Doc {
  const paths: Doc = {};
  for (const op of OPERATIONS) {
    const path = openApiPath(op.path);
    paths[path] ??= {};
    paths[path]![op.method] = operationDoc(op);
  }
  const components: Doc = {
    schemas: {},
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey", in: "header", name: "X-API-Key",
        description: "Clé publique créée via POST /keys. Quota par fenêtre de 60 s ; une clé sans quota est refusée avec 429.",
      },
      SessionBearer: { type: "http", scheme: "bearer", description: "Jeton obtenu via POST /auth/login." },
    },
  };
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    components.schemas[name] = jsonSchema(schema);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Radar Cyber API",
      version: API_VERSION,
      description: "API publique de l'observatoire. Lectures publiques limitées, écritures authentifiées. Les clés d'API portent leur propre quota.",
    },
    servers: [
      { url: "/api/v1", description: "Version 1 (recommandée)" },
      { url: "/api", description: "Alias historique" },
    ],
    tags: Array.from(new Set(OPERATIONS.map((op) => op.tag))).map((name) => ({ name })),
    paths,
    components,
  };
}

export function documentedRouteCount(spec: Doc = buildOpenApi()): number {
  return Object.values(spec.paths as Doc).reduce((n: number, item: Doc) => n + Object.keys(item).length, 0);
}
