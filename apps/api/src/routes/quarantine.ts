import type { FastifyInstance, FastifyRequest } from "fastify";
import { query } from "../db.js";
import { requireAuth, resolveUser } from "../middleware/auth.js";
import {
  loadOrgIndex,
  matchOrgInIndex,
  promoteOne,
  type OrgIndexEntry,
} from "../quarantine/promote.js";

function mapOrg(e: OrgIndexEntry) {
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    kind: e.kind,
    city: e.city,
    domain: e.domain,
  };
}

export default async function (app: FastifyInstance) {
  /**
   * Faits de quarantaine, organisation rapprochée quand l'indice correspond.
   * `raw_body` reste hors API : les données ransomware.live ne sont pas
   * republiées (voir docs/quarantine.md). L'événement public porte le résumé.
   */
  app.get("/quarantine", async (req: FastifyRequest, reply) => {
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
    if (q.status) { params.push(q.status); where.push(`q.status=$${params.length}`); }
    if (q.promoted === "true") { where.push("q.promoted = true"); }
    else if (q.promoted === "false") { where.push("q.promoted = false"); }
    if (q.source) { params.push(q.source); where.push(`q.source=$${params.length}`); }
    params.push(limit);
    const limitIdx = params.length;

    const r = await query<Record<string, unknown>>(
      `SELECT q.id, q.source, q.source_url, q.groupe, q.org_hint, q.claimed_at, q.extracted, q.tlp,
              q.status, q.promoted, q.promoted_at, q.promoted_by, q.received_at, q.purge_after, q.content_hash
       FROM quarantine_raw q
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY q.received_at DESC, q.id DESC LIMIT $${limitIdx}`,
      params
    );

    const index = await loadOrgIndex();
    const orgById = new Map(index.map((e) => [e.id, e]));
    const out: Record<string, unknown>[] = [];
    for (const row of r.rows) {
      // La route exige désormais un jeton : le destinataire autorisé peut voir
      // les faits TLP:RED. Leur contenu extrait reste masqué, seule la
      // métadonnée (source, groupe, date, rattachement) est exposée.
      const isRed = row.tlp === "RED";
      // Le rattachement se calcule sur `org_hint`, jamais sur le contenu extrait.
      const m = matchOrgInIndex(String(row.org_hint ?? ""), index);
      out.push({
        id: row.id,
        source: row.source,
        sourceUrl: row.source_url,
        groupe: row.groupe,
        orgHint: row.org_hint,
        claimedAt: row.claimed_at,
        extracted: isRed ? null : row.extracted,
        tlp: row.tlp,
        status: row.status,
        promoted: row.promoted,
        promotedAt: row.promoted_at,
        promotedBy: row.promoted_by,
        receivedAt: row.received_at,
        purgeAfter: row.purge_after,
        contentHash: row.content_hash,
        org: m && m.orgId ? mapOrg(orgById.get(m.orgId)!) : null,
        orgConfidence: m?.confidence ?? null,
      });
    }
    return out;
  });

  /** Comptes par statut, promotion et source. */
  app.get("/quarantine/stats", async (req: FastifyRequest, reply) => {
    const user = await resolveUser(req);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const total = await query<{ n: string }>("SELECT count(*)::text AS n FROM quarantine_raw");
    const pending = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM quarantine_raw WHERE status='pending' AND promoted=false"
    );
    const byStatus = await query<{ status: string; count: string }>(
      "SELECT status, count(*)::text AS count FROM quarantine_raw GROUP BY status ORDER BY status"
    );
    const byPromoted = await query<{ promoted: boolean; count: string }>(
      "SELECT promoted, count(*)::text AS count FROM quarantine_raw GROUP BY promoted ORDER BY promoted"
    );
    const bySource = await query<{ source: string; count: string }>(
      "SELECT source, count(*)::text AS count FROM quarantine_raw GROUP BY source ORDER BY source"
    );
    return {
      total: Number(total.rows[0].n),
      pendingUnpromoted: Number(pending.rows[0].n),
      byStatus: byStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      byPromoted: byPromoted.rows.map((r) => ({ promoted: r.promoted, count: Number(r.count) })),
      bySource: bySource.rows.map((r) => ({ source: r.source, count: Number(r.count) })),
    };
  });

  /** Promotion manuelle par un analyste connecté. */
  app.post<{ Params: { id: string } }>(
    "/quarantine/:id/promote",
    { preHandler: requireAuth() },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        reply.code(400).send({ error: "invalid id" });
        return;
      }
      const result = await promoteOne(id, req.user!.email);
      if (!result.found) {
        reply.code(404).send({ error: "not found" });
        return;
      }
      return result;
    }
  );
}
