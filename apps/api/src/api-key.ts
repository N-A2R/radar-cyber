/**
 * Clés d'API publiques : le secret ne vit que chez le client, la base ne
 * conserve que son empreinte. Chaque requête portant une clé consomme une unité
 * de quota dans une fenêtre glissante de 60 s, atomiquement en SQL : deux
 * instances de l'API ne peuvent pas dépasser le quota d'une même clé.
 */
import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { query } from "./db.js";
import { unauthorized, ApiError } from "./errors.js";
import type { AuthUser } from "./middleware/auth.js";

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_WINDOW_MS = 60_000;

export function generateApiKey(): string {
  return `rdk_${randomBytes(24).toString("base64url")}`;
}

/** Préfixe distinct de celui des tokens de session : aucune confusion possible. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(`radar-api-key:${key}`).digest("hex");
}

export type ApiKey = {
  id: number;
  name: string;
  prefix: string;
  scope: "read" | "write";
  quota: number;
  owner: AuthUser;
};

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKey;
  }
}

type KeyRow = {
  id: number;
  name: string;
  key_prefix: string;
  scope: "read" | "write";
  quota: number;
  user_id: number;
  email: string;
  role: string;
  display_name: string | null;
  revoked_at: string | null;
};

/** En-tête absent → null ; clé inconnue ou révoquée → 401 (jamais 404). */
export async function resolveApiKey(req: FastifyRequest): Promise<ApiKey | null> {
  const raw = req.headers[API_KEY_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const r = await query<KeyRow>(
    `SELECT k.id, k.name, k.key_prefix, k.scope, k.quota, k.revoked_at,
            u.id AS user_id, u.email, u.role, u.display_name
     FROM api_key k JOIN app_user u ON u.id = k.user_id
     WHERE k.key_hash = $1`,
    [hashApiKey(value.trim())],
  );
  const row = r.rows[0];
  if (!row || row.revoked_at !== null) throw unauthorized("invalid api key");
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    scope: row.scope,
    quota: row.quota,
    owner: { id: row.user_id, email: row.email, role: row.role, displayName: row.display_name },
  };
}

export type QuotaState = {
  limit: number;
  remaining: number;
  /** Timestamp returned by Postgres, used for the RFC 9333 reset header. */
  resetAt: string;
  retryAfter?: number;
};

/** Standard rate-limit headers make the per-key quota observable to clients. */
export function writeQuotaHeaders(reply: FastifyReply, state: QuotaState): void {
  const reset = Math.max(0, Math.ceil((Date.parse(state.resetAt) - Date.now()) / 1000));
  reply.header("RateLimit-Limit", String(state.limit));
  reply.header("RateLimit-Remaining", String(state.remaining));
  reply.header("RateLimit-Reset", String(reset));
  if (state.retryAfter !== undefined) reply.header("Retry-After", String(state.retryAfter));
}

export async function consumeApiKey(key: ApiKey, reply?: FastifyReply): Promise<QuotaState> {
  const r = await query<{ used: number; quota: number; reset_at: string }>(
    `UPDATE api_key
        SET used = CASE WHEN window_start IS NULL OR window_start <= now() - interval '1 minute'
                        THEN 1 ELSE used + 1 END,
            window_start = CASE WHEN window_start IS NULL OR window_start <= now() - interval '1 minute'
                                THEN now() ELSE window_start END,
            last_used_at = now()
      WHERE id = $1 AND revoked_at IS NULL AND quota > 0
        AND (window_start IS NOT NULL AND window_start > now() - interval '1 minute' AND used < quota
             OR window_start IS NULL OR window_start <= now() - interval '1 minute')
      RETURNING used, quota, window_start + interval '1 minute' AS reset_at`,
    [key.id],
  );
  const consumed = r.rows[0];
  if (consumed) {
    const state: QuotaState = {
      limit: consumed.quota,
      remaining: Math.max(0, consumed.quota - consumed.used),
      resetAt: consumed.reset_at,
    };
    if (reply) writeQuotaHeaders(reply, state);
    return state;
  }

  const state = await query<{ used: number; quota: number; reset_at: string }>(
    "SELECT used, quota, COALESCE(window_start, now()) + interval '1 minute' AS reset_at FROM api_key WHERE id = $1",
    [key.id],
  );
  const s = state.rows[0];
  const quota = s?.quota ?? key.quota;
  const used = s?.used ?? quota;
  const resetAt = s?.reset_at ?? new Date(Date.now() + API_KEY_WINDOW_MS).toISOString();
  const retryAfter = Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1000));
  const denied: QuotaState = { limit: quota, remaining: 0, resetAt, retryAfter };
  if (reply) writeQuotaHeaders(reply, denied);
  throw new ApiError(429, "api key quota exceeded", {
    code: "API_KEY_QUOTA_EXCEEDED",
    details: { keyId: key.id, quota, used, resetAt, retryAfter, limit: quota, remaining: 0 },
  });
}
