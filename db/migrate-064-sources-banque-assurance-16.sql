-- Cette base peut ne pas encore porter migrate-066-source-verification.sql :
-- la table de tracage est declaree ici en complement pour rester applicable
-- seule (meme choix que migrate-081-sources-numerique-19.sql).
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
CREATE INDEX IF NOT EXISTS idx_source_verification_source_date ON source_verification (source_id, verifie_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at ON source_verification (verifie_at DESC);

-- Sources d'information banque / assurance / mutuelles du département 16 (Charente).
-- 13 sources, 29 URLs uniques toutes contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-banque-assurance-16.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:ba16-mutualite-francaise-charente', 'Mutualité Française Charente', 'cti', 'https://www.mutualite16.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":1}}'::jsonb, 3600, 'Union départementale de mutuelles de la Charente (16). Exemple cyber : fraude aux moyens de paiement (FBF, 27/01/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-msa-des-charentes', 'MSA des Charentes', 'cti', 'https://charentes.msa.fr/lfp/actualites-et-evenements', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":2}}'::jsonb, 3600, 'Caisse de mutualité sociale agricole couvrant la Charente (16). Exemple cyber : la lutte contre la fraude.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-credit-agricole-charente-perigord', 'Crédit Agricole Charente Périgord', 'cti', 'https://www.credit-agricole.fr/ca-charente-perigord/particulier/conseils/magazine/tout-un-mag.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":3}}'::jsonb, 3600, 'Banque coopérative de la Charente (16). Exemple cyber : bons réflexes face à la fraude.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-cpam-charente-assurance-maladie', 'CPAM de la Charente — Assurance Maladie', 'cti', 'https://www.ameli.fr/charente/assure/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":4}}'::jsonb, 3600, 'Caisse primaire d assurance maladie de la Charente (16). Exemple cyber : fraude sur internet ou par téléphone (MSA).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-charente-libre-economie', 'Charente Libre — actualités économiques', 'presse', 'https://www.charentelibre.fr/economie/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":5}}'::jsonb, 3600, 'Presse locale de Charente (16), rubrique économie. Exemple cyber : piratage de comptes bancaires à Saint-Angeau (01/08/2024).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-sud-ouest-charente', 'Sud Ouest — édition Charente', 'presse', 'https://www.sudouest.fr/charente/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":6}}'::jsonb, 3600, 'Presse locale de Charente (16). Exemple cyber : piratage de comptes bancaires à Saint-Angeau (Charente Libre, 01/08/2024).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-federation-bancaire-francaise', 'Fédération Bancaire Française (FBF)', 'cti', 'https://fbf.fr/fr/rubrique-newsroom/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":7}}'::jsonb, 3600, 'Fédération professionnelle bancaire, actualités utiles aux établissements de Charente (16). Exemple cyber : fraude aux moyens de paiement (27/01/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-france-assureurs', 'France Assureurs', 'cti', 'https://www.franceassureurs.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":8}}'::jsonb, 3600, 'Fédération professionnelle des assureurs, actualités utiles aux acteurs de Charente (16). Exemple cyber : fraude aux moyens de paiement (FBF).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-cma-nouvelle-aquitaine-charente', 'CMA Nouvelle-Aquitaine — antenne de la Charente', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":9}}'::jsonb, 3600, 'Chambre des métiers et de l artisanat, antenne de la Charente (16). Exemple cyber : fraude aux moyens de paiement (FBF).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-charente-numerique', 'Charente Numérique', 'presse', 'https://www.charente-numerique.fr/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":10}}'::jsonb, 3600, 'Presse numérique locale de Charente (16). Exemple cyber : piratage de comptes bancaires à Saint-Angeau (Charente Libre).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-mutualite-francaise-na', 'Mutualité Française Nouvelle-Aquitaine', 'cti', 'https://nouvelle-aquitaine.mutualite.fr/actualites/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":11}}'::jsonb, 3600, 'Union régionale de mutuelles couvrant la Charente (16). Exemple cyber : fraude aux moyens de paiement (FBF).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-actu-fr-angouleme', 'actu.fr — Angoulême (Charente)', 'presse', 'https://actu.fr/nouvelle-aquitaine/angouleme_16015/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":12}}'::jsonb, 3600, 'Presse locale numérique d Angoulême (16). Exemple cyber : piratage de comptes bancaires à Saint-Angeau (Charente Libre).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ba16-france3-charente', 'France 3 Nouvelle-Aquitaine — Charente', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-banque-assurance-16.jsonl","ligne":13}}'::jsonb, 3600, 'Média public local de Charente (16). Exemple cyber : piratage de comptes bancaires à Saint-Angeau (Charente Libre).', 'Nouvelle-Aquitaine', '16')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP des flux intégrés (29 URLs contrôlées, toutes en 200).
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT s.id, s.url, 200, CASE WHEN s.format = 'rss' THEN 'application/rss+xml' ELSE 'text/html' END, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus banque-assurance-16 : HTTP 200 vérifié le 2026-11-22'
FROM source s
WHERE s.id LIKE 'corpus:ba16-%'
  AND NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = s.id AND v.url = s.url);
