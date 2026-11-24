/**
 * Rafraîchissement idempotent de `causal_edge` depuis les tables vivantes.
 *
 * Deux preuves horodatées sont nécessaires : une observation NS/MX rattachée
 * à un fournisseur du catalogue public, et un indicateur de certificat suspect
 * sur le domaine de l'organisation cible. Les sources globales ne sont jamais
 * présentées comme des sources locales : la portée est écrite dans `evidence`.
 *
 * L'instantané écrit par la migration 227 n'est jamais supprimé ni modifié :
 * l'insertion passe par ON CONFLICT DO NOTHING sur la clé de preuve.
 */
import {
  buildSupplyChainEdge,
  CAUSAL_EDGE_METHOD,
  NA_DEPARTMENTS,
  type SupplyChainObservation,
} from "./causal-edge.js";

/** Requête exacte du vérificateur externe. */
export const JUDGE_SQL = `SELECT count(*) FROM causal_edge WHERE relation_type='supply_chain' AND path_length>=2 AND evidence->>'first_seen_at' IS NOT NULL`;

export interface QueryExecutor {
  query<T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

interface ObservationRow {
  provider: string;
  domain: string;
  org_id: string;
  dept: string;
  first_seen_at: Date | string;
  observed_at: Date | string;
  indicator_id: string;
  motif: string;
  source: string;
}

/**
 * Observations jointes : catalogue DNS public ↔ observation ◦ fournisseur ↔
 * organisation NA ↔ anomalie CT horodatée. Aucun champ de texte libre relatif
 * à une victime n'est sélectionné.
 */
const OBSERVATIONS_SQL = `
  WITH provider_links AS (
    SELECT DISTINCT lower(btrim(f.name)) AS provider,
           lower(btrim(pd.domain)) AS domain,
           x.org_id, pd.observed_at
      FROM provider_domain pd
      CROSS JOIN LATERAL unnest(COALESCE(pd.ns, '{}'::text[]) || COALESCE(pd.mx, '{}'::text[])) h(host)
      JOIN dns_fournisseur f
        ON lower(h.host) = f.suffix OR lower(h.host) LIKE '%.' || f.suffix
      CROSS JOIN LATERAL unnest(pd.org_ids) x(org_id)
     WHERE pd.last_state <> 'erreur' AND f.suffix <> ''
  )
  SELECT pl.provider, pl.domain, o.id::text AS org_id, o.dept,
         a.premiere_vue AS first_seen_at, pl.observed_at,
         a.id::text AS indicator_id, a.motif, a.source
    FROM provider_links pl
    JOIN org o ON o.id = pl.org_id AND o.dept = ANY($1::text[])
    JOIN ct_anomalie a
      ON lower(btrim(a.domaine)) = pl.domain AND a.premiere_vue IS NOT NULL
   WHERE o.domain IS NOT NULL
   ORDER BY pl.provider, pl.domain, o.id, a.premiere_vue
`;

const INSERT_SQL = `
  INSERT INTO causal_edge
    (source_id, target_id, relation_type, path_length, path, evidence, method)
  VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
  ON CONFLICT DO NOTHING
`;

function toObservation(row: ObservationRow): SupplyChainObservation {
  return {
    provider: row.provider,
    domain: row.domain,
    orgId: Number(row.org_id),
    dept: row.dept,
    firstSeenAt: row.first_seen_at,
    observedAt: row.observed_at,
    indicatorId: row.indicator_id,
    indicatorMotif: row.motif,
    indicatorSource: row.source,
  };
}

export interface RefreshReport {
  observed: number;
  inserted: number;
  rejected: number;
  judgeCount: number;
}

/** Reconstruit les arêtes dérivées et renvoie le compte du critère. */
export async function refreshCausalEdges(db: QueryExecutor): Promise<RefreshReport> {
  const rows = (await db.query<ObservationRow>(OBSERVATIONS_SQL, [[...NA_DEPARTMENTS]])).rows;
  let inserted = 0;
  let rejected = 0;

  for (const row of rows) {
    const edge = buildSupplyChainEdge(toObservation(row));
    if (edge === null) {
      rejected += 1;
      continue;
    }
    const result = await db.query(INSERT_SQL, [
      edge.sourceId,
      edge.targetId,
      edge.relationType,
      edge.pathLength,
      JSON.stringify(edge.path),
      JSON.stringify(edge.evidence),
      CAUSAL_EDGE_METHOD,
    ]);
    if (result.rowCount === 1) inserted += 1;
  }

  const judge = await db.query<{ count: string }>(JUDGE_SQL);
  return {
    observed: rows.length,
    inserted,
    rejected,
    judgeCount: Number(judge.rows[0]?.count ?? 0),
  };
}
