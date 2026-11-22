-- Ransomware group tracking (chantier D1).
--
-- Only organisation-level evidence is stored: a public org id, a public claim
-- URL and the kind of match. Raw claims, hints and descriptions never enter
-- these tables, so no victim personal data can be published by accident.
CREATE TABLE IF NOT EXISTS ransomware_group (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug         text        NOT NULL UNIQUE,
    name         text        NOT NULL,
    claims_count integer     NOT NULL DEFAULT 0,
    first_seen   timestamptz,
    last_seen    timestamptz,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ransomware_victim (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id   bigint      NOT NULL REFERENCES ransomware_group(id) ON DELETE CASCADE,
    org_id     integer     NOT NULL REFERENCES org(id) ON DELETE CASCADE,
    source     text        NOT NULL,
    source_url text,
    claim_id   bigint,
    claimed_at timestamptz,
    match_type text        NOT NULL CHECK (match_type IN ('domain', 'name', 'event', 'curated'))
);

CREATE INDEX IF NOT EXISTS ransomware_victim_group_idx
    ON ransomware_victim (group_id);
CREATE INDEX IF NOT EXISTS ransomware_victim_org_idx
    ON ransomware_victim (org_id);

-- Bounded lookup for claim hints that name an organisation in Nouvelle-
-- Aquitaine. Without the partial btree index the 1.6 M row referential was
-- scanned for every batch of hints.
CREATE INDEX IF NOT EXISTS org_na_name_norm_idx
    ON org (name_norm)
    WHERE dept IN ('16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87');
