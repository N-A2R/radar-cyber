/**
 * Replay the examples published in the OpenAPI document as HTTP requests.
 *
 * The replay application registers the same paths as the real API and answers
 * with the documented example. Inputs are checked with the route's own Zod
 * schemas and outputs with the published response schema, so a stale or
 * invalid example fails loudly instead of silently rotting in the docs.
 */
import Fastify, { type FastifyInstance } from "fastify";
import type { z } from "zod";
import { OPERATIONS, type Operation } from "./catalog.js";
import { SCHEMAS } from "./schemas.js";
import { buildExamples, exampleRequest, type OperationExample } from "./examples.js";
import { buildOpenApi, openApiPath } from "./spec.js";

type Doc = Record<string, any>;



export type ReplayResult = {
  operationId: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  problems: string[];
};

function checkParsed(label: string, schema: z.ZodType, value: unknown, problems: string[]): void {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    problems.push(`${label} does not validate (${details})`);
  }
}

function checkResponse(op: Operation, example: OperationExample, problems: string[]): void {
  if (op.contentType) {
    if (typeof example.response !== "string") problems.push("response example is not a string");
    return;
  }
  checkParsed("response example", SCHEMAS[op.response], example.response, problems);
}

function checkPublished(op: Operation, example: OperationExample, problems: string[]): void {
  const spec = buildOpenApi();
  const item = (spec.paths as Doc)[openApiPath(op.path)] as Doc | undefined;
  const doc = item?.[op.method] as Doc | undefined;
  if (!doc) {
    problems.push("operation is absent from the OpenAPI document");
    return;
  }
  const request = exampleRequest(op, example);
  if (JSON.stringify(doc["x-request-example"]) !== JSON.stringify(request)) {
    problems.push("request example is not published in the document");
  }
  const mediaType = op.contentType ?? "application/json";
  const success = String(op.status ?? 200);
  const published = doc.responses?.[success]?.content?.[mediaType]?.example;
  if (published === undefined || JSON.stringify(published) !== JSON.stringify(example.response)) {
    problems.push("response example is not published at the success status");
  }
  for (const parameter of doc.parameters ?? []) {
    const expected = (parameter.in === "path" ? example.params : example.query)[parameter.name];
    if (expected === undefined || expected !== parameter.example) {
      problems.push(`parameter example ${parameter.name} is missing`);
    }
  }
  if (op.body) {
    const body = doc.requestBody?.content?.["application/json"]?.example;
    if (body === undefined || JSON.stringify(body) !== JSON.stringify(example.body)) {
      problems.push("request body example is not published");
    }
  }
}

/** A local Fastify application that executes every documented example. */
export function buildReplayApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  const examples = buildExamples();
  for (const op of OPERATIONS) {
    const example = examples.get(op.operationId)!;
    app.route({
      method: op.method.toUpperCase() as never,
      url: `/api/v1${op.path}`,
      handler: async (req, reply) => {
        const problems: string[] = [];
        if (op.params) checkParsed("path parameters", op.params, req.params, problems);
        if (op.query) checkParsed("query", op.query, req.query, problems);
        if (op.body) checkParsed("body", op.body, req.body, problems);
        if (problems.length > 0) {
          return reply.code(400).send({
            error: { code: "BAD_REQUEST", message: problems.join("; "), details: null },
          });
        }
        return reply.code(op.status ?? 200)
          .type(op.contentType ?? "application/json")
          .send(example.response as never);
      },
    });
  }
  return app;
}

export type ReplayOptions = {
  /** The real application, used to prove each example targets a live route. */
  application?: FastifyInstance;
  examples?: Map<string, OperationExample>;
};

export async function replayAll(options: ReplayOptions = {}): Promise<ReplayResult[]> {
  const examples = options.examples ?? buildExamples();
  const replayApp = buildReplayApp();
  await replayApp.ready();
  const results: ReplayResult[] = [];
  try {
    for (const op of OPERATIONS) {
      const example = examples.get(op.operationId);
      const problems: string[] = [];
      if (!example) {
        results.push({ operationId: op.operationId, method: op.method.toUpperCase(), url: op.path, status: 0, ok: false, problems: ["no example"] });
        continue;
      }
      const request = exampleRequest(op, example);
      if (op.params) checkParsed("path parameters", op.params, example.params, problems);
      if (op.query) checkParsed("query", op.query, example.query, problems);
      if (op.body) checkParsed("body", op.body, example.body, problems);
      checkResponse(op, example, problems);
      checkPublished(op, example, problems);

      const expectedStatus = op.status ?? 200;
      if (options.application) {
        const pattern = `/api/v1${op.path}`;

        const live = options.application.hasRoute({ method: request.method, url: pattern });
        if (!live) problems.push("no matching route in the application");
      }

      const response = await replayApp.inject({
        method: request.method as never,
        url: request.url,
        headers: request.headers,
        ...(request.payload === undefined ? {} : { payload: request.payload as never }),
      });
      if (response.statusCode !== expectedStatus) {
        problems.push(`replay returned ${response.statusCode}, expected ${expectedStatus}`);
      }
      const expectedBody = op.contentType ? example.response : JSON.stringify(example.response);
      const actualBody = op.contentType ? response.body : JSON.stringify(response.json());
      if (actualBody !== expectedBody) problems.push("replayed response differs from the example");

      results.push({
        operationId: op.operationId,
        method: request.method,
        url: request.url,
        status: response.statusCode,
        ok: problems.length === 0,
        problems,
      });
    }
  } finally {
    await replayApp.close();
  }
  return results;
}
