/**
 * Gestion des clés d'API publiques. Les écritures passent par un jeton de
 * session (requireAuth) : une clé ne peut pas créer d'autres clés. La clé en
 * clair n'est renvoyée qu'une seule fois, lors de sa création.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { generateApiKey, hashApiKey } from "../api-key.js";
import { query } from "../db.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

export const CreateKeyBody = z.object({
  name: z.string().trim().min(1).max(80),
  scope: z.enum(["read", "write"]).default("read"),
  quota: z.number().int().min(0).max(10_000).default(60),
}).strict();

export const KeyIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

type KeyRow = {
  id: number;
  name: string;
  key_prefix: string;
  scope: string;
  quota: number;
  used: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function publicKey(row: KeyRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    scope: row.scope,
    quota: row.quota,
    used: row.used,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}
/** Une clé, même en écriture, ne peut pas créer ni révoquer de clé. */
const sessionOnly = async (req: FastifyRequest, reply: FastifyReply) => {
  if (req.apiKey) throw forbidden("api keys cannot manage api keys");
  await requireAuth()(req, reply);
};

export default async function keysRoute(app: FastifyInstance) {
  app.post("/keys", { preHandler: sessionOnly }, async (req, reply) => {
    const parsed = CreateKeyBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest("invalid input", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    const body = parsed.data;
    if (body.scope === "write" && req.user?.role !== "admin") {
      throw forbidden("admin required for write-scoped keys");
    }
    const key = generateApiKey();
    const r = await query<KeyRow>(
      `INSERT INTO api_key (user_id, name, key_hash, key_prefix, scope, quota)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user!.id, body.name, hashApiKey(key), key.slice(0, 12), body.scope, body.quota],
    );
    return reply.code(201).send({ ...publicKey(r.rows[0]!), key });
  });

  app.get("/keys", { preHandler: sessionOnly }, async (req) => {
    const r = await query<KeyRow>(
      "SELECT * FROM api_key WHERE user_id = $1 ORDER BY id DESC",
      [req.user!.id],
    );
    return { keys: r.rows.map(publicKey) };
  });

  app.delete<{ Params: { id: string } }>("/keys/:id", { preHandler: sessionOnly }, async (req) => {
    const parsed = KeyIdParams.safeParse(req.params);
    if (!parsed.success) throw badRequest("invalid key id");
    const r = await query<{ id: number }>(
      `UPDATE api_key SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
      [parsed.data.id, req.user!.id],
    );
    if (!r.rows[0]) throw notFound("api key not found");
    return { ok: true, id: parsed.data.id };
  });
}
