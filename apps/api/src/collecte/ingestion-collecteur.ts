/**
 * Écriture des événements produits par les collecteurs dédiés via l'API.
 *
 * La colonne `langue` précède `observed_at`, `valid_at` et `severity` dans
 * l'INSERT : les paramètres sont numérotés explicitement pour que la date
 * ISO ne puisse pas glisser dans le smallint de sévérité (incident cisa_kev).
 *
 * Le même SQL est utilisé par le cycle partagé : un conflit sur `dedup_key`
 * rafraîchit les champs que la source peut corriger, sans toucher aux
 * décisions enrichies en aval. Les deux chemins ne doivent pas diverger.
 */
import type { NormalizedEvent } from "@radar/shared";
import { ingestQuery } from "../db.js";
import { withRunId } from "./runs.js";

export const SQL_INGERER_EVENEMENT_COLLECTEUR = `
WITH src AS (
  SELECT $1::text AS dedup_key, $2::text AS family, $3::text AS assertion_type,
         $4::text AS title, $5::text AS summary, $6::timestamptz AS observed_at,
         $7::timestamptz AS valid_at, $8::smallint AS severity, $9::text AS confidence,
         $10::text AS source_id, $11::text AS source_url, $12::jsonb AS evidence,
         $13::text AS geo_type, $14::double precision AS lat, $15::double precision AS lon,
         $16::boolean AS regional, $17::text AS regional_motif, $18::text AS langue,
         $19::smallint AS pertinence_score, $20::text AS pertinence_rule
), ins AS (
  INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, valid_at,
                     severity, confidence, source_id, source_url, evidence, geo_type, lat, lon,
                     regional, regional_motif, langue, pertinence_score, pertinence_rule)
  SELECT dedup_key, family, assertion_type, title, summary, observed_at, valid_at,
         severity, confidence, source_id, source_url, evidence, geo_type, lat, lon,
         regional, regional_motif, langue, pertinence_score, pertinence_rule
  FROM src
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING id
), avant AS (
  SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN e.title IS DISTINCT FROM s.title THEN 'title' END,
    CASE WHEN e.summary IS DISTINCT FROM s.summary THEN 'summary' END,
    CASE WHEN e.severity IS DISTINCT FROM s.severity THEN 'severity' END,
    CASE WHEN e.confidence IS DISTINCT FROM s.confidence THEN 'confidence' END,
    CASE WHEN e.source_url IS DISTINCT FROM s.source_url THEN 'source_url' END,
    CASE WHEN e.geo_type IS DISTINCT FROM s.geo_type THEN 'geo_type' END,
    CASE WHEN e.lat IS DISTINCT FROM s.lat THEN 'lat' END,
    CASE WHEN e.lon IS DISTINCT FROM s.lon THEN 'lon' END,
    CASE WHEN e.langue IS DISTINCT FROM s.langue THEN 'langue' END,
    CASE WHEN e.pertinence_score IS DISTINCT FROM s.pertinence_score THEN 'pertinence_score' END,
    CASE WHEN e.pertinence_rule IS DISTINCT FROM s.pertinence_rule THEN 'pertinence_rule' END
  ], NULL::text)::text[] AS champs
  FROM event e JOIN src s ON s.dedup_key = e.dedup_key
  WHERE NOT EXISTS (SELECT 1 FROM ins)
), maj AS (
  UPDATE event e SET
    title = s.title, summary = s.summary, severity = s.severity, confidence = s.confidence,
    source_url = s.source_url, geo_type = s.geo_type, lat = s.lat, lon = s.lon,
    langue = s.langue, pertinence_score = s.pertinence_score, pertinence_rule = s.pertinence_rule
  FROM src s
  WHERE e.dedup_key = s.dedup_key
    AND EXISTS (SELECT 1 FROM avant WHERE cardinality(avant.champs) > 0)
  RETURNING e.id
)
SELECT (SELECT id FROM ins) AS inserted_id,
       (SELECT champs FROM avant) AS champs,
       (SELECT id FROM maj) AS updated_id;
`;

export type ResultatIngestionCollecteur = {
	inserted_id: number | null;
	champs: string[] | null;
	updated_id: number | null;
};

export type ContexteIngestionCollecteur = {
  runId: number;
  langue: string;
  regional: boolean;
  regionalMotif: string | null;
  pertinenceScore: number;
  pertinenceRule: string | null;
  sourceUrlParDefaut: string;
};

/** Insère ou rafraîchit un événement admis, en citant le run qui l'a produit. */
export async function ecrireEvenementCollecteur(
	event: NormalizedEvent,
	ctx: ContexteIngestionCollecteur,
): Promise<ResultatIngestionCollecteur> {
	const r = await ingestQuery<ResultatIngestionCollecteur>(
		SQL_INGERER_EVENEMENT_COLLECTEUR,
		[event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null,
			event.observedAt ?? null, event.observedAt ?? new Date().toISOString(), event.severity,
			event.confidence ?? null, event.sourceId, event.sourceUrl ?? ctx.sourceUrlParDefaut,
			JSON.stringify(withRunId(event.evidence ?? {}, ctx.runId)), event.geoType,
			event.lat ?? null, event.lon ?? null, ctx.regional, ctx.regionalMotif, ctx.langue,
			ctx.pertinenceScore, ctx.pertinenceRule],
	);
	return r.rows[0] ?? { inserted_id: null, champs: null, updated_id: null };
}

/** Compatibilité : 1 seulement pour une vraie insertion, 0 pour un conflit. */
export async function ingererEvenementCollecteur(
	event: NormalizedEvent,
	ctx: ContexteIngestionCollecteur,
): Promise<number> {
	const r = await ecrireEvenementCollecteur(event, ctx);
	return r.inserted_id !== null ? 1 : 0;
}
