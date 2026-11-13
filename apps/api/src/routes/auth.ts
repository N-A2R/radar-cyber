import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { hashPassword, verifyPassword, newToken } from "../auth.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export default async function (app: FastifyInstance) {
  app.post("/auth/register", { preHandler: async (req, reply) => {
    const c = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user");
    if ((c.rows[0]?.n ?? 0) > 0) {
      await requireAuth()(req, reply);
    }
  } }, async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; password?: string; role?: string; displayName?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      reply.code(400).send({ error: "email and password required" });
      return;
    }
    // premier utilisateur autorisé ; sinon admin requis
    const count = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user");
    if ((count.rows[0]?.n ?? 0) > 0) {
      const u = req.user;
      if (!u || u.role !== "admin") {
        reply.code(403).send({ error: "admin required" });
        return;
      }
    }
    const existing = await query("SELECT id FROM app_user WHERE email = $1", [email]);
    if (existing.rowCount) {
      reply.code(409).send({ error: "email exists" });
      return;
    }
    const role = body.role && ["admin", "analyste", "lecteur"].includes(body.role) ? body.role : "lecteur";
    // premier utilisateur devient admin (bootstrap) ; impossible de choisir un autre rôle
    const finalRole = (count.rows[0]?.n ?? 0) === 0 ? "admin" : role;
    const hash = await hashPassword(password);
    const r = await query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role, display_name) VALUES ($1,$2,$3,$4) RETURNING id",
      [email, hash, finalRole, body.displayName ?? null]
    );
    reply.code(201).send({ id: r.rows[0].id, email, role: finalRole });
  });

  app.post("/auth/login", async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const r = await query<{ id: number; password_hash: string; role: string; display_name: string | null }>(
      "SELECT id, password_hash, role, display_name FROM app_user WHERE email = $1",
      [email]
    );
    const row = r.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      reply.code(401).send({ error: "invalid credentials" });
      return;
    }
    const token = newToken();
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    await query("INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2,$3)", [token, row.id, expires.toISOString()]);
    await query("UPDATE app_user SET last_login_at = now() WHERE id = $1", [row.id]);
    reply.send({ token, user: { id: row.id, email, role: row.role, displayName: row.display_name } });
  });

  app.post("/auth/logout", { preHandler: requireAuth() }, async (req, reply) => {
    const h = req.headers.authorization as string;
    const token = h.slice(7).trim();
    await query("DELETE FROM app_session WHERE token = $1", [token]);
    reply.send({ ok: true });
  });

  app.get("/auth/me", { preHandler: requireAuth() }, async (req) => {
    return req.user;
  });
}
