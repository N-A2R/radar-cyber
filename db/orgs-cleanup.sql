-- Nettoyage des organisations : coordonnées manquantes et doublons.
--
-- Idempotent (relançable sans effet supplémentaire) et non destructeur :
-- aucune ligne n'est supprimée, les événements restent rattachés à leur org.
--
-- 1. Départements erronés : l'import SIRENE a affecté à certaines orgs le
--    département du lot d'import, pas celui de la commune. Le repli
--    « centre de commune » de scripts/geocode-orgs.mts filtre sur ce
--    département : sans correction, il ne trouve rien.
-- 2. Orgs sans lat/lng : centroïde des orgs géolocalisées de la même ville
--    (ville normalisée : casse et arrondissement ignorés).
-- 3. Doublons :
--    a. même nom normalisé + même ville normalisée ;
--    b. même domaine + noms proches (similarité pg_trgm ≥ 0,6).
--    L'org « maîtresse » est l'id le plus faible ; les autres passent
--    status='doublon'.
-- 4. Les domaines partagés sans nom proche sont listés en fin de script
--    pour revue manuelle : un même domaine peut couvrir plusieurs
--    établissements distincts (ville vs agglo, siège vs filiale…).
--
-- Les orgs non complétées par l'étape 2 passent par scripts/geocode-orgs.mts
-- (recherche-entreprises puis BAN).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

BEGIN;

ALTER TABLE org ADD COLUMN IF NOT EXISTS geo_source text;

-- 1. Départements erronés (valeurs issues de l'API geo.api.gouv.fr/communes)
UPDATE org o
SET dept = d.dept
FROM (VALUES
  ('GRENOBLE', '38'),
  ('PARIS', '75'),
  ('TOULOUSE', '31'),
  ('SOUSCEYRAC-EN-QUERCY', '46')
) AS d(ville, dept)
WHERE upper(btrim(regexp_replace(
        coalesce(o.city, ''),
        '\s+\d{1,2}(e|è|eme|me)?(\s+arrondissement)?\s*$', '', 'i'))) = d.ville
  AND o.dept IS DISTINCT FROM d.dept;

-- 2. Centre de commune
WITH ville AS (
  SELECT norm_ville, avg(lat) AS lat, avg(lon) AS lon
  FROM (
    SELECT lat, lon,
           upper(btrim(regexp_replace(
             coalesce(city, ''),
             '\s+\d{1,2}(e|è|eme|me)?(\s+arrondissement)?\s*$', '', 'i'))) AS norm_ville
    FROM org
    WHERE lat IS NOT NULL AND lon IS NOT NULL
  ) g
  WHERE norm_ville <> ''
  GROUP BY norm_ville
)
UPDATE org o
SET lat = v.lat, lon = v.lon, geo_source = 'commune-centre'
FROM ville v
WHERE o.lat IS NULL
  AND o.lon IS NULL
  AND upper(btrim(regexp_replace(
        coalesce(o.city, ''),
        '\s+\d{1,2}(e|è|eme|me)?(\s+arrondissement)?\s*$', '', 'i'))) = v.norm_ville;

-- 3a. Doublons : même nom normalisé + même ville normalisée
WITH nomme AS (
  SELECT id,
         lower(translate(name,
           'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç',
           'AAAEEEEIIOOUUUcaaaeeeiiouuuc')) AS nom_norm,
         upper(btrim(regexp_replace(
           coalesce(city, ''),
           '\s+\d{1,2}(e|è|eme|me)?(\s+arrondissement)?\s*$', '', 'i'))) AS ville_norm
  FROM org
), doublons AS (
  SELECT id, min(id) OVER (PARTITION BY nom_norm, ville_norm) AS maitre
  FROM nomme
  WHERE nom_norm <> '' AND ville_norm <> ''
)
UPDATE org o
SET status = 'doublon'
FROM doublons d
WHERE o.id = d.id
  AND d.maitre <> o.id
  AND o.status IS DISTINCT FROM 'doublon';

-- 3b. Doublons : même domaine + nom proche
WITH paires AS (
  SELECT a.id AS id_a, b.id AS id_b
  FROM org a
  JOIN org b ON a.id < b.id
  WHERE a.domain IS NOT NULL AND btrim(a.domain) <> ''
    AND lower(a.domain) = lower(b.domain)
    AND similarity(a.name, b.name) >= 0.6
), candidats AS (
  SELECT id_a AS id, least(id_a, id_b) AS maitre FROM paires
  UNION
  SELECT id_b AS id, least(id_a, id_b) AS maitre FROM paires
), doublons AS (
  SELECT id, min(maitre) AS maitre FROM candidats GROUP BY id
)
UPDATE org o
SET status = 'doublon'
FROM doublons d
WHERE o.id = d.id
  AND d.maitre <> o.id
  AND o.status IS DISTINCT FROM 'doublon';

COMMIT;

-- 4. Revue manuelle : domaines partagés (tous, y compris noms non proches)
SELECT lower(domain) AS domaine,
       count(*) AS orgs,
       string_agg(id::text || ' · ' || name, ' | ' ORDER BY id) AS organisations
FROM org
WHERE domain IS NOT NULL AND btrim(domain) <> ''
GROUP BY lower(domain)
HAVING count(*) > 1
ORDER BY orgs DESC, domaine;

-- 5. Bilan
SELECT count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL) AS avec_coords,
       count(*) FILTER (WHERE lat IS NULL OR lon IS NULL) AS sans_coords,
       count(*) FILTER (WHERE status = 'doublon') AS doublons,
       count(*) AS total
FROM org;
