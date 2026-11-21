/**
 * Génère le client TypeScript de l'API publique depuis le catalogue Zod.
 * `OPERATIONS` est la source unique : une route ajoutée au catalogue gagne
 * automatiquement sa méthode typée ici.
 *
 *   pnpm -F @radar/api exec tsx ../../scripts/generate-api-client.mts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OPERATIONS } from "../apps/api/src/openapi/catalog.js";
import * as CatalogSchemas from "../apps/api/src/openapi/catalog.js";
import * as SchemaModule from "../apps/api/src/openapi/schemas.js";
import { API_VERSION } from "../apps/api/src/openapi/version.js";

const OUTPUT = fileURLToPath(new URL("../apps/api/src/openapi/client.generated.ts", import.meta.url));

/** Nom Zod d'un schéma du catalogue ou des schémas de réponse. */
function schemaNames(): Map<unknown, { name: string; module: "Schemas" | "Catalog" }> {
  const names = new Map<unknown, { name: string; module: "Schemas" | "Catalog" }>();
  for (const [name, value] of Object.entries(SchemaModule)) {
    if (typeof value === "object" && value !== null && "safeParse" in value) {
      names.set(value, { name, module: "Schemas" });
    }
  }
  for (const [name, value] of Object.entries(CatalogSchemas)) {
    if (typeof value === "object" && value !== null && "safeParse" in value && !names.has(value)) {
      names.set(value, { name, module: "Catalog" });
    }
  }
  return names;
}

function methodName(operationId: string): string {
  return operationId[0]!.toLowerCase() + operationId.slice(1);
}

export function generateClientSource(): string {
  const names = schemaNames();
  const aliases = new Map<string, "Schemas" | "Catalog">(
    Object.keys(SchemaModule.SCHEMAS).map((name) => [name, "Schemas" as const]),
  );
  for (const op of OPERATIONS) {
    for (const schema of [op.params, op.query, op.body]) {
      if (!schema) continue;
      const found = names.get(schema);
      if (!found) throw new Error("schéma non exporté : impossible de générer le client");
      if (!aliases.has(found.name)) aliases.set(found.name, found.module);
    }
  }
  const ref = (schema: unknown): string => {
    const found = names.get(schema);
    if (!found) throw new Error("schéma non exporté : impossible de générer le client");
    return found.name;
  };

  const lines: string[] = [
    "// Généré par scripts/generate-api-client.mts — ne pas éditer à la main.",
    `// API v${API_VERSION} — ${OPERATIONS.length} opérations.`,
    'import type { z } from "zod";',
    'import type * as Schemas from "./schemas.js";',
    'import type * as Catalog from "./catalog.js";',
    "",
  ];
  for (const [name, module] of aliases) {
    lines.push(`export type ${name} = z.infer<typeof ${module}.${name}>;`);
  }
  lines.push(
    "",
    "export interface RequestOptions {",
    '  /** Racine des requêtes : "/api/v1" par défaut, "/api" pour l’alias historique. */',
    "  baseUrl?: string;",
    "  apiKey?: string;",
    "  token?: string;",
    "  fetch?: typeof globalThis.fetch;",
    "  signal?: AbortSignal;",
    "}",
    "",
    "export class ApiClientError extends Error {",
    "  constructor(readonly status: number, readonly body: unknown) {",
    "    super(`HTTP ${status}`);",
    "    this.name = \"ApiClientError\";",
    "  }",
    "}",
    "",
    "function pathOf(template: string, params: Record<string, string | number | undefined>): string {",
    "  return template.replace(/\\{([A-Za-z0-9_]+)\\}/g, (_, key: string) =>",
    "    encodeURIComponent(String(params[key] ?? \"\")));",
    "}",
    "",
    "function withQuery(path: string, query?: Record<string, unknown>): string {",
    "  const search = new URLSearchParams();",
    "  for (const [key, value] of Object.entries(query ?? {})) {",
    "    if (value !== undefined && value !== null) search.set(key, String(value));",
    "  }",
    "  const suffix = search.toString();",
    "  return suffix ? `${path}?${suffix}` : path;",
    "}",
    "",
    "async function request<T>(path: string, method: string, body: unknown, options?: RequestOptions): Promise<T> {",
    "  const base = (options?.baseUrl ?? \"/api/v1\").replace(/\\/$/, \"\");",
    "  const headers: Record<string, string> = {};",
    "  if (body !== undefined) headers[\"content-type\"] = \"application/json\";",
    "  if (options?.token) headers.authorization = `Bearer ${options.token}`;",
    "  if (options?.apiKey) headers[\"x-api-key\"] = options.apiKey;",
    "  const res = await (options?.fetch ?? globalThis.fetch)(`${base}${path}`, {",
    "    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: options?.signal,",
    "  });",
    "  const text = await res.text();",
    "  const type = res.headers.get(\"content-type\") ?? \"\";",
    "  const parsed = type.includes(\"json\") && text.length > 0 ? JSON.parse(text) : text;",
    "  if (!res.ok) throw new ApiClientError(res.status, parsed);",
    "  return parsed as T;",
    "}",
    "",
    "export function createRadarClient(options?: RequestOptions) {",
    "  return {",
  );

  for (const op of OPERATIONS) {
    const fields: string[] = [];
    const paramKeys = [...op.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
    if (op.params) fields.push(`params: { ${paramKeys.map((k) => `${k}: string | number`).join("; ")} }`);
    if (op.query) fields.push(`query?: ${ref(op.query)}`);
    if (op.body) fields.push(`body: ${ref(op.body)}`);
    const argsType = fields.length > 0 ? `{ ${fields.join("; ")} }` : "Record<string, never>";
    const optional = fields.length === 0 ? "?" : "";
    const template = op.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const target = op.params ? `pathOf("${template}", args.params)` : `"${template}"`;
    const url = op.query ? `withQuery(${target}, args${optional}?.query)` : target;
    const body = op.body ? "args.body" : "undefined";
    lines.push(
      `    ${methodName(op.operationId)}: (args${optional}: ${argsType}, call?: RequestOptions) =>`,
      `      request<${op.response}>(${url}, "${op.method.toUpperCase()}", ${body}, { ...options, ...call }),`,
    );
  }
  lines.push("  };", "}", "");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUTPUT, generateClientSource());
  console.log(`client généré : ${OUTPUT} (${OPERATIONS.length} opérations)`);
}
