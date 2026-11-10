import type { FastifyInstance, FastifyRequest } from "fastify";
import { query } from "../db.js";
import { requireAuth, resolveUser } from "../middleware/auth.js";

export default async function (app: FastifyInstance) {
  app.get("/alerts", async (req: FastifyRequest, reply) => {
    const user = await resolveUser(req);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    let limit = Number(q.limit ?? 100);
    if (!Number.isFinite(limit)) limit = 100;
    limit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.status) { params.push(q.status); where.push(`a.status=$${params.length}`); }
    if (q.severity) { params.push(Number(q.severity)); where.push(`a.severity=$${params.length}`); }
    params.push(limit);
    const limitIdx = params.length;
    const sql = `SELECT a.*, e.title AS event_title, e.family AS event_family, e.tlp AS event_tlp, e.summary AS event_summary, i.type AS indicator_type, i.value AS indicator_value, o.name AS org_name
      FROM alert a
      LEFT JOIN event e ON e.id = a.event_id
      LEFT JOIN indicator i ON i.id = a.indicator_id
      LEFT JOIN org o ON o.id = a.org_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY a.created_at DESC, a.id DESC LIMIT $${limitIdx}`;
    const r = await query<Record<string, unknown>>(sql, params);
    const out: Record<string, unknown>[] = [];
    for (const row of r.rows) {
      const tlp = row.tlp === "RED" || row.event_tlp === "RED";
      if (tlp) {
        if ("summary" in row) {
          out.push({ ...row, summary: null });
          continue;
        }
        if ("event_summary" in row) {
          const { event_summary, ...rest } = row;
          out.push({ ...rest, event_summary: null });
          continue;
        }
        out.push(row);
        continue;
      }
      out.push(row);
    }
    return out;
  });

  app.get("/alerts/stats", async (req: FastifyRequest, reply) => {
    const user = await resolveUser(req);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const r = await query("SELECT status, severity, COUNT(*)::text AS count FROM alert GROUP BY status, severity");
    return r.rows;
  });

  app.post<{ Params: { id: string } }>("/alerts/:id/ack", { preHandler: requireAuth() }, async (req, reply) => {
    const id = Number(req.params.id);
    const u = req.user!;
    const r = await query("UPDATE alert SET status='ack', acked_at=now(), acked_by=$2, updated_at=now() WHERE id=$1 RETURNING id", [id, u.id]);
    if (!r.rowCount) { reply.code(404).send({ error: "not found" }); return; }
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/alerts/:id/resolve", { preHandler: requireAuth() }, async (req, reply) => {
    const id = Number(req.params.id);
    const r = await query("UPDATE alert SET status='resolved', updated_at=now() WHERE id=$1 RETURNING id", [id]);
    if (!r.rowCount) { reply.code(404).send({ error: "not found" }); return; }
    return { ok: true };
  });
}
