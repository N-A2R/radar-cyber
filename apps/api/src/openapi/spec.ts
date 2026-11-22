/** Génération de la spec OpenAPI 3.1 à partir des schémas Zod du catalogue. */
import { z } from "zod";
import { OPERATIONS, type Operation, type Security } from "./catalog.js";
import { SCHEMAS, INPUT_SCHEMAS } from "./schemas.js";
import { API_VERSION } from "./version.js";
import { buildExamples, exampleRequest, type OperationExample } from "./examples.js";

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

function parameters(
  schema: z.ZodType | undefined,
  place: "query" | "path",
  examples: Record<string, string | number>,
): Doc[] {
  if (!schema) return [];
  const converted = jsonSchema(schema);
  const required: string[] = converted.required ?? [];
  return Object.entries(converted.properties ?? {}).map(([name, s]) => ({
    name,
    in: place,
    required: place === "path" ? true : required.includes(name),
    schema: s,
    example: examples[name],
  }));
}

function operationDoc(op: Operation, example: OperationExample): Doc {
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
    parameters: [
      ...parameters(op.params, "path", example.params),
      ...parameters(op.query, "query", example.query),
    ],
    responses: {
      [success]: {
        description: "Succès",
        content: { [content]: { schema: successSchema, example: example.response } },
      },
      "400": { description: "Requête invalide", content: { "application/json": { schema: errorRef } } },
      "401": { description: "Authentification requise", content: { "application/json": { schema: errorRef } } },
      "403": { description: "Droits insuffisants", content: { "application/json": { schema: errorRef } } },
      "429": { description: "Quota épuisé", content: { "application/json": { schema: errorRef } } },
    },
    "x-request-example": exampleRequest(op, example),
  };
  if (op.body) {
    doc.requestBody = {
      required: true,
      content: { "application/json": { schema: jsonSchema(op.body), example: example.body } },
    };
  }
  return doc;
}

/** Un path Fastify `/orgs/:id` devient `/orgs/{id}` en OpenAPI. */
export function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function buildOpenApi(): Doc {
  const examples = buildExamples();
  const paths: Doc = {};
  for (const op of OPERATIONS) {
    const path = openApiPath(op.path);
    paths[path] ??= {};
    paths[path]![op.method] = operationDoc(op, examples.get(op.operationId)!);
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
  for (const [name, schema] of Object.entries({ ...SCHEMAS, ...INPUT_SCHEMAS })) {
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

/** Number of operations publishing both a runnable request and a response example. */
export function executableExampleCount(spec: Doc = buildOpenApi()): number {
  let count = 0;
  for (const item of Object.values(spec.paths as Doc)) {
    for (const operation of Object.values(item as Doc) as Doc[]) {
      if (!operation?.["x-request-example"]) continue;
      const status = Object.keys(operation.responses ?? {})[0];
      const media = Object.keys(operation.responses?.[status]?.content ?? {})[0];
      if (operation.responses?.[status]?.content?.[media]?.example !== undefined) count += 1;
    }
  }
  return count;
}
