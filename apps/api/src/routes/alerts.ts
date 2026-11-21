import type { FastifyInstance, FastifyRequest } from "fastify";
import { query } from "../db.js";
import { requireAuth, resolveUser } from "../middleware/auth.js";
import { scoreAlert } from "../detect/confidence.js";
import { badRequest, notFound, unauthorized } from "../errors.js";

export default async function (app: FastifyInstance) {
  app.get("/alerts", async (req: FastifyRequest, reply) => {
    const user = await resolveUser(req);
    if (!user) throw unauthorized();
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
    const sql = `SELECT a.*, e.title AS event_title, e.family AS event_family, e.tlp AS event_tlp, e.summary AS event_summary, e.confidence AS event_confidence, e.assertion_type AS event_assertion, i.type AS indicator_type, i.value AS indicator_value, o.name AS org_name, o.dept AS org_dept
      FROM alert a
      LEFT JOIN event e ON e.id = a.event_id
      LEFT JOIN indicator i ON i.id = a.indicator_id
      LEFT JOIN org o ON o.id = a.org_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY a.created_at DESC, a.id DESC LIMIT $${limitIdx}`;
    const r = await query<Record<string, unknown>>(sql, params);

    // Corroboration de la page en une requête : sources distinctes par
    // organisation sur 30 jours, plutôt qu'un comptage par alerte.
    const orgIds = [...new Set(r.rows.map((row) => row.org_id).filter((id): id is number => typeof id === "number"))];
    const sourceCounts = new Map<number, number>();
    if (orgIds.length > 0) {
      const counts = await query<{ org_id: number; n: number }>(
        `SELECT org_id, COUNT(DISTINCT source_id)::int AS n FROM event
         WHERE org_id = ANY($1) AND observed_at >= now() - interval '30 days'
         GROUP BY org_id`,
        [orgIds]
      );
      for (const row of counts.rows) sourceCounts.set(row.org_id, row.n);
    }

    const out: Record<string, unknown>[] = [];
    for (const row of r.rows) {
      const orgId = typeof row.org_id === "number" ? row.org_id : null;
      const scored: Record<string, unknown> = {
        ...row,
        confidence: scoreAlert({
          sourceConfidence: row.event_confidence as string | null,
          assertionType: row.event_assertion as string | null,
          orgId,
          orgDept: row.org_dept as string | null,
          distinctSources: orgId === null ? 0 : (sourceCounts.get(orgId) ?? 0),
        }),
      };
      const tlp = row.tlp === "RED" || row.event_tlp === "RED";
      if (tlp) {
        if ("summary" in row) {
          out.push({ ...scored, summary: null });
          continue;
        }
        if ("event_summary" in row) {
          const { event_summary, ...rest } = scored;
          out.push({ ...rest, event_summary: null });
          continue;
        }
        out.push(scored);
        continue;
      }
      out.push(scored);
    }
    return out;
  });

  app.get("/alerts/stats", async (req: FastifyRequest, reply) => {
    const user = await resolveUser(req);
    if (!user) throw unauthorized();
    const r = await query("SELECT status, severity, COUNT(*)::text AS count FROM alert GROUP BY status, severity");
    return r.rows;
  });

  app.get<{ Params: { id: string } }>("/alerts/:id", { preHandler: requireAuth() }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest("invalid id");
    }

    const alertRow = await query<{
      id: number;
      rule_id: string;
      title: string;
      severity: number;
      status: string;
      scope: string;
      created_at: string;
      event_id: number | null;
      org_id: number | null;
      evidence: unknown;
    }>(
      `SELECT a.id, a.rule_id, a.title, a.severity, a.status, a.scope, a.created_at,
              a.event_id, a.org_id, a.evidence
       FROM alert a WHERE a.id = $1 LIMIT 1`,
      [id]
    );
    const alert = alertRow.rows[0];
    if (!alert) throw notFound();

    const eventRow = alert.event_id === null
      ? null
      : await query<{
          id: string;
          title: string;
          family: string;
          severity: number;
          summary: string | null;
          observed_at: string | null;
          source_id: string;
          org_id: number | null;
          confidence: string | null;
          assertion_type: string | null;
          tlp: string;
          source_name: string | null;
          source_url: string | null;
          source_family: string | null;
        }>(
          `SELECT e.id, e.title, e.family, e.severity, e.summary, e.observed_at, e.source_id,
                  e.org_id, e.confidence, e.assertion_type, e.tlp,
                  s.name AS source_name, s.url AS source_url, s.family AS source_family
           FROM event e LEFT JOIN source s ON s.id = e.source_id
           WHERE e.id = $1 LIMIT 1`,
          [alert.event_id]
        );
    const event = eventRow?.rows[0] ?? null;

    // La corroboration porte sur l'organisation de l'alerte, à défaut sur celle
    // que porte l'événement déclencheur (les avis régionaux n'ont pas d'org_id).
    const orgId = alert.org_id ?? event?.org_id ?? null;
    const orgRow = orgId === null
      ? null
      : await query<{ id: number; name: string; dept: string | null; kind: string }>(
          `SELECT id, name, dept, kind FROM org WHERE id = $1 LIMIT 1`,
          [orgId]
        );
    const org = alert.org_id === null ? null : (orgRow?.rows[0] ?? null);

    let corroboration: { distinct_sources: number; sources: { name: string; count: string }[] } = {
      distinct_sources: 0,
      sources: [],
    };
    const orgName = orgRow?.rows[0]?.name ?? null;
    if (orgId !== null && orgName) {
      const pattern = `%${orgName.replace(/[\\%_]/g, "\\$&")}%`;
      const corr = await query<{ name: string; count: string; source_count: string }>(
        `WITH recent AS (
           SELECT e.source_id FROM event e
           WHERE e.observed_at >= now() - interval '30 days'
             AND (e.org_id = $1 OR e.title ILIKE $2)
           ORDER BY e.observed_at DESC
           LIMIT 2000
         )
         SELECT s.name, COUNT(*)::text AS count, COUNT(DISTINCT s.id)::text AS source_count
         FROM recent JOIN source s ON s.id = recent.source_id
         GROUP BY s.name
         ORDER BY COUNT(*) DESC, s.name ASC
         LIMIT 20`,
        [orgId, pattern]
      );
      corroboration = {
        distinct_sources: corr.rows.reduce((n, row) => n + Number(row.source_count), 0),
        sources: corr.rows.map((row) => ({ name: row.name, count: row.count })),
      };
    }

    return {
      alert: {
        id: alert.id,
        rule_id: alert.rule_id,
        title: alert.title,
        severity: alert.severity,
        status: alert.status,
        scope: alert.scope,
        created_at: alert.created_at,
      },
      event: event
        ? {
            id: event.id,
            title: event.title,
            family: event.family,
            severity: event.severity,
            summary: event.tlp === "RED" ? null : event.summary,
            observed_at: event.observed_at,
            source_id: event.source_id,
            confidence: event.confidence,
          }
        : null,
      source: event && event.source_name
        ? { name: event.source_name, url: event.source_url, family: event.source_family }
        : null,
      org,
      corroboration,
      confidence: scoreAlert({
        sourceConfidence: event?.confidence ?? null,
        assertionType: event?.assertion_type ?? null,
        orgId,
        orgDept: orgRow?.rows[0]?.dept ?? null,
        distinctSources: corroboration.distinct_sources,
      }),
      evidence: alert.evidence,
    };
  });

  app.post<{ Params: { id: string } }>("/alerts/:id/ack", { preHandler: requireAuth() }, async (req, reply) => {
    const id = Number(req.params.id);
    const u = req.user!;
    const r = await query("UPDATE alert SET status='ack', acked_at=now(), acked_by=$2, updated_at=now() WHERE id=$1 RETURNING id", [id, u.id]);
    if (!r.rowCount) throw notFound();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/alerts/:id/resolve", { preHandler: requireAuth() }, async (req, reply) => {
    const id = Number(req.params.id);
    const r = await query("UPDATE alert SET status='resolved', updated_at=now() WHERE id=$1 RETURNING id", [id]);
    if (!r.rowCount) throw notFound();
    return { ok: true };
  });
}
