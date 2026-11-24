/**
 * Seconde victime d'une campagne déjà identifiée.
 *
 * La règle `second-victim@1` vit dans `db/migrate-228-second-victim.sql` :
 * une paire relie deux événements d'une même campagne, d'organisations
 * distinctes, partageant un IOC et distants d'au plus 30 jours. Dès qu'un IOC
 * est observé, les organisations déjà exposées à cet IOC reçoivent une
 * prédiction horodatée à l'instant de l'observation ; elle n'utilise aucune
 * information sur l'événement futur. Ce module ne duplique pas le SQL, il
 * déclenche le recalcul et lit le résultat.
 */
import { query } from "../db.js";

export const REGLE_SECONDE_VICTIME = "second-victim@1";
export const ORIGINE_BENCHMARK = "benchmark-second-victim@1";
export const FENETRE_JOURS = 30;
export const OBJECTIF_PAIRES = 20;
export const OBJECTIF_TAUX = 0.5;

/** Forme exécutable du critère de sortie, identique à celle du rapport. */
export const CRITERE_SECONDE_VICTIME =
  "SELECT count(*) AS paires, count(*) FILTER (WHERE predicted_before) AS predites_avant, " +
  "round(100.0 * count(*) FILTER (WHERE predicted_before) / NULLIF(count(*), 0), 1) AS pourcentage " +
  "FROM second_victim_pair WHERE gap_days <= 30";

export type ScoreSecondesVictimes = {
  paires: number;
  predites_avant: number;
  taux: number;
};

export type PaireSecondeVictime = {
  first_event_key: string;
  second_event_key: string;
  campaign_key: string;
  target_org_key: string;
  ioc: string;
  iocs: string[];
  gap_days: string;
  prediction_key: string | null;
  predicted_at: string | null;
  lead_days: string | null;
  predicted_before: boolean;
};

export type PredictionSecondeVictime = {
  prediction_key: string;
  first_event_key: string;
  target_org_key: string;
  ioc: string;
  predicted_at: string;
  horizon_days: number;
};

/** Recalcule les prédictions et les paires ; renvoie le nombre de paires écrites. */
export async function rafraichirSecondesVictimes(): Promise<number> {
  const { rows } = await query<{ total: number }>(
    "SELECT refresh_second_victim_predictions()::int AS total",
  );
  return rows[0]?.total ?? 0;
}

/** Lit le critère de sortie tel que l'exécute le vérificateur externe. */
export async function lireCritereSecondesVictimes(): Promise<{
  paires: number;
  predites_avant: number;
  pourcentage: number;
}> {
  const { rows } = await query<{ paires: string; predites_avant: string; pourcentage: string }>(
    CRITERE_SECONDE_VICTIME,
  );
  return {
    paires: Number(rows[0]?.paires ?? 0),
    predites_avant: Number(rows[0]?.predites_avant ?? 0),
    pourcentage: Number(rows[0]?.pourcentage ?? 0),
  };
}

/** Lit la vue synthétique (nombre de paires, prédictions à temps, taux). */
export async function lireScoreSecondesVictimes(): Promise<ScoreSecondesVictimes> {
  const { rows } = await query<ScoreSecondesVictimes>(
    "SELECT paires, predites_avant, taux FROM second_victim_score",
  );
  return rows[0] ?? { paires: 0, predites_avant: 0, taux: 0 };
}

/** Détail auditable des paires : clés opaques uniquement, aucun nom d'organisation. */
export async function lirePairesSecondesVictimes(): Promise<PaireSecondeVictime[]> {
  const { rows } = await query<PaireSecondeVictime>(
    `SELECT first_event_key, second_event_key, campaign_key, target_org_key, ioc, iocs,
            gap_days::text AS gap_days, prediction_key, predicted_at::text AS predicted_at,
            lead_days::text AS lead_days, predicted_before
       FROM second_victim_pair
      ORDER BY campaign_key`,
  );
  return rows;
}

/** Prédictions émises avant toute connaissance de la seconde victime. */
export async function lirePredictionsSecondesVictimes(): Promise<PredictionSecondeVictime[]> {
  const { rows } = await query<PredictionSecondeVictime>(
    `SELECT prediction_key, first_event_key, target_org_key, ioc,
            predicted_at::text AS predicted_at, horizon_days
       FROM second_victim_prediction
      ORDER BY prediction_key`,
  );
  return rows;
}
