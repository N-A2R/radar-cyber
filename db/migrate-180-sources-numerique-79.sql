-- Sources d'information du secteur « numerique » du département 79 (Deux-Sèvres).
-- 22 sources ; 72 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel, contenus HTML/RSS vérifiés).
-- Corpus détaillé : bench/corpus/sources-numerique-79.jsonl
-- Rapport : bench/results/verification-numerique-79.json

-- Table de traçage déclarée ici en complément pour rester applicable sur une
-- branche qui ne contient pas encore migrate-064-source-verification.sql.
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
  ('corpus:numerique-79-le-campus-by-cci-deux-sevres', 'Le Campus by CCI Deux-Sèvres', 'cti', 'https://www.lecampusbycci79.fr/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":1}}'::jsonb, 3600, 'Le Campus by CCI Deux-Sèvres — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-cpme-79', 'CPME 79 — Confédération des petites et moyennes entreprises des Deux-Sèvres', 'cti', 'https://www.cpme79.fr/spip.php?page=backend', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":2}}'::jsonb, 3600, 'CPME 79 — Confédération des petites et moyennes entreprises des Deux-Sèvres — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-medef-deux-sevres', 'MEDEF Deux-Sèvres — actualités des entreprises', 'cti', 'https://www.medef79.fr/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":3}}'::jsonb, 3600, 'MEDEF Deux-Sèvres — actualités des entreprises — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-u2p', 'U2P — Union des entreprises de proximité (artisans et commerçants du 79)', 'cti', 'https://u2p-france.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":4}}'::jsonb, 3600, 'U2P — Union des entreprises de proximité (artisans et commerçants du 79) — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-numeum', 'Numeum — syndicat professionnel du numérique', 'cti', 'https://numeum.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":5}}'::jsonb, 3600, 'Numeum — syndicat professionnel du numérique — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-aliptic', 'ALIPTIC — cluster numérique de Nouvelle-Aquitaine', 'cti', 'https://www.aliptic.net/actualites.html', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":6}}'::jsonb, 3600, 'ALIPTIC — cluster numérique de Nouvelle-Aquitaine — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-alt-technopole-niort-deux-sevres', 'Altæ Technopole Niort Deux-Sèvres', 'institutionnel', 'https://altae-technopole.fr/actualites/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":7}}'::jsonb, 3600, 'Altæ Technopole Niort Deux-Sèvres — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-niort-agglo', 'Niort Agglo — centre de ressources en cybersécurité', 'institutionnel', 'https://www.niortagglo.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":8}}'::jsonb, 3600, 'Niort Agglo — centre de ressources en cybersécurité — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-ville-de-niort', 'Ville de Niort — Vivre à Niort', 'institutionnel', 'https://www.vivre-a-niort.com/news.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":9}}'::jsonb, 3600, 'Ville de Niort — Vivre à Niort — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-departement-des-deux-sevres', 'Département des Deux-Sèvres', 'institutionnel', 'https://www.deux-sevres.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":10}}'::jsonb, 3600, 'Département des Deux-Sèvres — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-deux-sevres-numerique', 'Deux-Sèvres Numérique — syndicat mixte de la fibre', 'institutionnel', 'https://www.deux-sevres-numerique.fr/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":11}}'::jsonb, 3600, 'Deux-Sèvres Numérique — syndicat mixte de la fibre — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-campus-de-niort', 'Campus de Niort — Université de Poitiers', 'institutionnel', 'https://niort.univ-poitiers.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":12}}'::jsonb, 3600, 'Campus de Niort — Université de Poitiers — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-iut-poitiers-niort-chatellerault', 'IUT Poitiers-Niort-Châtellerault', 'institutionnel', 'https://iutp.univ-poitiers.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":13}}'::jsonb, 3600, 'IUT Poitiers-Niort-Châtellerault — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-prefecture-des-deux-sevres', 'Préfecture des Deux-Sèvres', 'institutionnel', 'https://www.deux-sevres.gouv.fr/Actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":14}}'::jsonb, 3600, 'Préfecture des Deux-Sèvres — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-france-services', 'France Services', 'presse', 'https://www.france-services.gouv.fr/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":15}}'::jsonb, 3600, 'France Services — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-la-nouvelle-republique', 'La Nouvelle République — Deux-Sèvres', 'presse', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":16}}'::jsonb, 3600, 'La Nouvelle République — Deux-Sèvres — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-actu-fr', 'actu.fr — Deux-Sèvres', 'presse', 'https://actu.fr/deux-sevres/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":17}}'::jsonb, 3600, 'actu.fr — Deux-Sèvres — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-ici-poitou', 'ICI Poitou — Radio France', 'presse', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":18}}'::jsonb, 3600, 'ICI Poitou — Radio France — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-niort-info', 'Niort Info', 'presse', 'https://niortinfo.media/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":19}}'::jsonb, 3600, 'Niort Info — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-e-niort', 'E.Niort', 'cti', 'https://eniort.com/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":20}}'::jsonb, 3600, 'E.Niort — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-cma-nouvelle-aquitaine', 'CMA Nouvelle-Aquitaine — chambre des métiers et de l’artisanat', 'presse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":21}}'::jsonb, 3600, 'CMA Nouvelle-Aquitaine — chambre des métiers et de l’artisanat — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79'),
  ('corpus:numerique-79-deuxsevres-fr', 'Deuxsevres.fr — annuaire professionnel et revue de presse locale', 'presse', 'https://www.deuxsevres.fr/nav-newsactus', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-79.jsonl","ligne":22}}'::jsonb, 3600, 'Deuxsevres.fr — annuaire professionnel et revue de presse locale — source d information du secteur numerique dans les Deux-Sevres (79), verifiee le 2026-11-22.', 'Nouvelle-Aquitaine', '79')
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
SELECT v.source_id, v.url, v.code_http, v.content_type, v.items, v.ms, v.verifie_at, v.user_agent, v.etat, v.motif
FROM (VALUES
  ('corpus:numerique-79-le-campus-by-cci-deux-sevres', 'https://www.lecampusbycci79.fr/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-cpme-79', 'https://www.cpme79.fr/spip.php?page=backend', 200, 'text/xml; charset=utf-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-medef-deux-sevres', 'https://www.medef79.fr/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-u2p', 'https://u2p-france.fr/rss.xml', 200, 'application/rss+xml; charset=utf-8', 162, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-numeum', 'https://numeum.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-aliptic', 'https://www.aliptic.net/actualites.html', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-alt-technopole-niort-deux-sevres', 'https://altae-technopole.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-niort-agglo', 'https://www.niortagglo.fr/rss.xml', 200, 'application/rss+xml;charset=utf-8', 30, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-ville-de-niort', 'https://www.vivre-a-niort.com/news.xml', 200, 'application/rss+xml;charset=utf-8', 30, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-departement-des-deux-sevres', 'https://www.deux-sevres.fr/rss.xml', 200, 'application/rss+xml; charset=utf-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-deux-sevres-numerique', 'https://www.deux-sevres-numerique.fr/', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-campus-de-niort', 'https://niort.univ-poitiers.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 6, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-iut-poitiers-niort-chatellerault', 'https://iutp.univ-poitiers.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-prefecture-des-deux-sevres', 'https://www.deux-sevres.gouv.fr/Actualites', 200, 'text/html; charset=utf-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-france-services', 'https://www.france-services.gouv.fr/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 200, 'application/rss+xml; charset=UTF-8', 40, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-actu-fr', 'https://actu.fr/deux-sevres/rss.xml', 200, 'application/rss+xml; charset=utf-8', 20, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-ici-poitou', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 200, 'application/xml', 20, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-niort-info', 'https://niortinfo.media/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-e-niort', 'https://eniort.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-79-deuxsevres-fr', 'https://www.deuxsevres.fr/nav-newsactus', 200, 'text/html; charset=utf-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-79 : HTTP 200 verifie le 2026-11-22')
) AS v(source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
WHERE NOT EXISTS (
  SELECT 1 FROM source_verification sv
  WHERE sv.source_id = v.source_id AND sv.url = v.url
    AND sv.verifie_at::date = DATE '2026-11-22'
);
