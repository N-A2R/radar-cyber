import type { FastifyInstance } from "fastify";
import { ingestQuery } from "../db.js";
import { closeRun, openRun, withRunId } from "../collecte/runs.js";
import { consignerLot, type JournalEntry } from "../journal/index.js";
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

/**
 * Un corps fait 1 Mo au plus : sans borne, il tenait des milliers de petits
 * événements et autant d'INSERT séquentiels. Une poussée légitime tient dans
 * un lot de 500 ; au-delà, le client reçoit un 400 explicite au lieu de
 * saturer le pool d'ingestion.
 */
export const MAX_INGEST_EVENTS = 500;

export const ingestBodySchema = z.object({
  generated_at: z.string().optional(),
  profile: z.string().optional(),
  items_in: z.number().optional(),
  events: z.array(eventSchema).max(MAX_INGEST_EVENTS),
});

type IngestBody = z.infer<typeof ingestBodySchema>;

/**
 * Un seul INSERT pour tout le lot admis. `unnest` garde l'ordre des tableaux
 * et `WITH ORDINALITY` permet de restituer insertion/refus dans l'ordre du
 * corps, exactement comme la boucle d'avant — sans un aller-retour base par
 * événement.
 */
const SQL_INGERER_LOT = `
WITH src AS (
  SELECT ord,
         dedup_key, family, assertion_type, title, summary,
         observed_at::timestamptz AS observed_at, severity::smallint AS severity,
         confidence, source_id, source_url, evidence::text::jsonb AS evidence,
         geo_type, regional::boolean AS regional, regional_motif, langue,
         pertinence_score::smallint AS pertinence_score, pertinence_rule
    FROM unnest(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[],
      $7::smallint[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[],
      $13::boolean[], $14::text[], $15::text[], $16::smallint[], $17::text[]
    ) WITH ORDINALITY AS t(
      dedup_key, family, assertion_type, title, summary, observed_at, severity,
      confidence, source_id, source_url, evidence, geo_type, regional,
      regional_motif, langue, pertinence_score, pertinence_rule, ord
    )
), ins AS (
  INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, observed_at,
                     severity, confidence, source_id, source_url, evidence, geo_type,
                     regional, regional_motif, pertinence_score, pertinence_rule)
  SELECT dedup_key, family, assertion_type, title, summary, langue, observed_at,
         severity, confidence, source_id, source_url, evidence, geo_type,
         regional, regional_motif, pertinence_score, pertinence_rule
    FROM src
   ORDER BY ord
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING dedup_key AS cle
)
SELECT cle FROM ins
`;

type LigneAdmise = {
  dedupKey: string;
  family: string;
  assertionType: string;
  title: string;
  summary: string | null;
  observedAt: string | null;
  severity: number;
  confidence: string;
  sourceId: string;
  sourceUrl: string;
  evidence: string;
  geoType: string;
  regional: boolean;
  regionalMotif: string | null;
  langue: string;
  pertinenceScore: number;
  pertinenceRule: string | null;
  run: { id: number; itemsIn: number; itemsNew: number };
};

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
    const faits: JournalEntry[] = [];
    // Une provenance inconnue doit être un refus lisible, pas une violation de
    // clé étrangère en 500. Le contrat ne touche pas la base : ce contrôle
    // d'existence reste ici, où la connexion vit.
    const known = new Set<string>(
      (await ingestQuery<{ id: string }>("SELECT id FROM source")).rows.map((r) => r.id)
    );
    // Un run par source effectivement écrite : la requête HTTP est elle-même
    // un collecteur, et chaque événement qu'elle admet le cite (migration 206).
    const runs = new Map<string, { id: number; itemsIn: number; itemsNew: number }>();
    const runFor = async (sourceId: string) => {
      let run = runs.get(sourceId);
      if (!run) {
        run = { id: await openRun(sourceId, "ingest"), itemsIn: 0, itemsNew: 0 };
        runs.set(sourceId, run);
      }
      return run;
    };
    const closeAll = async (status: "ok" | "error", error?: string) => {
      for (const run of runs.values()) {
        await closeRun(run.id, { status, itemsIn: run.itemsIn, itemsNew: run.itemsNew, ...(error ? { error } : {}) }).catch(() => {});
      }
    };
    try {
      const lignes: LigneAdmise[] = [];
      for (const e of events as IngestEvent[]) {
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
        const run = await runFor(event.sourceId);
        run.itemsIn += 1;
        const portee = porteeRegionale(`${event.title} ${event.summary ?? ""}`, null);
        lignes.push({
          dedupKey: event.dedupKey,
          family: event.family,
          assertionType: event.assertionType,
          title: event.title,
          summary: event.summary ?? null,
          observedAt: event.observedAt ?? null,
          severity: event.severity,
          confidence: event.confidence ?? "C3",
          sourceId: event.sourceId,
          sourceUrl: event.sourceUrl ?? `urn:source:${event.sourceId}`,
          evidence: JSON.stringify(withRunId(event.evidence ?? {}, run.id)),
          geoType: event.geoType,
          regional: portee.regional,
          regionalMotif: portee.motif,
          langue: langue.language,
          pertinenceScore: pertinence.score,
          pertinenceRule: pertinence.rule,
          run,
        });
      }

      if (lignes.length > 0) {
        const r = await ingestQuery<{ cle: string }>(SQL_INGERER_LOT, [
          lignes.map((l) => l.dedupKey),
          lignes.map((l) => l.family),
          lignes.map((l) => l.assertionType),
          lignes.map((l) => l.title),
          lignes.map((l) => l.summary),
          lignes.map((l) => l.observedAt),
          lignes.map((l) => l.severity),
          lignes.map((l) => l.confidence),
          lignes.map((l) => l.sourceId),
          lignes.map((l) => l.sourceUrl),
          lignes.map((l) => l.evidence),
          lignes.map((l) => l.geoType),
          lignes.map((l) => l.regional),
          lignes.map((l) => l.regionalMotif),
          lignes.map((l) => l.langue),
          lignes.map((l) => l.pertinenceScore),
          lignes.map((l) => l.pertinenceRule),
        ]);
        // `RETURNING` ne rend qu'une ligne par clé réellement insérée. On
        // consomme ce set dans l'ordre du corps pour garder le même couple
        // (inserted, skipped) qu'avec les INSERT individuels.
        const aInserer = new Set(r.rows.map((row) => row.cle));
        for (const ligne of lignes) {
          if (!aInserer.has(ligne.dedupKey)) {
            skipped++;
            continue;
          }
          aInserer.delete(ligne.dedupKey);
          inserted++;
          ligne.run.itemsNew += 1;
          faits.push({
            kind: "event.admitted",
            subject: ligne.dedupKey,
            summary: `${ligne.sourceId} : événement admis via POST /api/ingest`,
            actor: "collecteur:ingest_http",
            payload: { family: ligne.family, assertionType: ligne.assertionType },
            validAt: ligne.observedAt,
          });
        }
      }
      if (faits.length > 0) await consignerLot(faits);
    } catch (error) {
      await closeAll("error", error instanceof Error ? error.message : String(error));
      throw error;
    }
    await closeAll("ok");
    return { inserted, skipped, contract: contract.detail(), rejected };
  });
}
