-- Store only the translated headline: never the original free text, the
-- summary, or any victim detail. Source event ids keep the link auditable.
CREATE TABLE IF NOT EXISTS article_translation (
    event_id bigint PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
    language text NOT NULL CHECK (language IN ('en', 'de', 'nl')),
    translated_title text NOT NULL,
    quality numeric(5,4) NOT NULL CHECK (quality >= 0 AND quality <= 1),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS article_translation_language_idx
    ON article_translation (language);
