-- 200 : sémantique unique TLP / PAP / Admiralty sur les objets partagés.
--
-- Un seul vocabulaire pour event.evidence, event.tlp, event.confidence et les
-- objets STIX exportés :
--   * TLP  : WHITE, GREEN, AMBER, RED  (CLEAR et TLP:* sont des alias) ;
--   * PAP  : WHITE, GREEN, AMBER, RED  (CLEAR est un alias de WHITE) ;
--   * Admiralty : A1 … F6 (fiabilité A-F, crédibilité 1-6).
--
-- Les fonctions normalize_trust_* sont la règle côté base ; le normaliseur
-- applicatif (apps/api/src/export/trust-tags.ts) applique la même table et
-- rejette tout tag inconnu au lieu de le deviner. Les clés étrangères sont le
-- dernier garde-fou : aucun objet ne peut être stocké avec un tag invalide.
-- TLP:RED et PAP:RED restent en quarantaine : ils ne sont jamais exportés.

CREATE TABLE IF NOT EXISTS trust_tlp (
  code text PRIMARY KEY,
  rang smallint NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_pap (
  code text PRIMARY KEY,
  rang smallint NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_admiralty (
  code text PRIMARY KEY,
  fiabilite text NOT NULL,
  credibilite smallint NOT NULL
);

INSERT INTO trust_tlp (code, rang) VALUES
  ('WHITE', 0), ('GREEN', 1), ('AMBER', 2), ('RED', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO trust_pap (code, rang) VALUES
  ('WHITE', 0), ('GREEN', 1), ('AMBER', 2), ('RED', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO trust_admiralty (code, fiabilite, credibilite)
SELECT chr(65 + f) || (c + 1)::text, chr(65 + f), c + 1
FROM generate_series(0, 5) AS f, generate_series(0, 5) AS c
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION normalize_trust_tlp(raw text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE upper(btrim(raw))
    WHEN 'CLEAR' THEN 'WHITE'
    WHEN 'TLP:CLEAR' THEN 'WHITE'
    WHEN 'WHITE' THEN 'WHITE'
    WHEN 'TLP:WHITE' THEN 'WHITE'
    WHEN 'GREEN' THEN 'GREEN'
    WHEN 'TLP:GREEN' THEN 'GREEN'
    WHEN 'AMBER' THEN 'AMBER'
    WHEN 'TLP:AMBER' THEN 'AMBER'
    WHEN 'RED' THEN 'RED'
    WHEN 'TLP:RED' THEN 'RED'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION normalize_trust_pap(raw text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE upper(btrim(raw))
    WHEN 'CLEAR' THEN 'WHITE'
    WHEN 'PAP:CLEAR' THEN 'WHITE'
    WHEN 'WHITE' THEN 'WHITE'
    WHEN 'PAP:WHITE' THEN 'WHITE'
    WHEN 'GREEN' THEN 'GREEN'
    WHEN 'PAP:GREEN' THEN 'GREEN'
    WHEN 'AMBER' THEN 'AMBER'
    WHEN 'PAP:AMBER' THEN 'AMBER'
    WHEN 'RED' THEN 'RED'
    WHEN 'PAP:RED' THEN 'RED'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION normalize_trust_confidence(raw text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN upper(btrim(raw)) ~ '^[A-F][1-6]$' THEN upper(btrim(raw)) ELSE NULL END
$$;

CREATE TABLE IF NOT EXISTS stix_object (
  id text PRIMARY KEY,
  stix_type text NOT NULL,
  tlp text NOT NULL REFERENCES trust_tlp(code),
  pap text NOT NULL REFERENCES trust_pap(code),
  confidence text NOT NULL REFERENCES trust_admiralty(code),
  object jsonb NOT NULL,
  source_event_id bigint REFERENCES event(id) ON DELETE CASCADE,
  exported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stix_object_tlp_idx ON stix_object (tlp);
CREATE INDEX IF NOT EXISTS stix_object_confidence_idx ON stix_object (confidence);
CREATE INDEX IF NOT EXISTS stix_object_source_event_idx ON stix_object (source_event_id);

-- Reprise des événements déjà présents. Un tag explicite et inconnu dans
-- evidence n'est jamais remplacé par la colonne : l'événement reste non
-- exporté, exactement comme le normaliseur applicatif le rejette.
WITH candidat AS (
  SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.created_at,
         CASE WHEN e.evidence ->> 'tlp' IS NOT NULL
              THEN normalize_trust_tlp(e.evidence ->> 'tlp')
              ELSE normalize_trust_tlp(e.tlp) END AS tlp,
         CASE WHEN e.evidence ->> 'pap' IS NOT NULL
              THEN normalize_trust_pap(e.evidence ->> 'pap')
              ELSE 'WHITE' END AS pap,
         CASE WHEN e.evidence ->> 'confidence' IS NOT NULL
              THEN normalize_trust_confidence(e.evidence ->> 'confidence')
              ELSE coalesce(normalize_trust_confidence(e.confidence), 'F6') END AS confidence
  FROM event e
), exportable AS (
  SELECT * FROM candidat
  WHERE tlp IS NOT NULL AND pap IS NOT NULL AND confidence IS NOT NULL
    AND tlp <> 'RED' AND pap <> 'RED'
)
INSERT INTO stix_object (id, stix_type, tlp, pap, confidence, object, source_event_id)
SELECT 'indicator--' || md5('event:' || c.dedup_key)::uuid::text,
       'indicator',
       c.tlp,
       c.pap,
       c.confidence,
       jsonb_build_object(
         'type', 'indicator',
         'spec_version', '2.1',
         'id', 'indicator--' || md5('event:' || c.dedup_key)::uuid::text,
         'created', c.created_at,
         'modified', c.created_at,
         'name', c.family || ' / ' || c.assertion_type,
         'pattern_type', 'radar-event-id',
         'pattern', '[x-radar:event-id = ' || c.id || ']',
         'object_marking_refs', jsonb_build_array(
           'marking-definition--' || md5('tlp:' || c.tlp)::uuid::text,
           'marking-definition--' || md5('pap:' || c.pap)::uuid::text
         ),
         'confidence', CASE substring(c.confidence from 2)::int
           WHEN 1 THEN 100 WHEN 2 THEN 90 WHEN 3 THEN 70
           WHEN 4 THEN 50 WHEN 5 THEN 25 ELSE 0 END,
         'extensions', jsonb_build_object('x-radar-trust', jsonb_build_object(
           'tlp', c.tlp, 'pap', c.pap, 'confidence', c.confidence
         ))
       ),
       c.id
FROM exportable c
ON CONFLICT (id) DO UPDATE SET
  tlp = EXCLUDED.tlp,
  pap = EXCLUDED.pap,
  confidence = EXCLUDED.confidence,
  object = EXCLUDED.object,
  source_event_id = EXCLUDED.source_event_id,
  exported_at = now();
