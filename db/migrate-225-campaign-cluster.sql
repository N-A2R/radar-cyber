-- 225 — campagnes multi-victimes invisibles.
--
-- Une campagne reliée à plusieurs organisations peut n'avoir ni acteur nommé,
-- ni titre commun : seuls les IOC (domaines, hashes, adresses) ou les empreintes
-- textuelles partagés la rendent visible. La règle `campaign-mv@1` :
--
--   1. deux organisations sont reliées dès qu'elles partagent au moins DEUX
--      IOC distincts ou DEUX empreintes textuelles distinctes (un seul signal
--      partagé est trop bruité pour être une preuve de campagne) ;
--   2. les relations sont fermées par transitivité (union-find) : trois
--      victimes reliées deux à deux forment une seule campagne ;
--   3. seuls les groupes d'au moins TROIS organisations et portant au moins
--      deux IOC ou deux empreintes partagés sont conservés.
--
-- Le corpus semé est un benchmark fabriqué : victimes `org-mv-*`, domaines
-- `.invalid`, empreintes opaques. Aucune organisation réelle, aucun contact,
-- aucune URL ou source nationale n'est présentée comme locale. La table
-- d'observations est indépendante des événements de production pour rester
-- rejouable sur une base neuve ; `refresh_campaign_clusters()` calcule les
-- clusters à partir des observations, et non d'une étiquette de campagne.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_cluster_observation (
  id              bigserial PRIMARY KEY,
  observation_key text        NOT NULL UNIQUE,
  org_key         text        NOT NULL,
  family          text        NOT NULL,
  observed_at     timestamptz NOT NULL,
  ioc             text[]      NOT NULL DEFAULT '{}'::text[],
  text_hash       text[]      NOT NULL DEFAULT '{}'::text[],
  origin          text        NOT NULL DEFAULT 'benchmark-campagnes-mv@1',
  CONSTRAINT campaign_cluster_observation_signaux
    CHECK (array_position(ioc, '') IS NULL AND array_position(text_hash, '') IS NULL)
);

CREATE INDEX IF NOT EXISTS campaign_cluster_observation_org_idx
  ON campaign_cluster_observation (org_key);

COMMENT ON TABLE campaign_cluster_observation IS
  'Observations d''une victime (organisation anonymisée) avec ses IOC et empreintes textuelles, sans nom d''acteur.';
COMMENT ON COLUMN campaign_cluster_observation.ioc IS
  'IOC partageables (domaine .invalid, hash) ; au moins deux valeurs communes sont nécessaires pour lier deux organisations.';
COMMENT ON COLUMN campaign_cluster_observation.text_hash IS
  'Empreinte opaque d''un texte, sans contenu ni donnée personnelle.';

CREATE TABLE IF NOT EXISTS campaign_cluster (
  cle              text        PRIMARY KEY,
  label            text        NOT NULL,
  family           text        NOT NULL,
  org_count        integer     NOT NULL CHECK (org_count >= 3),
  shared_ioc       integer     NOT NULL CHECK (shared_ioc >= 0),
  shared_text_hash integer     NOT NULL CHECK (shared_text_hash >= 0),
  org_keys         text[]      NOT NULL,
  iocs             text[]      NOT NULL,
  text_hashes      text[]      NOT NULL,
  observation_ids  bigint[]    NOT NULL,
  debut            timestamptz NOT NULL,
  fin              timestamptz NOT NULL,
  origin           text        NOT NULL,
  rule_version     text        NOT NULL DEFAULT 'campaign-mv@1',
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_cluster_multi_victime
    CHECK (org_count >= 3 AND (shared_ioc >= 2 OR shared_text_hash >= 2)),
  CONSTRAINT campaign_cluster_cardinalites
    CHECK (cardinality(org_keys) = org_count
           AND cardinality(iocs) = shared_ioc
           AND cardinality(text_hashes) = shared_text_hash)
);

CREATE INDEX IF NOT EXISTS campaign_cluster_qualifiant_idx
  ON campaign_cluster (org_count, shared_ioc, shared_text_hash);

COMMENT ON TABLE campaign_cluster IS
  'Campagnes invisibles regroupant au moins trois organisations par IOC ou empreintes textuelles partagés.';
COMMENT ON COLUMN campaign_cluster.shared_ioc IS
  'Nombre d''IOC distincts observés chez au moins deux organisations du groupe.';
COMMENT ON COLUMN campaign_cluster.shared_text_hash IS
  'Nombre d''empreintes textuelles distinctes observées chez au moins deux organisations du groupe.';

/**
 * Recalcule campaign_cluster depuis campaign_cluster_observation.
 * Une seule transaction : la table reflète exactement le dernier passage.
 * Le SQL est la source de vérité de la règle ; les modules TS ne la dupliquent pas.
 */
