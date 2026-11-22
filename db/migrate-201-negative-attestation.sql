-- 201 : registre des absences — une attestation explicite quand une
-- organisation n'a subi AUCUN événement sur une fenêtre donnée.
--
-- Pourquoi : le radar ne consignait que le positif (« voici un incident »).
-- Une organisation absente des écrans pouvait aussi bien n'avoir rien subi
-- que ne pas avoir été couverte. Le négatif n'était pas auditable.
--
-- Portée exacte, à ne jamais élargir en communication :
--   * l'absence porte sur le magasin d'événements du radar (`event`), pas sur
--     le monde : elle dit « aucun événement rattaché à cette organisation
--     n'a été observé pendant la fenêtre », jamais « rien ne s'est produit » ;
--   * `sources_checked` compte les sources ACTIVES interrogées par la requête
--     (leur ensemble exact est scellé dans `source_digest`) ; aucune source
--     nationale n'est présentée comme locale ;
--   * `signed` est vrai quand un sceau vérifiable accompagne la ligne.
--     `signature_method` dit ce que le sceau prouve :
--       - `hmac-sha256`   : authenticité + intégrité (clé RADAR_ATTESTATION_KEY) ;
--       - `sha256-content`: intégrité seule, rejouable par quiconque.
--     Le sceau ne remplace pas la preuve d'enquête : il fige le contenu
--     attesté pour qu'une modification ultérieure soit détectable.
--
-- Aucune donnée personnelle : identité publique d'organisation (nom, slug,
-- code officiel), fenêtre, compteurs, empreintes.

CREATE TABLE IF NOT EXISTS negative_attestation (
  id               bigserial PRIMARY KEY,
  org_id           integer REFERENCES org(id) ON DELETE SET NULL,
  org_slug         text NOT NULL,
  org_name         text NOT NULL,
  entity_source    text,
  entity_code      text,
  window_start     timestamptz NOT NULL,
  window_end       timestamptz NOT NULL,
  sources_checked  integer NOT NULL CHECK (sources_checked >= 0),
  source_scope     text NOT NULL DEFAULT 'enabled-sources',
  source_digest    text NOT NULL,
  events_found     integer NOT NULL DEFAULT 0 CHECK (events_found = 0),
  method           text NOT NULL DEFAULT 'event-store-window-v1',
  signed           boolean NOT NULL,
  signature        text,
  signature_method text,
  payload_digest   text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT negative_attestation_window_valid CHECK (window_end > window_start),
  CONSTRAINT negative_attestation_signed_sealed CHECK (
    (signed = false AND signature IS NULL)
    OR (signed = true AND signature IS NOT NULL AND signature_method IS NOT NULL)
  ),
  -- Rejouer la génération sur la même fenêtre met à jour la ligne au lieu
  -- d'empiler des doublons : une absence n'a qu'un état daté.
  CONSTRAINT negative_attestation_unique
    UNIQUE (org_slug, window_start, window_end, method)
);

-- Mise à niveau d'une table d'attestation déjà présente dans sa forme
-- ancienne (`org_id`, fenêtre, compteurs, signature). Les colonnes
-- d'identité publique, de portée et d'empreintes sont ajoutées puis remplies
-- depuis `org`, avant que les index et la vue ne les lisent.
ALTER TABLE negative_attestation
  ADD COLUMN IF NOT EXISTS org_slug         text,
  ADD COLUMN IF NOT EXISTS org_name         text,
  ADD COLUMN IF NOT EXISTS entity_source    text,
  ADD COLUMN IF NOT EXISTS entity_code      text,
  ADD COLUMN IF NOT EXISTS source_scope     text NOT NULL DEFAULT 'enabled-sources',
  ADD COLUMN IF NOT EXISTS source_digest    text,
  ADD COLUMN IF NOT EXISTS events_found     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS method           text NOT NULL DEFAULT 'event-store-window-v1',
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS payload_digest   text,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();

UPDATE negative_attestation a
   SET org_slug       = COALESCE(a.org_slug, o.slug, 'organisation-' || a.org_id),
       org_name       = COALESCE(a.org_name, o.name, 'organisation ' || a.org_id),
       entity_source  = COALESCE(a.entity_source, o.entity_source),
       entity_code    = COALESCE(a.entity_code, o.entity_code),
       source_digest  = COALESCE(a.source_digest, 'historique-non-calcule'),
       payload_digest = COALESCE(a.payload_digest, 'historique-non-calcule'),
       signature_method = COALESCE(a.signature_method, CASE WHEN a.signature IS NOT NULL THEN 'historique' END)
  FROM org o
 WHERE o.id = a.org_id
   AND (a.org_slug IS NULL OR a.org_name IS NULL OR a.source_digest IS NULL OR a.payload_digest IS NULL);

UPDATE negative_attestation
   SET org_slug       = COALESCE(org_slug, 'organisation-' || org_id),
       org_name       = COALESCE(org_name, 'organisation ' || org_id),
       source_digest  = COALESCE(source_digest, 'historique-non-calcule'),
       payload_digest = COALESCE(payload_digest, 'historique-non-calcule')
 WHERE org_slug IS NULL OR org_name IS NULL OR source_digest IS NULL OR payload_digest IS NULL;

ALTER TABLE negative_attestation
  ALTER COLUMN org_slug       SET NOT NULL,
  ALTER COLUMN org_name       SET NOT NULL,
  ALTER COLUMN source_digest  SET NOT NULL,
  ALTER COLUMN payload_digest SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'negative_attestation_window_valid') THEN
    ALTER TABLE negative_attestation
      ADD CONSTRAINT negative_attestation_window_valid CHECK (window_end > window_start);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'negative_attestation_signed_sealed') THEN
    ALTER TABLE negative_attestation
      ADD CONSTRAINT negative_attestation_signed_sealed CHECK (
        (signed = false AND signature IS NULL)
        OR (signed = true AND signature IS NOT NULL AND signature_method IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'negative_attestation_unique') THEN
    ALTER TABLE negative_attestation
      ADD CONSTRAINT negative_attestation_unique UNIQUE (org_slug, window_start, window_end, method);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS negative_attestation_org_idx
  ON negative_attestation (org_id);
CREATE INDEX IF NOT EXISTS negative_attestation_window_idx
  ON negative_attestation (window_start, window_end);
-- Le critère public : des attestations signées, multi-sources, sur une
-- fenêtre non vide. L'index partiel rend le comptage direct.
CREATE INDEX IF NOT EXISTS negative_attestation_signed_idx
  ON negative_attestation (org_slug)
  WHERE signed = true AND sources_checked >= 1;

COMMENT ON TABLE negative_attestation IS
  'Absence d''événement rattaché à une organisation sur une fenêtre : attestation signée, portée limitée au magasin event du radar.';
COMMENT ON COLUMN negative_attestation.source_digest IS
  'SHA-256 des identifiants de sources actives interrogées, triés : prouve l''ensemble exact contrôlé.';
COMMENT ON COLUMN negative_attestation.payload_digest IS
  'SHA-256 du contenu canonique attesté (organisation, fenêtre, sources, méthode).';
COMMENT ON COLUMN negative_attestation.signature_method IS
  'hmac-sha256 (authenticité + intégrité) ou sha256-content (intégrité seule).';
