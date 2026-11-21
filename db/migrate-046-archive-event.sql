-- 046 : archive complète des événements purgés.
--
-- migrate-028 garde un résumé (`event_archive`) pour mesurer et alimenter
-- `v_event_all`. La rétention supprime le brut après 90 jours : titre, résumé,
-- preuves et géographie disparaissent avec lui. On conserve désormais une
-- copie intégrale de ce qui est réellement purgé.
--
-- Mêmes colonnes que `event`, plus `archived_at`. Pas de clé étrangère vers
-- `source`, `org` ou `asset` : une archive doit survivre à la suppression de
-- son référentiel. L'identifiant d'origine est conservé, sans séquence locale.

BEGIN;

CREATE TABLE IF NOT EXISTS archive_event (
  id             bigint PRIMARY KEY,
  dedup_key      text NOT NULL UNIQUE,
  family         text NOT NULL,
  assertion_type text NOT NULL,
  title          text NOT NULL,
  summary        text,
  observed_at    timestamptz,
  collected_at   timestamptz NOT NULL DEFAULT now(),
  severity       smallint NOT NULL DEFAULT 3,
  confidence     text,
  source_id      text NOT NULL,
  source_url     text,
  evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
  geo_type       text NOT NULL DEFAULT 'unknown',
  lat            double precision,
  lon            double precision,
  org_id         integer,
  asset_id       integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  archived_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE archive_event IS
  'Copie intégrale des événements purgés par la rétention, sans clé étrangère vers le référentiel.';

COMMIT;
