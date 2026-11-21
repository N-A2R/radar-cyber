import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

/** Healthcheck public : aucun secret, aucun état applicatif détaillé. */
export default async function (app: FastifyInstance) {
  app.get("/health", async () => {
    const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM source");
    return { ok: true, sources: Number(r.rows[0]?.n ?? 0) };
  });
}
