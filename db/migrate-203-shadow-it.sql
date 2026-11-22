-- 203 : classement des sous-domaines CT par risque d'ombre.
--
-- Un sous-domaine vu dans les Certificate Transparency logs mais absent de
-- `asset` est un candidat « shadow IT » : soit un service légitime pas encore
-- inventorié, soit un service oublié, soit un nom qui imite une organisation.
-- La vue `shadow_it` rend ce classement lisible : une ligne par sous-domaine
-- récent (première vue < 30 jours), avec un motif et un score 0-100.
--
-- Le motif et le score sont calculés à la lecture, pas stockés : la même ligne
-- change de classe dès qu'un actif est ajouté ou qu'un domaine entre au
-- référentiel. Aucune donnée n'est écrasée, aucune colonne existante ne change.
--
-- Deux dates distinctes, parce qu'elles ne mesurent pas la même chose :
--   premiere_vue      première observation du nom par cet inventaire (chargement
--                     du snapshot ou passage de collecte) ;
--   certificat_vu_le  date la plus ancienne du certificat chez le fournisseur CT
--                     (crt.sh first_seen / Cert Spotter not_before).
-- Un nom peut être observé aujourd'hui avec un certificat de 2016 : la fenêtre
-- « nouveau sous-domaine » du critère porte sur la première observation.

ALTER TABLE ct_sous_domaine
  ADD COLUMN IF NOT EXISTS certificat_vu_le timestamptz;

UPDATE ct_sous_domaine
SET certificat_vu_le = premiere_vue
WHERE certificat_vu_le IS NULL;

COMMENT ON COLUMN ct_sous_domaine.premiere_vue IS
  'Première observation du nom par cet inventaire (chargement ou collecte).';
COMMENT ON COLUMN ct_sous_domaine.certificat_vu_le IS
  'Date la plus ancienne du certificat chez le fournisseur CT (first_seen / not_before).';

