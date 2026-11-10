-- 022 : référentiel `org` — code NAF, vocabulaire fermé de `kind`, nettoyage import SIRENE.
--
-- Contexte : l'import SIRENE a gonflé `org` à 7 698 lignes, avec deux orthographes
-- du même concept (`operateur-critique` / `opérateur critique`), un code NAF stocké
-- dans `sector`, et des organisations hors Nouvelle-Aquitaine ou sans département
-- qui dessinaient des arcs depuis Paris.
--
-- Règles :
--   * `kind` ∈ {entreprise, collectivite, sante, enseignement, recherche,
--               operateur_critique, ess} — tout le reste devient `entreprise` ;
--   * les codes NAF passent de `sector` à `naf` (le secteur éditorial reste dans `sector`) ;
--   * suppression des lignes issues de l'import SIRENE jamais reliées à un événement,
--     un alias ou un actif ; les organisations curatées (événement) survivent toujours ;
--   * coordonnées manifestement fausses (département NA, point hors des bornes régionales)
--     effacées : mieux vaut pas d'arc qu'un arc faux ;
--   * purge des comptes de test `@example.invalid` et de leurs sessions.

BEGIN;

-- 1. Code NAF séparé du secteur éditorial ---------------------------------
ALTER TABLE org ADD COLUMN IF NOT EXISTS naf text;

UPDATE org
   SET naf = sector
 WHERE naf IS NULL
   AND sector ~ '^[0-9]{2}\.[0-9]{2}[A-Z]?$';

UPDATE org
   SET sector = NULL
 WHERE naf IS NOT NULL
   AND sector ~ '^[0-9]{2}\.[0-9]{2}[A-Z]?$';

-- 2. `kind` ramené au vocabulaire fermé ------------------------------------
UPDATE org
   SET kind = CASE trim(both '_' FROM regexp_replace(
                lower(translate(trim(kind),
                  'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
                  'aaaaaaceeeeiiiinooooouuuuyyoa')),
                '[^a-z0-9]+', '_', 'g'))
     WHEN 'operateur_critique' THEN 'operateur_critique'
     WHEN 'collectivite'       THEN 'collectivite'
     WHEN 'sante'              THEN 'sante'
     WHEN 'enseignement'       THEN 'enseignement'
     WHEN 'recherche'          THEN 'recherche'
     WHEN 'ess'                THEN 'ess'
     WHEN 'entreprise'         THEN 'entreprise'
     ELSE 'entreprise'
   END;

-- 3. Nettoyage de l'import SIRENE ------------------------------------------
-- Lignes importées (naf renseigné) sans aucun rattachement éditorial.
DELETE FROM org o
 WHERE o.naf IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM event e     WHERE e.org_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM org_alias a WHERE a.org_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM asset s     WHERE s.org_id = o.id);

-- Hors Nouvelle-Aquitaine : uniquement les lignes non curatées.
DELETE FROM org o
 WHERE o.dept IS NOT NULL
   AND o.dept NOT IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND NOT EXISTS (SELECT 1 FROM event e     WHERE e.org_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM org_alias a WHERE a.org_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM asset s     WHERE s.org_id = o.id);

-- Sans département : uniquement les lignes non curatées (les autres gardent leurs
-- actifs et leurs alias pour le rattachement des événements à venir).
DELETE FROM org o
 WHERE o.dept IS NULL
   AND NOT EXISTS (SELECT 1 FROM event e     WHERE e.org_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM org_alias a WHERE a.org_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM asset s     WHERE s.org_id = o.id);

-- 4. Coordonnées hors des bornes régionales effacées -----------------------
-- Ex. : SNCF RESEAU rattaché à la Charente mais géocodé à Paris (48.92 / 2.35).
UPDATE org
   SET lat = NULL, lon = NULL
 WHERE dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
   AND (lat IS NOT NULL OR lon IS NOT NULL)
   AND (lat NOT BETWEEN 42.7 AND 47.3 OR lon NOT BETWEEN -2.0 AND 2.7);

-- 5. Purge des comptes de test ---------------------------------------------
DELETE FROM app_session
 WHERE user_id IN (SELECT id FROM app_user WHERE email LIKE '%@example.invalid');

DELETE FROM app_user WHERE email LIKE '%@example.invalid';

COMMIT;
