-- 220 — mesure de base CTEM : qui est exposé, sur quel port, avec quelle fraîcheur.
--
-- `exposition_service` porte déjà les observations (une ligne = un port vu
-- pour une organisation, une IP et une source). Il manquait le dénominateur :
-- les organisations qui possèdent au moins un actif. La table `asset` était
-- vide ; on y inscrit les domaines publics déjà déclarés par les
-- organisations. Ce ne sont pas des observations nouvelles : le domaine est
-- une donnée publique déjà présente dans `org.domain`, et le statut reste
-- `candidat` tant qu'une découverte DNS n'a pas apporté sa preuve propre.
--
-- La vue `ctem_exposition_baseline` donne une ligne par organisation avec
-- actif : exposition ou non, ports et services observés, dernière consultation
-- et fraîcheur. La fonction `ctem_exposition_baseline_mesurer` agrège la
-- couverture, l'âge médian et le taux de fraîcheur à 7 jours. Un jeu
-- d'identifiants optionnel permet de mesurer un périmètre précis (tests,
-- département) sans toucher au reste de la base.
--
-- Aucune donnée personnelle : seuls des domaines d'organisation, des ports et
-- des dates de consultation sont conservés.

BEGIN;

INSERT INTO asset (org_id, kind, value, status)
SELECT o.id, 'domain', h.host, 'candidat'
  FROM org o
  CROSS JOIN LATERAL (
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(lower(btrim(o.domain)), '^https?://', ''),
                 '[/?#].*$', ''),
               ':[0-9]+$', ''),
             '^www\.', '') AS host
  ) h
 WHERE o.domain IS NOT NULL
   AND btrim(o.domain) <> ''
   AND h.host ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'
ON CONFLICT (org_id, kind, value) DO NOTHING;

CREATE OR REPLACE VIEW ctem_exposition_baseline AS
WITH actifs AS (
  SELECT org_id, count(*)::bigint AS nb_actifs
    FROM asset
   GROUP BY org_id
), exposition AS (
  SELECT org_id,
         count(*)::bigint AS nb_services,
         coalesce(array_agg(DISTINCT port ORDER BY port), '{}'::integer[]) AS ports,
         coalesce(array_agg(DISTINCT service ORDER BY service), '{}'::text[]) AS services,
         coalesce(array_agg(DISTINCT source ORDER BY source), '{}'::text[]) AS sources,
         max(consulted_at) AS derniere_consultation
    FROM exposition_service
   GROUP BY org_id
)
SELECT a.org_id,
       a.nb_actifs,
       (e.org_id IS NOT NULL) AS expose,
       coalesce(e.nb_services, 0)::bigint AS nb_services,
       coalesce(e.ports, '{}'::integer[]) AS ports,
       coalesce(e.services, '{}'::text[]) AS services,
       coalesce(e.sources, '{}'::text[]) AS sources,
       e.derniere_consultation,
       round(extract(epoch FROM (now() - e.derniere_consultation)) / 86400.0, 2) AS age_jours,
       CASE
         WHEN e.derniere_consultation IS NULL THEN 'non_mesuree'
         WHEN e.derniere_consultation > now() - interval '7 days' THEN 'fraiche'
         ELSE 'ancienne'
       END AS fraicheur
  FROM actifs a
  LEFT JOIN exposition e ON e.org_id = a.org_id;

CREATE OR REPLACE FUNCTION ctem_exposition_baseline_mesurer(org_ids integer[] DEFAULT NULL)
RETURNS TABLE (
  organisations_avec_actif bigint,
  organisations_exposees bigint,
  couverture double precision,
  age_median_jours double precision,
  organisations_fraiches bigint,
  taux_fraicheur double precision,
  services bigint,
  ports_distincts bigint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
WITH actifs AS (
  SELECT DISTINCT a.org_id
    FROM asset a
   WHERE $1 IS NULL OR a.org_id = ANY($1)
), exposition AS (
  SELECT e.org_id,
         max(e.consulted_at) AS derniere_consultation,
         count(*)::bigint AS nb_services
    FROM exposition_service e
   WHERE $1 IS NULL OR e.org_id = ANY($1)
   GROUP BY e.org_id
), par_org AS (
  SELECT a.org_id,
         e.derniere_consultation,
         coalesce(e.nb_services, 0)::bigint AS nb_services
    FROM actifs a
    LEFT JOIN exposition e ON e.org_id = a.org_id
), agrege AS (
  SELECT count(*)::bigint AS actifs,
         count(p.derniere_consultation)::bigint AS exposes,
         count(p.derniere_consultation)::double precision / nullif(count(*), 0) AS couverture,
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY (extract(epoch FROM (now() - p.derniere_consultation)) / 86400.0)::double precision
         ) AS age_median_jours,
         count(p.derniere_consultation)
           FILTER (WHERE p.derniere_consultation > now() - interval '7 days')::bigint AS frais,
         coalesce(sum(p.nb_services), 0)::bigint AS services
    FROM par_org p
)
SELECT g.actifs,
       g.exposes,
       coalesce(g.couverture, 0)::double precision,
       coalesce(g.age_median_jours, 0)::double precision,
       g.frais,
       coalesce((
         SELECT count(DISTINCT e.org_id)
                  FILTER (WHERE e.consulted_at > now() - interval '7 days')::double precision
                / nullif(count(DISTINCT e.org_id), 0)
           FROM exposition_service e
          WHERE $1 IS NULL OR e.org_id = ANY($1)
       ), 0)::double precision,
       g.services,
       (SELECT count(DISTINCT e.port)::bigint
          FROM exposition_service e
         WHERE $1 IS NULL OR e.org_id = ANY($1)) AS ports_distincts
  FROM agrege g;
$$;

CREATE OR REPLACE VIEW ctem_exposition_baseline_mesure AS
SELECT * FROM ctem_exposition_baseline_mesurer();

COMMENT ON VIEW ctem_exposition_baseline IS
  'Une ligne par organisation possédant un actif : ports/services exposés, dernière consultation et fraîcheur à 7 jours.';
COMMENT ON FUNCTION ctem_exposition_baseline_mesurer(integer[]) IS
  'Couverture, âge médian et taux de fraîcheur CTEM sur toutes les organisations ou sur un jeu d''identifiants.';
COMMENT ON VIEW ctem_exposition_baseline_mesure IS
  'Mesure de base CTEM : couverture des organisations avec actif, âge médian et part des organisations consultées sur 7 jours.';

COMMIT;
