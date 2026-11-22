/**
 * API v1 stability commitment. The policy is published in the OpenAPI document
 * and in the `X-API-Stability` header; the frozen contract makes it checkable.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Operation } from "./catalog.js";
import { API_VERSION } from "./version.js";

export const STABILITY = "stable" as const;

export const COMPATIBILITY_POLICY = {
  version: API_VERSION,
  stability: STABILITY,
  major: "1",
  contract: "v1",
  breakingChangesRequireMajor: true,
  currentPrefix: "/api/v1",
  legacyPrefix: "/api",
  rules: [
    "Every operation frozen in the v1 contract keeps its path, method, operationId, success status, response schema, security and parameter contract throughout 1.x.",
    "Additive changes stay on the 1.x line but require republishing the frozen contract and the published version.",
    "Removing a frozen operation requires a new major version; the 1.x surface stays available.",
    "Signature changes are reported conservatively: additive ones are published as a minor version, incompatible ones only as a major version.",
    "The legacy /api prefix mirrors /api/v1 for the whole 1.x lifetime.",
  ],
} as const;

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

type ParameterContract = {
  name: string;
  in: "path" | "query";
  required: boolean;
  schema: string;
};

function parameterContract(schema: z.ZodType | undefined, place: "path" | "query"): ParameterContract[] {
  if (!schema) return [];
  const json = z.toJSONSchema(schema, { target: "openapi-3.1" }) as {
    required?: string[];
    properties?: Record<string, unknown>;
  };
  const required = json.required ?? [];
  return Object.entries(json.properties ?? {})
    .map(([name, shape]) => ({
      name,
      in: place,
      required: place === "path" || required.includes(name),
      schema: fingerprint(shape),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function bodyContract(schema: z.ZodType | undefined) {
  if (!schema) return null;
  const json = z.toJSONSchema(schema, { target: "openapi-3.1" }) as { required?: string[] };
  return {
    required: [...(json.required ?? [])].sort(),
    schema: fingerprint(json),
  };
}

/** Hash of the compatibility-relevant part of an operation, not of its wording. */
export function operationSignature(op: Operation): string {
  return fingerprint({
    method: op.method,
    path: op.path,
    operationId: op.operationId,
    status: op.status ?? 200,
    response: op.response,
    contentType: op.contentType ?? "application/json",
    security: op.security,
    params: parameterContract(op.params, "path"),
    query: parameterContract(op.query, "query"),
    body: bodyContract(op.body),
  });
}

export function operationKey(op: { method: string; path: string }): string {
  return `${op.method} ${op.path}`;
}

export function contractDigest(operations: readonly Operation[]): string {
  const lines = operations
    .map((op) => `${operationKey(op)}=${operationSignature(op)}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
