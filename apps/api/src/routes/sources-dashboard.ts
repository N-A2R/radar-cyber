/**
 * GET /api/sources/dashboard — tableau de bord des sources, en une requête
 * HTTP. Chaque chiffre est calculé en base au moment de l'appel : aucune
 * constante, aucun compteur conservé en mémoire, aucune valeur inventée par
 * le navigateur.
 *
 * Définitions (le front ne fait que les afficher) :
 *  - `morte` : `source.statut = 'morte'`, décision explicite ; cette règle
 *    prime sur toutes les autres.
 *  - `muette` : collectée avec succès sur 7 j, au moins un fait dans son
 *    historique, mais aucun fait sur 7 j. Une source qui n'a jamais rendu
 *    n'est pas muette : son silence n'a pas de point de départ mesuré.
 *  - `lente` : dernier run réussi sur 7 j dont la durée dépasse 30 s, le
 *    timeout de `fetchText` du collecteur générique. Un run lent mais muet
 *    reste compté `muette` : le silence prime sur la vitesse.
 *  - `ok200` : dernier run réussi sur 7 j dans les trois cas ci-dessus.
 *  - `dormante` : aucun run réussi sur 7 j. Ce seaux est affiché pour que la
 *    somme des états soit égale au nombre de sources déclarées : une source
 *    qu'on n'interroge plus n'est pas prouvée saine.
 *  - `rendement` : événements des 30 derniers jours / entrées lues sur la
 *    même fenêtre (`collector_run.items_in`). `null` si rien n'a été lu —
 *    ce n'est pas 0 %. Même définition que `GET /api/sources`.
 *  - `evolution` : une ligne par jour UTC des 7 derniers jours, y compris
 *    les jours sans événement (un zéro mesuré, pas une case vide).
 *  - `collecte.dureeTotaleMs` : somme des durées réelles des runs terminés
 *    sur 7 j, tous statuts confondus. Des runs concurrents peuvent se
 *    chevaucher : c'est un temps de collecte cumulé, pas un temps horloge.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export const FENETRE_JOURS = 7;
export const FENETRE_RENDEMENT_JOURS = 30;
/** Timeout d'un fetch du collecteur générique (`apps/api/src/collectors/generic.ts`). */
export const SEUIL_LENTE_MS = 30_000;
export const LIMITE_CLASSEMENT = 10;

export type EtatSource = "ok200" | "muette" | "morte" | "lente" | "dormante";

export type SourceRendement = {
  id: string;
  name: string;
  family: string;
  entrees: number;
  evenements: number;
  rendement: number | null;
};

export type JourEvolution = {
  date: string;
  evenements: number;
  entrees: number;
  sourcesActives: number;
};

export type SourcesDashboard = {
  generatedAt: string;
  fenetreJours: typeof FENETRE_JOURS;
  fenetreRendementJours: typeof FENETRE_RENDEMENT_JOURS;
  seuilLenteMs: typeof SEUIL_LENTE_MS;
  limiteClassement: typeof LIMITE_CLASSEMENT;
  totalSources: number;
  etats: Record<EtatSource, number>;
  meilleures: SourceRendement[];
  pires: SourceRendement[];
  evolution: JourEvolution[];
  collecte: { dureeTotaleMs: number; runs: number };
};

type EtatRow = {
  ok200: string | number;
  muette: string | number;
  morte: string | number;
  lente: string | number;
  dormante: string | number;
  total: string | number;
};

type RendementRow = {
  id: string;
  name: string;
  family: string;
  entrees: string | number;
  evenements: string | number;
  rendement: string | number | null;
};

type EvolutionRow = {
  date: string;
  evenements: string | number;
  entrees: string | number;
  sources_actives: string | number;
};

type CollecteRow = { duree_totale_ms: string | number; runs: string | number };

const CLASSEMENT = `
  WITH runs30 AS (
    SELECT source_id, sum(items_in)::int AS entrees
      FROM collector_run
     WHERE started_at >= now() - interval '30 days'
     GROUP BY source_id
  ),
  ev30 AS (
    SELECT source_id, count(*)::int AS evenements
      FROM event
     WHERE COALESCE(observed_at, collected_at) >= now() - interval '30 days'
     GROUP BY source_id
  ),
  mesures AS (
    SELECT s.id, s.name, s.family,
           r.entrees,
           COALESCE(e.evenements, 0)::int AS evenements,
           CASE WHEN r.entrees > 0
                THEN round(COALESCE(e.evenements, 0)::numeric / r.entrees, 3)::float8
                ELSE NULL END AS rendement
      FROM runs30 r
      JOIN source s ON s.id = r.source_id
      LEFT JOIN ev30 e ON e.source_id = r.source_id
     WHERE r.entrees > 0
  )
`;

function sourceRendement(row: RendementRow): SourceRendement {
  return {
    id: row.id,
    name: row.name,
    family: row.family,
    entrees: Number(row.entrees),
    evenements: Number(row.evenements),
    rendement: row.rendement === null ? null : Number(row.rendement),
  };
}

