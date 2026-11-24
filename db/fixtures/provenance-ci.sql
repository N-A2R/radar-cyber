-- Fixture déterministe pour le job CI `provenance` : une seule affaire
-- Nouvelle-Aquitaine publicuelle, sans donnée personnelle ni victime nommée.
--
-- L'identifiant et l'URL de source existent déjà dans db/migrations : ce sont
-- ceux du flux public de la DREAL Nouvelle-Aquitaine, pas une source inventée.
-- L'événement est inséré régional dès l'écriture : le trigger de production
-- `event_custody_admission` journalise lui-même l'admission, l'acteur,
-- l'horloge d'enregistrement et les clés de preuve autorisées. Le journal
-- étant append-only, la fixture est idempotente par `dedup_key`.
--
-- Le contrôle de contexte échoue bruyamment si les migrations changent : le
-- job CI ne doit jamais mesurer une base dont l'état diffère de la référence
-- attendue par le garde-fou (`CI_FIXTURE_STATE`).

BEGIN;

DO $$
DECLARE
  orgs bigint;
  sources bigint;
  events bigint;
BEGIN
  SELECT count(*) INTO orgs FROM org;
  SELECT count(*) INTO sources FROM source;
  SELECT count(*) INTO events FROM event;
  IF (orgs, sources, events) NOT IN ((30, 2757, 339), (30, 2757, 340)) THEN
    RAISE EXCEPTION
      'contexte fixture inattendu: % organisations, % sources, % événements (attendu 30/2757/339 ou 30/2757/340)',
      orgs, sources, events;
  END IF;
END $$;

INSERT INTO event (
  dedup_key, family, assertion_type, title, observed_at, collected_at,
  source_id, source_url, regional, regional_motif, evidence
)
SELECT
  'provenance-ci:dreal-na-public-feed',
  'cti',
  'ambient_signal',
  'Avis public régional — mesure de provenance (fixture)',
  TIMESTAMPTZ '2026-11-20T10:00:00Z',
  TIMESTAMPTZ '2026-11-20T10:05:00Z',
  'corpus:ee16-dreal-nouvelle-aquitaine',
  s.url,
  TRUE,
  'nouvelle-aquitaine',
  '{"run_id":"1","mode":"provenance-fixture"}'::jsonb
FROM source s
WHERE s.id = 'corpus:ee16-dreal-nouvelle-aquitaine'
  AND NOT EXISTS (
    SELECT 1 FROM event e WHERE e.dedup_key = 'provenance-ci:dreal-na-public-feed'
  );

COMMIT;
