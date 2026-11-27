-- 251 — Backfill de l'empreinte des événements de flux après le passage à
-- `id:<sha256>` / `titre:<sha256>` (commit b1c12fb6).
--
-- Le collecteur générique calculait depuis la migration 045 une empreinte
-- `titre normalisé|jour UTC|source`, stockée dans `event.fingerprint` et
-- protégée par un index unique partiel. Le nouveau format est
-- `source|id:<hash>|<jour>` (URL/guid du flux) ou
-- `source|titre:<hash>|<jour>` (sans identifiant déclaré). Sans backfill, une
-- ligne ancienne garde son empreinte 045 et le même article réécrit après le
-- déploiement reçoit une empreinte différente : l'index unique ne voit aucun
-- conflit et le doublon entre en base.
--
-- La reconstruction s'appuie sur les colonnes réellement écrites :
--   - identité = `source_url` quand ce n'est pas le repli `urn:source:<id>` ;
--   - défaut = titre normalisé comme dans `normalizeTitle()` (NFD, signes
--     diacritiques U+0300–036F, minuscules, non-alphanumériques = espace) ;
--   - jour UTC de `observed_at` seulement si `date_source` vient du flux
--     (`feed` ou `inferred`), sinon `sans-date` comme `fingerprintOf()`.
-- `left(base64url(sha256(...)), 24)` reproduit exactement `hashKey()`.
--
-- Deux lignes anciennes qui se rejoignent sur la même empreinte v2 étaient
-- déjà le même article : la plus récente (déjà au format v2 si une collecte a
-- eu lieu) garde l'empreinte, les autres perdent la leur. Aucun événement
-- n'est supprimé. Rejouable : le calcul est déterministe et la seconde passe
-- ne modifie aucune ligne.

BEGIN;

CREATE OR REPLACE FUNCTION migration_250_hash(valeur text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT left(
    rtrim(translate(encode(sha256(convert_to(valeur, 'UTF8')), 'base64'), '+/', '-_'), '='),
    24
  )
$$;

WITH calcul AS (
  SELECT e.id,
         e.fingerprint,
         e.source_id || '|' ||
         CASE
           WHEN e.source_url IS NOT NULL
            AND btrim(e.source_url) <> ''
            AND e.source_url NOT LIKE 'urn:source:%'
             THEN 'id:' || migration_250_hash(btrim(lower(e.source_url)))
           ELSE 'titre:' || migration_250_hash(
             btrim(regexp_replace(
               regexp_replace(
                 pg_catalog.normalize(lower(coalesce(e.title, '')), 'NFD'),
                 U&'[\0300-\036F]' UESCAPE '\', '', 'g'
               ),
               '[^a-z0-9]+', ' ', 'g'
             )) || '|' || e.source_id
           )
         END || '|' ||
         CASE
           WHEN e.date_source IS NOT NULL
            AND e.date_source <> 'fetched'
            AND e.observed_at IS NOT NULL
             THEN to_char(e.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
           ELSE 'sans-date'
         END AS fingerprint_v2
    FROM event e
   WHERE e.dedup_key LIKE 'feed:%'
     AND e.fingerprint IS NOT NULL
), classes AS (
  SELECT id, fingerprint, fingerprint_v2,
         row_number() OVER (
           PARTITION BY fingerprint_v2
           ORDER BY CASE
                      WHEN fingerprint LIKE '%|id:%' OR fingerprint LIKE '%|titre:%' THEN 0
                      ELSE 1
                    END,
                    id
         ) AS rang
    FROM calcul
)
UPDATE event e
   SET fingerprint = CASE WHEN c.rang = 1 THEN c.fingerprint_v2 ELSE NULL END
  FROM classes c
 WHERE e.id = c.id
   AND (
     (c.rang = 1 AND e.fingerprint IS DISTINCT FROM c.fingerprint_v2)
     OR (c.rang > 1 AND e.fingerprint IS NOT NULL)
   );

DROP FUNCTION migration_250_hash(text);

COMMIT;
