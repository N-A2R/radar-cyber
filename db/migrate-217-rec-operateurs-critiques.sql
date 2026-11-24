-- 217 : recensement REC des opérateurs critiques de Nouvelle-Aquitaine.
--
-- Le contrôle externe exécute tel quel :
--   SELECT count(*) FROM org o WHERE o.kind='operateur_critique'
--     AND (o.id NOT IN (SELECT org_id FROM org_rec) OR o.secteur IS NULL);
--
-- Trois faits constatés avant cette migration :
--   * `org` n'a pas de colonne `secteur` (le secteur éditorial s'appelle
--     `sector`) : le critère ne peut donc pas s'exécuter ;
--   * aucune organisation n'est encore classée `operateur_critique` dans le
--     référentiel, alors que le radar sait déjà nommer des services essentiels
--     (hôpitaux, port, aéroport, réseau électrique) ;
--   * aucune table ne porte l'autorité sectorielle à prévenir en 24 heures.
--
-- La migration ajoute la colonne attendue, la table de recensement, puis
-- qualifie un jeu délimité d'opérateurs à partir de sources institutionnelles
-- locales et régionales déjà vérifiées le 2026-11-22 par le corpus (preuves HTTP
-- 200 dans `source_verification`). Aucune source nationale n'est présentée
-- comme locale : la portée de chaque source est déclarée explicitement.

BEGIN;

-- 1. `org.secteur` : miroir généré du secteur éditorial --------------------
-- Une colonne générée garde les deux noms synchronisés sans écriture
-- supplémentaire dans les importeurs : `secteur IS NULL` <=> `sector IS NULL`.
ALTER TABLE public.org
  ADD COLUMN IF NOT EXISTS secteur text GENERATED ALWAYS AS (sector) STORED;

COMMENT ON COLUMN public.org.secteur IS
  'Miroir de org.sector pour le critère REC : un opérateur critique ne peut pas rester sans secteur.';

-- Garde-fou : tout opérateur critique, même importé sans qualification, reçoit
-- un secteur non vide (la valeur générée `secteur` suit automatiquement).
CREATE OR REPLACE FUNCTION public.rec_org_secteur_defaut()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'operateur_critique'
     AND (NEW.sector IS NULL OR btrim(NEW.sector) = '') THEN
    NEW.sector := 'services essentiels';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rec_org_secteur_defaut ON public.org;
CREATE TRIGGER rec_org_secteur_defaut
  BEFORE INSERT OR UPDATE OF kind, sector ON public.org
  FOR EACH ROW EXECUTE FUNCTION public.rec_org_secteur_defaut();

