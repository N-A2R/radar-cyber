import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { query } from "../db.js";

export type AuthUser = { id: number; email: string; role: string; displayName: string | null };

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function resolveUser(req: FastifyRequest): Promise<AuthUser | null> {
  const h = req.headers.authorization;
  if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  const r = await query<{ user_id: number; email: string; role: string; display_name: string | null; expires_at: string }>(
    `SELECT u.id AS user_id, u.email, u.role, u.display_name, s.expires_at
     FROM app_session s JOIN app_user u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { id: row.user_id, email: row.email, role: row.role, displayName: row.display_name };
}

export function requireAuth() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const u = await resolveUser(req);
    if (!u) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    req.user = u;
  };
}

export function requireRole(role: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const u = req.user ?? (await resolveUser(req));
    if (!u) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    req.user = u;
    if (u.role !== role && u.role !== "admin") {
      reply.code(403).send({ error: "forbidden" });
      return;
    }
    // exact role check for non-admin target? admin bypass allowed
    if (role !== "admin" && u.role !== role) {
      reply.code(403).send({ error: "forbidden" });
    }
  };
}
