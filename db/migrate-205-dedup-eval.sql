-- 205 : déduplication entre flux — mesure de précision et de rappel.
--
-- Un même incident republié par deux sources gonfle les scores, la
-- corroboration et le volume d'alertes. La migration 045 empêche une source
-- d'écrire deux fois le même article ; elle ne voit pas la réédition par une
-- seconde source, car la partie « source » de l'empreinte diffère.
--
-- Cette migration matérialise une évaluation reproductible :
--   * `dedup_pair` porte 200 paires annotées, dont 50 doublons réels ;
--   * `dedup_is_duplicate` applique la règle `cross-flow@1` (même titre
--     normalisé, ou titres proches, ou même entité + même nature le même
--     jour) ; l'implémentation TypeScript de `apps/api/src/dedup/event-pairs.ts`
--     applique exactement la même règle et le test compare les deux ;
--   * `dedup_eval` agrège tp/fp/fn/tn et les métriques.
--
-- Le critère de sortie se lit directement :
--   SELECT tp::float/(tp+fp) AS p, tp::float/(tp+fn) AS r FROM dedup_eval;
--
-- Aucune donnée personnelle : uniquement des titres d'actualité cyber
-- fabriqués pour l'évaluation, sans victime nommée.

CREATE TABLE IF NOT EXISTS dedup_pair (
  id           text PRIMARY KEY,
  a_title      text NOT NULL,
  a_source     text NOT NULL,
  a_day        date NOT NULL,
  b_title      text NOT NULL,
  b_source     text NOT NULL,
  b_day        date NOT NULL,
  is_duplicate boolean NOT NULL,
  predicted    boolean,
  note         text NOT NULL DEFAULT '',
  rule_version text NOT NULL DEFAULT 'cross-flow@1',
  annotated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dedup_eval (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  n_pairs      integer NOT NULL,
  n_duplicates integer NOT NULL,
  tp           integer NOT NULL,
  fp           integer NOT NULL,
  fn           integer NOT NULL,
  tn           integer NOT NULL,
  precision    double precision NOT NULL,
  recall       double precision NOT NULL,
  rule_version text NOT NULL,
  measured_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION dedup_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT btrim(regexp_replace(
    translate(
      replace(replace(lower(coalesce(t, '')), 'œ', 'oe'), 'æ', 'ae'),
      'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ', 'aaaaaaceeeeiiiinoooooouuuuyy'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ));
$fn$;

CREATE OR REPLACE FUNCTION dedup_tokens(t text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT COALESCE(array_agg(tok ORDER BY tok), '{}'::text[])
  FROM unnest(string_to_array(dedup_norm(t), ' ')) AS tok
  WHERE tok <> '' AND NOT (tok = ANY(ARRAY['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'et', 'en', 'au', 'aux', 'a', 'sur', 'pour', 'par', 'avec', 'dans', 'chez', 'vers', 'the', 'of', 'and', 'to', 'in', 'on', 'by', 'at']));
$fn$;

CREATE OR REPLACE FUNCTION dedup_content(t text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT COALESCE(array_agg(DISTINCT tok ORDER BY tok), '{}'::text[])
  FROM unnest(dedup_tokens(t)) AS tok
  WHERE length(tok) >= 3
    AND NOT (tok = ANY(ARRAY['cyberattaque', 'cyberattaques', 'cyber', 'attaque', 'attaques', 'victime', 'victimes', 'rancongiciel', 'rancongiciels', 'ransomware', 'ransomwares', 'pirate', 'pirates', 'piratage', 'intrusion', 'intrusions', 'incident', 'incidents', 'securite', 'informatique', 'systeme', 'systemes', 'donnees', 'personnelle', 'personnelles', 'site', 'sites', 'service', 'services', 'entreprise', 'entreprises', 'organisation', 'organisations', 'structure', 'structures', 'etablissement', 'etablissements', 'activite', 'activites', 'suspendu', 'suspendue', 'suspendues', 'paralyse', 'paralysee', 'paralysees', 'confirme', 'confirmee', 'confirmees', 'selon', 'indique', 'annonce', 'revele', 'lance', 'lancee', 'renforce', 'renforcement', 'renforcer', 'touche', 'touchee', 'touchees', 'affecte', 'affectee', 'affectees', 'dossier', 'fichier', 'fichiers', 'acces', 'reseau', 'reseaux', 'information', 'informations', 'communique', 'rapport', 'enquete', 'plainte', 'justice', 'condamne', 'condamnation', 'litige', 'projet', 'budget', 'marche', 'contrat', 'appel', 'offre', 'recrutement', 'formation', 'sensibilisation', 'prevention', 'mois', 'journee', 'semaine', 'campagne', 'numerique', 'digital', 'apres', 'avant', 'lors', 'alors', 'ainsi', 'egalement', 'toujours', 'encore', 'deja', 'plus', 'moins', 'tres', 'tout', 'tous', 'toute', 'toutes', 'autre', 'autres', 'meme', 'premier', 'premiere', 'nouveau', 'nouvelle', 'nouvelles', 'grand', 'grande', 'petit', 'petite', 'important', 'importante', 'plusieurs', 'certains', 'certaines', 'patients', 'patient', 'usagers', 'habitants', 'administres', 'agents', 'salaries', 'eleves', 'etudiants', 'clients', 'fournisseurs', 'partenaires', 'groupe', 'equipe', 'equipes', 'personnel', 'personnels', 'ligne', 'lignes', 'interrompu', 'interrompus', 'interrompue', 'interrompues', 'bloque', 'bloques', 'bloquee', 'bloquees', 'prise', 'charge', 'perturbee', 'perturbees', 'perturbe', 'rancon', 'rancons', 'exigee', 'exigees', 'comptes', 'compte', 'derobe', 'derobes', 'derobee', 'derobees', 'publie', 'publies', 'publiee', 'publiees', 'diffuse', 'diffuses', 'diffusee', 'diffusees', 'expose', 'exposes', 'exposee', 'exposees', 'hacker', 'hackers', 'internet', 'identite', 'courriel', 'courriels', 'frauduleux', 'frauduleuse', 'frauduleuses', 'usurpe', 'usurpent', 'sature', 'satures', 'saturee', 'saturees', 'responsable', 'annuel', 'annuelle', 'signe', 'cybersecurite', 'recrute', 'ddos', 'phishing', 'hameconnage', 'hameconnages', 'defacement', 'defigure', 'vulnerabilite', 'faille', 'correctif', 'zero', 'day', 'cible', 'cibles', 'vise', 'visee', 'visees', 'fraude', 'fraudes', 'arnaque', 'arnaques', 'escroquerie', 'escroqueries', 'prestataire', 'prestataires']))
    AND NOT (tok = ANY(ARRAY['chu', 'ch', 'hopital', 'hopitaux', 'hospitalier', 'hospitaliere', 'clinique', 'ehpad', 'mairie', 'ville', 'communes', 'commune', 'departement', 'departemental', 'departementale', 'conseil', 'region', 'regional', 'regionale', 'agglo', 'agglomeration', 'communaute', 'metropole', 'metropolitain', 'sdis', 'pompiers', 'pompier', 'universite', 'universitaire', 'univ', 'gendarmerie', 'gendarmes', 'police', 'prefecture', 'prefet', 'ecole', 'college', 'lycee', 'tribunal', 'caf', 'cpam', 'urssaf', 'ars']));
$fn$;

CREATE OR REPLACE FUNCTION dedup_markers(t text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT COALESCE(array_agg(DISTINCT m ORDER BY m), '{}'::text[])
  FROM (
    SELECT CASE
      WHEN tok = ANY(ARRAY['chu', 'ch', 'hopital', 'hopitaux', 'hospitalier', 'hospitaliere', 'clinique', 'ehpad']) THEN 'hopital'
      WHEN tok = ANY(ARRAY['mairie', 'ville', 'communes', 'commune']) THEN 'commune'
      WHEN tok = ANY(ARRAY['departement', 'departemental', 'departementale', 'conseil']) THEN 'departement'
      WHEN tok = ANY(ARRAY['region', 'regional', 'regionale']) THEN 'region'
      WHEN tok = ANY(ARRAY['agglo', 'agglomeration', 'communaute', 'metropole', 'metropolitain']) THEN 'agglo'
      WHEN tok = ANY(ARRAY['sdis', 'pompiers', 'pompier']) THEN 'pompiers'
      WHEN tok = ANY(ARRAY['universite', 'universitaire', 'univ']) THEN 'universite'
      WHEN tok = ANY(ARRAY['gendarmerie', 'gendarmes']) THEN 'gendarmerie'
      WHEN tok = ANY(ARRAY['police']) THEN 'police'
      WHEN tok = ANY(ARRAY['prefecture', 'prefet']) THEN 'prefecture'
      WHEN tok = ANY(ARRAY['ecole', 'college', 'lycee']) THEN 'ecole'
      WHEN tok = ANY(ARRAY['tribunal']) THEN 'tribunal'
      WHEN tok = ANY(ARRAY['caf']) THEN 'caf'
      WHEN tok = ANY(ARRAY['cpam']) THEN 'cpam'
      WHEN tok = ANY(ARRAY['urssaf']) THEN 'urssaf'
      WHEN tok = ANY(ARRAY['ars']) THEN 'ars'
      ELSE NULL END AS m
    FROM unnest(dedup_tokens(t)) AS tok
  ) s WHERE m IS NOT NULL;
$fn$;

CREATE OR REPLACE FUNCTION dedup_identifiers(t text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::text[])
  FROM (
    SELECT m[1] AS x FROM regexp_matches(lower(coalesce(t, '')), 'cve-[0-9]{4}-[0-9]{4,}', 'g') AS m
    UNION ALL
    SELECT m[1] FROM regexp_matches(lower(coalesce(t, '')), '\m([0-9]{1,3}\.){3}[0-9]{1,3}\M', 'g') AS m
    UNION ALL
    SELECT m[1] FROM regexp_matches(lower(coalesce(t, '')), '\m([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+(fr|com|net|org|io|eu|info)\M', 'g') AS m
  ) s;
$fn$;

CREATE OR REPLACE FUNCTION dedup_kind(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  WITH tok AS (SELECT dedup_tokens(t) AS a)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['rancongiciel', 'rancongiciels', 'ransomware', 'ransomwares'])) THEN 'ransomware'
    WHEN EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['cve', 'vulnerabilite', 'vulnerabilites', 'faille', 'failles', 'correctif', 'correctifs'])) THEN 'vuln'
    WHEN EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['fuite', 'fuites', 'exfiltration', 'exfiltrations', 'divulgation', 'divulgations', 'exfiltre', 'exfiltree', 'exfiltrees'])) THEN 'leak'
    WHEN (EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['donnees']))
          OR EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['fichier','fichiers'])))
         AND EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['publie', 'publies', 'publiee', 'publiees', 'diffuse', 'diffuses', 'diffusee', 'diffusees', 'derobe', 'derobes', 'derobee', 'derobees', 'expose', 'exposes', 'exposee', 'exposees', 'vole', 'voles', 'volee', 'volees'])) THEN 'leak'
    WHEN EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['phishing', 'hameconnage', 'hameconnages', 'arnaque', 'arnaques', 'escroquerie', 'escroqueries', 'fraude', 'fraudes'])) THEN 'fraude'
    WHEN EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['defacement', 'defiguration', 'defigure', 'defiguree', 'defigurees', 'defigurent', 'defigures', 'detournee', 'detournees'])) THEN 'defacement'
    WHEN EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['ddos']))
         OR (EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['deni']))
             AND EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['service']))) THEN 'ddos'
    WHEN EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['cyberattaque', 'cyberattaques', 'intrusion', 'intrusions', 'piratage', 'pirate', 'pirates', 'compromission', 'compromissions', 'compromis']))
         OR (EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['attaque']))
             AND EXISTS (SELECT 1 FROM unnest(a) x WHERE x = ANY(ARRAY['informatique']))) THEN 'incident'
    ELSE 'autre' END
  FROM tok;
