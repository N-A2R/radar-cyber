// Persistance des décisions : une campagne est un `bandit_run`, ses 1 000
// tirages sont des `bandit_decision` immuables. Réenregistrer la même campagne
// ne duplique aucune décision (contrainte d'unicité en base).
import type { PoolClient } from "pg";
import type { ResultatBandit } from "./sources.js";

export async function enregistrerBandit(
  client: PoolClient,
  runId: string,
  resultat: ResultatBandit,
  fenetreJours: number,
): Promise<{ decisions: number }> {
  const m = resultat.metriques;
  const c = resultat.config;
  await client.query(
    `INSERT INTO bandit_run (
       run_id, algorithme, graine, fenetre_jours, nb_decisions, items_par_decision,
       prior_pondere, taux_reference, taux_cible, oracle_source_id, taux_oracle,
       rendement_observe, regret_cumule, regret_pct
     ) VALUES ($1, 'thompson-beta', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (run_id) DO NOTHING`,
    [
      runId,
      c.graine,
      fenetreJours,
      c.nbDecisions,
      c.itemsParDecision,
      c.poidsPrior,
      m.tauxReference,
      m.tauxCible,
      m.oracleSourceId,
      m.tauxOracle,
      m.rendement,
      m.regretCumule,
      m.regretPct,
    ],
  );

  const d = resultat.decisions;
  const res = await client.query(
    `INSERT INTO bandit_decision (
       run_id, tour, source_id, score_echantillone, items_lus, evenements_nouveaux,
       taux_observe, taux_oracle, regret_attendu, regret_cumule, posterior_alpha, posterior_beta
     )
     SELECT $1, t.tour, t.source_id, t.score, t.items, t.nouveaux,
            t.taux_observe, t.taux_oracle, t.regret, t.regret_cumule, t.alpha, t.beta
       FROM unnest(
         $2::integer[], $3::text[], $4::numeric[], $5::integer[], $6::integer[],
         $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[],
         $11::numeric[], $12::numeric[]
       ) AS t(tour, source_id, score, items, nouveaux, taux_observe, taux_oracle,
              regret, regret_cumule, alpha, beta)
     ON CONFLICT (run_id, tour) DO NOTHING
     RETURNING 1`,
    [
      runId,
      d.map((x) => x.tour),
      d.map((x) => x.sourceId),
      d.map((x) => x.scoreEchantillone),
      d.map((x) => x.itemsLus),
      d.map((x) => x.evenementsNouveaux),
      d.map((x) => x.tauxObserve),
      d.map((x) => x.tauxOracle),
      d.map((x) => x.regretAttendu),
      d.map((x) => x.regretCumule),
      d.map((x) => x.posteriorAlpha),
      d.map((x) => x.posteriorBeta),
    ],
  );
  return { decisions: res.rowCount ?? 0 };
}
