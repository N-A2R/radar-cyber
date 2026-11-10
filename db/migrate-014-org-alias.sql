-- 014 : alias d'organisations — socle du rattachement des événements
--
-- Le rattachement ne cherchait qu'une égalité exacte nom d'org = titre, d'où
-- 112 événements rattachés sur 7 411. On matérialise ici les variantes
-- d'écriture déjà connues des données : slug, domaine (sans www.), nom nettoyé
-- des formes juridiques et des préfixes institutionnels.
--
-- La table est peuplée ici, pas dans scripts/match-orgs.mts : la migration seule
-- suffit à rendre la base utilisable, le script ne fait que mesurer/appliquer.

CREATE TABLE IF NOT EXISTS org_alias (
  id         serial PRIMARY KEY,
  org_id     integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  alias      text NOT NULL,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, alias)
);

CREATE INDEX IF NOT EXISTS org_alias_lower_alias_idx ON org_alias (lower(alias));
CREATE INDEX IF NOT EXISTS org_lower_name_idx ON org (lower(name));

-- Nettoyage en étapes explicites (translate plutôt qu'unaccent : aucune
-- extension à installer sur les bases de dev).
WITH step1 AS (
  SELECT id, name, slug, domain,
         translate(lower(name),
                   'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
                   'aaaaaaceeeeiiiinooooouuuuyyoa') AS s
  FROM org
),
step2 AS (
  -- Les points sont supprimés (et non remplacés par une espace) pour que
  -- « S.A.S. » devienne « sas » et tombe sous la regex des formes juridiques.
  SELECT id, slug, domain, regexp_replace(s, '\.', '', 'g') AS s
  FROM step1
),
step3 AS (
  SELECT id, slug, domain,
         btrim(regexp_replace(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) AS s
  FROM step2
),
step4 AS (
  -- Formes juridiques en mot entier seulement (sa ne doit pas manger « safran »).
  SELECT id, slug, domain,
         btrim(regexp_replace(s,
           '(^|\s)(sas|sasu|sarl|eurl|sa|sci|gie|snc|sca|scop)(\s|$)', ' ', 'g')) AS s
  FROM step3
),
step5 AS (
  -- Préfixes institutionnels, avec leur article éventuel.
  SELECT id, slug, domain,
         btrim(regexp_replace(s,
           '^(universite|centre hospitalier|hopital)\s+(de\s+|du\s+|des\s+|d\s+)?', '')) AS s
  FROM step4
),
step6 AS (
  SELECT id, slug, domain,
         btrim(regexp_replace(s, '^(de|du|des|d)\s+', '')) AS s,
         btrim(regexp_replace(regexp_replace(lower(slug), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) AS slug_alias,
         btrim(regexp_replace(lower(regexp_replace(coalesce(domain, ''), '^www\.', '', 'i')), '\s+', ' ', 'g')) AS domain_alias
  FROM step5
),
all_aliases AS (
  SELECT id AS org_id, s AS alias, 'name'::text AS source FROM step6
  UNION ALL
  SELECT id, slug_alias, 'slug' FROM step6
  UNION ALL
  SELECT id, domain_alias, 'domain' FROM step6
)
INSERT INTO org_alias (org_id, alias, source)
SELECT DISTINCT ON (org_id, alias) org_id, alias, source
FROM all_aliases
WHERE alias IS NOT NULL AND alias <> '' AND length(alias) >= 4
ON CONFLICT (org_id, alias) DO NOTHING;
