-- 205 : les listes de veille deviennent un signal.
--
-- Une liste déclare les organisations surveillées (migrate-200-watchlist.sql).
-- Dès qu'un fait touche l'une d'elles — un événement rattaché à l'organisation
-- ou une fuite documentée (`fuite_org`) — la correspondance est enregistrée
-- dans `watchlist_match` et une alerte de règle `watchlist` est ouverte.
-- Le déclenchement vit en base : quel que soit le chemin d'écriture (collecte,
-- promotion de revendication, reclassification), l'événement est vu.
--
-- Aucune donnée personnelle : seuls des identifiants (liste, organisation,
-- événement, fuite) et des libellés de veille sont copiés.

CREATE TABLE IF NOT EXISTS watchlist_match (
  id           bigserial PRIMARY KEY,
  watchlist_id bigint NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  item_id      bigint NOT NULL REFERENCES watchlist_item(id) ON DELETE CASCADE,
  event_id     bigint REFERENCES event(id) ON DELETE CASCADE,
  fuite_id     text REFERENCES fuite_reference(id) ON DELETE CASCADE,
  org_id       integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  matched_at   timestamptz NOT NULL DEFAULT now(),
  -- Une correspondance porte soit sur un événement, soit sur une fuite.
  CHECK ((event_id IS NOT NULL) <> (fuite_id IS NOT NULL))
);

-- Une liste ne signale qu'une fois le même événement ou la même fuite.
CREATE UNIQUE INDEX IF NOT EXISTS ux_watchlist_match_event
  ON watchlist_match (watchlist_id, event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_watchlist_match_fuite
  ON watchlist_match (watchlist_id, fuite_id) WHERE fuite_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS watchlist_match_event_idx ON watchlist_match (event_id);
CREATE INDEX IF NOT EXISTS watchlist_match_fuite_idx ON watchlist_match (fuite_id);
CREATE INDEX IF NOT EXISTS watchlist_match_org_idx ON watchlist_match (org_id, matched_at DESC);

-- Une seule alerte par fuite et organisation : `alert` n'a pas de colonne
-- dédiée aux fuites, l'identité est portée par l'evidence.
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_watchlist_fuite
  ON alert (org_id, (evidence->>'fuite_id'))
  WHERE rule_id = 'watchlist' AND event_id IS NULL;

-- Le même événement ne réveille qu'une alerte de veille, même si plusieurs
-- listes couvrent l'organisation : le titre nomme toutes les listes touchées.
CREATE OR REPLACE FUNCTION watchlist_match_event() RETURNS trigger AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO watchlist_match (watchlist_id, item_id, event_id, org_id)
  SELECT wi.watchlist_id, wi.id, NEW.id, NEW.org_id
    FROM watchlist_item wi
   WHERE wi.kind = 'org' AND wi.org_id = NEW.org_id
  ON CONFLICT DO NOTHING;

  INSERT INTO alert (rule_id, title, severity, event_id, org_id, evidence, scope)
  SELECT 'watchlist',
         'Veille — ' || string_agg(DISTINCT w.name, ', ' ORDER BY w.name) || ' : ' || NEW.title,
         GREATEST(1, LEAST(5, NEW.severity)),
         NEW.id,
         NEW.org_id,
         jsonb_build_object(
           'watchlist_slugs', jsonb_agg(DISTINCT w.slug),
           'event_title', NEW.title,
           'family', NEW.family,
           'org_id', NEW.org_id
         ),
         'watchlist'
    FROM watchlist_match m
    JOIN watchlist w ON w.id = m.watchlist_id
   WHERE m.event_id = NEW.id
   HAVING count(*) > 0
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_watchlist_match_event ON event;
CREATE TRIGGER trg_watchlist_match_event
  AFTER INSERT OR UPDATE OF org_id ON event
  FOR EACH ROW EXECUTE FUNCTION watchlist_match_event();

CREATE OR REPLACE FUNCTION watchlist_match_fuite() RETURNS trigger AS $$
BEGIN
  INSERT INTO watchlist_match (watchlist_id, item_id, fuite_id, org_id)
  SELECT wi.watchlist_id, wi.id, NEW.fuite_id, NEW.org_id
    FROM watchlist_item wi
   WHERE wi.kind = 'org' AND wi.org_id = NEW.org_id
  ON CONFLICT DO NOTHING;

  INSERT INTO alert (rule_id, title, severity, event_id, org_id, evidence, scope)
  SELECT 'watchlist',
         'Veille — fuite documentée touchant ' || string_agg(DISTINCT w.name, ', ' ORDER BY w.name)
           || ' (' || NEW.domain || ')',
         3,
         NULL,
         NEW.org_id,
         jsonb_build_object(
           'watchlist_slugs', jsonb_agg(DISTINCT w.slug),
           'fuite_id', NEW.fuite_id,
           'domain', NEW.domain,
           'org_id', NEW.org_id
         ),
         'watchlist'
    FROM watchlist_match m
    JOIN watchlist w ON w.id = m.watchlist_id
   WHERE m.fuite_id = NEW.fuite_id AND m.org_id = NEW.org_id
   HAVING count(*) > 0
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_watchlist_match_fuite ON fuite_org;
CREATE TRIGGER trg_watchlist_match_fuite
  AFTER INSERT ON fuite_org
  FOR EACH ROW EXECUTE FUNCTION watchlist_match_fuite();
