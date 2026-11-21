-- 050 : score de pertinence cyber des événements.
--
-- Le score (0–10) et la règle de couverture sont calculés par
-- `collectors/filter.ts` au moment de l'admission, avec le même moteur que la
-- porte. `pertinence_rule` porte la règle (`org`, `epss`, `dept`) quand c'est
-- elle qui a fait passer l'item. Les lignes antérieures restent NULL : on ne
-- réécrit pas l'histoire et on n'invente pas de score.

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

COMMENT ON COLUMN event.pertinence_score IS 'Score cyber 0-10 calculé à l''admission (collectors/filter.ts). NULL : événement antérieur à la migration 050.';
COMMENT ON COLUMN event.pertinence_rule IS 'Règle de couverture ayant admis l''item : org, epss ou dept ; NULL sinon.';

COMMIT;
