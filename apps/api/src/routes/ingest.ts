import type { FastifyInstance } from "fastify";
import { ingestQuery } from "../db.js";
import { consigner } from "../journal/index.js";
import { requireAuth } from "../middleware/auth.js";
import { AdmissionTally, admitEvent } from "../contract/admit.js";

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

/**
 * Source par défaut des bots Hermes.
 *
 * Était `"hermes"`, qui n'existe pas au catalogue : la clé étrangère
 * `event_source_id_fkey` rejetait l'insert en 500. Tout bot poussant sans
 * `source_id` échouait donc systématiquement — défaut invisible faute de test
 * sur cette route. Le collecteur fichier utilise déjà `hermes_radar_cyber`
 * (db/sources.sql) ; on aligne la porte HTTP dessus.
 */
const DEFAULT_SOURCE_ID = "hermes_radar_cyber";

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
    // Le contrat tranche, et le client apprend *pourquoi* : un bot qui envoie
    // une famille inconnue doit pouvoir se corriger, pas deviner.
    const contract = new AdmissionTally();
    const rejected: Array<{ dedupKey: string | null; reasons: string[] }> = [];
    // Une provenance inconnue doit être un refus lisible, pas une violation de
    // clé étrangère en 500. Le contrat ne touche pas la base : ce contrôle
    // d'existence reste ici, où la connexion vit.
    const known = new Set<string>(
      (await ingestQuery<{ id: string }>("SELECT id FROM source")).rows.map((r) => r.id)
    );
    for (const e of events) {
      const admitted = admitEvent({
        dedupKey: e.dedup_key,
        family: e.family ?? "cti",
        assertionType: e.assertion_type ?? "ambient_signal",
        title: e.title,
        summary: e.summary,
        observedAt: e.observed_at ?? undefined,
        severity: e.severity ?? 2,
        confidence: e.confidence ?? "C3",
        sourceId: e.source_id ?? DEFAULT_SOURCE_ID,
        sourceUrl: e.source_url ?? undefined,
        orgHint: e.org_name ?? undefined,
        evidence: { hermes: true, profile: req.body?.profile ?? null, org_name: e.org_name ?? null, evidence: e.evidence ?? {} },
        geoType: "unknown",
      });
      contract.record(admitted);
      if (admitted.ok && !known.has(admitted.event.sourceId)) {
        skipped++;
        rejected.push({ dedupKey: e.dedup_key ?? null, reasons: ["source-inconnue"] });
        continue;
      }
      if (!admitted.ok) {
        skipped++;
        rejected.push({ dedupKey: e.dedup_key ?? null, reasons: admitted.rejections });
        continue;
      }
      const event = admitted.event;
      const r = await ingestQuery<{ inserted: boolean }>(
        `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
           severity, confidence, source_id, source_url, evidence, geo_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [
          event.dedupKey,
          event.family,
          event.assertionType,
          event.title,
          event.summary ?? null,
          event.observedAt ?? null,
          event.severity,
          event.confidence ?? "C3",
          event.sourceId,
          event.sourceUrl ?? null,
          JSON.stringify(event.evidence ?? {}),
          event.geoType,
        ]
      );
      if (r.rows[0]?.inserted) {
        inserted++;
        await consigner({
          kind: "event.admitted",
          subject: event.dedupKey,
          summary: `${event.sourceId} : événement admis via POST /api/ingest`,
          actor: "collecteur:ingest_http",
          payload: { family: event.family, assertionType: event.assertionType },
          validAt: event.observedAt ?? null,
        });
      } else skipped++;
    }
    return { inserted, skipped, contract: contract.detail(), rejected };
  });
}