-- Distance d'édition de Levenshtein, sans extension (pas de CREATE EXTENSION
-- superutilisateur). Même algorithme que detecterSuspects() côté TypeScript.
CREATE OR REPLACE FUNCTION shadow_distance_edition(a text, b text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  la integer := length(coalesce(a, ''));
  lb integer := length(coalesce(b, ''));
  precedent integer[];
  courante integer[];
  i integer;
  j integer;
  cout integer;
BEGIN
  IF a IS NOT DISTINCT FROM b THEN RETURN 0; END IF;
  IF la = 0 THEN RETURN lb; END IF;
  IF lb = 0 THEN RETURN la; END IF;
  precedent := ARRAY(SELECT generate_series(0, lb));
  FOR i IN 1..la LOOP
    courante := ARRAY[i];
    FOR j IN 1..lb LOOP
      cout := CASE WHEN substr(a, i, 1) = substr(b, j, 1) THEN 0 ELSE 1 END;
      courante[j + 1] := LEAST(courante[j] + 1, precedent[j + 1] + 1, precedent[j] + cout);
    END LOOP;
    precedent := courante;
  END LOOP;
  RETURN precedent[lb + 1];
END;
$$;

-- Motif et score d'un sous-domaine. Cinq classes, par ordre de priorité :
--   wildcard  80  nom couvert par un certificat joker, hôte non attesté
--   typosquat 90  domaine copie une organisation connue (distance 1 ou 2)
--   staging   70  environnement de test/préproduction exposé
--   orphelin  55  domaine inconnu du référentiel, aucun actif ne le réclame
--   legitime  15  domaine d'une organisation connue, hôte pas encore inventorié
CREATE OR REPLACE FUNCTION shadow_classer(p_sous_domaine text, p_domaine text)
RETURNS TABLE (motif text, score smallint, detail text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_label text := lower(split_part(p_sous_domaine, '.', 1));
  v_racine text := lower(split_part(p_domaine, '.', 1));
  v_suffixe text := substring(lower(p_domaine) from strpos(lower(p_domaine), '.') + 1);
  v_distance integer;
  v_cible text;
  v_staging boolean;
  v_connu boolean;
BEGIN
  IF left(p_sous_domaine, 1) = '*' THEN
    RETURN QUERY SELECT 'wildcard'::text, 80::smallint,
      'nom couvert par un certificat joker, hôte non attesté'::text;
    RETURN;
  END IF;

  -- Un domaine déjà rattaché au référentiel n'est jamais un typosquat : sinon
  -- une organisation voisine à deux caractères (bordeauxac.fr) ferait passer
  -- le vrai domaine (bordeaux.fr) pour une copie.
  v_connu := EXISTS (
    SELECT 1 FROM org o
    WHERE lower(regexp_replace(o.domain, '^www\.', '')) = lower(p_domaine)
       OR lower(o.domain) = 'www.' || lower(p_domaine)
  ) OR EXISTS (SELECT 1 FROM asset a WHERE lower(a.value) = lower(p_domaine));

  SELECT min(s.d), (array_agg(s.domaine ORDER BY s.d, s.domaine))[1]
    INTO v_distance, v_cible
  FROM (
    SELECT
      shadow_distance_edition(v_racine, split_part(lower(regexp_replace(o.domain, '^www\.', '')), '.', 1)) AS d,
      o.domain AS domaine
    FROM org o
    WHERE o.domain IS NOT NULL
      AND btrim(o.domain) <> ''
      AND length(split_part(lower(regexp_replace(o.domain, '^www\.', '')), '.', 1)) >= 6
      AND split_part(lower(regexp_replace(o.domain, '^www\.', '')), '.', 1) <> v_racine
      AND substring(lower(regexp_replace(o.domain, '^www\.', ''))
                    from strpos(lower(regexp_replace(o.domain, '^www\.', '')), '.') + 1) = v_suffixe
  ) s
  WHERE s.d BETWEEN 1 AND 2
    AND NOT v_connu
    -- Mêmes gardes que detecterSuspects() : étiquette cible d'au moins 6
    -- caractères, et pas de distance 2 sur une étiquette de moins de 8.
    -- `pau` est à deux caractères de `spac`, mais ce n'est pas une copie.
    AND length(v_racine) >= 6
    AND NOT (s.d = 2 AND length(v_racine) < 8);

  IF v_distance IS NOT NULL THEN
    RETURN QUERY SELECT 'typosquat'::text,
      (CASE WHEN v_distance = 1 THEN 90 ELSE 82 END)::smallint,
      format('domaine à %s caractère(s) de %s', v_distance, v_cible);
    RETURN;
  END IF;

  v_staging := v_label ~ '^(staging|stage|stg|test|tests|testing|dev|devel|develop|preprod|pre-production|prod-test|uat|recette|rec|qualif|qualification|demo|sandbox|old|legacy|backup|bak|tmp|temp|preview|beta|alpha|nightly|ci|jenkins|gitlab|admin-test)$'
    OR v_label ~ '(^|[-_.])(staging|stage|test|dev|preprod|recette|rec|uat|sandbox|demo|old|legacy|backup|tmp)([-_.]|$)';
  IF v_staging THEN
    RETURN QUERY SELECT 'staging'::text, 70::smallint,
      'environnement de test ou de préproduction exposé'::text;
    RETURN;
  END IF;

  IF v_connu THEN
    RETURN QUERY SELECT 'legitime'::text, 15::smallint,
      'domaine rattaché à une organisation connue, hôte sans actif inventorié'::text;
  ELSE
    RETURN QUERY SELECT 'orphelin'::text, 55::smallint,
      'domaine inconnu du référentiel, aucun actif ne le réclame'::text;
  END IF;
  RETURN;
END;
$$;

-- Accélère le LEFT JOIN de la vue sur `asset.value`.
CREATE INDEX IF NOT EXISTS idx_asset_value ON asset (value);

-- Le critère de sortie, mot pour mot : sous-domaines sans actif dont la
-- première vue date de moins de 30 jours, chacun avec un motif et un score.
-- Une base qui a déjà la vue dans une forme antérieure (colonne `certificat_id`
-- au lieu de `certificat_vu_le`) ne peut pas passer par CREATE OR REPLACE :
-- PostgreSQL refuse tout changement de nom ou de liste de colonnes. La vue ne
-- porte aucune donnée et rien n'en dépend (les requêtes sont dans le code) :
-- on la remplace explicitement. Sur une base neuve, le DROP est un no-op et la
-- définition créée est identique à celle d'avant.
DROP VIEW IF EXISTS shadow_it;

CREATE VIEW shadow_it AS
SELECT
  c.id,
  c.sous_domaine,
  c.domaine,
  c.organisation,
  c.source,
  c.premiere_vue,
  c.certificat_vu_le,
  c.certificat_id,
  m.motif,
  m.score,
  m.detail AS motif_detail,
  c.collecte_le
FROM ct_sous_domaine c
LEFT JOIN asset a ON a.value = c.sous_domaine
CROSS JOIN LATERAL shadow_classer(c.sous_domaine, c.domaine) AS m
WHERE a.id IS NULL
  AND c.premiere_vue > now() - interval '30 days';

COMMENT ON VIEW shadow_it IS
  'Sous-domaines CT récents (première vue < 30 j) sans actif inventorié, classés par motif (wildcard, typosquat, staging, orphelin, legitime) et score 0-100.';