CREATE OR REPLACE FUNCTION refresh_campaign_clusters() RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  total integer;
BEGIN
  DELETE FROM campaign_cluster;

  WITH RECURSIVE
  signaux AS (
    SELECT o.id AS observation_id, o.org_key, o.family, o.observed_at, 'ioc'::text AS kind, v.value
      FROM campaign_cluster_observation o
      CROSS JOIN LATERAL unnest(o.ioc) AS v(value)
    UNION ALL
    SELECT o.id, o.org_key, o.family, o.observed_at, 'text'::text, v.value
      FROM campaign_cluster_observation o
      CROSS JOIN LATERAL unnest(o.text_hash) AS v(value)
  ),
  org_signal AS (
    SELECT DISTINCT kind, value, org_key FROM signaux
  ),
  partages AS (
    SELECT s.kind, s.value, s.org_key
      FROM org_signal s
      JOIN (SELECT kind, value
              FROM org_signal
             GROUP BY kind, value
            HAVING count(DISTINCT org_key) >= 2) p
        ON p.kind = s.kind AND p.value = s.value
  ),
  paires AS (
    SELECT a.org_key AS org_a,
           b.org_key AS org_b,
           count(*) FILTER (WHERE a.kind = 'ioc')::integer AS ioc_communs,
           count(*) FILTER (WHERE a.kind = 'text')::integer AS text_communs
      FROM partages a
      JOIN partages b
        ON b.kind = a.kind AND b.value = a.value AND b.org_key > a.org_key
     GROUP BY a.org_key, b.org_key
  ),
  aretes AS (
    SELECT org_a, org_b
      FROM paires
     WHERE ioc_communs >= 2 OR text_communs >= 2
  ),
  graphe AS (
    SELECT org_a AS org_key, org_b AS voisin FROM aretes
    UNION
    SELECT org_b AS org_key, org_a AS voisin FROM aretes
  ),
  atteint(org_key, racine) AS (
    SELECT org_key, org_key FROM graphe
    UNION
    SELECT g.org_key, a.racine
      FROM atteint a
      JOIN graphe g ON g.voisin = a.org_key
  ),
  composante AS (
    SELECT org_key, min(racine) AS cle
      FROM atteint
     GROUP BY org_key
  ),
  membres AS (
    SELECT c.cle, o.id AS observation_id, o.org_key, o.family,
           o.observed_at, o.ioc, o.text_hash, o.origin
      FROM composante c
      JOIN campaign_cluster_observation o ON o.org_key = c.org_key
  ),
  groupes AS (
    SELECT cle,
           count(DISTINCT org_key)::integer AS org_count,
           min(observed_at) AS debut,
           max(observed_at) AS fin,
           array_agg(DISTINCT org_key ORDER BY org_key) AS org_keys,
           array_agg(DISTINCT observation_id ORDER BY observation_id) AS observation_ids,
           min(family) AS family,
           min(origin) AS origin
      FROM membres
     GROUP BY cle
  ),
  signaux_membre AS (
    SELECT m.cle, m.org_key, 'ioc'::text AS kind, v.value
      FROM membres m
      CROSS JOIN LATERAL unnest(m.ioc) AS v(value)
    UNION ALL
    SELECT m.cle, m.org_key, 'text'::text AS kind, v.value
      FROM membres m
      CROSS JOIN LATERAL unnest(m.text_hash) AS v(value)
  ),
  signaux_partages AS (
    SELECT cle, kind, value
      FROM signaux_membre
     GROUP BY cle, kind, value
    HAVING count(DISTINCT org_key) >= 2
  ),
  iocs AS (
    SELECT cle, array_agg(value ORDER BY value) AS valeurs
      FROM signaux_partages
     WHERE kind = 'ioc'
     GROUP BY cle
  ),
  textes AS (
    SELECT cle, array_agg(value ORDER BY value) AS valeurs
      FROM signaux_partages
     WHERE kind = 'text'
     GROUP BY cle
  )
  INSERT INTO campaign_cluster
    (cle, label, family, org_count, shared_ioc, shared_text_hash,
     org_keys, iocs, text_hashes, observation_ids, debut, fin,
     origin, rule_version, refreshed_at)
  SELECT g.cle,
         'campagne multi-victimes ' || g.cle,
         g.family,
         g.org_count,
         coalesce(cardinality(i.valeurs), 0),
         coalesce(cardinality(t.valeurs), 0),
         g.org_keys,
         coalesce(i.valeurs, '{}'::text[]),
         coalesce(t.valeurs, '{}'::text[]),
         g.observation_ids,
         g.debut,
         g.fin,
         g.origin,
         'campaign-mv@1',
         now()
    FROM groupes g
    LEFT JOIN iocs i ON i.cle = g.cle
    LEFT JOIN textes t ON t.cle = g.cle
   WHERE g.org_count >= 3
     AND (coalesce(cardinality(i.valeurs), 0) >= 2
          OR coalesce(cardinality(t.valeurs), 0) >= 2);

  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$fn$;

