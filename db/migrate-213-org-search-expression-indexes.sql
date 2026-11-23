-- 213 — Rend indexable la requête de `loadCandidateIndex` (quarantine/promote).
--
-- Dérive constatée le 2026-11-23 : la base de production portait déjà
-- `org_domain_sql_norm_trgm`, `org_website_sql_norm_trgm` et
-- `org_website_lower_trgm`, mais AUCUNE migration ne les déclarait. Une base
-- neuve (CI, nouvelle instance) partait donc sans eux, et la recherche
-- d'organisations retombait en Seq Scan sur 1,67 M de lignes.
--
-- Les trois index portent sur les expressions EXACTES du prédicat de
-- `sqlDomain()` : `regexp_replace`, `lower`, `btrim` et `coalesce` sont
-- IMMUTABLE, donc l'expression indexée est identique à celle de la requête —
-- aucun rewriting SQL, aucun résultat modifié.
--
-- Mesure du 2026-11-21 sur la base réelle (1 673 151 lignes) : 790 ms en
-- Seq Scan, quelques ms avec les index. Re-mesuré le 2026-11-23 : 112 ms au
-- total (dont 45 ms de planification) avec un BitmapOr sur `org_name_norm_trgm`
-- et `org_domain_sql_norm_trgm`.
--
-- `CREATE INDEX IF NOT EXISTS` sans CONCURRENTLY : le migrator applique chaque
-- fichier dans une transaction, et CONCURRENTLY y est interdit. Sur une base
-- déjà indexée (production), chaque instruction est un no-op immédiat.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS org_name_norm_trgm
  ON org USING gin (name_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS org_domain_sql_norm_trgm
  ON org USING gin ((
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(btrim(domain)), '^https?://', ''),
            '[/?#].*$', ''
          ),
          ':\d+$', ''
        ),
        '\.$', ''
      ),
      '^www\.', ''
    )
  ) gin_trgm_ops)
  WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS org_website_sql_norm_trgm
  ON org USING gin ((
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(btrim(website)), '^https?://', ''),
            '[/?#].*$', ''
          ),
          ':\d+$', ''
        ),
        '\.$', ''
      ),
      '^www\.', ''
    )
  ) gin_trgm_ops)
  WHERE website IS NOT NULL;

CREATE INDEX IF NOT EXISTS org_website_lower_trgm
  ON org USING gin ((lower(coalesce(website, ''))) gin_trgm_ops);

ANALYZE org;
