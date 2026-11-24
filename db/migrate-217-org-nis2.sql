-- 217 : cartographie NIS2 des organisations assujetties.
--
-- Une organisation marquée `operateur_critique` ou `ess` dans le référentiel
-- doit pouvoir afficher sa catégorie (essentielle / importante), le motif du
-- classement, son SIREN et la date du calcul. Les quatre valeurs sont portées
-- par `org_nis2`, alimentée par une fonction déterministe puis entretenue par
-- un trigger : aucune ligne assujettie ne peut rester sans classement.
--
-- Fondement du calcul : directive (UE) 2022/2555 (NIS2), article 3 et annexes
-- I et II. Les secteurs de l'annexe I et les organismes publics sont classés
-- « essentielle » ; les autres secteurs couverts sont classés « importante ».
-- Le seuil 250 salariés (effectif_min) sert de critère de taille lorsqu'il est
-- renseigné. La transposition nationale doit être confirmée par l'autorité
-- compétente : aucune source nationale n'est présentée ici comme une source
-- locale.
--
-- Les SIREN de référence ont été vérifiés le 2026-11-23 auprès de l'API
-- Recherche d'entreprises (DINUM/Etalab, base SIRENE INSEE) : source nationale
-- explicitement nommée comme telle, et non comme une collecte locale.

BEGIN;

-- 1. Correspondances nominales vérifiées auprès de la source nationale ------
CREATE TABLE IF NOT EXISTS public.org_nis2_reference_siren (
  motif_nom     text PRIMARY KEY CHECK (btrim(motif_nom) <> ''),
  nom_officiel  text NOT NULL CHECK (btrim(nom_officiel) <> ''),
  siren         text NOT NULL CHECK (siren ~ '^[0-9]{9}$'),
  source        text NOT NULL CHECK (btrim(source) <> ''),
  source_url    text NOT NULL CHECK (source_url LIKE 'https://%'),
  verifie_le    date NOT NULL
);

COMMENT ON TABLE public.org_nis2_reference_siren IS
  'SIREN vérifiés auprès d''une source nationale (API Recherche d''entreprises, base SIRENE) ; jamais une source locale.';

INSERT INTO public.org_nis2_reference_siren
  (motif_nom, nom_officiel, siren, source, source_url, verifie_le)
