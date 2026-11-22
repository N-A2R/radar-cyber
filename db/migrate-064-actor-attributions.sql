-- Actor-to-group attribution (chantier E8).
--
-- Only public actor labels and aggregate counts are stored. No claim hint,
-- victim name, e-mail address or phone number can reach this table.
CREATE TABLE IF NOT EXISTS actor_group_attribution (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor       text        NOT NULL,
    actor_key   text        NOT NULL UNIQUE,
    group_slug  text        NOT NULL,
    group_name  text        NOT NULL,
    confidence  smallint    NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    level       text        NOT NULL CHECK (level IN ('high', 'medium', 'low')),
    method      text        NOT NULL CHECK (method IN ('exact', 'alias', 'prefix', 'fuzzy')),
    sources     integer     NOT NULL DEFAULT 0,
    claims      integer     NOT NULL DEFAULT 0,
    computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS actor_group_attribution_level_idx
    ON actor_group_attribution (level, confidence DESC);
