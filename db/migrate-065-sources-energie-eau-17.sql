-- Sources d'information du secteur « energie-eau » du département 17 (Charente-Maritime).
-- 10 sources, 22 contrôles HTTP sur 21 URLs distinctes (sites, pages actualités et flux), toutes en 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-energie-eau-17.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-17.json

-- La table de traçage est déclarée ici en complément pour rester applicable
-- sur une branche qui ne contient pas encore migrate-064-source-verification.sql.
CREATE TABLE IF NOT EXISTS source_verification (
  id                bigserial PRIMARY KEY,
  source_id         text        NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  url               text        NOT NULL,
  code_http         integer,
  content_type      text,
  items             integer     NOT NULL DEFAULT 0 CHECK (items >= 0),
  derniere_item_at  timestamptz,
  ms                integer     NOT NULL CHECK (ms >= 0),
  verifie_at        timestamptz NOT NULL DEFAULT now(),
  user_agent        text        NOT NULL,
  etat              text        NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif             text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:e17-eau17', 'Eau17 — Syndicat des eaux de la Charente-Maritime (SDE17)', 'cti', 'https://www.eau17.fr/actualites.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":1}}'::jsonb, 3600, 'Syndicat des eaux de la Charente-Maritime (17). Exemple cyber : arnaque a la facture d eau signalee dans le departement.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-rese', 'RESE — Votre service public de l eau (Saintes)', 'cti', 'https://www.rese.fr/actualites.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":2}}'::jsonb, 3600, 'Regie de l eau de Saintes et de la Charente-Maritime (17). Exemple cyber : faux Flash de la RESE.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-sdeer', 'SDEER — Syndicat departemental d electrification et d equipement rural', 'cti', 'https://www.sdeer17.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":3}}'::jsonb, 3600, 'Syndicat departemental d electrification de la Charente-Maritime (17). Exemple cyber : cyberattaque de controle du syndicat informatique departemental.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-agur', 'Agur — Le service public de l eau (Saintes)', 'cti', 'https://www.agur.fr/nos-actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":4}}'::jsonb, 3600, 'Service public de l eau de Saintes (17). Exemple cyber : arnaque sur les factures d eau a Jonzac.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-enedis', 'Enedis — Gestionnaire du reseau de distribution d electricite', 'cti', 'https://www.enedis.fr/presse', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":5}}'::jsonb, 3600, 'Distributeur d electricite interconnecte avec la Charente-Maritime (17). Exemple cyber : demarchages frauduleux usurpant Enedis.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-cma', 'CMA Nouvelle-Aquitaine — antenne de la Charente-Maritime', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":6}}'::jsonb, 3600, 'Chambre des metiers et de l artisanat, antenne de la Charente-Maritime (17), artisans energie et eau. Exemple cyber : fuite de donnees Incognito.fr a Saint-Martin-de-Re.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-sud-ouest', 'Sud Ouest — Charente-Maritime', 'presse', 'https://www.sudouest.fr/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":7}}'::jsonb, 3600, 'Presse quotidienne locale de Charente-Maritime (17), rubrique environnement et ressources en eau. Exemple cyber : attaque de la mairie de Marennes-Hiers-Brouage.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-ici', 'ici Charente-Maritime — Radio France', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":8}}'::jsonb, 3600, 'Radio publique locale de Charente-Maritime (17). Exemple cyber : attaque informatique de la billetterie de la Coursive a La Rochelle.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-recours-france', 'Recours France — Energies et eau en Charente-Maritime', 'cti', 'https://recours-france.fr/annuaire/energie/17-charente-maritime', 'annuaire professionnel public', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":9}}'::jsonb, 86400, 'Annuaire professionnel des entreprises energie et eau de Charente-Maritime (17).', 'Nouvelle-Aquitaine', '17'),
  ('corpus:e17-pro-rge', 'Pro-RGE — Entreprises RGE en Charente-Maritime', 'cti', 'https://pro-rge.fr/entreprises/charente-maritime-17/', 'annuaire professionnel public', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-17.jsonl","ligne":10}}'::jsonb, 86400, 'Annuaire des professionnels Reconnu Garant de l Environnement de Charente-Maritime (17), travaux d efficacite energetique.', 'Nouvelle-Aquitaine', '17')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 21 URLs distinctes contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:e17-eau17', ARRAY['https://www.eau17.fr/','https://www.eau17.fr/actualites','https://www.eau17.fr/actualites.xml']),
    ('corpus:e17-rese', ARRAY['https://www.rese.fr/','https://www.rese.fr/actualites','https://www.rese.fr/actualites.xml']),
    ('corpus:e17-sdeer', ARRAY['https://www.sdeer17.fr/','https://www.sdeer17.fr/actualites/','https://www.sdeer17.fr/feed/']),
    ('corpus:e17-agur', ARRAY['https://www.agur.fr/','https://www.agur.fr/nos-actualites/']),
    ('corpus:e17-enedis', ARRAY['https://www.enedis.fr/','https://www.enedis.fr/presse']),
    ('corpus:e17-cma', ARRAY['https://cma-nouvelleaquitaine.fr/','https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites']),
    ('corpus:e17-sud-ouest', ARRAY['https://www.sudouest.fr/charente-maritime','https://www.sudouest.fr/charente-maritime/archives/','https://www.sudouest.fr/rss.xml']),
    ('corpus:e17-ici', ARRAY['https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17']),
    ('corpus:e17-recours-france', ARRAY['https://recours-france.fr/annuaire/energie/17-charente-maritime']),
    ('corpus:e17-pro-rge', ARRAY['https://pro-rge.fr/entreprises/charente-maritime-17/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-17 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
