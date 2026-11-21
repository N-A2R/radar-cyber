-- 045 : clé d'alias précalculée pour le gazetteer.
--
-- Le chargement du gazetteer normalisait 1 678 185 alias en JavaScript à chaque
-- coup de cache (10 min) : œ/æ, NFD + suppression des diacritiques, minuscules,
-- ponctuation réduite à des espaces. La clé est désormais matérialisée par une
-- colonne GÉNÉRÉE STORED : elle ne peut pas diverger de l'alias, et le SELECT du
-- collecteur n'a plus qu'à la lire.
--
-- L'expression est IMMUTABLE (lower, pg_catalog.normalize, regexp_replace,
-- replace, btrim). Elle reproduit `normaliser()` dans gazetteer.ts :
--  1. lower puis NFD, suppression de tous les signes diacritiques combinants
--     (les mêmes blocs Unicode que `\p{Diacritic}`) ;
--  2. œ→oe, æ→ae — ces ligatures ne se décomposent pas en NFD et sont
--     remplacées explicitement des deux côtés ;
--  3. tout ce qui n'est pas [a-z0-9] devient une espace, au plus une par
--     séquence, puis btrim retire les espaces de bord — exactement le
--     `[^a-z0-9]+` + trim de la fonction TypeScript.
--
-- Une table de translate limitée aux lettres françaises passait l'échantillon
-- mais divergeait sur Ẽ ou Ō, présents dans les raisons sociales : la mesure
-- complète des 1 678 185 alias a trouvé ces cas. La décomposition Unicode
-- couvre tous les caractères que le JS sait traiter.
--
-- L'index est partiel sur les alias actifs : ce sont les seuls que charge le
-- gazetteer, et un index sur la table entière paierait pour les alias rejetés.

ALTER TABLE org_alias
  ADD COLUMN IF NOT EXISTS nom_normalise text
  GENERATED ALWAYS AS (
    btrim(
      regexp_replace(
        replace(
          replace(
            regexp_replace(
              pg_catalog.normalize(lower(alias), 'NFD'),
              U&'[\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]' UESCAPE '\',
              '',
              'g'
            ),
            'œ', 'oe'
          ),
          'æ', 'ae'
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
