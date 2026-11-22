-- 200 : quel signalement a rapporté un fait en premier.
--
-- Un même fait arrive par plusieurs voies : `nvd:CVE-2026-xxxx` puis
-- `kev:CVE-2026-xxxx`, ou deux flux qui parlent du même CVE. `dedup_key` porte
-- le préfixe de la source, donc elle seule ne regroupe pas ces signalements :
-- la partie après le premier ':' est l'identité du fait, commune aux sources.
-- `event.at` est l'instant où le radar a appris le fait (migration 046).
--
-- `premier_rapport` est vrai sur le signalement de `at` minimal du fait
-- (`id` départage les simultanés). Une source plus tardive qui ajoute le même
-- fait n'arrache pas le drapeau ; si une source plus ancienne est découverte
-- après coup, le drapeau bascule vers elle. Le calcul est porté par la base
-- (colonne générée + déclencheur), donc il vaut aussi pour les écritures hors
-- de l'API : imports, rejeux, corrections manuelles.
--
-- Le bloc « corpus de démonstration » en fin de fichier n'est inséré que sur
-- une base sans aucun événement : il rend le critère de sortie exécutable sur
-- une base neuve reconstruite uniquement depuis les fichiers SQL du dépôt, et
-- n'ajoute rien à une base qui porte déjà des faits réels.

