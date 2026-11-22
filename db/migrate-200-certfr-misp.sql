-- 200 — Flux MISP public du CERT-FR (TLP:CLEAR) : la source.
--
-- La source est nationale : `region = 'national'`, aucun département. Un
-- événement du flux ne désigne donc jamais une organisation régionale ; ce
-- sont les corrélations écrites par le corrélateur qui portent le rattachement.
--
-- Le corpus durable — celui qui survit à la rétention des événements — vit
-- dans `certfr_misp_event` (migration 202) : un événement MISP peut dater de
-- 2020, `event` l'archive au bout de 90 jours, jamais cette table.
INSERT INTO source (id, name, family, url, license, enabled, cursor, kind, format, parser, interval_sec, description, region, department, statut, language)
VALUES (
  'certfr_misp',
  'CERT-FR — flux MISP public (TLP:CLEAR)',
  'cti',
  'https://misp.cert.ssi.gouv.fr/feed-misp/manifest.json',
  'CERT-FR — flux MISP public, TLP:CLEAR (diffusion libre)',
  true,
  '{}'::jsonb,
  'misp',
  'json',
  '{"manifest": "https://misp.cert.ssi.gouv.fr/feed-misp/manifest.json", "events": "{uuid}.json"}'::jsonb,
  86400,
  'Événements MISP TLP:CLEAR publiés par le CERT-FR, ingérés quotidiennement puis corrélés aux événements régionaux',
  'national',
  NULL,
  'active',
  'fr'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  license = EXCLUDED.license,
  enabled = true,
  kind = EXCLUDED.kind,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  interval_sec = EXCLUDED.interval_sec,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = NULL,
  statut = 'active',
  language = EXCLUDED.language;

-- Retrouver vite les corrélations et événements porteurs d'un UUID MISP.
CREATE INDEX IF NOT EXISTS event_certfr_misp_uuid_idx
  ON event ((evidence ->> 'mispUuid'))
  WHERE evidence ? 'mispUuid';
