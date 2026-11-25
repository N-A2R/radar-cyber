import { badRequest, notFound } from "../errors.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { query } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { applyReview, reviewQueue } from "../quarantine/review.js";
import type { TriageBucket } from "../quarantine/triage.js";
import {
  matchOrgInIndex,
  promoteOne,
  type OrgIndexEntry,
} from "../quarantine/promote.js";
import { reviewSnapshot } from "../quarantine/review-index.js";
import { z } from "zod";
import { parseBody, invalidBody } from "./body-validation.js";

/** Retire la clé réservée du contenu extrait avant exposition. */
function stripReview(extracted: unknown): unknown {
  if (!extracted || typeof extracted !== "object") return extracted;
  const { _review: _journal, ...rest } = extracted as Record<string, unknown>;
  return rest;
}

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

/** Routes sans corps : `{}` est valide, toute clé supplémentaire est refusée. */
const EmptyBody = z.strictObject({});

const ReviewBody = z.strictObject({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(["promote", "reject", "review", "undo"]),
  reason: z.string().trim().max(500).optional(),
}).refine(
  (body) => body.action !== "reject" || (body.reason?.length ?? 0) > 0,
  { message: "reason requis pour un rejet", path: ["reason"] },
);

export default async function (app: FastifyInstance) {
  /**
   * Faits de quarantaine, organisation rapprochée quand l'indice correspond.
   * Niveau 4 (déploiement privé) : `rawBody` expose le corps brut tel que
   * collecté, y compris pour les faits TLP:RED.
   */
  app.get("/quarantine", { preHandler: requireRole("lecteur") }, async (req: FastifyRequest, reply) => {
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
      `SELECT q.id, q.raw_body, q.source, q.source_url, q.groupe, q.org_hint, q.claimed_at, q.extracted, q.tlp,
              q.status, q.promoted, q.promoted_at, q.promoted_by, q.received_at, q.purge_after, q.content_hash
       FROM quarantine_raw q
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY q.received_at DESC, q.id DESC LIMIT $${limitIdx}`,
      params
    );

    const index = (await reviewSnapshot(r.rows.map((row) => String(row.org_hint ?? "")))).orgIndex;
    const orgById = new Map(index.map((e) => [e.id, e]));
    const out: Record<string, unknown>[] = [];
    for (const row of r.rows) {
      // Niveau 4 : le destinataire autorisé lit les faits TLP:RED et leur
      // contenu extrait ; le rattachement reste calculé sur `org_hint`.
      const m = matchOrgInIndex(String(row.org_hint ?? ""), index);
      out.push({
        // `bigint` arrive en chaîne de pg ; le contrat /api/quarantine expose
        // un nombre, comme les autres identifiants de l'API.
        id: Number(row.id),
        source: row.source,
        sourceUrl: row.source_url,
        groupe: row.groupe,
        orgHint: row.org_hint,
        extracted: stripReview(row.extracted),
        claimedAt: row.claimed_at,
        // `_review` est notre journal de décisions, pas du contenu extrait :
        // il sort par son propre champ, jamais dans la charge utile source.
        rawBody: row.raw_body,
        review: Array.isArray((row.extracted as Record<string, unknown> | null)?.["_review"])
          ? (row.extracted as Record<string, unknown>)["_review"]
          : [],
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

  /** Corps brut d'un fait de quarantaine, tel qu'encodé par le collecteur. */
  app.get<{ Params: { id: string } }>(
    "/quarantine/:id/raw",
    { preHandler: requireRole("analyste") },
    async (req) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("identifiant de quarantaine invalide");
      const result = await query<{
        id: string;
        raw_body: string | null;
        extracted: Record<string, unknown> | null;
        source: string;
        source_url: string | null;
        tlp: string | null;
      }>(
        `SELECT id, raw_body, extracted, source, source_url, tlp
           FROM quarantine_raw WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) throw notFound(`quarantine fact ${id} not found`);
      return {
        id: Number(row.id),
        rawBody: row.raw_body,
        extracted: stripReview(row.extracted),
        source: row.source,
        sourceUrl: row.source_url,
        tlp: row.tlp,
      };
    },
  );

  /** Comptes par statut, promotion et source. */
  app.get("/quarantine/stats", { preHandler: requireRole("lecteur") }, async (req: FastifyRequest, reply) => {
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

  /**
   * File de revue priorisée : score, seau, suggestion et trace du calcul.
   * Authentifiée comme le reste de la quarantaine — les métadonnées seules
   * sont exposées, jamais le corps brut.
   */
  app.get("/quarantine/queue", { preHandler: requireRole("analyste") }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const bucket = q.bucket && ["chaud", "tiede", "froid"].includes(q.bucket)
      ? (q.bucket as TriageBucket)
      : null;
    const page = Number(q.page);
    const limit = Number(q.limit);
    return reviewQueue({
      status: q.status || null,
      bucket,
      source: q.source || null,
      groupe: q.groupe || null,
      q: q.q || null,
      page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 0,
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50,
    });
  });

  /**
   * Décision groupée. Le motif est obligatoire pour un rejet : une file de
   * revue qui n'explique pas ses refus ne se relit pas.
   */
  app.post("/quarantine/review", { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = parseBody(ReviewBody, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const { ids, action, reason } = parsed.data;
    return applyReview(ids, action, reason ?? null, req.user!.email);
  });

  /** Promotion manuelle par un analyste connecté. */
  app.post<{ Params: { id: string } }>(
    "/quarantine/:id/promote",
    { preHandler: requireAuth() },
    async (req, reply) => {
      const parsed = parseBody(EmptyBody, req.body);
      if (!parsed.success) return invalidBody(reply, parsed.error);
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw badRequest("invalid id");
      }
      const result = await promoteOne(id, req.user!.email);
      if (!result.found) {
        throw notFound();
      }
      return result;
    }
  );
}
