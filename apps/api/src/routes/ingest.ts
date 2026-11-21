import type { FastifyInstance } from "fastify";
import { ingestQuery } from "../db.js";
import { consigner } from "../journal/index.js";
import { porteeRegionale } from "../match/territorial.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import { AdmissionTally, admitEvent } from "../contract/admit.js";
import { languageVerdict } from "../collectors/filter.js";
import { scoreEventPertinence } from "../collectors/pertinence.js";
import { z } from "zod";
import { parseBody, invalidBody } from "./body-validation.js";

/**
 * Événement poussé par un bot. `z.object` tolère les clés inconnues : les
 * collecteurs ajoutent parfois des champs, on ne veut pas casser un bot pour
 * une clé supplémentaire. Les réparations métier restent dans `admitEvent`.
 */
const eventSchema = z.object({
  dedup_key: z.string(),
  title: z.string(),
  family: z.string().optional(),
  assertion_type: z.string().optional(),
  summary: z.string().nullable().optional(),
  observed_at: z.string().nullable().optional(),
  severity: z.number().optional(),
  confidence: z.string().optional(),
  source_id: z.string().optional(),
  source_url: z.string().nullable().optional(),
  org_name: z.string().nullable().optional(),
  evidence: z.unknown().optional(),
});

type IngestEvent = z.infer<typeof eventSchema>;

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

const ingestBodySchema = z.object({
  generated_at: z.string().optional(),
  profile: z.string().optional(),
  items_in: z.number().optional(),
  events: z.array(eventSchema),
});

type IngestBody = z.infer<typeof ingestBodySchema>;

export default async function (app: FastifyInstance) {
  // Fenêtre glissante partagée par les écritures d'ingestion de ce serveur.
  const writeRateLimit = rateLimit({ max: 20, windowMs: 60_000 });
  app.post<{ Body: IngestBody }>("/ingest", { preHandler: [writeRateLimit, requireAuth()] }, async (req, reply) => {
    const parsed = parseBody(ingestBodySchema, req.body);
    if (!parsed.success) return invalidBody(reply, parsed.error);
    const body = parsed.data;
    const events = body.events;

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
      const langue = languageVerdict(e.title, e.summary);
      const pertinence = scoreEventPertinence({ title: e.title, summary: e.summary, sourceUrl: e.source_url });
      if (!langue.keep) {
        skipped++;
        rejected.push({ dedupKey: e.dedup_key ?? null, reasons: [`langue_${langue.language}`] });
        continue;
      }
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
        evidence: { hermes: true, profile: body.profile ?? null, org_name: e.org_name ?? null, evidence: e.evidence ?? {} },
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
        `INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, observed_at,
           severity, confidence, source_id, source_url, evidence, geo_type,
           regional, regional_motif, pertinence_score, pertinence_rule)
         VALUES ($1,$2,$3,$4,$5,$15,$6,$7,$8,$9,$10,$11,$12,$13,$14,$16,$17)
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
          ...(() => {
            const p = porteeRegionale(`${event.title} ${event.summary ?? ""}`, null);
            return [p.regional, p.motif];
          })(), langue.language, pertinence.score, pertinence.rule,
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
