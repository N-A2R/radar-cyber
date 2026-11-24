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

/** Cookie de session : seul moyen pour un `EventSource` (aucun en-tête possible). */
export const SESSION_COOKIE = "radar_session";
export const SESSION_COOKIE_PATH = "/api";
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Jeton de session porté par la requête, sans jamais accepter le paramètre
 * `?token=` ici : ce dernier reste limité au flux SSE et est journalisé à part.
 * Le bearer l'emporte sur le cookie, qui l'emporte sur la clé d'API.
 */
export function sessionToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (typeof h === "string" && /^bearer /i.test(h)) {
    const token = h.slice(7).trim();
    if (token) return token;
  }
  const brut = req.headers.cookie;
  if (typeof brut === "string") {
    for (const morceau of brut.split(";")) {
      const egal = morceau.indexOf("=");
      if (egal < 0) continue;
      if (morceau.slice(0, egal).trim() !== SESSION_COOKIE) continue;
      try {
        const valeur = decodeURIComponent(morceau.slice(egal + 1).trim());
        if (valeur) return valeur;
      } catch { return null; }
    }
  }
  return null;
}

export function ecrireCookieSession(req: FastifyRequest, reply: FastifyReply, token: string): void {
  const securise = req.protocol === "https" || process.env.RADAR_COOKIE_SECURE === "1";
  reply.header("Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=${SESSION_COOKIE_PATH}; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${securise ? "; Secure" : ""}`);
}

export function effacerCookieSession(req: FastifyRequest, reply: FastifyReply): void {
  const securise = req.protocol === "https" || process.env.RADAR_COOKIE_SECURE === "1";
  reply.header("Set-Cookie",
    `${SESSION_COOKIE}=; Path=${SESSION_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Strict${securise ? "; Secure" : ""}`);
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
  // Une seule résolution par requête : les hooks et les handlers consomment
  // la même identité, posée par le hook le plus antérieur (M11).
  if (req.user) return req.user;
  const token = sessionToken(req);
  if (token) {
    const user = await lookupToken(token);
    if (user) return user;
  }
  if (req.apiKey) return req.apiKey.owner;
  const path = (req.url ?? "").split("?")[0];
  if (QUERY_TOKEN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    const raw = (req.query as { token?: unknown } | undefined)?.token;
    if (typeof raw === "string" && raw.trim().length > 0) return lookupToken(raw.trim());
  }
  return null;
}

export function requireAuth() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const u = req.user ?? (await resolveUser(req));
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

