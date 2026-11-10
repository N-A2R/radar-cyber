-- Sources .onion de revendication (ransomware) réellement publiques.
-- Testées via Tor (SOCKS5 127.0.0.1:9050) le 2026-11-10 ; activées à la main
-- par le parent une fois la collecte validée (enabled = false).
-- Colonnes vérifiées : \d public.source

BEGIN;

INSERT INTO public.source (
  id, name, family, url, license, retain_raw, enabled, kind, format,
  parser, interval_sec, description, relevance, disabled_reason
) VALUES
(
  'onion:ransomlook:site',
  'RansomLook — site .onion (revendications)',
  'ransomware',
  'http://ransomlookumjrc6erzqn467lkcu2t5h4enjzfigvsxrrktxicysi2yd.onion/',
  NULL,
  false,
  false,
  'narrative',
  'html',
  '{}'::jsonb,
  3600,
  'Miroir .onion du site RansomLook (agrégateur de revendications ransomware), testé HTTP 200 via Tor.',
  'context',
  'Activation manuelle requise (collecte Tor à valider par le parent).'
),
(
  'onion:ransomwatch:site',
  'Ransomwatch — site .onion (revendications)',
  'ransomware',
  'http://ransomwr3tsydeii4q43vazm7wofla5ujdajquitomtd47cxjtfgwyyd.onion/',
  NULL,
  false,
  false,
  'narrative',
  'html',
  '{}'::jsonb,
  3600,
  'Miroir .onion de Ransomwatch (flux de revendications ransomware), testé HTTP 200 via Tor.',
  'context',
  'Activation manuelle requise (collecte Tor à valider par le parent).'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
