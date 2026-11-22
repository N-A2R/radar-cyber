-- Sources d'information du secteur « numerique » du departement 23 (Creuse).
-- 15 sources ; 43 URL controlees en HTTP 200 le 2026-11-22 (GET reel, redirections suivies).
-- Corpus detaille : bench/corpus/sources-numerique-23.jsonl
-- Rapport : bench/results/verification-numerique-23.json

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
  ('corpus:numerique-23-aliptic', 'ALIPTIC — association limousine des professionnels du numérique', 'cti', 'https://www.aliptic.net/actualites.html', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":1}}'::jsonb, 3600, 'ALIPTIC — association limousine des professionnels du numérique — association professionnelle du numérique, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-french-tech-limousin', 'French Tech Limousin', 'cti', 'https://www.lafrenchtech-limousin.com/actualites.html', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":2}}'::jsonb, 3600, 'French Tech Limousin — réseau French Tech (Limousin / Creuse), source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-dorsal', 'Dorsal — l’actu du numérique en Limousin', 'cti', 'https://www.dorsal.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":3}}'::jsonb, 3600, 'Dorsal — l’actu du numérique en Limousin — service public du numérique (réseau Limousin), source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-quincaillerie', 'La Quincaillerie.tl — tiers-lieu numérique de Guéret', 'cti', 'https://www.laquincaillerie.tl/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":4}}'::jsonb, 3600, 'La Quincaillerie.tl — tiers-lieu numérique de Guéret — tiers-lieu numérique / fab lab, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-wiclic', 'Wiclic — informatique et cybersécurité à Guéret', 'cti', 'https://www.wiclic.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":5}}'::jsonb, 3600, 'Wiclic — informatique et cybersécurité à Guéret — entreprise de services numériques (ESN), source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-cybernettic', 'Cybernettic — agence web en Creuse', 'cti', 'https://www.cybernettic.fr/spip.php?page=backend', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":6}}'::jsonb, 3600, 'Cybernettic — agence web en Creuse — agence web / informatique, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-e-inclusion', 'Creuse — territoire d’actions pour un numérique inclusif', 'cti', 'https://e-inclusion.creuse.fr/evenements/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":7}}'::jsonb, 3600, 'Creuse — territoire d’actions pour un numérique inclusif — dispositif départemental d’inclusion numérique, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-nathd', 'NATHD — réseau très haut débit Nouvelle-Aquitaine', 'cti', 'https://nathd.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":8}}'::jsonb, 3600, 'NATHD — réseau très haut débit Nouvelle-Aquitaine — syndicat mixte fibre / réseau très haut débit, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-cma-creuse', 'CMA Creuse — Chambre de métiers et de l’artisanat', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":9}}'::jsonb, 3600, 'CMA Creuse — Chambre de métiers et de l’artisanat — chambre consulaire (artisanat / numérique), source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-cd23', 'Conseil départemental de la Creuse', 'institutionnel', 'https://www.creuse.fr/rss/actus.rss', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":10}}'::jsonb, 3600, 'Conseil départemental de la Creuse — collectivité départementale — numérique et fibre, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-ville-gueret', 'Ville de Guéret — La Quincaillerie numérique', 'institutionnel', 'https://www.ville-gueret.fr/actualites/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":11}}'::jsonb, 3600, 'Ville de Guéret — La Quincaillerie numérique — collectivité communale — tiers-lieu numérique, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-ici-creuse', 'ici Creuse — Radio France', 'presse', 'https://www.ici.fr/rss/creuse/rubrique/infos.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":12}}'::jsonb, 3600, 'ici Creuse — Radio France — radio publique locale, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-france3-creuse', 'France 3 Nouvelle-Aquitaine — Creuse', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":13}}'::jsonb, 3600, 'France 3 Nouvelle-Aquitaine — Creuse — télévision publique régionale, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-la-montagne', 'La Montagne — rubrique Numérique (édition Creuse)', 'presse', 'https://www.lamontagne.fr/actualites/numerique', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":14}}'::jsonb, 3600, 'La Montagne — rubrique Numérique (édition Creuse) — presse quotidienne régionale, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:numerique-23-actu-creuse', 'actu.fr — Actu Creuse', 'presse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-23.jsonl","ligne":15}}'::jsonb, 3600, 'actu.fr — Actu Creuse — presse locale numérique, source d information du secteur numerique en Creuse (23), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '23')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : une ligne par source intégrée, 200 observé le 2026-11-22.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
VALUES
  ('corpus:numerique-23-aliptic', 'https://www.aliptic.net/actualites.html', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-french-tech-limousin', 'https://www.lafrenchtech-limousin.com/actualites.html', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-dorsal', 'https://www.dorsal.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-quincaillerie', 'https://www.laquincaillerie.tl/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-wiclic', 'https://www.wiclic.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-cybernettic', 'https://www.cybernettic.fr/spip.php?page=backend', 200, 'text/xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-e-inclusion', 'https://e-inclusion.creuse.fr/evenements/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-nathd', 'https://nathd.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-cma-creuse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-cd23', 'https://www.creuse.fr/rss/actus.rss', 200, 'application/rss+xml', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-ville-gueret', 'https://www.ville-gueret.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-ici-creuse', 'https://www.ici.fr/rss/creuse/rubrique/infos.xml', 200, 'application/xml', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-france3-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss', 200, 'text/xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-la-montagne', 'https://www.lamontagne.fr/actualites/numerique', 200, 'text/html; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-23-actu-creuse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 200, 'application/rss+xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-23 : HTTP 200 vérifié le 2026-11-22');
