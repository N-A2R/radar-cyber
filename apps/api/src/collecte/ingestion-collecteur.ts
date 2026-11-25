/**
 * Écriture des événements produits par les collecteurs dédiés via l'API.
 *
 * La colonne `langue` précède `observed_at`, `valid_at` et `severity` dans
 * l'INSERT : les paramètres sont numérotés explicitement pour que la date
 * ISO ne puisse pas glisser dans le smallint de sévérité (incident cisa_kev).
 */
import type { NormalizedEvent } from "@radar/shared";
import { ingestQuery } from "../db.js";
import { withRunId } from "./runs.js";

export const SQL_INGERER_EVENEMENT_COLLECTEUR = `
  INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue,
                     observed_at, valid_at, severity, confidence, source_id, source_url,
                     evidence, geo_type, lat, lon, regional, regional_motif,
                     pertinence_score, pertinence_rule)
  VALUES ($1,$2,$3,$4,$5,$18,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$19,$20)
  ON CONFLICT (dedup_key) DO UPDATE SET observed_at = COALESCE(event.observed_at, EXCLUDED.observed_at)
`;

export type ContexteIngestionCollecteur = {
  runId: number;
  langue: string;
  regional: boolean;
  regionalMotif: string | null;
  pertinenceScore: number;
  pertinenceRule: string | null;
  sourceUrlParDefaut: string;
};

/** Insère un événement admis en citant le run de collecte qui l'a produit. */
export async function ingererEvenementCollecteur(
  event: NormalizedEvent,
  ctx: ContexteIngestionCollecteur,
): Promise<number> {
  const r = await ingestQuery(
    SQL_INGERER_EVENEMENT_COLLECTEUR,
    [event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null,
      event.observedAt ?? null, event.observedAt ?? new Date().toISOString(), event.severity,
      event.confidence ?? null, event.sourceId, event.sourceUrl ?? ctx.sourceUrlParDefaut,
      JSON.stringify(withRunId(event.evidence ?? {}, ctx.runId)), event.geoType,
      event.lat ?? null, event.lon ?? null, ctx.regional, ctx.regionalMotif, ctx.langue,
      ctx.pertinenceScore, ctx.pertinenceRule],
  );
  return r.rowCount ?? 0;
}
