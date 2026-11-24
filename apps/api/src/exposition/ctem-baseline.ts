/**
 * Lecture de la mesure de base CTEM définie par la migration 220.
 *
 * Les calculs vivent dans PostgreSQL (vue et fonction) pour que le juge puisse
 * exécuter la même requête que le tableau de bord. Ce module ne fait que
 * convertir les types renvoyés par `pg` (bigint et numeric arrivent en texte).
 */
import { query } from "../db.js";

export type CtemBaselineMeasure = {
  organisations_avec_actif: number;
  organisations_exposees: number;
  couverture: number;
  age_median_jours: number;
  organisations_fraiches: number;
  taux_fraicheur: number;
  services: number;
  ports_distincts: number;
};

export type CtemExpositionLigne = {
  org_id: number;
  nb_actifs: number;
  expose: boolean;
  nb_services: number;
  ports: number[];
  services: string[];
  sources: string[];
  derniere_consultation: Date | null;
  age_jours: number | null;
  fraicheur: string;
};

const MESURE_COLONNES = `
  organisations_avec_actif::int AS organisations_avec_actif,
  organisations_exposees::int AS organisations_exposees,
  couverture::float AS couverture,
  age_median_jours::float AS age_median_jours,
  organisations_fraiches::int AS organisations_fraiches,
  taux_fraicheur::float AS taux_fraicheur,
  services::int AS services,
  ports_distincts::int AS ports_distincts
`;

/** Mesure agrégée, sur toute la base ou sur un jeu d'organisations. */
export async function measureCtemBaseline(orgIds?: readonly number[]): Promise<CtemBaselineMeasure> {
  const res = await query<CtemBaselineMeasure>(
    `SELECT ${MESURE_COLONNES} FROM ctem_exposition_baseline_mesurer($1::integer[])`,
    [orgIds?.length ? [...orgIds] : null],
  );
  const mesure = res.rows[0];
  if (!mesure) throw new Error("la mesure de base CTEM n'a renvoyé aucune ligne");
  return mesure;
}

/** Une ligne par organisation avec actif : exposition, ports, services et fraîcheur. */
export async function lireCtemExposition(orgIds?: readonly number[]): Promise<CtemExpositionLigne[]> {
  const res = await query<CtemExpositionLigne>(
    `SELECT org_id,
            nb_actifs::int AS nb_actifs,
            expose,
            nb_services::int AS nb_services,
            ports, services, sources,
            derniere_consultation,
            age_jours::float AS age_jours,
            fraicheur
       FROM ctem_exposition_baseline
      WHERE $1::integer[] IS NULL OR org_id = ANY($1::integer[])
      ORDER BY org_id`,
    [orgIds?.length ? [...orgIds] : null],
  );
  return res.rows;
}
