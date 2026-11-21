-- Scores de confiance calculés : un score par événement, un par rattachement.
-- Les composantes et la décomposition sont stockées en JSONB : la note ne peut
-- pas être lue sans son explication, et un changement de barème se recompute.
-- `fact_key` identifie le fait (famille + organisation + titre normalisé +
-- fenêtre de 72 h) pour mesurer la corroboration sans fusionner d'événement.

CREATE TABLE IF NOT EXISTS event_confidence (
  event_id         bigint PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
  fact_key         text NOT NULL,
  score            smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  level            text NOT NULL CHECK (level IN ('high', 'medium', 'low')),
  sources_distinct smallint NOT NULL CHECK (sources_distinct >= 0),
  components       jsonb NOT NULL,
  breakdown        jsonb NOT NULL,
  measures         jsonb NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_confidence_fact_idx ON event_confidence (fact_key);
CREATE INDEX IF NOT EXISTS event_confidence_level_idx ON event_confidence (level, score);

CREATE TABLE IF NOT EXISTS attachment_confidence (
  event_id         bigint NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  org_id           integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  fact_key         text NOT NULL,
  score            smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  level            text NOT NULL CHECK (level IN ('high', 'medium', 'low')),
  sources_distinct smallint NOT NULL CHECK (sources_distinct >= 0),
  components       jsonb NOT NULL,
  breakdown        jsonb NOT NULL,
  measures         jsonb NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, org_id)
);

CREATE INDEX IF NOT EXISTS attachment_confidence_level_idx ON attachment_confidence (level, score);
