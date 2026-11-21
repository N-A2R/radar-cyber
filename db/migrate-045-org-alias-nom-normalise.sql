-- 045 : clé d'alias précalculée pour le gazetteer.
--
-- Le chargement du gazetteer normalisait 1 678 185 alias en JavaScript à chaque
-- coup de cache (10 min) : œ/æ, NFD + suppression des diacritiques, minuscules,
-- ponctuation réduite à des espaces. La clé est désormais matérialisée par une
-- colonne GÉNÉRÉE STORED : elle ne peut pas diverger de l'alias, et le SELECT du
-- collecteur n'a plus qu'à la lire.
--
-- L'expression est IMMUTABLE (lower/replace/translate/regexp_replace/btrim) et
-- reproduit `normaliser()` dans gazetteer.ts sur les lettres françaises :
--  1. lower puis œ→oe, æ→ae (NFD ne décompose pas ces deux ligatures, d'où
--     les remplacements explicites des deux côtés) ;
--  2. translate des diacritiques français vers leur base ASCII ;
--  3. tout ce qui n'est pas [a-z0-9] devient une espace, au plus une par
--     séquence, puis btrim retire les espaces de bord — exactement le
--     `[^a-z0-9]+` + trim de la fonction TypeScript.
--
-- L'index est partiel sur les alias actifs : ce sont les seuls que charge le
-- gazetteer, et un index sur la table entière paierait pour les alias rejetés.

ALTER TABLE org_alias
  ADD COLUMN IF NOT EXISTS nom_normalise text
  GENERATED ALWAYS AS (
    btrim(
      regexp_replace(
        translate(
          replace(replace(lower(alias), 'œ', 'oe'), 'æ', 'ae'),
          'àáâãäåçéèêëìíîïñòóôõöùúûüýÿ',
          'aaaaaaceeeeiiiinooooouuuuyy'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS org_alias_nom_normalise_actif_idx
  ON org_alias (nom_normalise) WHERE status = 'active';

ANALYZE org_alias;
