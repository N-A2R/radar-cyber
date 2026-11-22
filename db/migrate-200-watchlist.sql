-- Listes de veille déclaratives : l'observatoire dit ce qu'il surveille
-- (organisations, secteurs, technologies) au lieu de recevoir un flux
-- indifférencié. Aucune donnée personnelle : seuls des identifiants de
-- référentiel et des libellés de veille sont stockés.
CREATE TABLE IF NOT EXISTS watchlist (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist_item (
  id           bigserial PRIMARY KEY,
  watchlist_id bigint NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('org', 'secteur', 'technologie')),
  ref          text NOT NULL,
  org_id       integer REFERENCES org(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, kind, ref),
  -- Une organisation est une référence authentique du référentiel ; un
  -- secteur ou une technologie est un libellé libre, sans org_id.
  CHECK ((kind = 'org' AND org_id IS NOT NULL) OR (kind <> 'org' AND org_id IS NULL))
);

CREATE INDEX IF NOT EXISTS watchlist_item_watchlist_idx ON watchlist_item (watchlist_id);
