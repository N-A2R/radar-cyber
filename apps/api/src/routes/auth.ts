import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { hashPassword, verifyPassword, newToken, hashSessionToken } from "../auth.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { badRequest, conflict, forbidden, unauthorized } from "../errors.js";
import { z } from "zod";
import { parseBody, invalidBody } from "./body-validation.js";

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

const RegisterBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(1000),
  role: z.enum(["admin", "analyste", "lecteur"]).optional(),
  displayName: z.string().trim().max(200).optional(),
});

const LoginBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

const EmptyBody = z.strictObject({});

export default async function (app: FastifyInstance) {
  app.post("/auth/register", { preHandler: async (req, reply) => {
    const c = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user");
    if ((c.rows[0]?.n ?? 0) > 0) {
      await requireAuth()(req, reply);
    }
  } },
  async (req, reply) => {
    const parsed = parseBody(RegisterBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const body = parsed.data;
    // premier utilisateur autorisé ; sinon admin requis
    const count = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user");
    if ((count.rows[0]?.n ?? 0) > 0) {
      const u = req.user;
      if (!u || u.role !== "admin") {
        throw forbidden("admin required");
      }
    }
    const existing = await query("SELECT id FROM app_user WHERE email = $1", [body.email]);
    if (existing.rowCount) {
      throw conflict("email exists");
    }
    // premier utilisateur devient admin (bootstrap) ; impossible de choisir un autre rôle
    const finalRole = (count.rows[0]?.n ?? 0) === 0 ? "admin" : (body.role ?? "lecteur");
    const hash = await hashPassword(body.password);
    const r = await query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role, display_name) VALUES ($1,$2,$3,$4) RETURNING id",
      [body.email, hash, finalRole, body.displayName ?? null]
    );
    reply.code(201).send({ id: r.rows[0].id, email: body.email, role: finalRole });
  });

  app.post("/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = parseBody(LoginBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const { email, password } = parsed.data;
    const r = await query<{ id: number; password_hash: string; role: string; display_name: string | null }>(
      "SELECT id, password_hash, role, display_name FROM app_user WHERE email = $1",
      [email]
    );
    const row = r.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw unauthorized("invalid credentials");
    }
    const token = newToken();
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    // Seul le SHA-256 du token dort en base : le token lui-même ne vit que
    // chez le client.
    await query("INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2,$3)", [hashSessionToken(token), row.id, expires.toISOString()]);
    await query("UPDATE app_user SET last_login_at = now() WHERE id = $1", [row.id]);
    reply.send({ token, user: { id: row.id, email, role: row.role, displayName: row.display_name } });
  });

  app.post("/auth/logout", { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = parseBody(EmptyBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const h = req.headers.authorization as string;
    const token = h.slice(7).trim();
    await query("DELETE FROM app_session WHERE token = $1", [hashSessionToken(token)]);
    reply.send({ ok: true });
  });

  app.get("/auth/me", { preHandler: requireAuth() }, async (req) => {
    return req.user;
  });
}
