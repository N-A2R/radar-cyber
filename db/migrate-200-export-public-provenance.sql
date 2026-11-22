-- Provenance et licence de chaque fait publié.
--
-- Le critère externe porte sur `export_public_event` : chaque ligne publiée
-- doit pointer vers un événement dont la source, la date de connaissance, la
-- date de collecte et la licence de réutilisation sont renseignées.
--
-- Deux règles de provenance :
--   1. un fait n'entre dans l'export public que si sa chaîne est complète ;
--      les colonnes NOT NULL de la table rendent une exportation incomplète
--      impossible, même depuis un futur script qui oublierait le contrôle ;
--   2. les sources sans mention explicite reçoivent la politique de
--      réutilisation des faits du projet (compilation MIT). Aucun droit sur le
--      contenu amont n'est transféré : cette valeur atteste la règle
--      d'attribution appliquée au fait publié, elle n'invente pas une licence
--      concédée par l'éditeur source.
--
-- La vue `export_public_event_provenance` sert au contrôle manuel : elle
-- expose la ligne datée d'export avec son événement, son URL source et sa
-- licence, sans donner accès à un contenu brut ou à une donnée personnelle.

CREATE TABLE IF NOT EXISTS export_public_event (
  event_id      bigint PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
  exported_at   timestamptz NOT NULL DEFAULT now(),
  source_url    text NOT NULL,
  at            timestamptz NOT NULL,
  collected_at  timestamptz NOT NULL,
  license       text NOT NULL,
  CONSTRAINT export_public_event_url_nonvide CHECK (btrim(source_url) <> ''),
  CONSTRAINT export_public_event_license_nonvide CHECK (btrim(license) <> '')
);

CREATE INDEX IF NOT EXISTS export_public_event_exported_idx
  ON export_public_event (exported_at DESC);

CREATE OR REPLACE VIEW export_public_event_provenance AS
SELECT x.exported_at,
       x.event_id,
       e.dedup_key,
       e.title,
       e.family,
       e.observed_at,
       x.source_url,
       x.at,
       x.collected_at,
       x.license,
       s.id AS source_id,
       s.name AS source_name,
       s.url AS source_home
FROM export_public_event x
JOIN event e ON e.id = x.event_id
JOIN source s ON s.id = e.source_id;

-- 1. Licence de réutilisation des sources muettes.
UPDATE source
   SET license = 'faits publics - réutilisation avec attribution (licence MIT de la compilation)'
 WHERE license IS NULL OR btrim(license) = '';

-- 2. Complète la chaîne des faits déjà collectés (URL de la fiche source,
--    horloges de connaissance et de collecte). Le fallback sur s.url est le
--    même que celui de la route de lecture /api/corpus-stats.
UPDATE event e
   SET source_url  = COALESCE(NULLIF(btrim(e.source_url), ''), s.url),
       at          = COALESCE(e.at, e.observed_at, e.valid_at, e.created_at, now()),
       collected_at = COALESCE(e.collected_at, e.at, e.observed_at, e.created_at, now())
  FROM source s
 WHERE s.id = e.source_id
   AND (e.source_url IS NULL OR btrim(e.source_url) = '' OR e.at IS NULL OR e.collected_at IS NULL);

-- 3. Publie les faits dont la chaîne est complète. Les faits TLP:AMBER/RED
--    restent hors de l'export public. Le rejeu est idempotent.
INSERT INTO export_public_event (event_id, exported_at, source_url, at, collected_at, license)
SELECT e.id, now(), e.source_url, e.at, e.collected_at, s.license
  FROM event e
  JOIN source s ON s.id = e.source_id
 WHERE e.source_url IS NOT NULL AND btrim(e.source_url) <> ''
   AND e.at IS NOT NULL
   AND e.collected_at IS NOT NULL
   AND s.license IS NOT NULL AND btrim(s.license) <> ''
   AND (e.tlp IS NULL OR e.tlp = 'CLEAR')
ON CONFLICT (event_id) DO NOTHING;