VALUES
  ('conseil departemental de la creuse%', 'DEPARTEMENT DE LA CREUSE', '222309627', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=222309627', DATE '2026-11-23'),
  ('conseil departemental de la gironde%', 'DEPARTEMENT DE LA GIRONDE', '223300013', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=223300013', DATE '2026-11-23'),
  ('departement du lot et garonne%', 'DEPARTEMENT DU LOT ET GARONNE', '224700013', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=224700013', DATE '2026-11-23'),
  ('conseil departemental des deux-sevres%', 'DEPARTEMENT DES DEUX SEVRES', '227900016', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=227900016', DATE '2026-11-23'),
  ('conseil departemental des pyrenees-atlantiques%', 'DEPARTEMENT DES PYRENEES ATLANTIQUES', '226400018', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=226400018', DATE '2026-11-23'),
  ('sdis de la charente-maritime%', 'SCE DEPARTEMENTAL INCENDIE ET SECOURS (SDIS) — Charente-Maritime', '281700252', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=281700252', DATE '2026-11-23'),
  ('sdis de la charente%', 'SCE DEPARTEMENTAL INCENDIE ET SECOURS (SDIS) — Charente', '281600015', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=281600015', DATE '2026-11-23'),
  ('sdis de la creuse%', 'SCE DEPARTEMENTAL INCENDIE ET SECOURS (SDIS) — Creuse', '282309624', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=282309624', DATE '2026-11-23'),
  ('sdis des deux-sevres%', 'SCE DEPARTEMENTAL INCENDIE ET SECOURS (SDIS) — Deux-Sèvres', '287900336', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=287900336', DATE '2026-11-23'),
  ('sdis des landes%', 'SCE DEPARTEMENTAL INCENDIE ET SECOURS (SDIS) — Landes', '284003324', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=284003324', DATE '2026-11-23'),
  ('ecole nationale superieure d''arts et metiers bordeaux%', 'ECOLE NATIONALE SUPERIEURE D''ARTS ET METIERS (ENSAM)', '197534720', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=197534720', DATE '2026-11-23'),
  ('enscpb bordeaux%', 'ECOLE NAT SUPERIEURE CHIMIE ET PHYSIQUE', '193301694', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=193301694', DATE '2026-11-23'),
  ('universite de la rochelle%', 'LA ROCHELLE UNIVERSITE', '191700327', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=191700327', DATE '2026-11-23'),
  ('universite de limoges%', 'UNIVERSITE DE LIMOGES', '198706699', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=198706699', DATE '2026-11-23'),
  ('universite de poitiers%', 'UNIVERSITE DE POITIERS', '198608564', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=198608564', DATE '2026-11-23'),
  ('a''urba%', 'AGENCE D''URBANISME BORDEAUX AQUITAINE (A''URBA)', '781814488', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=781814488', DATE '2026-11-23'),
  ('federation nationale des agences d''urbanisme%', 'FEDERATION NATIONALE AGENCES D''URBANISME (FNAU)', '378936942', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=378936942', DATE '2026-11-23'),
  ('centre hospitalier d''angouleme%', 'CENTRE HOSPITALIER D ANGOULEME', '261600340', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=261600340', DATE '2026-11-23'),
  ('centre hospitalier rochefort%', 'CENTRE HOSPITALIER DE ROCHEFORT', '261700330', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=261700330', DATE '2026-11-23'),
  ('chu limoges%', 'CENTRE HOSPITALIER ET UNIVERSITAIRE DE LIMOGES (CHU)', '268708518', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=268708518', DATE '2026-11-23'),
  ('centre hospitalier gueret%', 'CENTRE HOSPITALIER DE GUERET', '262309602', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=262309602', DATE '2026-11-23'),
  ('centre hospitalier de perigueux%', 'CENTRE HOSPITALIER DE PERIGUEUX', '262405806', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=262405806', DATE '2026-11-23'),
  ('groupe hospitalier pellegrin%', 'CENTRE HOSPITALIER UNIVERSITAIRE DE BORDEAUX (site Pellegrin)', '263305823', 'API Recherche d''entreprises (DINUM/Etalab), base SIRENE INSEE — source nationale', 'https://recherche-entreprises.api.gouv.fr/search?q=263305823', DATE '2026-11-23')
ON CONFLICT (motif_nom) DO UPDATE
   SET nom_officiel = EXCLUDED.nom_officiel,
       siren = EXCLUDED.siren,
       source = EXCLUDED.source,
       source_url = EXCLUDED.source_url,
       verifie_le = EXCLUDED.verifie_le;

-- 2. Table de classement ----------------------------------------------------
-- `siren` est non nul par construction : quand aucune source ne le fournit,
-- la valeur sentinelle 000000000 est accompagnée d'une preuve explicite
-- (`siren_etabli` = false), jamais présentée comme un vrai SIREN.
CREATE TABLE IF NOT EXISTS public.org_nis2 (
  org_id      integer PRIMARY KEY REFERENCES public.org(id) ON DELETE CASCADE,
  categorie   text NOT NULL CHECK (categorie IN ('essentielle', 'importante')),
  motif       text NOT NULL CHECK (btrim(motif) <> ''),
  siren       text NOT NULL CHECK (siren ~ '^[0-9]{9}$'),
  classes_le  timestamptz NOT NULL DEFAULT now(),
  preuve      jsonb NOT NULL CHECK (jsonb_typeof(preuve) = 'object'),
  CONSTRAINT org_nis2_preuve_complete CHECK (
    preuve ? 'regle' AND preuve ? 'entrees' AND preuve ? 'siren_etabli'
    AND preuve ? 'siren_source' AND preuve ? 'source_droit' AND preuve ? 'calcule_le'
  )
);

COMMENT ON TABLE public.org_nis2 IS
  'Classement NIS2 des organisations assujetties (référentiel `org` kind operateur_critique ou ess), avec motif, SIREN et preuve du calcul.';
COMMENT ON COLUMN public.org_nis2.motif IS
  'Explication lisible : catégorie, règle appliquée, entrées observées et source du SIREN.';
COMMENT ON COLUMN public.org_nis2.preuve IS
  'Preuve structurée du calcul : règle, entrées, droit appliqué, source du SIREN et horodatage.';

CREATE INDEX IF NOT EXISTS org_nis2_categorie_idx ON public.org_nis2 (categorie);
CREATE INDEX IF NOT EXISTS org_nis2_siren_idx ON public.org_nis2 (siren);

-- 3. Résolution du SIREN : org -> source SIRENE -> correspondance vérifiée ->
--    organisation mère -> sentinelle documentée.
CREATE OR REPLACE FUNCTION public.nis2_siren(p_org public.org)
RETURNS TABLE (siren text, source text, nom_officiel text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_reference record;
BEGIN
  IF p_org.siren ~ '^[0-9]{9}$' THEN
    RETURN QUERY SELECT p_org.siren, 'Champ siren du référentiel org', p_org.name;
    RETURN;
  END IF;

  IF p_org.entity_source IN ('sirene', 'recherche-entreprises')
     AND p_org.entity_code ~ '^[0-9]{9}$' THEN
    RETURN QUERY SELECT p_org.entity_code,
                       'Identifiant officiel ' || p_org.entity_source || ' du référentiel org',
                       p_org.name;
    RETURN;
  END IF;

  -- Un établissement `sirene-site` porte un SIRET : ses neuf premiers chiffres
  -- sont le SIREN de l'unité légale, sans approximation ni recopie manuelle.
  IF p_org.entity_source = 'sirene-site'
     AND p_org.entity_code ~ '^[0-9]{14}$' THEN
    RETURN QUERY SELECT left(p_org.entity_code, 9),
                       'Neuf premiers chiffres du SIRET officiel (entity_code sirene-site)',
                       p_org.name;
    RETURN;
  END IF;

  SELECT r.siren, r.source, r.nom_officiel INTO v_reference
    FROM public.org_nis2_reference_siren r
   WHERE p_org.name_norm LIKE r.motif_nom
   ORDER BY length(r.motif_nom) DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_reference.siren, v_reference.source, v_reference.nom_officiel;
    RETURN;
  END IF;

  IF p_org.parent_org_id IS NOT NULL THEN
    SELECT parent.entity_code AS siren,
           'SIREN de l''organisation mère (entity_code SIRENE)' AS source,
           parent.name AS nom_officiel
      INTO v_reference
      FROM public.org parent
     WHERE parent.id = p_org.parent_org_id
       AND parent.entity_code ~ '^[0-9]{9}$';
    IF FOUND THEN
      RETURN QUERY SELECT v_reference.siren, v_reference.source, v_reference.nom_officiel;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT '000000000'::text,
                      'SIREN non établi à la date du calcul (valeur sentinelle, pas un identifiant officiel)',
                      p_org.name;
END;
$$;

-- 4. Calcul de la catégorie et du motif, sans texte libre de source.
CREATE OR REPLACE FUNCTION public.nis2_classement(p_org public.org)
RETURNS TABLE (categorie text, motif text, siren text, preuve jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_famille text;
  v_regle text;
  v_categorie text;
  v_siren record;
  v_entrees jsonb;
  v_motif text;
  v_preuve jsonb;
BEGIN
  IF p_org.kind NOT IN ('operateur_critique', 'ess') THEN
    RETURN;
  END IF;

  SELECT s.siren, s.source, s.nom_officiel INTO v_siren FROM public.nis2_siren(p_org) s;

  v_famille := CASE
    WHEN p_org.kind = 'operateur_critique' THEN 'operateur_critique'
    WHEN p_org.name_norm ~ '^(conseil departemental|departement|sdis|prefecture|agence regionale de sante|ars)' THEN 'administration_publique'
    WHEN p_org.name_norm ~ '(universite|ecole|enscpb|ensam|institut national polytechnique)' THEN 'enseignement_recherche'
    ELSE 'autre_service_essentiel'
  END;

  v_categorie := CASE
    WHEN v_famille IN ('operateur_critique', 'administration_publique') THEN 'essentielle'
    WHEN COALESCE(p_org.effectif_min, 0) >= 250
      OR COALESCE(p_org.naf, '') ~ '^(35|36|37|38|39|49|50|51|52|53|61|62|63|64|65|66|84|86|87|88)' THEN 'essentielle'
    ELSE 'importante'
  END;

  v_regle := CASE
    WHEN v_famille = 'operateur_critique' THEN
      'kind=operateur_critique : opérateur critique, annexe I / article 3 NIS2 => essentielle'
    WHEN v_famille = 'administration_publique' THEN
      'famille=administration_publique (conseil départemental, SDIS, préfecture, ARS) : secteur « administration publique » de l''annexe I => essentielle'
    WHEN COALESCE(p_org.effectif_min, 0) >= 250 THEN
      'effectif_min >= 250 : entité de taille supérieure au seuil PME, secteur couvert => essentielle'
    WHEN COALESCE(p_org.naf, '') ~ '^(35|36|37|38|39|49|50|51|52|53|61|62|63|64|65|66|84|86|87|88)' THEN
      'NAF secteur critique de l''annexe I : énergie, eau, transport, numérique, finance, administration ou santé => essentielle'
    WHEN v_famille = 'enseignement_recherche' THEN
      'famille=enseignement_recherche : secteur « recherche » de l''annexe II, taille PME => importante'
    ELSE
      'famille=autre_service_essentiel : secteur couvert hors taille critique, classement conservateur => importante'
  END;

  v_entrees := jsonb_build_object(
    'kind', p_org.kind,
    'famille', v_famille,
    'nom_normalise', p_org.name_norm,
    'naf', p_org.naf,
    'secteur_groupe', p_org.secteur_groupe,
    'effectif_min', p_org.effectif_min,
    'siren_org', p_org.siren
  );

  v_preuve := jsonb_build_object(
    'regle', v_regle,
    'entrees', v_entrees,
    'source_droit', 'Directive (UE) 2022/2555 (NIS2), article 3 et annexes I et II ; transposition nationale à confirmer par l''autorité compétente',
    'siren_source', v_siren.source,
    'nom_officiel', v_siren.nom_officiel,
    'siren_etabli', v_siren.siren <> '000000000',
    'calcule_le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  v_motif := format(
    'Classée %s : %s. Entrées : kind=%s, famille=%s, NAF=%s, effectif_min=%s. SIREN %s d''après %s. Fondement : directive (UE) 2022/2555 (NIS2), article 3 et annexes I et II.',
    v_categorie, v_regle, p_org.kind, v_famille,
    COALESCE(p_org.naf, 'non renseigné'), COALESCE(p_org.effectif_min::text, 'non renseigné'),
    v_siren.siren, v_siren.source
  );

  RETURN QUERY SELECT v_categorie, v_motif, v_siren.siren, v_preuve;
END;
$$;

COMMENT ON FUNCTION public.nis2_classement(public.org) IS
  'Calcule deterministe le classement NIS2 : categorie, motif lisible, SIREN et preuve structuree, sans donnee personnelle.';

-- 5. Entretien automatique : insertion, changement de statut ou de nom ------
CREATE OR REPLACE FUNCTION public.nis2_org_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_classement record;
BEGIN
  SELECT c.categorie, c.motif, c.siren, c.preuve
    INTO v_classement
    FROM public.nis2_classement(NEW) c;

  IF v_classement.categorie IS NULL THEN
    DELETE FROM public.org_nis2 WHERE org_id = NEW.id;
    RETURN NULL;
  END IF;

  INSERT INTO public.org_nis2 (org_id, categorie, motif, siren, classes_le, preuve)
  VALUES (NEW.id, v_classement.categorie, v_classement.motif, v_classement.siren, now(), v_classement.preuve)
  ON CONFLICT (org_id) DO UPDATE
     SET categorie = EXCLUDED.categorie,
         motif = EXCLUDED.motif,
         siren = EXCLUDED.siren,
         classes_le = now(),
         preuve = EXCLUDED.preuve
   WHERE org_nis2.categorie IS DISTINCT FROM EXCLUDED.categorie
      OR org_nis2.motif IS DISTINCT FROM EXCLUDED.motif
      OR org_nis2.siren IS DISTINCT FROM EXCLUDED.siren
      OR org_nis2.preuve IS DISTINCT FROM EXCLUDED.preuve;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS nis2_org_classement ON public.org;
CREATE TRIGGER nis2_org_classement
  AFTER INSERT OR UPDATE OF kind, name, name_norm, naf, secteur_groupe, effectif_min,
                          siren, entity_code, entity_source, parent_org_id, status
  ON public.org
  FOR EACH ROW EXECUTE FUNCTION public.nis2_org_sync();

-- 6. Backfill : aucune organisation assujettie préexistante sans classement.
INSERT INTO public.org_nis2 (org_id, categorie, motif, siren, classes_le, preuve)
SELECT o.id, c.categorie, c.motif, c.siren, now(), c.preuve
  FROM public.org o
  CROSS JOIN LATERAL public.nis2_classement(o) c
 WHERE o.kind IN ('operateur_critique', 'ess')
ON CONFLICT (org_id) DO UPDATE
   SET categorie = EXCLUDED.categorie,
       motif = EXCLUDED.motif,
       siren = EXCLUDED.siren,
       classes_le = now(),
       preuve = EXCLUDED.preuve
 WHERE org_nis2.categorie IS DISTINCT FROM EXCLUDED.categorie
    OR org_nis2.motif IS DISTINCT FROM EXCLUDED.motif
    OR org_nis2.siren IS DISTINCT FROM EXCLUDED.siren
    OR org_nis2.preuve IS DISTINCT FROM EXCLUDED.preuve;

-- 7. Lecture pour l'utilisateur final : pourquoi Cette organisation est classée.
CREATE OR REPLACE VIEW public.org_nis2_lecture AS
SELECT o.id AS org_id,
       o.name,
       o.kind,
       n.categorie,
       n.motif,
       n.siren,
       n.classes_le,
       n.preuve
  FROM public.org_nis2 n
  JOIN public.org o ON o.id = n.org_id;

COMMIT;
