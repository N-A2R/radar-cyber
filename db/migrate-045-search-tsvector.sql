-- 045 — recherche plein texte sur org/event (configuration française).
--
-- Contexte : `/api/search` reposait sur `ILIKE '%q%'`. Même avec les index
-- trigramme de 006, un motif enveloppant peut rester coûteux et ne classe
-- aucun résultat. Deux colonnes GÉNÉRÉES
-- (donc impossibles à désynchroniser de leur source) portent le tsvector :
-- le nom est pondéré A, le domaine B ; pour event, le titre est A et le
-- résumé B. Le périmètre reste celui de l'ancien `/api/search` (name/domain,
-- title/summary) : indexer la ville ferait entrer 132 000 orgs pour le seul
-- terme « bordeaux » (mesuré sur la copie à 1,67 M), et rendrait le classement
-- coûteux sans améliorer la recherche d'un nom. La configuration `french`
-- applique la stemming et ignore les mots vides français (« de », « le »).
--
-- Le dictionnaire `unaccent` fournit une fonction STABLE, inutilisable dans
-- une colonne générée. On normalise donc avec `translate` (IMMUTABLE), comme
-- la migration 041 le fait déjà pour `name_norm`; la configuration de
-- recherche reste bien `french`, appliquée après cette normalisation.
CREATE OR REPLACE FUNCTION french_search_input(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(
    lower(coalesce(value, '')),
    'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
    'aaaaaaceeeeiiiinoooooouuuuyy'
  )
$$;

ALTER TABLE org
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', french_search_input(name)), 'A') ||
    setweight(to_tsvector('french', french_search_input(domain)), 'B')
  ) STORED;

ALTER TABLE event
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', french_search_input(title)), 'A') ||
    setweight(to_tsvector('french', french_search_input(summary)), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS org_search_tsv_idx ON org USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS event_search_tsv_idx ON event USING gin (search_tsv);

ANALYZE org;
ANALYZE event;
