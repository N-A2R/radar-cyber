/**
 * Campagnes multi-victimes invisibles.
 *
 * La règle de regroupement vit dans `db/migrate-225-campaign-cluster.sql`
 * (fonction `refresh_campaign_clusters`) : deux organisations sont reliées par
 * au moins deux IOC ou deux empreintes textuelles partagés, puis les relations
 * sont fermées par transitivité. Ce module n'en duplique pas le SQL : il
 * déclenche le recalcul et lit le critère de sortie.
 */
import { query } from "../db.js";

export const REGLE_CAMPAGNE_MV = "campaign-mv@1";
export const ORIGINE_BENCHMARK = "benchmark-campagnes-mv@1";
export const SEUIL_ORGS = 3;
export const SEUIL_SIGNAUX = 2;
export const OBJECTIF_CLUSTERS = 10;

/** Forme exécutable du critère : le `>=10` annoncé porte sur le compte. */
export const CRITERE_CAMPAGNES_MV =
  "SELECT count(*) FROM campaign_cluster WHERE org_count>=3 AND (shared_ioc>=2 OR shared_text_hash>=2)";

export type CampagneCluster = {
  cle: string;
  label: string;
  family: string;
  org_count: number;
  shared_ioc: number;
  shared_text_hash: number;
  org_keys: string[];
  iocs: string[];
  text_hashes: string[];
  /** `bigint[]` est renvoyé sous forme de chaînes par le pilote pg. */
  observation_ids: string[];
  origin: string;
};

/** Recalcule la table depuis les observations ; renvoie le nombre de clusters écrits. */
export async function rafraichirCampagnesClusters(): Promise<number> {
  const { rows } = await query<{ total: number }>(
    "SELECT refresh_campaign_clusters()::int AS total",
  );
  return rows[0]?.total ?? 0;
}

/** Lit le critère de sortie sur la table calculée. */
export async function lireCritereCampagnesClusters(): Promise<number> {
  const resultat = await query<{ count: string }>(CRITERE_CAMPAGNES_MV);
  return Number(resultat.rows[0]?.count ?? 0);
}

/** Détail des clusters, utile au rapport et aux tests d'auditabilité. */
export async function lireCampagnesClusters(): Promise<CampagneCluster[]> {
  const { rows } = await query<CampagneCluster>(
    `SELECT cle, label, family, org_count, shared_ioc, shared_text_hash,
            org_keys, iocs, text_hashes, observation_ids, origin
       FROM campaign_cluster
      ORDER BY cle`,
  );
  return rows;
}
