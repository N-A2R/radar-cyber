-- 049 : score de pertinence cyber par événement.
--
-- Le score (0–10) est calculé par `collectors/pertinence.ts` au moment de
-- l'admission, avec le même moteur que la porte. `pertinence_rule` porte la
-- règle de couverture ayant fait passer l'item (org/epss/dept), quand il y en
-- a une. Les lignes antérieures restent NULL : on ne réécrit pas l'histoire.
-- `admission_rule` est conservé tel quel pour les appelants existants.

BEGIN;

ALTER TABLE event ADD COLUMN IF NOT EXISTS pertinence_score smallint;
ALTER TABLE event ADD COLUMN IF NOT EXISTS pertinence_rule text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_pertinence_score_check') THEN
    ALTER TABLE event ADD CONSTRAINT event_pertinence_score_check
      CHECK (pertinence_score IS NULL OR (pertinence_score BETWEEN 0 AND 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_pertinence_rule_check') THEN
    ALTER TABLE event ADD CONSTRAINT event_pertinence_rule_check
      CHECK (pertinence_rule IS NULL OR pertinence_rule IN ('org', 'epss', 'dept'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_pertinence_score_idx ON event (pertinence_score)
  WHERE pertinence_score IS NOT NULL;

COMMENT ON COLUMN event.pertinence_score IS 'Score cyber 0-10 calculé à l''admission (collectors/pertinence.ts). NULL : événement antérieur à la migration 049.';
COMMENT ON COLUMN event.pertinence_rule IS 'Règle de couverture ayant admis l''item : org, epss ou dept ; NULL sinon.';

COMMIT;