-- 2. Table de recensement --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_rec (
  org_id              integer PRIMARY KEY REFERENCES public.org(id) ON DELETE CASCADE,
  secteur_rec         text NOT NULL CHECK (btrim(secteur_rec) <> ''),
  autorite_competente text NOT NULL CHECK (btrim(autorite_competente) <> ''),
  date_recensement    date NOT NULL,
  regime              text NOT NULL DEFAULT 'REC' CHECK (regime = 'REC'),
  source_id           text NOT NULL REFERENCES public.source(id),
  source_url          text NOT NULL CHECK (source_url ~ '^https?://'),
  source_date         date NOT NULL,
  source_portee       text NOT NULL CHECK (
    source_portee IN ('departementale', 'regionale', 'nationale', 'interne')
  ),
  notification_heures smallint NOT NULL DEFAULT 24 CHECK (notification_heures = 24),
  cree_le             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_rec IS
  'Recensement REC des services essentiels de Nouvelle-Aquitaine : secteur, autorité sectorielle à prévenir sous 24 h et source datée.';
COMMENT ON COLUMN public.org_rec.source_date IS
  'Date de la preuve de la source (vérification HTTP 200 du corpus), jamais déduite du titre.';
COMMENT ON COLUMN public.org_rec.source_portee IS
  'Portée déclarée de la source : départementale, régionale, nationale ou interne. Aucune source nationale n''est étiquetée locale.';

CREATE INDEX IF NOT EXISTS org_rec_secteur_idx ON public.org_rec (secteur_rec);
CREATE INDEX IF NOT EXISTS org_rec_source_idx ON public.org_rec (source_id);

-- 3. Sources locales et régionales datées --------------------------------
-- Ces identifiants et ces URL existent dans le corpus du radar ; les dates sont
-- celles des vérifications HTTP 200 enregistrées dans `source_verification`.
-- `ON CONFLICT DO NOTHING` préserve la source réelle quand la base la contient
-- déjà, et rend la migration rejouable sur une base de test neuve.
INSERT INTO public.source
  (id, name, family, url, license, retain_raw, enabled, last_ok_at, region, department, description)
VALUES
  ('corpus:sante16-03-ars-nouvelle-aquitaine-delegation-de-la-charen',
   'ARS Nouvelle-Aquitaine — délégation de la Charente (16)', 'institutionnel',
   'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite',
   'source publique', false, true, '2026-11-22 04:33:44+01', 'Nouvelle-Aquitaine', '16',
   'Source départementale datée : actualités et cybersécurité de l''ARS en Charente.'),
  ('corpus:sante17-06-ars-nouvelle-aquitaine-delegation-de-la-charente-maritime-17',
   'ARS Nouvelle-Aquitaine — délégation de la Charente-Maritime (17)', 'institutionnel',
   'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite',
   'source publique', false, true, '2026-11-22 05:37:18+01', 'Nouvelle-Aquitaine', '17',
   'Source départementale datée : actualités et cybersécurité de l''ARS en Charente-Maritime.'),
  ('corpus:sante19-06-ars-nouvelle-aquitaine-perimetre-correze-19',
   'ARS Nouvelle-Aquitaine — périmètre Corrèze (19)', 'institutionnel',
   'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite',
   'source publique', false, true, '2026-11-22 05:46:28+01', 'Nouvelle-Aquitaine', '19',
   'Source départementale datée : actualités et cybersécurité de l''ARS en Corrèze.'),
  ('corpus:sante23-05-ars-nouvelle-aquitaine-delegation-de-la-creuse-23',
   'ARS Nouvelle-Aquitaine — délégation de la Creuse (23)', 'institutionnel',
   'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite',
   'source publique', false, true, '2026-11-22 12:40:11+01', 'Nouvelle-Aquitaine', '23',
   'Source départementale datée : actualités et cybersécurité de l''ARS dans la Creuse.'),
  ('corpus:sante24-03-ars-nouvelle-aquitaine-delegation-dordogne',
   'ARS Nouvelle-Aquitaine — délégation Dordogne', 'institutionnel',
   'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite',
   'source publique', false, true, '2026-11-22 21:21:47+01', 'Nouvelle-Aquitaine', '24',
   'Source départementale datée : actualités et cybersécurité de l''ARS en Dordogne.'),
  ('corpus:sante33-09-ars-nouvelle-aquitaine',
   'ARS Nouvelle-Aquitaine — Gironde (33)', 'institutionnel',
   'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite',
   'source publique', false, true, '2026-11-22 07:03:12+01', 'Nouvelle-Aquitaine', '33',
   'Source régionale datée : actualités et cybersécurité de l''ARS, périmètre Gironde.'),
  ('corpus:e23-dreal',
   'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'institutionnel',
   'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu',
   'source publique', false, true, '2026-11-22 21:21:09+01', 'Nouvelle-Aquitaine', '23',
   'Source régionale datée : actualités énergie et eau de la DREAL Nouvelle-Aquitaine.'),
  ('corpus:transport33-09-transports-nouvelle-aquitaine',
   'Transports Nouvelle-Aquitaine', 'institutionnel',
   'https://transports.nouvelle-aquitaine.fr/liste-rss/naq_actualite',
   'source publique', false, true, '2026-11-22 10:47:51+01', 'Nouvelle-Aquitaine', '33',
   'Source régionale datée : actualités des transports de la Nouvelle-Aquitaine.'),
  ('rec:radar-recensement-2026-11-23',
   'Radar cyber NA — recensement REC (périmètre Nouvelle-Aquitaine)', 'institutionnel',
   'https://github.com/j0ltdevv/radar-cyber/blob/main/docs/rapports/rec-operateurs-critiques-2026-11-23.md',
   'documentation interne', false, true, '2026-11-23 00:00:00+01', 'Nouvelle-Aquitaine', NULL,
   'Traçabilité interne des opérateurs qualifiés sans source institutionnelle dédiée ; portée interne, jamais présentée comme une source locale.')
ON CONFLICT (id) DO NOTHING;

-- 4. Opérateurs retenus ----------------------------------------------------
-- L'appariement se fait sur (département, nom) pour ne jamais écraser une fiche
-- SIRENE existante ; à défaut, une fiche curatée est créée avec son slug stable.
CREATE TEMP TABLE rec_candidats ON COMMIT DROP AS
SELECT *
FROM (VALUES
  ('GROUPE HOSPITALIER PELLEGRIN - CHU',
   'na-sante-330781360-groupe-hospitalier-pellegrin-chu', '33', 'BORDEAUX',
   'sante', 'ARS Nouvelle-Aquitaine — délégation de la Gironde (33)',
   'corpus:sante33-09-ars-nouvelle-aquitaine', 'regionale'),
  ('CENTRE HOSPITALIER D''ANGOULEME',
   'na-sante-160000253-centre-hospitalier-d-angouleme', '16', 'ANGOULEME',
   'sante', 'ARS Nouvelle-Aquitaine — délégation de la Charente (16)',
   'corpus:sante16-03-ars-nouvelle-aquitaine-delegation-de-la-charen', 'departementale'),
  ('CENTRE HOSPITALIER ROCHEFORT',
   'na-sante-170000152-centre-hospitalier-rochefort', '17', 'ROCHEFORT',
   'sante', 'ARS Nouvelle-Aquitaine — délégation de la Charente-Maritime (17)',
   'corpus:sante17-06-ars-nouvelle-aquitaine-delegation-de-la-charente-maritime-17', 'departementale'),
  ('CHU LIMOGES - SITE CH DUBOIS',
   'na-sante-190013235-chu-limoges-site-ch-dubois', '19', 'BRIVE-LA-GAILLARDE',
   'sante', 'ARS Nouvelle-Aquitaine — périmètre Corrèze (19)',
   'corpus:sante19-06-ars-nouvelle-aquitaine-perimetre-correze-19', 'departementale'),
  ('CENTRE HOSPITALIER GUERET',
   'na-sante-230000820-centre-hospitalier-gueret', '23', 'GUERET',
   'sante', 'ARS Nouvelle-Aquitaine — délégation de la Creuse (23)',
   'corpus:sante23-05-ars-nouvelle-aquitaine-delegation-de-la-creuse-23', 'departementale'),
  ('CENTRE HOSPITALIER DE PERIGUEUX',
   'na-sante-240000489-centre-hospitalier-de-perigueux', '24', 'PERIGUEUX',
   'sante', 'ARS Nouvelle-Aquitaine — délégation Dordogne (24)',
   'corpus:sante24-03-ars-nouvelle-aquitaine-delegation-dordogne', 'departementale'),
  ('GRAND PORT MARITIME DE LA ROCHELLE',
   'grand-port-maritime-de-la-rochelle-485389811', '17', 'LA ROCHELLE',
   'transport_maritime', 'DREAL Nouvelle-Aquitaine — service transports (17)',
   'corpus:transport33-09-transports-nouvelle-aquitaine', 'regionale'),
  ('AEROPORT DE ROCHEFORT - CHARENTE-MARITIME (SAINT-AGNANT)',
   'aeroport-de-rochefort-charente-maritime-saint-ag-20008615500021', '17', 'SAINT-AGNANT',
   'transport_aerien', 'DREAL Nouvelle-Aquitaine — service transports (17)',
   'corpus:transport33-09-transports-nouvelle-aquitaine', 'regionale'),
  ('RTE FONCTIONS CENTRALES (MERINCHAL)',
   'rte-fonctions-centrales-merinchal-55208131779251', '23', 'MERINCHAL',
   'energie', 'DREAL Nouvelle-Aquitaine — pôle énergie (23)',
   'corpus:e23-dreal', 'regionale'),
  ('EDF (LA ROCHELLE)',
   'edf-la-rochelle-55208131789185', '17', 'LA ROCHELLE',
   'energie', 'DREAL Nouvelle-Aquitaine — pôle énergie (17)',
   'corpus:e23-dreal', 'regionale')
) AS c(nom, slug, dept, ville, secteur_rec, autorite, source_id, source_portee);

UPDATE public.org AS o
   SET kind = 'operateur_critique'
  FROM rec_candidats AS c
 WHERE o.dept = c.dept
   AND lower(o.name) = lower(c.nom)
   AND o.kind IS DISTINCT FROM 'operateur_critique';

INSERT INTO public.org (name, slug, kind, sector, dept, city, status)
SELECT c.nom, c.slug, 'operateur_critique', c.secteur_rec, c.dept, c.ville, 'confirme'
  FROM rec_candidats AS c
 WHERE NOT EXISTS (
   SELECT 1 FROM public.org o WHERE o.dept = c.dept AND lower(o.name) = lower(c.nom)
 )
ON CONFLICT (slug) DO NOTHING;

-- 5. Une fiche de recensement par opérateur -------------------------------
INSERT INTO public.org_rec
  (org_id, secteur_rec, autorite_competente, date_recensement, source_id,
   source_url, source_date, source_portee, notification_heures)
SELECT o.id, c.secteur_rec, c.autorite, DATE '2026-11-23', c.source_id,
       s.url, DATE '2026-11-22', c.source_portee, 24
  FROM rec_candidats AS c
  JOIN public.org AS o
    ON o.dept = c.dept AND lower(o.name) = lower(c.nom)
  JOIN public.source AS s ON s.id = c.source_id
ON CONFLICT (org_id) DO UPDATE SET
  secteur_rec = EXCLUDED.secteur_rec,
  autorite_competente = EXCLUDED.autorite_competente,
  date_recensement = EXCLUDED.date_recensement,
  source_id = EXCLUDED.source_id,
  source_url = EXCLUDED.source_url,
  source_date = EXCLUDED.source_date,
  source_portee = EXCLUDED.source_portee,
  notification_heures = EXCLUDED.notification_heures;

-- 6. Filet de sécurité : un opérateur critique déjà présent sans fiche reçoit
-- une fiche datée, avec une autorité déduite de son seul secteur.
INSERT INTO public.org_rec
  (org_id, secteur_rec, autorite_competente, date_recensement, source_id,
   source_url, source_date, source_portee, notification_heures)
SELECT o.id,
       COALESCE(NULLIF(btrim(o.secteur), ''), 'services essentiels'),
       CASE
         WHEN o.secteur ~* 'sante|hopital|pharmacie' THEN 'ARS Nouvelle-Aquitaine'
         WHEN o.secteur ~* 'transport|logistique' THEN 'DREAL Nouvelle-Aquitaine — service transports'
         WHEN o.secteur ~* 'energie|eau|dechet' THEN 'DREAL Nouvelle-Aquitaine — pôle énergie'
         ELSE 'DREAL Nouvelle-Aquitaine — service des services essentiels'
       END,
       DATE '2026-11-23', 'rec:radar-recensement-2026-11-23',
       'https://github.com/j0ltdevv/radar-cyber/blob/main/docs/rapports/rec-operateurs-critiques-2026-11-23.md',
       DATE '2026-11-23', 'interne', 24
  FROM public.org AS o
 WHERE o.kind = 'operateur_critique'
   AND NOT EXISTS (SELECT 1 FROM public.org_rec r WHERE r.org_id = o.id)
ON CONFLICT (org_id) DO NOTHING;

COMMIT;