COMMENT ON FUNCTION refresh_campaign_clusters() IS
  'Recalcule les campagnes multi-victimes : fermeture transitive des paires partageant au moins deux IOC ou deux empreintes, puis filtre >=3 organisations.';

-- 12 campagnes synthétiques : 6 mixtes, 3 IOC seulement, 3 empreintes seulement.
-- Chaque campagne a 3 ou 4 victimes ; ses signaux sont propres pour rester
-- détectable sans étiquette préalable.
INSERT INTO campaign_cluster_observation
  (observation_key, org_key, family, observed_at, ioc, text_hash, origin)
SELECT 'obs-mv-' || lpad(c.i::text, 2, '0') || '-' || lpad(g.n::text, 2, '0'),
       'org-mv-' || lpad(c.i::text, 2, '0') || '-' || lpad(g.n::text, 2, '0'),
       c.family,
       timestamptz '2026-01-01 00:00:00+00'
         + ((c.i - 1) || ' days')::interval + (g.n || ' hours')::interval,
       CASE WHEN c.genre IN ('mixte', 'ioc')
            THEN ARRAY[
              'ioc-mv-' || lpad(c.i::text, 2, '0') || '-a.example.invalid',
              'ioc-mv-' || lpad(c.i::text, 2, '0') || '-b.example.invalid',
              'ioc-mv-' || lpad(c.i::text, 2, '0') || '-c.example.invalid'
            ]
            ELSE ARRAY[]::text[] END,
       CASE WHEN c.genre IN ('mixte', 'texte')
            THEN ARRAY[
              'th-mv-' || lpad(c.i::text, 2, '0') || '-a',
              'th-mv-' || lpad(c.i::text, 2, '0') || '-b'
            ]
            ELSE ARRAY[]::text[] END,
       'benchmark-campagnes-mv@1'
  FROM (VALUES
    (1,  'ransomware',  'mixte'),
    (2,  'leaks',       'mixte'),
    (3,  'phishing',    'mixte'),
    (4,  'ransomware',  'mixte'),
    (5,  'leaks',       'mixte'),
    (6,  'cti',         'mixte'),
    (7,  'ransomware',  'ioc'),
    (8,  'leaks',       'ioc'),
    (9,  'phishing',    'ioc'),
    (10, 'ransomware',  'texte'),
    (11, 'leaks',       'texte'),
    (12, 'cti',         'texte')
  ) AS c(i, family, genre)
  CROSS JOIN LATERAL generate_series(1, CASE WHEN c.i <= 6 THEN 4 ELSE 3 END) AS g(n)
ON CONFLICT (observation_key) DO NOTHING;

-- Leurres : deux victimes seules, trois victimes avec un seul IOC commun,
-- et une observation isolée. Aucun ne doit produire de cluster qualifiant.
INSERT INTO campaign_cluster_observation
  (observation_key, org_key, family, observed_at, ioc, text_hash, origin)
VALUES
  ('obs-mv-leurre-paire-1', 'org-mv-x1-01', 'ransomware',
   timestamptz '2026-02-01 00:00:00+00',
   ARRAY['ioc-mv-x1-a.example.invalid', 'ioc-mv-x1-b.example.invalid'], ARRAY[]::text[],
   'benchmark-campagnes-mv@1'),
  ('obs-mv-leurre-paire-2', 'org-mv-x1-02', 'ransomware',
   timestamptz '2026-02-01 01:00:00+00',
   ARRAY['ioc-mv-x1-a.example.invalid', 'ioc-mv-x1-b.example.invalid'], ARRAY[]::text[],
   'benchmark-campagnes-mv@1'),
  ('obs-mv-leurre-un-seul-1', 'org-mv-x2-01', 'leaks',
   timestamptz '2026-02-02 00:00:00+00',
   ARRAY['ioc-mv-x2-unique.example.invalid'], ARRAY[]::text[],
   'benchmark-campagnes-mv@1'),
  ('obs-mv-leurre-un-seul-2', 'org-mv-x2-02', 'leaks',
   timestamptz '2026-02-02 01:00:00+00',
   ARRAY['ioc-mv-x2-unique.example.invalid'], ARRAY[]::text[],
   'benchmark-campagnes-mv@1'),
  ('obs-mv-leurre-un-seul-3', 'org-mv-x2-03', 'leaks',
   timestamptz '2026-02-02 02:00:00+00',
   ARRAY['ioc-mv-x2-unique.example.invalid'], ARRAY[]::text[],
   'benchmark-campagnes-mv@1'),
  ('obs-mv-leurre-isole', 'org-mv-x3-01', 'cti',
   timestamptz '2026-02-03 00:00:00+00',
   ARRAY['ioc-mv-x3-a.example.invalid', 'ioc-mv-x3-b.example.invalid'],
   ARRAY['th-mv-x3-a', 'th-mv-x3-b'],
   'benchmark-campagnes-mv@1')
ON CONFLICT (observation_key) DO NOTHING;

SELECT refresh_campaign_clusters();

COMMIT;
