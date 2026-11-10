import type { FastifyInstance } from "fastify";
import { ingestQuery } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * Ingestion externe (bots Hermes, scripts).
 *
 * Le mode « fichier » du collecteur Hermes écrit dans `out/` ; ce endpoint
 * permet la remontée HTTP directe quand la box joignable en HTTPS.
 * Protégé par authentification : n'importe qui sur le réseau ne peut pas
 * injecter des événements.
 */
interface IngestEvent {
  dedup_key: string;
  family?: string;
  assertion_type?: string;
  title: string;
  summary?: string | null;
  observed_at?: string | null;
  severity?: number;
  confidence?: string;
  source_id?: string;
  source_url?: string | null;
  org_name?: string | null;
  evidence?: unknown;
}

interface IngestBody {
  generated_at?: string;
  profile?: string;
  items_in?: number;
  events?: IngestEvent[];
}

export default async function (app: FastifyInstance) {
  app.post<{ Body: IngestBody }>("/ingest", { preHandler: requireAuth() }, async (req, reply) => {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (events.length === 0) return { inserted: 0, skipped: 0 };

    let inserted = 0;
    let skipped = 0;
    for (const e of events) {
      if (!e.dedup_key || !e.title) { skipped++; continue; }
      const r = await ingestQuery<{ inserted: boolean }>(
        `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
           severity, confidence, source_id, source_url, evidence, geo_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'unknown')
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [
          e.dedup_key,
          e.family ?? "cti",
          e.assertion_type ?? "ambient_signal",
          String(e.title).slice(0, 400),
          e.summary ? String(e.summary).slice(0, 4000) : null,
          e.observed_at ?? null,
          e.severity ?? 2,
          e.confidence ?? "C3",
          e.source_id ?? "hermes",
          e.source_url ?? null,
          JSON.stringify({ hermes: true, profile: req.body?.profile ?? null, org_name: e.org_name ?? null, evidence: e.evidence ?? {} }),
        ]
      );
      if (r.rows[0]?.inserted) inserted++; else skipped++;
    }
    return { inserted, skipped };
  });
}
