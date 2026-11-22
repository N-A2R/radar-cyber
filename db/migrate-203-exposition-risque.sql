-- 203 — criticité exploitable de l'exposition externe.
--
-- Le problème : `exposition_service` liste des ports, pas des dangers. Un site
-- web et une base PostgreSQL exposée se retrouvaient au même niveau. Cette
-- migration ajoute deux signaux publics et vérifiables (EPSS maximal, CISA KEV)
-- puis une vue qui classe les services par exploitabilité.
--
-- Aucune donnée personnelle : `exposition_risque_mesure` ne conserve que des
-- métadonnées techniques (catégorie, port, produit, version, CVE, source, date).
-- Aucun nom d'organisation, aucune adresse IP, aucun contenu de page.

BEGIN;

-- 1. Les services d'administration à distance ont leur propre catégorie : un
--    RDP exposé ne doit plus être noyé dans « autre ».
--    Les lignes historiques de 3389 étaient classées « autre » : elles
--    rejoignent la catégorie qui les rend visibles.
UPDATE exposition_service SET category = 'rdp' WHERE port = 3389 AND category = 'autre';

-- 2. Corpus de mesures dédié : les lignes restent citables sans exposer
--    l'organisation ni l'adresse réseau.
CREATE TABLE IF NOT EXISTS exposition_risque_mesure (
  id           bigserial PRIMARY KEY,
  categorie    text NOT NULL CHECK (categorie IN ('base_de_donnees', 'vpn', 'rdp', 'web', 'mail', 'autre')),
  port         integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  service      text NOT NULL,
  technology   text NOT NULL,
  version      text NOT NULL DEFAULT '',
  epss_max     double precision NOT NULL DEFAULT 0 CHECK (epss_max BETWEEN 0 AND 1),
  kev          boolean NOT NULL DEFAULT false,
  source       text NOT NULL,
  source_url   text NOT NULL CHECK (source_url <> ''),
  preuve_url   text,
  consulted_at timestamptz NOT NULL,
  UNIQUE (categorie, port, service, technology, version, source_url)
);

ALTER TABLE exposition_risque_mesure ADD COLUMN IF NOT EXISTS preuve_url text;

-- Élargissement idempotent pour les bases qui avaient la première version.
ALTER TABLE exposition_risque_mesure DROP CONSTRAINT IF EXISTS exposition_risque_mesure_categorie_check;
ALTER TABLE exposition_risque_mesure ADD CONSTRAINT exposition_risque_mesure_categorie_check
  CHECK (categorie IN ('base_de_donnees', 'vpn', 'rdp', 'web', 'mail', 'autre'));

-- Les bases qui avaient déjà la table avec `version` nullable sont alignées :
-- une version absente vaut chaîne vide, ce qui rend la contrainte d'unicité
-- effective (PostgreSQL considère deux NULL comme distincts).
ALTER TABLE exposition_risque_mesure ALTER COLUMN version SET DEFAULT '';
UPDATE exposition_risque_mesure SET version = '' WHERE version IS NULL;
ALTER TABLE exposition_risque_mesure ALTER COLUMN version SET NOT NULL;

CREATE INDEX IF NOT EXISTS exposition_risque_mesure_fraicheur_idx
  ON exposition_risque_mesure (consulted_at DESC);
CREATE INDEX IF NOT EXISTS exposition_risque_mesure_epss_idx
  ON exposition_risque_mesure (epss_max DESC) WHERE kev OR epss_max >= 0.1;

-- 4. Formule unique, réutilisée par la vue et vérifiée par les tests.
--    Poids : catégorie 5–50, EPSS 0–30, KEV 25 ; score borné à 100.
CREATE OR REPLACE FUNCTION exposition_criticite(
  categorie text,
  epss_max double precision,
  kev boolean
) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT round((
    least(100, greatest(0,
      CASE categorie
        WHEN 'base_de_donnees' THEN 50
        WHEN 'rdp' THEN 45
        WHEN 'vpn' THEN 40
        WHEN 'mail' THEN 20
        WHEN 'web' THEN 15
        ELSE 5
      END
      + 30 * least(1, greatest(0, COALESCE(epss_max, 0)))
      + CASE WHEN COALESCE(kev, false) THEN 35 ELSE 0 END
    ))
  )::numeric, 2)::double precision
$$;

CREATE OR REPLACE FUNCTION exposition_niveau(
  categorie text,
  epss_max double precision,
  kev boolean
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN COALESCE(kev, false) THEN 'critique'
    WHEN COALESCE(epss_max, 0) >= 0.1 THEN 'eleve'
    WHEN categorie IN ('base_de_donnees', 'vpn', 'rdp') THEN 'modere'
    WHEN COALESCE(epss_max, 0) >= 0.01 THEN 'modere'
    ELSE 'faible'
  END
$$;

-- 5. Vue de priorisation. Chaque ligne est fraîche (< 7 jours) et cite sa
--    source primaire. `categorie` reste le vocabulaire de l'inventaire.
--
--    L'inventaire apporte le port et la catégorie ; il ne porte aucun signal
--    EPSS/KEV par service, car une CVE d'hôte (WordPress, OpenSSH…) ne prouve
--    rien sur un port MySQL. L'exploitabilité n'est donc attribuée que par le
--    corpus, où chaque ligne porte une CVE de produit vérifiée sur NVD.
--    DROP préalable : une vue d'une version antérieure (sans `preuve_url`) ne
--    peut pas être remplacée à colonnes constantes, et rien n'en dépend.
DROP VIEW IF EXISTS exposition_risque;
CREATE OR REPLACE VIEW exposition_risque AS
SELECT e.id::text                                   AS id,
       'inventaire'::text                           AS provenance,
       e.category                                   AS categorie,
       e.port,
       e.service,
       e.technology,
       e.version,
       0::double precision                          AS epss_max,
       false                                        AS kev,
       exposition_criticite(e.category, 0, false)   AS criticite,
       exposition_niveau(e.category, 0, false)      AS niveau,
       e.source,
       e.source_url,
       NULL::text                                   AS preuve_url,
       e.consulted_at
  FROM exposition_service e
 WHERE e.source_url <> ''
   AND e.consulted_at >= now() - interval '7 days'
   -- Une mesure déjà classée par le corpus n'est pas répétée depuis
   -- l'inventaire : la ligne classée porte la preuve, elle a priorité.
   AND NOT EXISTS (
     SELECT 1
       FROM exposition_risque_mesure m
      WHERE m.source_url = e.source_url
        AND m.port = e.port
        AND m.categorie = e.category
        AND m.source_url <> ''
        AND m.consulted_at >= now() - interval '7 days'
   )
UNION ALL
SELECT 'corpus:' || m.id::text                      AS id,
       'corpus'::text                               AS provenance,
       m.categorie,
       m.port,
       m.service,
       m.technology,
       m.version,
       m.epss_max,
       m.kev,
       exposition_criticite(m.categorie, m.epss_max, m.kev) AS criticite,
       exposition_niveau(m.categorie, m.epss_max, m.kev)    AS niveau,
       m.source,
       m.source_url,
       m.preuve_url,
       m.consulted_at
  FROM exposition_risque_mesure m
 WHERE m.source_url <> ''
   AND m.consulted_at >= now() - interval '7 days';

COMMENT ON VIEW exposition_risque IS
  'Services exposés classés par criticité exploitable (catégorie, EPSS maximal, KEV), avec source_url et consulted_at de moins de 7 jours.';

COMMIT;
