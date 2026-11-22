-- 204 — Frise d'exposition des identifiants par organisation et par source.
--
-- Répond à trois questions sur les fuites publiques documentées :
--   * quand un domaine régional apparaît pour la première fois (`first_seen`) ;
--   * quand il a été vu pour la dernière fois (`last_seen`) ;
--   * s'il a disparu puis ressurgi (`episodes` > 1, `resurgences`).
--
-- Une ligne par couple `(org_id, source)`. La date retenue est celle de la
-- fuite (`fuite_reference.breach_date`), pas l'heure de collecte : un avis
-- public daté de 2019 reste daté de 2019 même s'il est réingéré demain. Une
-- nouvelle exposition séparée de plus de 365 jours de la précédente ouvre un
-- épisode : c'est la définition retenue d'une résurgence.
--
-- Périmètre : les douze départements de Nouvelle-Aquitaine. Une organisation
-- sans département régional n'entre pas dans la frise ; une source nationale
-- n'est jamais présentée comme locale.
--
-- Aucune donnée personnelle : la vue ne lit que des métadonnées publiques
-- (identifiant d'organisation, domaine, département, source, dates, compteurs).
-- Les corps bruts, victimes, courriels, mots de passe et adresses IP restent
-- hors de portée (quarantaine et `leak_claim`, jamais lus ici).

BEGIN;

CREATE OR REPLACE VIEW fuite_timeline AS
WITH points AS (
  SELECT fo.org_id,
         fr.source,
         fo.domain,
         o.dept,
         COALESCE(fr.breach_date, fr.collected_at::date) AS vu_le
  FROM fuite_org fo
  JOIN fuite_reference fr ON fr.id = fo.fuite_id
  JOIN org o ON o.id = fo.org_id
  WHERE o.dept IN ('16', '17', '19', '23', '24', '33',
                   '40', '47', '64', '79', '86', '87')
),
bornes AS (
  SELECT org_id,
         source,
         -- Domaine de la plus ancienne exposition connue du couple.
         (array_agg(domain ORDER BY vu_le, domain))[1] AS domain,
         min(dept) AS dept,
         min(vu_le) AS first_seen,
         max(vu_le) AS last_seen,
         count(*) AS fuites
  FROM points
  GROUP BY org_id, source
),
dates AS (
  SELECT DISTINCT org_id, source, vu_le FROM points
),
sauts AS (
  SELECT org_id,
         source,
         CASE
           WHEN vu_le - lag(vu_le) OVER (PARTITION BY org_id, source ORDER BY vu_le)
                > 365
           THEN 1
           ELSE 0
         END AS nouveau
  FROM dates
),
episodes AS (
  SELECT org_id, source, (1 + sum(nouveau))::integer AS episodes
  FROM sauts
  GROUP BY org_id, source
)
SELECT b.org_id,
       b.domain,
       b.dept,
       b.source,
       b.first_seen,
       b.last_seen,
       b.fuites,
       e.episodes,
       e.episodes - 1 AS resurgences,
       (b.last_seen - b.first_seen) AS fenetre_jours
FROM bornes b
JOIN episodes e USING (org_id, source);

COMMENT ON VIEW fuite_timeline IS
  'Une ligne par (org_id, source) : première et dernière fuite publique connue, épisodes et résurgences. Métadonnées seules, douze départements de Nouvelle-Aquitaine.';
COMMENT ON COLUMN fuite_timeline.first_seen IS
  'Date de la plus ancienne fuite publique connue pour ce couple (org_id, source).';
COMMENT ON COLUMN fuite_timeline.last_seen IS
  'Date de la plus récente fuite publique connue pour ce couple (org_id, source).';
COMMENT ON COLUMN fuite_timeline.episodes IS
  'Nombre de périodes d''exposition séparées par plus de 365 jours sans nouvelle fuite.';
COMMENT ON COLUMN fuite_timeline.resurgences IS
  'episodes - 1 : nombre de retours après une disparition de plus d''un an.';
COMMENT ON COLUMN fuite_timeline.fenetre_jours IS
  'Écart en jours entre first_seen et last_seen (0 pour une exposition unique).';

COMMIT;
