-- 231 — incidents d'archivage : ne plus perdre la preuve en silence.
--
-- Constat audit : 4 165 résumés `event_archive` n'ont aucune copie intégrale
-- dans `archive_event`, et 2 961 d'entre eux ne sont plus dans `event`. Le
-- titre, la source_url et l'evidence de ces événements sont irrémédiablement
-- perdus. On ne fabrique PAS une copie vide : on consigne l'absence dans une
-- table d'incidents, puis on interdit tout nouveau DELETE qui n'aurait pas
-- écrit les deux archives.
--
-- Exception assumée : un événement encore cité par une alerte peut être purgé
-- du brut avec le seul résumé (la copie intégrale n'existe pas pour ces lignes,
-- voir migrate-046). `v_event_all` déduplique ces cas depuis la migration 232.
BEGIN;

CREATE TABLE IF NOT EXISTS archive_incident (
  id            bigserial PRIMARY KEY,
  dedup_key     text NOT NULL,
  family        text,
  source_id     text,
  source_url    text,
  observed_at   timestamptz,
  collected_at  timestamptz,
  motif         text NOT NULL CHECK (motif IN ('copie_integrale_manquante')),
  detail        text NOT NULL CHECK (length(btrim(detail)) > 0),
  constate_le   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archive_incident_unique UNIQUE (dedup_key, motif)
);

CREATE INDEX IF NOT EXISTS archive_incident_constate_idx
  ON archive_incident (motif, constate_le DESC);

COMMENT ON TABLE archive_incident IS
  'Incidents de chaîne de preuve : résumé archivé sans copie intégrale, constaté à la réconciliation ou à la purge.';

-- Réconciliation historique, une fois par clé. Les 1 204 résumés qui ont
-- encore un brut ne sont PAS des incidents : la preuve existe toujours.
INSERT INTO archive_incident
  (dedup_key, family, source_id, source_url, observed_at, collected_at, motif, detail)
SELECT a.dedup_key, a.family, a.source_id, a.source_url, a.observed_at, a.collected_at,
       'copie_integrale_manquante',
       'Résumé présent dans event_archive, aucune copie intégrale dans archive_event et brut supprimé.'
  FROM event_archive a
 WHERE NOT EXISTS (SELECT 1 FROM archive_event b WHERE b.dedup_key = a.dedup_key)
   AND NOT EXISTS (SELECT 1 FROM event e WHERE e.dedup_key = a.dedup_key)
ON CONFLICT (dedup_key, motif) DO NOTHING;

-- Garde-fou applicable : DOUBLE ÉCRITURE AVANT SUPPRESSION.
-- Le trigger complète le résumé s'il manque, puis refuse la suppression d'un
-- événement non cité par une alerte tant que la copie intégrale n'existe pas.
CREATE OR REPLACE FUNCTION garantir_archive_event_avant_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM alert a WHERE a.event_id = OLD.id) THEN
    RAISE NOTICE 'event % conservé en archive résumée seulement : encore cité par une alerte', OLD.dedup_key;
  ELSIF NOT EXISTS (
    SELECT 1 FROM archive_event b WHERE b.dedup_key = OLD.dedup_key
  ) THEN
    RAISE EXCEPTION
      'Suppression de % refusée : aucune copie intégrale dans archive_event (écrire la copie avant DELETE)',
      OLD.dedup_key
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO event_archive
    (dedup_key, family, assertion_type, org_id, org_name, org_kind, dept,
     source_id, source_url, severity, confidence, admission_rule,
     observed_at, collected_at, valid_at, at)
  SELECT OLD.dedup_key, OLD.family, OLD.assertion_type, OLD.org_id, o.name, o.kind,
         COALESCE(OLD.dept, o.dept), OLD.source_id, OLD.source_url, OLD.severity,
         OLD.confidence, OLD.admission_rule, OLD.observed_at, OLD.collected_at,
         OLD.valid_at, OLD.at
    FROM (SELECT 1) s
    LEFT JOIN org o ON o.id = OLD.org_id
  ON CONFLICT (dedup_key) DO NOTHING;

  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS event_archive_avant_delete ON event;
CREATE TRIGGER event_archive_avant_delete
  BEFORE DELETE ON event
  FOR EACH ROW EXECUTE FUNCTION garantir_archive_event_avant_delete();

COMMIT;
