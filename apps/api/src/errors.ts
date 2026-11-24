/**
 * Format unique des erreurs HTTP de l'API : { error: { code, message, details } }.
 *
 * Les routes lèvent des `ApiError` au lieu d'envoyer elles-mêmes un payload ;
 * `installErrorHandler` centralise la sérialisation, les erreurs inattendues
 * (500) et les routes inconnues (404). Les codes Postgres connus sont traduits
 * ici pour ne pas laisser fuir un statut ou un payload brut.
 */
import type { FastifyInstance, FastifyReply } from "fastify";

export type ErrorBody = { error: { code: string; message: string; details: unknown } };

const CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  429: "RATE_LIMIT_EXCEEDED",
  500: "INTERNAL_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, message: string, options: { code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = options.code ?? CODE_BY_STATUS[statusCode] ?? "ERROR";
    this.details = options.details ?? null;
  }
}

export function badRequest(message: string, details?: unknown, code?: string): ApiError {
  return new ApiError(400, message, { code, details });
}
export function unauthorized(message = "unauthorized", details?: unknown): ApiError {
  return new ApiError(401, message, { details });
}
export function forbidden(message = "forbidden", details?: unknown): ApiError {
  return new ApiError(403, message, { details });
}
export function notFound(message = "not found", details?: unknown): ApiError {
  return new ApiError(404, message, { details });
}
export function conflict(message: string, details?: unknown, code?: string): ApiError {
  return new ApiError(409, message, { code, details });
}
export function unprocessable(message: string, details?: unknown, code?: string): ApiError {
  return new ApiError(422, message, { code, details });
}
export function serviceUnavailable(message: string, details?: unknown): ApiError {
  return new ApiError(503, message, { details });
}

type PgError = { code?: unknown; constraint?: unknown; detail?: unknown };

/** Détail réservé au journal serveur : jamais sérialisé dans la réponse. */
const PG_DETAILS = Symbol("pgDetails");

/** 23505 = unicité violée, 23503 = référence absente. */
function fromPostgres(error: object): ApiError | null {
  const { code, constraint, detail } = error as PgError;
  if (code !== "23505" && code !== "23503") return null;
  const apiError = code === "23505"
    ? conflict("doublon : contrainte d'unicité violée", undefined, "DUPLICATE_KEY")
    : unprocessable("référence invalide : clé étrangère violée", undefined, "FOREIGN_KEY_VIOLATION");
  Object.defineProperty(apiError, PG_DETAILS, {
    value: { code, constraint: constraint ?? null, detail: detail ?? null },
  });
  return apiError;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (typeof error === "object" && error !== null) {
    const pg = fromPostgres(error);
    if (pg) return pg;
    const candidate = error as { statusCode?: unknown; message?: unknown; validation?: unknown };
    if (typeof candidate.statusCode === "number" && candidate.statusCode >= 400 && candidate.statusCode < 600) {
      return new ApiError(candidate.statusCode,
        typeof candidate.message === "string" ? candidate.message : "erreur HTTP",
        { details: candidate.validation ?? null });
    }
  }
  return new ApiError(500, "internal server error");
}

function errorBody(error: ApiError): ErrorBody {
  return { error: { code: error.code, message: error.message, details: error.details } };
}

/** Installé sur l'instance racine : couvre aussi les plugins de routes. */
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const apiError = toApiError(error);
    const pgDetails = Object.getOwnPropertyDescriptor(apiError, PG_DETAILS)?.value;
    if (pgDetails !== undefined) {
      request.log.warn({ pg: pgDetails }, "détail PostgreSQL consigné côté serveur uniquement");
    }
    if (apiError.statusCode >= 500) request.log.error({ err: error }, apiError.message);
    reply.code(apiError.statusCode).send(errorBody(apiError));
  });
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send(errorBody(notFound(`route inconnue : ${request.method} ${request.url}`)));
  });
}
