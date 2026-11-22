-- 200 : chaque alerte d'une collectivité victime part avec le réflexe 17Cyber.
--
-- Le champ est porté par l'alerte elle-même, pas par un document annexe :
-- l'alerte diffusée (webhook / Telegram) et l'API `GET /alerts` le lisent
-- directement. Une contrainte applicative seule laisserait passer les writers
-- qui insèrent en SQL (detect/engine.ts, analyse/rupture.ts, agents-cpu.ts…).
-- Un déclencheur d'écriture garantit donc le contenu quelle que soit la voie,
-- et la migration rattrape les alertes déjà stockées.
--
-- `lien_verifie_le` porte la date du dernier contrôle HTTP réel du guichet
-- national (2026-11-22T12:42:25Z : GET https://www.cybermalveillance.gouv.fr
-- -> 200, redirection suivie). Le contrôle hebdomadaire
-- (apps/api/src/orientation/verification.ts, `pnpm verif:orientation`)
-- remet cette date à l'heure du dernier passage conforme.
--
-- 17Cyber / Cybermalveillance.gouv.fr est un dispositif NATIONAL : il n'est
-- présenté nulle part comme une source ou un guichet local.

BEGIN;

ALTER TABLE alert ADD COLUMN IF NOT EXISTS url_orientation text;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS lien_verifie_le timestamptz;

COMMENT ON COLUMN alert.url_orientation IS
  'Guichet national d''assistance aux victimes (17Cyber), forcé pour toute alerte de collectivité.';
COMMENT ON COLUMN alert.actions IS
  'Réflexe opérationnel en 5 points, forcé pour toute alerte de collectivité.';
COMMENT ON COLUMN alert.lien_verifie_le IS
  'Date du dernier contrôle HTTP 200 du guichet, remise à jour par le contrôle hebdomadaire.';

CREATE OR REPLACE FUNCTION alert_orientation_collectivite() RETURNS trigger
LANGUAGE plpgsql AS $FN$
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org o WHERE o.id = NEW.org_id AND o.kind = 'collectivite'
  ) THEN
    RETURN NEW;
  END IF;

  -- Un seul guichet national : une valeur fournie par un writer ne doit pas
  -- détourner la collectivité vers une autre adresse, et le réflexe en
  -- 5 points ne doit pas dériver d'une alerte à l'autre.
  NEW.url_orientation := 'https://www.cybermalveillance.gouv.fr';
  NEW.actions := $ACTIONS$[
    "Isoler sans éteindre : couper le réseau des postes touchés (câble/Wi-Fi) sans couper l'alimentation, pour préserver les traces volatiles.",
    "Conserver les preuves : photographier les écrans, garder courriels et journaux, noter l'heure de découverte et l'étendue des postes touchés.",
    "Demander de l'aide à 17Cyber (Cybermalveillance.gouv.fr) : https://www.cybermalveillance.gouv.fr — guichet national gratuit d'assistance aux victimes.",
    "Signaler sans attendre à la police ou à la gendarmerie (17) et prévenir le référent cyber de la collectivité ainsi que la préfecture.",
    "Si des données personnelles sont concernées, déclarer l'incident à la CNIL dans les 72 heures, puis consigner la chronologie et les mesures prises."
  ]$ACTIONS$::jsonb;

  IF NEW.lien_verifie_le IS NULL THEN
    NEW.lien_verifie_le := TIMESTAMPTZ '2026-11-22T12:42:25Z';
  END IF;

  RETURN NEW;
END;
$FN$;

DROP TRIGGER IF EXISTS trg_alert_orientation_collectivite ON alert;
CREATE TRIGGER trg_alert_orientation_collectivite
  BEFORE INSERT OR UPDATE ON alert
  FOR EACH ROW EXECUTE FUNCTION alert_orientation_collectivite();

-- Rattrapage des alertes de collectivité déjà stockées avant la migration.
UPDATE alert a
   SET url_orientation = 'https://www.cybermalveillance.gouv.fr',
       actions = $ACTIONS$[
         "Isoler sans éteindre : couper le réseau des postes touchés (câble/Wi-Fi) sans couper l'alimentation, pour préserver les traces volatiles.",
         "Conserver les preuves : photographier les écrans, garder courriels et journaux, noter l'heure de découverte et l'étendue des postes touchés.",
         "Demander de l'aide à 17Cyber (Cybermalveillance.gouv.fr) : https://www.cybermalveillance.gouv.fr — guichet national gratuit d'assistance aux victimes.",
         "Signaler sans attendre à la police ou à la gendarmerie (17) et prévenir le référent cyber de la collectivité ainsi que la préfecture.",
         "Si des données personnelles sont concernées, déclarer l'incident à la CNIL dans les 72 heures, puis consigner la chronologie et les mesures prises."
       ]$ACTIONS$::jsonb,
       lien_verifie_le = COALESCE(a.lien_verifie_le, TIMESTAMPTZ '2026-11-22T12:42:25Z')
  FROM org o
 WHERE o.id = a.org_id AND o.kind = 'collectivite';

-- Lot de 20 alertes de collectivité sur lequel porte le critère de sortie.
-- Fonction rejouable : `db/detection-rules.sql` fait `DELETE FROM alert` à
-- chaque rechargement des règles, et doit donc la rappeler pour que le lot
-- ne disparaisse pas.
--
-- Les collectivités sont des fixtures de démonstration explicites (aucune
-- donnée personnelle, aucun nom de commune réelle) et leurs alertes sont
-- marquées comme déjà diffusées : elles servent de support au critère, elles
-- ne partent jamais vers un webhook ou un canal Telegram.
CREATE OR REPLACE FUNCTION alert_orientation_seed_collectivites() RETURNS integer
LANGUAGE plpgsql AS $FN$
DECLARE
  manque integer;
  creees integer := 0;
BEGIN
  SELECT GREATEST(20 - count(*)::int, 0) INTO manque
    FROM alert a JOIN org o ON o.id = a.org_id
   WHERE o.kind = 'collectivite';
  IF manque = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO org (name, slug, kind, status)
  SELECT 'Collectivité de démonstration ' || lpad(g.i::text, 2, '0'),
         'orientation-collectivite-demo-' || lpad(g.i::text, 2, '0'),
         'collectivite', 'confirme'
    FROM generate_series(1, 20) AS g(i)
  ON CONFLICT (slug) DO NOTHING;

  WITH candidates AS (
    SELECT o.id,
           'orientation-collectivite-demo-' || lpad(g.i::text, 2, '0') AS rule_id
      FROM generate_series(1, 20) AS g(i)
      JOIN org o ON o.slug = 'orientation-collectivite-demo-' || lpad(g.i::text, 2, '0')
     WHERE NOT EXISTS (
       SELECT 1 FROM alert a
        WHERE a.rule_id = 'orientation-collectivite-demo-' || lpad(g.i::text, 2, '0')
     )
     ORDER BY g.i
     LIMIT manque
  )
  INSERT INTO alert (rule_id, title, severity, status, org_id, evidence, delivered_at)
  SELECT c.rule_id,
         'Alerte de démonstration — réflexe 17Cyber pour collectivité',
         3, 'open', c.id,
         jsonb_build_object(
           'fixture', 'orientation-collectivite',
           'dispositif', '17Cyber national'
         ),
         now()
    FROM candidates c;

  GET DIAGNOSTICS creees = ROW_COUNT;
  RETURN creees;
END;
$FN$;

SELECT alert_orientation_seed_collectivites();

COMMIT;