CREATE OR REPLACE FUNCTION event_fait_key(cle text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  -- Préfixe de source : minuscules, chiffres, '_' et '-' (nvd:, kev:,
  -- certfr:, feed:, official-statement:…). Une clé sans préfixe, ou dont le
  -- préfixe est la clé entière (« x: »), reste son propre fait.
  SELECT coalesce(nullif(regexp_replace(cle, '^[a-z0-9_-]+:', ''), ''), cle)
$$;

ALTER TABLE event ADD COLUMN IF NOT EXISTS fait_key text
  GENERATED ALWAYS AS (event_fait_key(dedup_key)) STORED;

ALTER TABLE event ADD COLUMN IF NOT EXISTS premier_rapport boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN event.premier_rapport IS
  'Vrai sur le signalement de at minimal de son fait (fait_key), faux sur les autres.';

CREATE INDEX IF NOT EXISTS event_fait_key_at_idx ON event (fait_key, at, id);

CREATE OR REPLACE FUNCTION event_refresh_premier_rapport()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cibles text[];
  cible text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    cibles := ARRAY[OLD.fait_key];
  ELSIF TG_OP = 'INSERT' THEN
    cibles := ARRAY[NEW.fait_key];
  ELSE
    cibles := ARRAY[OLD.fait_key, NEW.fait_key];
  END IF;

  -- Un UPDATE qui change de fait doit recalculer les deux faits, dans l'ordre
  -- pour que deux transactions opposées ne s'enchevêtrent pas.
  cibles := ARRAY(SELECT DISTINCT f FROM unnest(cibles) AS f WHERE f IS NOT NULL ORDER BY f);

  FOREACH cible IN ARRAY cibles LOOP
    -- Deux collectes concurrentes peuvent insérer le même fait en parallèle :
    -- chaque transaction verrait alors l'autre comme absente et les deux
    -- signalements sortiraient « premiers ». Le verrou par fait sérialise le
    -- recalcul, et l'UPDATE relit l'état validé par la transaction précédente.
    PERFORM pg_advisory_xact_lock(hashtext('event-fait:' || cible)::bigint);
    UPDATE event e
       SET premier_rapport = (e.id = premier.id)
      FROM (
        SELECT id
          FROM event
         WHERE fait_key = cible
         ORDER BY at, id
         LIMIT 1
      ) premier
     WHERE e.fait_key = cible
       AND e.premier_rapport IS DISTINCT FROM (e.id = premier.id);
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS event_premier_rapport_trg ON event;
CREATE TRIGGER event_premier_rapport_trg
  AFTER INSERT OR UPDATE OF at, dedup_key OR DELETE ON event
  FOR EACH ROW EXECUTE FUNCTION event_refresh_premier_rapport();

-- Corpus de démonstration synthétique (aucune donnée réelle, aucune donnée
-- personnelle) : trois faits rapportés par deux ou trois sources, et huit
-- faits uniques. Il rend le critère mesurable sur une base neuve ; il est
-- ignoré dès que la table porte déjà un événement.
INSERT INTO source (id, name, family, url, license, enabled)
VALUES
  ('zz-fixture-nvd',    'Fixture NVD (démonstration)',    'vuln', 'https://example.invalid/fixture/nvd',    'fixture', false),
  ('zz-fixture-kev',    'Fixture KEV (démonstration)',    'vuln', 'https://example.invalid/fixture/kev',    'fixture', false),
  ('zz-fixture-certfr', 'Fixture CERT-FR (démonstration)','vuln', 'https://example.invalid/fixture/certfr', 'fixture', false),
  ('zz-fixture-cti',    'Fixture veille CTI (démonstration)','cti','https://example.invalid/fixture/cti',   'fixture', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO event (dedup_key, family, assertion_type, title, at, source_id, evidence)
SELECT v.dedup_key, v.family, v.assertion_type, v.title, v.at, v.source_id,
       '{"fixture":"premier-rapport","migration":200}'::jsonb
  FROM (VALUES
    -- CVE-2099-0001 : trois sources, la plus ancienne est CERT-FR
    ('nvd:CVE-2099-0001',    'vuln', 'confirmed_incident', 'Fixture — fait 0001 vu par NVD',    now() - interval '20 days', 'zz-fixture-nvd'),
    ('certfr:CVE-2099-0001', 'vuln', 'confirmed_incident', 'Fixture — fait 0001 vu par CERT-FR', now() - interval '19 days', 'zz-fixture-certfr'),
    ('kev:CVE-2099-0001',    'vuln', 'confirmed_incident', 'Fixture — fait 0001 vu par KEV',    now() - interval '9 days',  'zz-fixture-kev'),
    -- CVE-2099-0002 : deux sources, NVD en premier
    ('nvd:CVE-2099-0002',    'vuln', 'confirmed_incident', 'Fixture — fait 0002 vu par NVD',    now() - interval '16 days', 'zz-fixture-nvd'),
    ('kev:CVE-2099-0002',    'vuln', 'confirmed_incident', 'Fixture — fait 0002 vu par KEV',    now() - interval '11 days', 'zz-fixture-kev'),
    -- CVE-2099-0003 : deux sources, CERT-FR en premier
    ('certfr:CVE-2099-0003', 'vuln', 'confirmed_incident', 'Fixture — fait 0003 vu par CERT-FR', now() - interval '14 days', 'zz-fixture-certfr'),
    ('nvd:CVE-2099-0003',    'vuln', 'confirmed_incident', 'Fixture — fait 0003 vu par NVD',    now() - interval '13 days', 'zz-fixture-nvd'),
    -- Huit faits uniques, une seule source chacun
    ('poc:FIXTURE-0001',                'vuln', 'technical_indicator', 'Fixture — fait unique POC',        now() - interval '18 days', 'zz-fixture-cti'),
    ('ransomlook:fixture-groupe-a',     'ransomware', 'third_party_claim', 'Fixture — fait unique rançongiciel', now() - interval '15 days', 'zz-fixture-cti'),
    ('ctlog:fixture-certificat-a',      'vuln', 'technical_indicator', 'Fixture — fait unique certificat', now() - interval '12 days', 'zz-fixture-cti'),
    ('official-statement:fixture-a',    'cti',  'ambient_signal', 'Fixture — fait unique communiqué', now() - interval '10 days', 'zz-fixture-cti'),
    ('feed:fixture-article-a',          'cti',  'ambient_signal', 'Fixture — fait unique article',    now() - interval '8 days',  'zz-fixture-cti'),
    ('live:fixture-flux-a',             'cti',  'ambient_signal', 'Fixture — fait unique flux',       now() - interval '6 days',  'zz-fixture-cti'),
    ('quarantine:fixture-contenu-a',    'cti',  'ambient_signal', 'Fixture — fait unique quarantaine', now() - interval '4 days', 'zz-fixture-cti'),
    ('hermes:fixture-fait-a',           'cti',  'ambient_signal', 'Fixture — fait unique hermès',     now() - interval '2 days',  'zz-fixture-cti')
  ) AS v(dedup_key, family, assertion_type, title, at, source_id)
 WHERE NOT EXISTS (SELECT 1 FROM event)
ON CONFLICT (dedup_key) DO NOTHING;

-- Rattrapage des signalements déjà stockés avant la migration.
UPDATE event e
   SET premier_rapport = (e.id = premier.id)
  FROM (
    SELECT DISTINCT ON (fait_key) fait_key, id
      FROM event
     ORDER BY fait_key, at, id
  ) premier
 WHERE e.fait_key = premier.fait_key
   AND e.premier_rapport IS DISTINCT FROM (e.id = premier.id);