export default async function (app: FastifyInstance) {
  app.get("/sources/dashboard", async () => {
    const [etats, meilleures, pires, evolution, collecte] = await Promise.all([
      query<EtatRow>(
        `WITH dernier_run AS (
           SELECT DISTINCT ON (source_id) source_id,
                  extract(epoch FROM (finished_at - started_at)) * 1000 AS duree_ms
             FROM collector_run
            WHERE status = 'ok' AND finished_at >= now() - interval '7 days'
            ORDER BY source_id, finished_at DESC
         ),
         production AS (
           SELECT source_id, count(*)::int AS n
             FROM event
            WHERE COALESCE(observed_at, collected_at) >= now() - interval '7 days'
            GROUP BY source_id
         ),
         historique AS (
           SELECT source_id, count(*)::int AS n FROM event GROUP BY source_id
         )
         SELECT count(*) FILTER (WHERE s.statut = 'morte')::int AS morte,
                count(*) FILTER (
                  WHERE s.statut <> 'morte' AND r.source_id IS NOT NULL
                    AND COALESCE(h.n, 0) > 0 AND COALESCE(p.n, 0) = 0
                )::int AS muette,
                count(*) FILTER (
                  WHERE s.statut <> 'morte' AND r.source_id IS NOT NULL
                    AND NOT (COALESCE(h.n, 0) > 0 AND COALESCE(p.n, 0) = 0)
                    AND r.duree_ms > $1::numeric
                )::int AS lente,
                count(*) FILTER (
                  WHERE s.statut <> 'morte' AND r.source_id IS NOT NULL
                    AND NOT (COALESCE(h.n, 0) > 0 AND COALESCE(p.n, 0) = 0)
                    AND r.duree_ms <= $1::numeric
                )::int AS ok200,
                count(*) FILTER (WHERE s.statut <> 'morte' AND r.source_id IS NULL)::int AS dormante,
                count(*)::int AS total
           FROM source s
           LEFT JOIN dernier_run r ON r.source_id = s.id
           LEFT JOIN production p ON p.source_id = s.id
           LEFT JOIN historique h ON h.source_id = s.id`,
        [SEUIL_LENTE_MS],
      ),
      query<RendementRow>(
        `${CLASSEMENT}
         SELECT id, name, family, entrees, evenements, rendement
           FROM mesures
          ORDER BY rendement DESC, evenements DESC, id
          LIMIT $1`,
        [LIMITE_CLASSEMENT],
      ),
      query<RendementRow>(
        `${CLASSEMENT}
         SELECT id, name, family, entrees, evenements, rendement
           FROM mesures
          ORDER BY rendement ASC, evenements DESC, id
          LIMIT $1`,
        [LIMITE_CLASSEMENT],
      ),
      query<EvolutionRow>(
        `WITH jours AS (
           SELECT generate_series((current_date - interval '6 days')::date,
                                  current_date::date,
                                  interval '1 day')::date AS jour
         ),
         evenements AS (
           SELECT (COALESCE(observed_at, collected_at) AT TIME ZONE 'UTC')::date AS jour,
                  count(*)::int AS n,
                  count(DISTINCT source_id)::int AS sources
             FROM event
            WHERE COALESCE(observed_at, collected_at) >= (current_date - interval '6 days')
            GROUP BY 1
         ),
         runs AS (
           SELECT (finished_at AT TIME ZONE 'UTC')::date AS jour,
                  sum(items_in)::int AS entrees
             FROM collector_run
            WHERE status = 'ok' AND finished_at >= (current_date - interval '6 days')
            GROUP BY 1
         )
         SELECT to_char(j.jour, 'YYYY-MM-DD') AS date,
                COALESCE(e.n, 0)::int AS evenements,
                COALESCE(r.entrees, 0)::int AS entrees,
                COALESCE(e.sources, 0)::int AS sources_actives
           FROM jours j
           LEFT JOIN evenements e ON e.jour = j.jour
           LEFT JOIN runs r ON r.jour = j.jour
          ORDER BY j.jour`,
      ),
      query<CollecteRow>(
        `SELECT COALESCE(sum(GREATEST(0, extract(epoch FROM (finished_at - started_at)) * 1000)), 0)::bigint
                AS duree_totale_ms,
                count(*)::int AS runs
           FROM collector_run
          WHERE finished_at >= now() - interval '7 days' AND status <> 'running'`,
      ),
    ]);

    const e = etats.rows[0]!;
    const c = collecte.rows[0]!;
    return {
      generatedAt: new Date().toISOString(),
      fenetreJours: FENETRE_JOURS,
      fenetreRendementJours: FENETRE_RENDEMENT_JOURS,
      seuilLenteMs: SEUIL_LENTE_MS,
      limiteClassement: LIMITE_CLASSEMENT,
      totalSources: Number(e.total),
      etats: {
        ok200: Number(e.ok200),
        muette: Number(e.muette),
        morte: Number(e.morte),
        lente: Number(e.lente),
        dormante: Number(e.dormante),
      },
      meilleures: meilleures.rows.map(sourceRendement),
      pires: pires.rows.map(sourceRendement),
      evolution: evolution.rows.map((r) => ({
        date: r.date,
        evenements: Number(r.evenements),
        entrees: Number(r.entrees),
        sourcesActives: Number(r.sources_actives),
      })),
      collecte: {
        dureeTotaleMs: Number(c.duree_totale_ms),
        runs: Number(c.runs),
      },
    } satisfies SourcesDashboard;
  });
}
