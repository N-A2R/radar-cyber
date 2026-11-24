/**
 * Alerte précoce NIS2 à 24 heures : le brouillon est produit en base par la
 * migration 218 dès qu'un événement de gravité >= 4 est pris en connaissance.
 * Ce module ne ressaisit rien : il lit les brouillons, les contrôle et les
 * rend sous forme de texte daté. Aucun titre, résumé, URL ou identité ne
 * transite ici : seuls les champs structurés du brouillon sont utilisés.
 */
import { query } from "../db.js";

export const REGIME_ALERTE_24H = "NIS2_24h";
export const DELAI_ALERTE_24H_MS = 24 * 60 * 60 * 1000;

/** Critère du contrôle externe, exécuté tel quel. */
export const CRITERE_ALERTE_NIS2_24H =
  "SELECT count(*) FROM notification_brouillon WHERE regime='NIS2_24h' AND (echeance IS NULL OR payload->>'impact' IS NULL OR source_event_id IS NULL);";

export type BrouillonAlerte24h = {
  id: string;
  source_event_id: string;
  regime: typeof REGIME_ALERTE_24H;
  awareness_at: Date;
  echeance: Date;
  payload: Record<string, unknown>;
};

function date(valeur: unknown): Date {
  const parsed = valeur instanceof Date ? valeur : new Date(String(valeur));
  if (Number.isNaN(parsed.getTime())) throw new Error(`date invalide : ${String(valeur)}`);
  return parsed;
}

/** Échoue fermé : un brouillon sans horodatage ni impact n'est pas rendu. */
export function champsAlerte24h(payload: Record<string, unknown> | null | undefined): {
  awarenessAt: string;
  impact: string;
  contexte: string;
  mesures: string;
} {
  if (!payload || typeof payload !== "object") throw new Error("alerte NIS2_24h sans payload");
  const awarenessAt = payload["awareness_at"];
  if (typeof awarenessAt !== "string" || !awarenessAt.trim() || Number.isNaN(new Date(awarenessAt).getTime())) {
    throw new Error("alerte NIS2_24h sans horodatage de prise de connaissance");
  }
  const extrait = (cle: string): string => {
    const valeur = payload[cle];
    if (typeof valeur !== "string" || valeur.trim().length === 0) {
      throw new Error(`alerte NIS2_24h sans ${cle}`);
    }
    return valeur.trim();
  };
  return {
    awarenessAt,
    impact: extrait("impact"),
    contexte: extrait("contexte"),
    mesures: extrait("mesures"),
  };
}

/** Brouillon daté prêt à être transmis à l'autorité compétente. */
export function renduAlerte24h(brouillon: BrouillonAlerte24h): string {
  if (brouillon.regime !== REGIME_ALERTE_24H) {
    throw new Error(`régime inattendu : ${String(brouillon.regime)}`);
  }
  const champs = champsAlerte24h(brouillon.payload);
  const prisEnConnaissance = date(brouillon.awareness_at);
  const echeance = date(brouillon.echeance);
  if (echeance.getTime() - prisEnConnaissance.getTime() !== DELAI_ALERTE_24H_MS) {
    throw new Error("échéance NIS2_24h différente de awareness_at + 24 heures");
  }
  return [
    "# Alerte précoce NIS2 (24 heures)",
    "",
    `- Incident source : ${brouillon.source_event_id}`,
    `- Prise de connaissance : ${prisEnConnaissance.toISOString()}`,
    `- Échéance de notification : ${echeance.toISOString()}`,
    `- Destinataire : autorité compétente (ANSSI)`,
    "",
    "## 1. Contexte",
    "",
    champs.contexte,
    "",
    "## 2. Impact",
    "",
    champs.impact,
    "",
    "## 3. Mesures immédiates",
    "",
    champs.mesures,
    "",
    "Brouillon produit depuis les champs structurés de l'événement : ni donnée personnelle, ni récit de victime, ni URL d'article.",
    "",
  ].join("\n");
}

/** Produit ou rafraîchit les brouillons manquants ; renvoie le nombre écrit. */
export async function genereAlertesNis2_24h(): Promise<number> {
  const resultat = await query<{ ecrits: string }>(
    "SELECT public.nis2_alerte_24h_genere()::text AS ecrits",
  );
  return Number(resultat.rows[0]?.ecrits ?? -1);
}

export async function brouillonsAlerte24h(
  sourceEventId?: string | number,
): Promise<BrouillonAlerte24h[]> {
  const resultat = await query<BrouillonAlerte24h>(
    `SELECT id::text, source_event_id::text, regime, awareness_at, echeance, payload
       FROM notification_brouillon
      WHERE regime = $1
        AND ($2::bigint IS NULL OR source_event_id = $2)
      ORDER BY source_event_id::bigint`,
    [REGIME_ALERTE_24H, sourceEventId === undefined ? null : String(sourceEventId)],
  );
  for (const brouillon of resultat.rows) {
    brouillon.awareness_at = date(brouillon.awareness_at);
    brouillon.echeance = date(brouillon.echeance);
    champsAlerte24h(brouillon.payload);
  }
  return resultat.rows;
}

/** Nombre de brouillons incomplets : la sortie brute du juge externe. */
export async function compteurAlerte24hIncomplete(): Promise<number> {
  const resultat = await query<{ count: string }>(CRITERE_ALERTE_NIS2_24H);
  return Number(resultat.rows[0]?.count ?? -1);
}
