import { forbidden, unauthorized } from "../errors.js";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { query } from "../db.js";
import { hashSessionToken } from "../auth.js";

export type Role = "admin" | "analyste" | "lecteur";
export type AuthUser = { id: number; email: string; role: Role | string; displayName: string | null };

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

async function lookupToken(token: string): Promise<AuthUser | null> {
  // La base ne connaît que le SHA-256 du token : on cherche le hash, jamais
  // le token lui-même.
  const r = await query<{ user_id: number; email: string; role: string; display_name: string | null; expires_at: string }>(
    `SELECT u.id AS user_id, u.email, u.role, u.display_name, s.expires_at
     FROM app_session s JOIN app_user u ON u.id = s.user_id
     WHERE s.token = $1`,
    [hashSessionToken(token)]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { id: row.user_id, email: row.email, role: row.role, displayName: row.display_name };
}

/**
 * Le flux SSE est consommé par un `EventSource`, qui ne peut pas poser
 * d'en-tête `Authorization` : c'est la seule route qui accepte le jeton en
 * paramètre de requête.
 */
const QUERY_TOKEN_PATHS = ["/api/stream"];

export async function resolveUser(req: FastifyRequest): Promise<AuthUser | null> {
  const h = req.headers.authorization;
  if (h && h.toLowerCase().startsWith("bearer ")) {
    const token = h.slice(7).trim();
    if (token) return lookupToken(token);
  }
  const path = (req.url ?? "").split("?")[0];
  if (QUERY_TOKEN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    const raw = (req.query as { token?: unknown } | undefined)?.token;
    if (typeof raw === "string" && raw.trim().length > 0) return lookupToken(raw.trim());
  }
  return null;
}

export function requireAuth() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const u = await resolveUser(req);
    if (!u) {
      throw unauthorized();
    }
    req.user = u;
  };
}

/**
 * Hiérarchie : lecteur < analyste < admin. Un admin satisfait toutes les
 * gardes ; un analyste satisfait les gardes analyste et lecteur.
 * L'ancienne version portait deux fois le même test, ce qui masquait
 * l'intention sans changer le résultat.
 */
const RANG: Record<Role, number> = { lecteur: 1, analyste: 2, admin: 3 };

export function roleSuffit(role: string, requis: Role): boolean {
  const rang = RANG[role as Role];
  return rang !== undefined && rang >= RANG[requis];
}

export function requireRole(role: Role) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const u = req.user ?? (await resolveUser(req));
    if (!u) throw unauthorized();
    req.user = u;
    if (!roleSuffit(u.role, role)) throw forbidden();
  };
}