$fn$;

CREATE OR REPLACE FUNCTION dedup_kind_group(k text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT CASE WHEN k IN ('ransomware', 'leak', 'incident') THEN 'incident' ELSE k END;
$fn$;

CREATE OR REPLACE FUNCTION dedup_shared(a text[], b text[]) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT count(*)::int FROM (SELECT unnest(a) INTERSECT SELECT unnest(b)) s;
$fn$;

CREATE OR REPLACE FUNCTION dedup_jaccard(a text[], b text[]) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT CASE WHEN u = 0 THEN 0 ELSE s::float / u END
  FROM (
    SELECT
      (SELECT count(*) FROM (SELECT unnest(a) INTERSECT SELECT unnest(b)) x) AS s,
      (SELECT count(*) FROM (SELECT unnest(a) UNION SELECT unnest(b)) y) AS u
  ) z;
$fn$;

CREATE OR REPLACE FUNCTION dedup_is_duplicate(a_title text, a_day date, b_title text, b_day date) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  WITH ca AS (SELECT dedup_content(a_title) AS v),
       cb AS (SELECT dedup_content(b_title) AS v)
  SELECT CASE
    WHEN a_day IS NULL OR b_day IS NULL THEN false
    WHEN abs(a_day - b_day) > 1 THEN false
    WHEN dedup_norm(a_title) <> '' AND dedup_norm(a_title) = dedup_norm(b_title) THEN true
    WHEN dedup_shared(ca.v, cb.v) >= 2
         AND (SELECT count(*) FROM (SELECT unnest(ca.v) UNION SELECT unnest(cb.v)) u) >= 3
         AND dedup_jaccard(ca.v, cb.v) >= 0.55 THEN true
    WHEN dedup_kind_group(dedup_kind(a_title)) <> 'autre'
         AND dedup_kind_group(dedup_kind(a_title)) = dedup_kind_group(dedup_kind(b_title))
         AND (dedup_shared(dedup_identifiers(a_title), dedup_identifiers(b_title)) > 0
              OR (dedup_shared(dedup_markers(a_title), dedup_markers(b_title)) > 0
                  AND dedup_shared(ca.v, cb.v) > 0)) THEN true
    ELSE false END
  FROM ca, cb;
$fn$;

INSERT INTO dedup_pair (id, a_title, a_source, a_day, b_title, b_source, b_day, is_duplicate, note)
VALUES
  ('D001', 'CHU de Bordeaux victime d''un rançongiciel : activité suspendue', 'presse-locale', '2026-10-01'::date, 'Rançongiciel contre CHU de Bordeaux : systèmes bloqués', 'source-institutionnelle', '2026-10-02'::date, true, 'ransomware — CHU de Bordeaux'),
  ('D002', 'Rançongiciel contre CH de Bayonne : services en ligne interrompus', 'presse-locale', '2026-10-03'::date, 'CH de Bayonne : les systèmes chiffrés par un rançongiciel', 'source-institutionnelle', '2026-10-03'::date, true, 'ransomware — CH de Bayonne'),
  ('D003', 'Hôpital de Mont-de-Marsan : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2026-10-05'::date, 'Hôpital de Mont-de-Marsan : une cyberattaque paralyse services en ligne interrompus', 'source-institutionnelle', '2026-10-05'::date, true, 'ransomware — Hôpital de Mont-de-Marsan'),
  ('D004', 'CH d''Angoulême : une cyberattaque paralyse systèmes bloqués', 'presse-locale', '2026-10-07'::date, 'CH d''Angoulême victime d''un rançongiciel : prise en charge perturbée', 'source-institutionnelle', '2026-10-08'::date, true, 'ransomware — CH d''Angoulême'),
  ('D005', 'CH de Châtellerault victime d''un rançongiciel : activité suspendue', 'presse-locale', '2026-10-09'::date, 'Rançongiciel contre CH de Châtellerault : systèmes bloqués', 'source-institutionnelle', '2026-10-09'::date, true, 'ransomware — CH de Châtellerault'),
  ('D006', 'Rançongiciel contre CHU de Limoges : services en ligne interrompus', 'presse-locale', '2026-10-11'::date, 'Limoges : une cyberattaque paralyse l''établissement', 'source-institutionnelle', '2026-10-11'::date, true, 'ransomware — CHU de Limoges'),
  ('D007', 'Clinique Pasteur de Bordeaux : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2026-10-13'::date, 'Hôpital de Bordeaux : une cyberattaque paralyse services en ligne interrompus', 'source-institutionnelle', '2026-10-14'::date, true, 'ransomware — Clinique Pasteur de Bordeaux'),
  ('D008', 'Mairie de Pau : une cyberattaque paralyse systèmes bloqués', 'presse-locale', '2026-10-15'::date, 'Mairie de Pau victime d''un rançongiciel : prise en charge perturbée', 'source-institutionnelle', '2026-10-15'::date, true, 'ransomware — Mairie de Pau'),
  ('D009', 'Ville de Niort victime d''un rançongiciel : activité suspendue', 'presse-locale', '2026-10-17'::date, 'Rançongiciel contre Ville de Niort : systèmes bloqués', 'source-institutionnelle', '2026-10-17'::date, true, 'ransomware — Ville de Niort'),
  ('D010', 'Rançongiciel contre Mairie de La Rochelle : services en ligne interrompus', 'presse-locale', '2026-10-19'::date, 'Mairie de La Rochelle : les systèmes chiffrés par un rançongiciel', 'source-institutionnelle', '2026-10-20'::date, true, 'ransomware — Mairie de La Rochelle'),
  ('D011', 'Mairie de Brive : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2026-10-21'::date, 'Ville de Brive : une cyberattaque paralyse services en ligne interrompus', 'source-institutionnelle', '2026-10-21'::date, true, 'ransomware — Mairie de Brive'),
  ('D012', 'Mairie de Périgueux : une cyberattaque paralyse systèmes bloqués', 'presse-locale', '2026-10-23'::date, 'Mairie de Périgueux victime d''un rançongiciel : prise en charge perturbée', 'source-institutionnelle', '2026-10-23'::date, true, 'ransomware — Mairie de Périgueux'),
  ('D013', 'Mairie de Rochefort victime d''une fuite de données : 2844 comptes exposés', 'presse-locale', '2026-10-25'::date, 'Mairie de Rochefort : des données personnelles diffusées en ligne', 'source-institutionnelle', '2026-10-26'::date, true, 'leak — Mairie de Rochefort'),
  ('D014', 'Mairie de Saintes : des données personnelles diffusées en ligne', 'presse-locale', '2026-10-27'::date, 'Exfiltration de données : Mairie de Saintes concerné', 'source-institutionnelle', '2026-10-27'::date, true, 'leak — Mairie de Saintes'),
  ('D015', 'Exfiltration de données : Mairie de Cognac concerné', 'presse-locale', '2026-10-29'::date, 'Ville de Cognac : des fichiers dérobés puis publiés', 'source-institutionnelle', '2026-10-29'::date, true, 'leak — Mairie de Cognac'),
  ('D016', 'Mairie de Tulle : des fichiers dérobés puis publiés', 'presse-locale', '2026-10-31'::date, 'Mairie de Tulle victime d''une fuite de données : 4214 comptes exposés', 'source-institutionnelle', '2026-11-01'::date, true, 'leak — Mairie de Tulle'),
  ('D017', 'Mairie de Guéret victime d''une fuite de données : 3392 comptes exposés', 'presse-locale', '2026-11-02'::date, 'Mairie de Guéret : des données personnelles diffusées en ligne', 'source-institutionnelle', '2026-11-02'::date, true, 'leak — Mairie de Guéret'),
  ('D018', 'Département de la Gironde : des données personnelles diffusées en ligne', 'presse-locale', '2026-11-04'::date, 'Exfiltration de données : Département de la Gironde concerné', 'source-institutionnelle', '2026-11-04'::date, true, 'leak — Département de la Gironde'),
  ('D019', 'Exfiltration de données : Conseil départemental des Landes concerné', 'presse-locale', '2026-11-06'::date, 'Département de Landes : des fichiers dérobés puis publiés', 'source-institutionnelle', '2026-11-07'::date, true, 'leak — Conseil départemental des Landes'),
  ('D020', 'Département de la Dordogne : des fichiers dérobés puis publiés', 'presse-locale', '2026-11-08'::date, 'Département de la Dordogne victime d''une fuite de données : 4762 comptes exposés', 'source-institutionnelle', '2026-11-08'::date, true, 'leak — Département de la Dordogne'),
  ('D021', 'Région Nouvelle-Aquitaine visé par une cyberattaque', 'presse-locale', '2026-11-10'::date, 'Intrusion informatique au sein de Région Nouvelle-Aquitaine : systèmes bloqués', 'source-institutionnelle', '2026-11-10'::date, true, 'incident — Région Nouvelle-Aquitaine'),
  ('D022', 'Intrusion informatique au sein de Université de Poitiers : services en ligne interrompus', 'presse-locale', '2026-11-12'::date, 'Cyberattaque à Université de Poitiers : activité suspendue', 'source-institutionnelle', '2026-11-13'::date, true, 'incident — Université de Poitiers'),
  ('D023', 'Cyberattaque à Université de Bordeaux : prise en charge perturbée', 'presse-locale', '2026-11-14'::date, 'Piratage informatique : Université de Bordeaux touché', 'source-institutionnelle', '2026-11-14'::date, true, 'incident — Université de Bordeaux'),
  ('D024', 'Piratage informatique : SDIS de la Gironde touché', 'presse-locale', '2026-11-16'::date, 'SDIS de la Gironde visé par une cyberattaque', 'source-institutionnelle', '2026-11-16'::date, true, 'incident — SDIS de la Gironde'),
  ('D025', 'Communauté d''agglomération de La Rochelle visé par une cyberattaque', 'presse-locale', '2026-11-18'::date, 'Intrusion informatique au sein de Communauté d''agglomération de La Rochelle : systèmes bloqués', 'source-institutionnelle', '2026-11-19'::date, true, 'incident — Communauté d''agglomération de La Rochelle'),
  ('D026', 'Intrusion informatique au sein de Préfecture de la Dordogne : services en ligne interrompus', 'presse-locale', '2026-11-20'::date, 'Dordogne : une cyberattaque paralyse les services', 'source-institutionnelle', '2026-11-20'::date, true, 'incident — Préfecture de la Dordogne'),
  ('D027', 'Cyberattaque à Lycée de Bayonne : prise en charge perturbée', 'presse-locale', '2026-11-22'::date, 'Piratage informatique : Lycée de Bayonne touché', 'source-institutionnelle', '2026-11-22'::date, true, 'incident — Lycée de Bayonne'),
  ('D028', 'Piratage informatique : Collège de Pau touché', 'presse-locale', '2026-11-24'::date, 'Collège de Pau visé par une cyberattaque', 'source-institutionnelle', '2026-11-25'::date, true, 'incident — Collège de Pau'),
  ('D029', 'CAF de Poitiers visé par une cyberattaque', 'presse-locale', '2026-11-26'::date, 'Intrusion informatique au sein de CAF de Poitiers : systèmes bloqués', 'source-institutionnelle', '2026-11-26'::date, true, 'incident — CAF de Poitiers'),
  ('D030', 'Intrusion informatique au sein de CPAM de Niort : services en ligne interrompus', 'presse-locale', '2026-11-28'::date, 'Cyberattaque à CPAM de Niort : activité suspendue', 'source-institutionnelle', '2026-11-28'::date, true, 'incident — CPAM de Niort'),
  ('D031', 'CHU de Bordeaux : les services en ligne saturés par un DDoS', 'presse-locale', '2026-11-30'::date, 'Une attaque DDoS perturbe Hôpital de Bordeaux', 'source-institutionnelle', '2026-12-01'::date, true, 'ddos — CHU de Bordeaux'),
  ('D032', 'Une attaque DDoS perturbe CH de Bayonne', 'presse-locale', '2026-12-02'::date, 'CH de Bayonne cible d''une attaque DDoS', 'source-institutionnelle', '2026-12-02'::date, true, 'ddos — CH de Bayonne'),
  ('D033', 'Hôpital de Mont-de-Marsan cible d''une attaque DDoS', 'presse-locale', '2026-12-04'::date, 'Attaque par déni de service contre Hôpital de Mont-de-Marsan', 'source-institutionnelle', '2026-12-04'::date, true, 'ddos — Hôpital de Mont-de-Marsan'),
  ('D034', 'Attaque par déni de service contre CH d''Angoulême', 'presse-locale', '2026-12-06'::date, 'CH d''Angoulême : les services en ligne saturés par un DDoS', 'source-institutionnelle', '2026-12-07'::date, true, 'ddos — CH d''Angoulême'),
  ('D035', 'CH de Châtellerault : les services en ligne saturés par un DDoS', 'presse-locale', '2026-12-08'::date, 'Une attaque DDoS perturbe Hôpital de Châtellerault', 'source-institutionnelle', '2026-12-08'::date, true, 'ddos — CH de Châtellerault'),
  ('D036', 'Une attaque DDoS perturbe CHU de Limoges', 'presse-locale', '2026-12-10'::date, 'CHU de Limoges cible d''une attaque DDoS', 'source-institutionnelle', '2026-12-10'::date, true, 'ddos — CHU de Limoges'),
  ('D037', 'Clinique Pasteur de Bordeaux alerté après une campagne de phishing', 'presse-locale', '2026-12-12'::date, 'Hameçonnage au nom de Clinique Pasteur de Bordeaux', 'source-institutionnelle', '2026-12-13'::date, true, 'fraude — Clinique Pasteur de Bordeaux'),
  ('D038', 'Hameçonnage au nom de Mairie de Pau', 'presse-locale', '2026-12-14'::date, 'Mairie de Pau : une fraude par courriel usurpe l''identité de l''établissement', 'source-institutionnelle', '2026-12-14'::date, true, 'fraude — Mairie de Pau'),
  ('D039', 'Ville de Niort : une fraude par courriel usurpe l''identité de l''établissement', 'presse-locale', '2026-12-16'::date, 'Ville de Niort : une arnaque par phishing vise les usagers', 'source-institutionnelle', '2026-12-16'::date, true, 'fraude — Ville de Niort'),
  ('D040', 'Mairie de La Rochelle : une arnaque par phishing vise les usagers', 'presse-locale', '2026-12-18'::date, 'Mairie de La Rochelle alerté après une campagne de phishing', 'source-institutionnelle', '2026-12-19'::date, true, 'fraude — Mairie de La Rochelle'),
  ('D041', 'Mairie de Brive alerté après une campagne de phishing', 'presse-locale', '2026-12-20'::date, 'Hameçonnage au nom de Mairie de Brive', 'source-institutionnelle', '2026-12-20'::date, true, 'fraude — Mairie de Brive'),
  ('D042', 'Hameçonnage au nom de Mairie de Périgueux', 'presse-locale', '2026-12-22'::date, 'Mairie de Périgueux : une fraude par courriel usurpe l''identité de l''établissement', 'source-institutionnelle', '2026-12-22'::date, true, 'fraude — Mairie de Périgueux'),
  ('D043', 'Mairie de Rochefort : le site internet piraté et défiguré', 'presse-locale', '2026-12-24'::date, 'Des hackers défigurent le site de Ville de Rochefort', 'source-institutionnelle', '2026-12-25'::date, true, 'defacement — Mairie de Rochefort'),
  ('D044', 'Des hackers défigurent le site de Mairie de Saintes', 'presse-locale', '2026-12-26'::date, 'Le site de Mairie de Saintes défiguré par des hackers', 'source-institutionnelle', '2026-12-26'::date, true, 'defacement — Mairie de Saintes'),
  ('D045', 'Le site de Mairie de Cognac défiguré par des hackers', 'presse-locale', '2026-12-28'::date, 'Défacement : la page d''accueil de Mairie de Cognac détournée', 'source-institutionnelle', '2026-12-28'::date, true, 'defacement — Mairie de Cognac'),
  ('D046', 'Défacement : la page d''accueil de Mairie de Tulle détournée', 'presse-locale', '2026-12-30'::date, 'Tulle : le site internet défiguré', 'source-institutionnelle', '2026-12-31'::date, true, 'defacement — Mairie de Tulle'),
  ('D047', 'Une faille zero-day affecte VMware vCenter (CVE-2026-7712)', 'presse-locale', '2027-01-01'::date, 'Correctif urgent pour CVE-2026-7712 dans VMware vCenter', 'source-institutionnelle', '2027-01-01'::date, true, 'vuln — Mairie de Guéret'),
  ('D048', 'Correctif urgent pour CVE-2026-8843 dans Citrix NetScaler', 'presse-locale', '2027-01-03'::date, 'Faille critique CVE-2026-8843 dans Citrix NetScaler', 'source-institutionnelle', '2027-01-03'::date, true, 'vuln — Département de la Gironde'),
  ('D049', 'Faille critique CVE-2026-1180 dans Microsoft Exchange', 'presse-locale', '2027-01-05'::date, 'CVE-2026-1180 : Microsoft Exchange exposé à une vulnérabilité critique', 'source-institutionnelle', '2027-01-06'::date, true, 'vuln — Conseil départemental des Landes'),
  ('D050', 'CVE-2026-2043 : SonicWall SMA exposé à une vulnérabilité critique', 'presse-locale', '2027-01-07'::date, 'Une faille zero-day affecte SonicWall SMA (CVE-2026-2043)', 'source-institutionnelle', '2027-01-07'::date, true, 'vuln — Département de la Dordogne'),
  ('N001', 'CHU de Bordeaux victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-01-09'::date, 'Mairie de Périgueux : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-01-29'::date, false, 'sujets distincts'),
  ('N002', 'Intrusion informatique au sein de CH de Bayonne : services en ligne interrompus', 'presse-locale', '2027-01-12'::date, 'Des hackers défigurent le site de Mairie de Rochefort', 'autre-flux', '2027-02-01'::date, false, 'sujets distincts'),
  ('N003', 'Exfiltration de données : Hôpital de Mont-de-Marsan concerné', 'presse-locale', '2027-01-15'::date, 'Mairie de Saintes signe un contrat avec un prestataire informatique', 'autre-flux', '2027-02-04'::date, false, 'sujets distincts'),
  ('N004', 'Une attaque DDoS perturbe CH d''Angoulême', 'presse-locale', '2027-01-18'::date, 'Hameçonnage au nom de Mairie de Cognac', 'autre-flux', '2027-02-07'::date, false, 'sujets distincts'),
  ('N005', 'Après le rançongiciel, CH de Châtellerault : activité suspendue', 'presse-locale', '2027-01-21'::date, 'Mairie de Tulle : le site internet piraté et défiguré', 'autre-flux', '2027-02-10'::date, false, 'sujets distincts'),
  ('N006', 'Intrusion informatique au sein de CHU de Limoges : services en ligne interrompus', 'presse-locale', '2027-01-24'::date, 'Mairie de Guéret publie son rapport annuel d''activité', 'autre-flux', '2027-02-13'::date, false, 'sujets distincts'),
  ('N007', 'Exfiltration de données : Clinique Pasteur de Bordeaux concerné', 'presse-locale', '2027-01-27'::date, 'Département de la Gironde alerté après une campagne de phishing', 'autre-flux', '2027-02-16'::date, false, 'sujets distincts'),
  ('N008', 'Une attaque DDoS perturbe Mairie de Pau', 'presse-locale', '2027-01-30'::date, 'Défacement : la page d''accueil de Conseil départemental des Landes détournée', 'autre-flux', '2027-02-19'::date, false, 'sujets distincts'),
  ('N009', 'Ville de Niort : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-02-02'::date, 'Département de la Dordogne inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-02-22'::date, false, 'sujets distincts'),
  ('N010', 'Intrusion informatique au sein de Mairie de La Rochelle : services en ligne interrompus', 'presse-locale', '2027-02-05'::date, 'Région Nouvelle-Aquitaine : une arnaque par phishing vise les usagers', 'autre-flux', '2027-02-25'::date, false, 'sujets distincts'),
  ('N011', 'Exfiltration de données : Mairie de Brive concerné', 'presse-locale', '2027-02-08'::date, 'Le site de Université de Poitiers défiguré par des hackers', 'autre-flux', '2027-02-28'::date, false, 'sujets distincts'),
  ('N012', 'Une attaque DDoS perturbe Mairie de Périgueux', 'presse-locale', '2027-02-11'::date, 'Université de Bordeaux organise une journée de sensibilisation au numérique', 'autre-flux', '2027-03-03'::date, false, 'sujets distincts'),
  ('N013', 'Mairie de Rochefort victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-02-14'::date, 'SDIS de la Gironde : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-03-06'::date, false, 'sujets distincts'),
  ('N014', 'Intrusion informatique au sein de Mairie de Saintes : services en ligne interrompus', 'presse-locale', '2027-02-17'::date, 'Des hackers défigurent le site de Communauté d''agglomération de La Rochelle', 'autre-flux', '2027-03-09'::date, false, 'sujets distincts'),
  ('N015', 'Exfiltration de données : Mairie de Cognac concerné', 'presse-locale', '2027-02-20'::date, 'Préfecture de la Dordogne recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-03-12'::date, false, 'sujets distincts'),
  ('N016', 'Une attaque DDoS perturbe Mairie de Tulle', 'presse-locale', '2027-02-23'::date, 'Hameçonnage au nom de Lycée de Bayonne', 'autre-flux', '2027-03-15'::date, false, 'sujets distincts'),
  ('N017', 'Après le rançongiciel, Mairie de Guéret : activité suspendue', 'presse-locale', '2027-02-26'::date, 'Collège de Pau : le site internet piraté et défiguré', 'autre-flux', '2027-03-18'::date, false, 'sujets distincts'),
  ('N018', 'Intrusion informatique au sein de Département de la Gironde : services en ligne interrompus', 'presse-locale', '2027-03-01'::date, 'CAF de Poitiers signe un contrat avec un prestataire informatique', 'autre-flux', '2027-03-21'::date, false, 'sujets distincts'),
  ('N019', 'Exfiltration de données : Conseil départemental des Landes concerné', 'presse-locale', '2027-03-04'::date, 'CPAM de Niort alerté après une campagne de phishing', 'autre-flux', '2027-03-24'::date, false, 'sujets distincts'),
  ('N020', 'Une attaque DDoS perturbe Département de la Dordogne', 'presse-locale', '2027-03-07'::date, 'Défacement : la page d''accueil de CHU de Bordeaux détournée', 'autre-flux', '2027-03-27'::date, false, 'sujets distincts'),
  ('N021', 'Région Nouvelle-Aquitaine : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-03-10'::date, 'CH de Bayonne publie son rapport annuel d''activité', 'autre-flux', '2027-03-30'::date, false, 'sujets distincts'),
  ('N022', 'Intrusion informatique au sein de Université de Poitiers : services en ligne interrompus', 'presse-locale', '2027-03-13'::date, 'Hôpital de Mont-de-Marsan : une arnaque par phishing vise les usagers', 'autre-flux', '2027-04-02'::date, false, 'sujets distincts'),
  ('N023', 'Exfiltration de données : Université de Bordeaux concerné', 'presse-locale', '2027-03-16'::date, 'Le site de CH d''Angoulême défiguré par des hackers', 'autre-flux', '2027-04-05'::date, false, 'sujets distincts'),
  ('N024', 'Une attaque DDoS perturbe SDIS de la Gironde', 'presse-locale', '2027-03-19'::date, 'CH de Châtellerault inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-04-08'::date, false, 'sujets distincts'),
  ('N025', 'Communauté d''agglomération de La Rochelle victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-03-22'::date, 'CHU de Limoges : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-04-11'::date, false, 'sujets distincts'),
  ('N026', 'Intrusion informatique au sein de Préfecture de la Dordogne : services en ligne interrompus', 'presse-locale', '2027-03-25'::date, 'Des hackers défigurent le site de Clinique Pasteur de Bordeaux', 'autre-flux', '2027-04-14'::date, false, 'sujets distincts'),
  ('N027', 'Exfiltration de données : Lycée de Bayonne concerné', 'presse-locale', '2027-03-28'::date, 'Mairie de Pau organise une journée de sensibilisation au numérique', 'autre-flux', '2027-04-17'::date, false, 'sujets distincts'),
  ('N028', 'Une attaque DDoS perturbe Collège de Pau', 'presse-locale', '2027-03-31'::date, 'Hameçonnage au nom de Ville de Niort', 'autre-flux', '2027-04-20'::date, false, 'sujets distincts'),
  ('N029', 'Après le rançongiciel, CAF de Poitiers : activité suspendue', 'presse-locale', '2027-04-03'::date, 'Mairie de La Rochelle : le site internet piraté et défiguré', 'autre-flux', '2027-04-23'::date, false, 'sujets distincts'),
  ('N030', 'Intrusion informatique au sein de CPAM de Niort : services en ligne interrompus', 'presse-locale', '2027-04-06'::date, 'Mairie de Brive recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-04-26'::date, false, 'sujets distincts'),
  ('N031', 'Exfiltration de données : CHU de Bordeaux concerné', 'presse-locale', '2027-04-09'::date, 'Mairie de Périgueux alerté après une campagne de phishing', 'autre-flux', '2027-04-29'::date, false, 'sujets distincts'),
  ('N032', 'Une attaque DDoS perturbe CH de Bayonne', 'presse-locale', '2027-04-12'::date, 'Défacement : la page d''accueil de Mairie de Rochefort détournée', 'autre-flux', '2027-05-02'::date, false, 'sujets distincts'),
  ('N033', 'Hôpital de Mont-de-Marsan : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-04-15'::date, 'Mairie de Saintes signe un contrat avec un prestataire informatique', 'autre-flux', '2027-05-05'::date, false, 'sujets distincts'),
  ('N034', 'Intrusion informatique au sein de CH d''Angoulême : services en ligne interrompus', 'presse-locale', '2027-04-18'::date, 'Mairie de Cognac : une arnaque par phishing vise les usagers', 'autre-flux', '2027-05-08'::date, false, 'sujets distincts'),
  ('N035', 'Exfiltration de données : CH de Châtellerault concerné', 'presse-locale', '2027-04-21'::date, 'Le site de Mairie de Tulle défiguré par des hackers', 'autre-flux', '2027-05-11'::date, false, 'sujets distincts'),
  ('N036', 'Une attaque DDoS perturbe CHU de Limoges', 'presse-locale', '2027-04-24'::date, 'Mairie de Guéret publie son rapport annuel d''activité', 'autre-flux', '2027-05-14'::date, false, 'sujets distincts'),
  ('N037', 'Clinique Pasteur de Bordeaux victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-04-27'::date, 'Département de la Gironde : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-05-17'::date, false, 'sujets distincts'),
  ('N038', 'Intrusion informatique au sein de Mairie de Pau : services en ligne interrompus', 'presse-locale', '2027-04-30'::date, 'Des hackers défigurent le site de Conseil départemental des Landes', 'autre-flux', '2027-05-20'::date, false, 'sujets distincts'),
  ('N039', 'Exfiltration de données : Ville de Niort concerné', 'presse-locale', '2027-05-03'::date, 'Département de la Dordogne inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-05-23'::date, false, 'sujets distincts'),
  ('N040', 'Une attaque DDoS perturbe Mairie de La Rochelle', 'presse-locale', '2027-05-06'::date, 'Hameçonnage au nom de Région Nouvelle-Aquitaine', 'autre-flux', '2027-05-26'::date, false, 'sujets distincts'),
  ('N041', 'Après le rançongiciel, Mairie de Brive : activité suspendue', 'presse-locale', '2027-05-09'::date, 'Université de Poitiers : le site internet piraté et défiguré', 'autre-flux', '2027-05-29'::date, false, 'sujets distincts'),
  ('N042', 'Intrusion informatique au sein de Mairie de Périgueux : services en ligne interrompus', 'presse-locale', '2027-05-12'::date, 'Université de Bordeaux organise une journée de sensibilisation au numérique', 'autre-flux', '2027-06-01'::date, false, 'sujets distincts'),
  ('N043', 'Exfiltration de données : Mairie de Rochefort concerné', 'presse-locale', '2027-05-15'::date, 'SDIS de la Gironde alerté après une campagne de phishing', 'autre-flux', '2027-06-04'::date, false, 'sujets distincts'),
  ('N044', 'Une attaque DDoS perturbe Mairie de Saintes', 'presse-locale', '2027-05-18'::date, 'Défacement : la page d''accueil de Communauté d''agglomération de La Rochelle détournée', 'autre-flux', '2027-06-07'::date, false, 'sujets distincts'),
  ('N045', 'Mairie de Cognac : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-05-21'::date, 'Préfecture de la Dordogne recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-06-10'::date, false, 'sujets distincts'),
  ('N046', 'Intrusion informatique au sein de Mairie de Tulle : services en ligne interrompus', 'presse-locale', '2027-05-24'::date, 'Lycée de Bayonne : une arnaque par phishing vise les usagers', 'autre-flux', '2027-06-13'::date, false, 'sujets distincts'),
  ('N047', 'Exfiltration de données : Mairie de Guéret concerné', 'presse-locale', '2027-05-27'::date, 'Le site de Collège de Pau défiguré par des hackers', 'autre-flux', '2027-06-16'::date, false, 'sujets distincts'),
  ('N048', 'Une attaque DDoS perturbe Département de la Gironde', 'presse-locale', '2027-05-30'::date, 'CAF de Poitiers signe un contrat avec un prestataire informatique', 'autre-flux', '2027-06-19'::date, false, 'sujets distincts'),
  ('N049', 'Conseil départemental des Landes victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-06-02'::date, 'CPAM de Niort : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-06-22'::date, false, 'sujets distincts'),
  ('N050', 'Intrusion informatique au sein de Département de la Dordogne : services en ligne interrompus', 'presse-locale', '2027-06-05'::date, 'Des hackers défigurent le site de CHU de Bordeaux', 'autre-flux', '2027-06-25'::date, false, 'sujets distincts'),
  ('N051', 'CH d''Angoulême victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-02-28'::date, 'Attaque par déni de service contre CH d''Angoulême', 'autre-flux', '2027-02-28'::date, false, 'même organisation, nature différente (ransomware/ddos)'),
  ('N052', 'Intrusion informatique au sein de CH de Châtellerault : services en ligne interrompus', 'presse-locale', '2027-03-01'::date, 'CH de Châtellerault : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-03-01'::date, false, 'même organisation, nature différente (incident/fraude)'),
  ('N053', 'Exfiltration de données : CHU de Limoges concerné', 'presse-locale', '2027-03-02'::date, 'Des hackers défigurent le site de CHU de Limoges', 'autre-flux', '2027-03-02'::date, false, 'même organisation, nature différente (leak/defacement)'),
  ('N054', 'Piratage informatique : Clinique Pasteur de Bordeaux touché', 'presse-locale', '2027-03-03'::date, 'Clinique Pasteur de Bordeaux cible d''une attaque DDoS', 'autre-flux', '2027-03-03'::date, false, 'même organisation, nature différente (incident/ddos)'),
  ('N055', 'Après le rançongiciel, Mairie de Pau : activité suspendue', 'presse-locale', '2027-03-04'::date, 'Hameçonnage au nom de Mairie de Pau', 'autre-flux', '2027-03-04'::date, false, 'même organisation, nature différente (ransomware/fraude)'),
  ('N056', 'Attaque informatique à Ville de Niort : services en ligne interrompus', 'presse-locale', '2027-03-05'::date, 'Ville de Niort : les services en ligne saturés par un DDoS', 'autre-flux', '2027-03-05'::date, false, 'même organisation, nature différente (ransomware/ddos)'),
  ('N057', 'Cyberattaque à Mairie de La Rochelle : prise en charge perturbée', 'presse-locale', '2027-03-06'::date, 'Mairie de La Rochelle : une arnaque par phishing vise les usagers', 'autre-flux', '2027-03-06'::date, false, 'même organisation, nature différente (incident/fraude)'),
  ('N058', 'Mairie de Brive : des fichiers dérobés puis publiés', 'presse-locale', '2027-03-07'::date, 'Le site de Mairie de Brive défiguré par des hackers', 'autre-flux', '2027-03-07'::date, false, 'même organisation, nature différente (leak/defacement)'),
  ('N059', 'Mairie de Périgueux visé par une cyberattaque', 'presse-locale', '2027-03-08'::date, 'Attaque par déni de service contre Mairie de Périgueux', 'autre-flux', '2027-03-08'::date, false, 'même organisation, nature différente (incident/ddos)'),
  ('N060', 'Mairie de Rochefort : une cyberattaque paralyse services en ligne interrompus', 'presse-locale', '2027-03-09'::date, 'Mairie de Rochefort : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-03-09'::date, false, 'même organisation, nature différente (ransomware/fraude)'),
  ('N061', 'Après le rançongiciel, Mairie de Saintes : prise en charge perturbée', 'presse-locale', '2027-03-10'::date, 'Une attaque DDoS perturbe Mairie de Saintes', 'autre-flux', '2027-03-10'::date, false, 'même organisation, nature différente (ransomware/ddos)'),
  ('N062', 'Piratage informatique : Mairie de Cognac touché', 'presse-locale', '2027-03-11'::date, 'Mairie de Cognac alerté après une campagne de phishing', 'autre-flux', '2027-03-11'::date, false, 'même organisation, nature différente (incident/fraude)'),
  ('N063', 'Mairie de Tulle victime d''une fuite de données : 2844 comptes exposés', 'presse-locale', '2027-03-12'::date, 'Défacement : la page d''accueil de Mairie de Tulle détournée', 'autre-flux', '2027-03-12'::date, false, 'même organisation, nature différente (leak/defacement)'),
  ('N064', 'Intrusion informatique au sein de Mairie de Guéret : services en ligne interrompus', 'presse-locale', '2027-03-13'::date, 'Mairie de Guéret : les services en ligne saturés par un DDoS', 'autre-flux', '2027-03-13'::date, false, 'même organisation, nature différente (incident/ddos)'),
  ('N065', 'Département de la Gironde : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-03-14'::date, 'Département de la Gironde : une arnaque par phishing vise les usagers', 'autre-flux', '2027-03-14'::date, false, 'même organisation, nature différente (ransomware/fraude)'),
  ('N066', 'Conseil départemental des Landes : une cyberattaque paralyse systèmes bloqués', 'presse-locale', '2027-03-15'::date, 'Conseil départemental des Landes cible d''une attaque DDoS', 'autre-flux', '2027-03-15'::date, false, 'même organisation, nature différente (ransomware/ddos)'),
  ('N067', 'Département de la Dordogne visé par une cyberattaque', 'presse-locale', '2027-03-16'::date, 'Hameçonnage au nom de Département de la Dordogne', 'autre-flux', '2027-03-16'::date, false, 'même organisation, nature différente (incident/fraude)'),
  ('N068', 'Région Nouvelle-Aquitaine : des données personnelles diffusées en ligne', 'presse-locale', '2027-03-17'::date, 'Région Nouvelle-Aquitaine : le site internet piraté et défiguré', 'autre-flux', '2027-03-17'::date, false, 'même organisation, nature différente (leak/defacement)'),
  ('N069', 'Cyberattaque à Université de Poitiers : prise en charge perturbée', 'presse-locale', '2027-03-18'::date, 'Une attaque DDoS perturbe Université de Poitiers', 'autre-flux', '2027-03-18'::date, false, 'même organisation, nature différente (incident/ddos)'),
  ('N070', 'Rançongiciel contre Université de Bordeaux : systèmes bloqués', 'presse-locale', '2027-03-19'::date, 'Université de Bordeaux alerté après une campagne de phishing', 'autre-flux', '2027-03-19'::date, false, 'même organisation, nature différente (ransomware/fraude)'),
  ('N071', 'SDIS de la Gironde : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-03-20'::date, 'Attaque par déni de service contre SDIS de la Gironde', 'autre-flux', '2027-03-20'::date, false, 'même organisation, nature différente (ransomware/ddos)'),
  ('N072', 'Intrusion informatique au sein de Communauté d''agglomération de La Rochelle : services en ligne interrompus', 'presse-locale', '2027-03-21'::date, 'Communauté d''agglomération de La Rochelle : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-03-21'::date, false, 'même organisation, nature différente (incident/fraude)'),
  ('N073', 'Exfiltration de données : Préfecture de la Dordogne concerné', 'presse-locale', '2027-03-22'::date, 'Des hackers défigurent le site de Préfecture de la Dordogne', 'autre-flux', '2027-03-22'::date, false, 'même organisation, nature différente (leak/defacement)'),
  ('N074', 'Piratage informatique : Lycée de Bayonne touché', 'presse-locale', '2027-03-23'::date, 'Lycée de Bayonne cible d''une attaque DDoS', 'autre-flux', '2027-03-23'::date, false, 'même organisation, nature différente (incident/ddos)'),
  ('N075', 'Collège de Pau victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-03-24'::date, 'Hameçonnage au nom de Collège de Pau', 'autre-flux', '2027-03-24'::date, false, 'même organisation, nature différente (ransomware/fraude)'),
  ('N076', 'Rançongiciel contre CAF de Poitiers : services en ligne interrompus', 'presse-locale', '2027-03-25'::date, 'CAF de Poitiers : les services en ligne saturés par un DDoS', 'autre-flux', '2027-03-25'::date, false, 'même organisation, nature différente (ransomware/ddos)'),
  ('N077', 'Cyberattaque à CPAM de Niort : prise en charge perturbée', 'presse-locale', '2027-03-26'::date, 'CPAM de Niort : une arnaque par phishing vise les usagers', 'autre-flux', '2027-03-26'::date, false, 'même organisation, nature différente (incident/fraude)'),
  ('N078', 'CHU de Bordeaux : des fichiers dérobés puis publiés', 'presse-locale', '2027-03-27'::date, 'Le site de CHU de Bordeaux défiguré par des hackers', 'autre-flux', '2027-03-27'::date, false, 'même organisation, nature différente (leak/defacement)'),
  ('N079', 'CH de Bayonne visé par une cyberattaque', 'presse-locale', '2027-03-28'::date, 'Attaque par déni de service contre CH de Bayonne', 'autre-flux', '2027-03-28'::date, false, 'même organisation, nature différente (incident/ddos)'),
  ('N080', 'Attaque informatique à Hôpital de Mont-de-Marsan : services en ligne interrompus', 'presse-locale', '2027-03-29'::date, 'Hôpital de Mont-de-Marsan : une fraude par courriel usurpe l''identité de l''établissement', 'autre-flux', '2027-03-29'::date, false, 'même organisation, nature différente (ransomware/fraude)'),
  ('N081', 'Mairie de Pau victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-03-30'::date, 'Rançongiciel contre Mairie de Pau : services en ligne interrompus', 'autre-flux', '2027-04-14'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N082', 'Intrusion informatique au sein de Ville de Niort : services en ligne interrompus', 'presse-locale', '2027-03-31'::date, 'Cyberattaque à Ville de Niort : prise en charge perturbée', 'autre-flux', '2027-04-15'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N083', 'Exfiltration de données : Mairie de La Rochelle concerné', 'presse-locale', '2027-04-01'::date, 'Mairie de La Rochelle : des fichiers dérobés puis publiés', 'autre-flux', '2027-04-16'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N084', 'Une attaque DDoS perturbe Mairie de Brive', 'presse-locale', '2027-04-02'::date, 'Mairie de Brive cible d''une attaque DDoS', 'autre-flux', '2027-04-17'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N085', 'Après le rançongiciel, Mairie de Périgueux : activité suspendue', 'presse-locale', '2027-04-03'::date, 'Attaque informatique à Mairie de Périgueux : services en ligne interrompus', 'autre-flux', '2027-04-18'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N086', 'Intrusion informatique au sein de Mairie de Rochefort : services en ligne interrompus', 'presse-locale', '2027-04-04'::date, 'Cyberattaque à Mairie de Rochefort : prise en charge perturbée', 'autre-flux', '2027-04-19'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N087', 'Exfiltration de données : Mairie de Saintes concerné', 'presse-locale', '2027-04-05'::date, 'Mairie de Saintes : des fichiers dérobés puis publiés', 'autre-flux', '2027-04-20'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N088', 'Une attaque DDoS perturbe Mairie de Cognac', 'presse-locale', '2027-04-06'::date, 'Mairie de Cognac cible d''une attaque DDoS', 'autre-flux', '2027-04-21'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N089', 'Mairie de Tulle : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-04-07'::date, 'Mairie de Tulle : une cyberattaque paralyse services en ligne interrompus', 'autre-flux', '2027-04-22'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N090', 'Intrusion informatique au sein de Mairie de Guéret : services en ligne interrompus', 'presse-locale', '2027-04-08'::date, 'Cyberattaque à Mairie de Guéret : prise en charge perturbée', 'autre-flux', '2027-04-23'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N091', 'Exfiltration de données : Département de la Gironde concerné', 'presse-locale', '2027-04-09'::date, 'Département de la Gironde : des fichiers dérobés puis publiés', 'autre-flux', '2027-04-24'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N092', 'Une attaque DDoS perturbe Conseil départemental des Landes', 'presse-locale', '2027-04-10'::date, 'Conseil départemental des Landes cible d''une attaque DDoS', 'autre-flux', '2027-04-25'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N093', 'Département de la Dordogne victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-04-11'::date, 'Rançongiciel contre Département de la Dordogne : services en ligne interrompus', 'autre-flux', '2027-04-26'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N094', 'Intrusion informatique au sein de Région Nouvelle-Aquitaine : services en ligne interrompus', 'presse-locale', '2027-04-12'::date, 'Cyberattaque à Région Nouvelle-Aquitaine : prise en charge perturbée', 'autre-flux', '2027-04-27'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N095', 'Exfiltration de données : Université de Poitiers concerné', 'presse-locale', '2027-04-13'::date, 'Université de Poitiers : des fichiers dérobés puis publiés', 'autre-flux', '2027-04-28'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N096', 'Une attaque DDoS perturbe Université de Bordeaux', 'presse-locale', '2027-04-14'::date, 'Université de Bordeaux cible d''une attaque DDoS', 'autre-flux', '2027-04-29'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N097', 'Après le rançongiciel, SDIS de la Gironde : activité suspendue', 'presse-locale', '2027-04-15'::date, 'Attaque informatique à SDIS de la Gironde : services en ligne interrompus', 'autre-flux', '2027-04-30'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N098', 'Intrusion informatique au sein de Communauté d''agglomération de La Rochelle : services en ligne interrompus', 'presse-locale', '2027-04-16'::date, 'Cyberattaque à Communauté d''agglomération de La Rochelle : prise en charge perturbée', 'autre-flux', '2027-05-01'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N099', 'Exfiltration de données : Préfecture de la Dordogne concerné', 'presse-locale', '2027-04-17'::date, 'Préfecture de la Dordogne : des fichiers dérobés puis publiés', 'autre-flux', '2027-05-02'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N100', 'Une attaque DDoS perturbe Lycée de Bayonne', 'presse-locale', '2027-04-18'::date, 'Lycée de Bayonne cible d''une attaque DDoS', 'autre-flux', '2027-05-03'::date, false, 'même organisation, faits séparés dans le temps'),
  ('N101', 'CHU de Bordeaux victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-05-09'::date, 'Rançongiciel contre Université de Bordeaux : prise en charge perturbée', 'autre-flux', '2027-05-09'::date, false, 'même lieu (Bordeaux), organisations différentes'),
  ('N102', 'Intrusion informatique au sein de Mairie de Pau : services en ligne interrompus', 'presse-locale', '2027-05-10'::date, 'Cyberattaque à Collège de Pau : systèmes bloqués', 'autre-flux', '2027-05-10'::date, false, 'même lieu (Pau), organisations différentes'),
  ('N103', 'Exfiltration de données : Mairie de La Rochelle concerné', 'presse-locale', '2027-05-11'::date, 'Communauté d''agglomération de La Rochelle : des fichiers dérobés puis publiés', 'autre-flux', '2027-05-11'::date, false, 'même lieu (La Rochelle), organisations différentes'),
  ('N104', 'Préfecture de la Dordogne : une cyberattaque paralyse systèmes bloqués', 'presse-locale', '2027-05-12'::date, 'Après le rançongiciel, Département de la Dordogne : services en ligne interrompus', 'autre-flux', '2027-05-12'::date, false, 'même lieu (Dordogne), organisations différentes'),
  ('N105', 'CH de Bayonne visé par une cyberattaque', 'presse-locale', '2027-05-13'::date, 'Intrusion informatique au sein de Lycée de Bayonne : prise en charge perturbée', 'autre-flux', '2027-05-13'::date, false, 'même lieu (Bayonne), organisations différentes'),
  ('N106', 'Université de Poitiers : des données personnelles diffusées en ligne', 'presse-locale', '2027-05-14'::date, 'Exfiltration de données : CAF de Poitiers concerné', 'autre-flux', '2027-05-14'::date, false, 'même lieu (Poitiers), organisations différentes'),
  ('N107', 'Ville de Niort victime d''un rançongiciel : prise en charge perturbée', 'presse-locale', '2027-05-15'::date, 'Rançongiciel contre CPAM de Niort : activité suspendue', 'autre-flux', '2027-05-15'::date, false, 'même lieu (Niort), organisations différentes'),
  ('N108', 'Piratage informatique : Mairie de Périgueux touché', 'presse-locale', '2027-05-16'::date, 'Mairie de Guéret visé par une cyberattaque', 'autre-flux', '2027-05-16'::date, false, 'même lieu (Périgueux), organisations différentes'),
  ('N109', 'Mairie de Rochefort victime d''une fuite de données : 2296 comptes exposés', 'presse-locale', '2027-05-17'::date, 'Mairie de Cognac : des données personnelles diffusées en ligne', 'autre-flux', '2027-05-17'::date, false, 'même lieu (Rochefort), organisations différentes'),
  ('N110', 'SDIS de la Gironde : une cyberattaque paralyse services en ligne interrompus', 'presse-locale', '2027-05-18'::date, 'Après le rançongiciel, Clinique Pasteur de Bordeaux : systèmes bloqués', 'autre-flux', '2027-05-18'::date, false, 'même lieu (Gironde), organisations différentes'),
  ('N111', 'Cyberattaque à CHU de Bordeaux : prise en charge perturbée', 'presse-locale', '2027-05-19'::date, 'Piratage informatique : Université de Bordeaux touché', 'autre-flux', '2027-05-19'::date, false, 'même lieu (Bordeaux), organisations différentes'),
  ('N112', 'Mairie de Pau : des fichiers dérobés puis publiés', 'presse-locale', '2027-05-20'::date, 'Collège de Pau victime d''une fuite de données : 2981 comptes exposés', 'autre-flux', '2027-05-20'::date, false, 'même lieu (Pau), organisations différentes'),
  ('N113', 'Mairie de La Rochelle victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-05-21'::date, 'Rançongiciel contre Communauté d''agglomération de La Rochelle : prise en charge perturbée', 'autre-flux', '2027-05-21'::date, false, 'même lieu (La Rochelle), organisations différentes'),
  ('N114', 'Intrusion informatique au sein de Préfecture de la Dordogne : services en ligne interrompus', 'presse-locale', '2027-05-22'::date, 'Cyberattaque à Département de la Dordogne : systèmes bloqués', 'autre-flux', '2027-05-22'::date, false, 'même lieu (Dordogne), organisations différentes'),
  ('N115', 'Exfiltration de données : CH de Bayonne concerné', 'presse-locale', '2027-05-23'::date, 'Lycée de Bayonne : des fichiers dérobés puis publiés', 'autre-flux', '2027-05-23'::date, false, 'même lieu (Bayonne), organisations différentes'),
  ('N116', 'Université de Poitiers : une cyberattaque paralyse systèmes bloqués', 'presse-locale', '2027-05-24'::date, 'Après le rançongiciel, CAF de Poitiers : services en ligne interrompus', 'autre-flux', '2027-05-24'::date, false, 'même lieu (Poitiers), organisations différentes'),
  ('N117', 'Ville de Niort visé par une cyberattaque', 'presse-locale', '2027-05-25'::date, 'Intrusion informatique au sein de CPAM de Niort : prise en charge perturbée', 'autre-flux', '2027-05-25'::date, false, 'même lieu (Niort), organisations différentes'),
  ('N118', 'Mairie de Périgueux : des données personnelles diffusées en ligne', 'presse-locale', '2027-05-26'::date, 'Exfiltration de données : Mairie de Guéret concerné', 'autre-flux', '2027-05-26'::date, false, 'même lieu (Périgueux), organisations différentes'),
  ('N119', 'Mairie de Rochefort victime d''un rançongiciel : prise en charge perturbée', 'presse-locale', '2027-05-27'::date, 'Rançongiciel contre Mairie de Cognac : activité suspendue', 'autre-flux', '2027-05-27'::date, false, 'même lieu (Rochefort), organisations différentes'),
  ('N120', 'Piratage informatique : SDIS de la Gironde touché', 'presse-locale', '2027-05-28'::date, 'Clinique Pasteur de Bordeaux visé par une cyberattaque', 'autre-flux', '2027-05-28'::date, false, 'même lieu (Gironde), organisations différentes'),
  ('N121', 'CHU de Limoges victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-06-08'::date, 'CHU de Limoges publie son rapport annuel d''activité', 'autre-flux', '2027-06-08'::date, false, 'même organisation, actualité non cyber'),
  ('N122', 'Intrusion informatique au sein de Clinique Pasteur de Bordeaux : services en ligne interrompus', 'presse-locale', '2027-06-09'::date, 'Clinique Pasteur de Bordeaux organise une journée de sensibilisation au numérique', 'autre-flux', '2027-06-09'::date, false, 'même organisation, actualité non cyber'),
  ('N123', 'Exfiltration de données : Mairie de Pau concerné', 'presse-locale', '2027-06-10'::date, 'Mairie de Pau signe un contrat avec un prestataire informatique', 'autre-flux', '2027-06-10'::date, false, 'même organisation, actualité non cyber'),
  ('N124', 'Une attaque DDoS perturbe Ville de Niort', 'presse-locale', '2027-06-11'::date, 'Ville de Niort inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-06-11'::date, false, 'même organisation, actualité non cyber'),
  ('N125', 'Après le rançongiciel, Mairie de La Rochelle : activité suspendue', 'presse-locale', '2027-06-12'::date, 'Mairie de La Rochelle recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-06-12'::date, false, 'même organisation, actualité non cyber'),
  ('N126', 'Intrusion informatique au sein de Mairie de Brive : services en ligne interrompus', 'presse-locale', '2027-06-13'::date, 'Mairie de Brive publie son rapport annuel d''activité', 'autre-flux', '2027-06-13'::date, false, 'même organisation, actualité non cyber'),
  ('N127', 'Exfiltration de données : Mairie de Périgueux concerné', 'presse-locale', '2027-06-14'::date, 'Mairie de Périgueux organise une journée de sensibilisation au numérique', 'autre-flux', '2027-06-14'::date, false, 'même organisation, actualité non cyber'),
  ('N128', 'Une attaque DDoS perturbe Mairie de Rochefort', 'presse-locale', '2027-06-15'::date, 'Mairie de Rochefort signe un contrat avec un prestataire informatique', 'autre-flux', '2027-06-15'::date, false, 'même organisation, actualité non cyber'),
  ('N129', 'Mairie de Saintes : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-06-16'::date, 'Mairie de Saintes inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-06-16'::date, false, 'même organisation, actualité non cyber'),
  ('N130', 'Intrusion informatique au sein de Mairie de Cognac : services en ligne interrompus', 'presse-locale', '2027-06-17'::date, 'Mairie de Cognac recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-06-17'::date, false, 'même organisation, actualité non cyber'),
  ('N131', 'Exfiltration de données : Mairie de Tulle concerné', 'presse-locale', '2027-06-18'::date, 'Mairie de Tulle publie son rapport annuel d''activité', 'autre-flux', '2027-06-18'::date, false, 'même organisation, actualité non cyber'),
  ('N132', 'Une attaque DDoS perturbe Mairie de Guéret', 'presse-locale', '2027-06-19'::date, 'Mairie de Guéret organise une journée de sensibilisation au numérique', 'autre-flux', '2027-06-19'::date, false, 'même organisation, actualité non cyber'),
  ('N133', 'Département de la Gironde victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-06-20'::date, 'Département de la Gironde signe un contrat avec un prestataire informatique', 'autre-flux', '2027-06-20'::date, false, 'même organisation, actualité non cyber'),
  ('N134', 'Intrusion informatique au sein de Conseil départemental des Landes : services en ligne interrompus', 'presse-locale', '2027-06-21'::date, 'Conseil départemental des Landes inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-06-21'::date, false, 'même organisation, actualité non cyber'),
  ('N135', 'Exfiltration de données : Département de la Dordogne concerné', 'presse-locale', '2027-06-22'::date, 'Département de la Dordogne recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-06-22'::date, false, 'même organisation, actualité non cyber'),
  ('N136', 'Une attaque DDoS perturbe Région Nouvelle-Aquitaine', 'presse-locale', '2027-06-23'::date, 'Région Nouvelle-Aquitaine publie son rapport annuel d''activité', 'autre-flux', '2027-06-23'::date, false, 'même organisation, actualité non cyber'),
  ('N137', 'Après le rançongiciel, Université de Poitiers : activité suspendue', 'presse-locale', '2027-06-24'::date, 'Université de Poitiers organise une journée de sensibilisation au numérique', 'autre-flux', '2027-06-24'::date, false, 'même organisation, actualité non cyber'),
  ('N138', 'Intrusion informatique au sein de Université de Bordeaux : services en ligne interrompus', 'presse-locale', '2027-06-25'::date, 'Université de Bordeaux signe un contrat avec un prestataire informatique', 'autre-flux', '2027-06-25'::date, false, 'même organisation, actualité non cyber'),
  ('N139', 'Exfiltration de données : SDIS de la Gironde concerné', 'presse-locale', '2027-06-26'::date, 'SDIS de la Gironde inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-06-26'::date, false, 'même organisation, actualité non cyber'),
  ('N140', 'Une attaque DDoS perturbe Communauté d''agglomération de La Rochelle', 'presse-locale', '2027-06-27'::date, 'Communauté d''agglomération de La Rochelle recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-06-27'::date, false, 'même organisation, actualité non cyber'),
  ('N141', 'Préfecture de la Dordogne : les systèmes chiffrés par un rançongiciel', 'presse-locale', '2027-06-28'::date, 'Préfecture de la Dordogne publie son rapport annuel d''activité', 'autre-flux', '2027-06-28'::date, false, 'même organisation, actualité non cyber'),
  ('N142', 'Intrusion informatique au sein de Lycée de Bayonne : services en ligne interrompus', 'presse-locale', '2027-06-29'::date, 'Lycée de Bayonne organise une journée de sensibilisation au numérique', 'autre-flux', '2027-06-29'::date, false, 'même organisation, actualité non cyber'),
  ('N143', 'Exfiltration de données : Collège de Pau concerné', 'presse-locale', '2027-06-30'::date, 'Collège de Pau signe un contrat avec un prestataire informatique', 'autre-flux', '2027-06-30'::date, false, 'même organisation, actualité non cyber'),
  ('N144', 'Une attaque DDoS perturbe CAF de Poitiers', 'presse-locale', '2027-07-01'::date, 'CAF de Poitiers inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-07-01'::date, false, 'même organisation, actualité non cyber'),
  ('N145', 'CPAM de Niort victime d''un rançongiciel : activité suspendue', 'presse-locale', '2027-07-02'::date, 'CPAM de Niort recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-07-02'::date, false, 'même organisation, actualité non cyber'),
  ('N146', 'Intrusion informatique au sein de CHU de Bordeaux : services en ligne interrompus', 'presse-locale', '2027-07-03'::date, 'CHU de Bordeaux publie son rapport annuel d''activité', 'autre-flux', '2027-07-03'::date, false, 'même organisation, actualité non cyber'),
  ('N147', 'Exfiltration de données : CH de Bayonne concerné', 'presse-locale', '2027-07-04'::date, 'CH de Bayonne organise une journée de sensibilisation au numérique', 'autre-flux', '2027-07-04'::date, false, 'même organisation, actualité non cyber'),
  ('N148', 'Une attaque DDoS perturbe Hôpital de Mont-de-Marsan', 'presse-locale', '2027-07-05'::date, 'Hôpital de Mont-de-Marsan signe un contrat avec un prestataire informatique', 'autre-flux', '2027-07-05'::date, false, 'même organisation, actualité non cyber'),
  ('N149', 'Après le rançongiciel, CH d''Angoulême : activité suspendue', 'presse-locale', '2027-07-06'::date, 'CH d''Angoulême inaugure un nouveau service de cybersécurité', 'autre-flux', '2027-07-06'::date, false, 'même organisation, actualité non cyber'),
  ('N150', 'Intrusion informatique au sein de CH de Châtellerault : services en ligne interrompus', 'presse-locale', '2027-07-07'::date, 'CH de Châtellerault recrute un responsable de la sécurité des systèmes d''information', 'autre-flux', '2027-07-07'::date, false, 'même organisation, actualité non cyber')
ON CONFLICT (id) DO UPDATE SET
  a_title = EXCLUDED.a_title,
  a_source = EXCLUDED.a_source,
  a_day = EXCLUDED.a_day,
  b_title = EXCLUDED.b_title,
  b_source = EXCLUDED.b_source,
  b_day = EXCLUDED.b_day,
  is_duplicate = EXCLUDED.is_duplicate,
  note = EXCLUDED.note;

UPDATE dedup_pair
   SET predicted = dedup_is_duplicate(a_title, a_day, b_title, b_day)
 WHERE predicted IS DISTINCT FROM dedup_is_duplicate(a_title, a_day, b_title, b_day);

DO $guard$
DECLARE n integer; d integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_duplicate) INTO n, d FROM dedup_pair;
  IF n <> 200 OR d <> 50 THEN
    RAISE EXCEPTION 'dedup_pair attendu 200 paires / 50 doublons, trouvé % / %', n, d;
  END IF;
END
$guard$;

INSERT INTO dedup_eval (id, n_pairs, n_duplicates, tp, fp, fn, tn, precision, recall, rule_version)
SELECT 1,
       count(*),
       count(*) FILTER (WHERE is_duplicate),
       count(*) FILTER (WHERE is_duplicate AND predicted),
       count(*) FILTER (WHERE NOT is_duplicate AND predicted),
       count(*) FILTER (WHERE is_duplicate AND NOT predicted),
       count(*) FILTER (WHERE NOT is_duplicate AND NOT predicted),
       (count(*) FILTER (WHERE is_duplicate AND predicted))::float
         / NULLIF(count(*) FILTER (WHERE predicted), 0),
       (count(*) FILTER (WHERE is_duplicate AND predicted))::float
         / NULLIF(count(*) FILTER (WHERE is_duplicate), 0),
       'cross-flow@1'
  FROM dedup_pair
ON CONFLICT (id) DO UPDATE SET
  n_pairs = EXCLUDED.n_pairs,
  n_duplicates = EXCLUDED.n_duplicates,
  tp = EXCLUDED.tp,
  fp = EXCLUDED.fp,
  fn = EXCLUDED.fn,
  tn = EXCLUDED.tn,
  precision = EXCLUDED.precision,
  recall = EXCLUDED.recall,
  rule_version = EXCLUDED.rule_version,
  measured_at = now();
