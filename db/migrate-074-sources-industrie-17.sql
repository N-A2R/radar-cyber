-- Sources d'information du secteur industrie dans le département 17 (Charente-Maritime).
-- 9 sources, 21 URL distinctes contrôlées en HTTP 200 le 2026-11-22 (curl -L, GET avec User-Agent navigateur).
-- Corpus détaillé : bench/corpus/sources-industrie-17.jsonl
-- Preuve HTTP : bench/results/verification-sources-industrie-17.json

-- La table de traçage est déclarée ici pour rester applicable sur une branche
-- qui ne contient pas encore migrate-064-source-verification.sql.
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
  ('corpus:industrie17-cpme17', 'CPME 17 — Confédération des petites et moyennes entreprises de la Charente-Maritime', 'cti', 'https://cpme17.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":1}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), CPME 17 — Confédération des petites et moyennes entreprises de la Charente-Maritime ; corpus ligne 1.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-medef17', 'MEDEF Charente-Maritime', 'cti', 'https://www.medef17.fr/fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":2}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), MEDEF Charente-Maritime ; corpus ligne 2.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-sud-ouest-charente-maritime', 'Sud Ouest — Charente-Maritime', 'presse', 'https://www.sudouest.fr/charente-maritime/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":3}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), Sud Ouest — Charente-Maritime ; corpus ligne 3.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-actu-fr-charente-maritime', 'actu.fr — Charente-Maritime', 'presse', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":4}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), actu.fr — Charente-Maritime ; corpus ligne 4.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-ici-la-rochelle', 'ici La Rochelle — Radio France', 'presse', 'https://www.ici.fr/rss/la-rochelle/a-la-une.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":5}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), ici La Rochelle — Radio France ; corpus ligne 5.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-journal-des-entreprises-na', 'Le Journal des Entreprises — Nouvelle-Aquitaine', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":6}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), Le Journal des Entreprises — Nouvelle-Aquitaine ; corpus ligne 6.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-agglo-la-rochelle', 'Agglo La Rochelle — actualités et développement économique', 'cti', 'https://www.agglo-larochelle.fr/les-flux-rss-de-l-agglo/-/data-agglo/all-9786027.rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":7}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), Agglo La Rochelle — actualités et développement économique ; corpus ligne 7.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-technopole-atlas', 'Technopole ATLAS — La Rochelle', 'cti', 'https://technopole-atlas.fr/l-actualite', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":8}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), Technopole ATLAS — La Rochelle ; corpus ligne 8.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:industrie17-cooperative-carbone', 'Coopérative Carbone — La Rochelle', 'cti', 'https://cooperativecarbone.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-17.jsonl","ligne":9}}'::jsonb, 3600, 'source d''information du secteur industrie en Charente-Maritime (17), Coopérative Carbone — La Rochelle ; corpus ligne 9.', 'Nouvelle-Aquitaine', '17')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Traçage des contrôles HTTP : 21 URL distinctes, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat)
VALUES
  ('corpus:industrie17-cpme17', 'https://cpme17.fr/', 200, 'text/html; charset=UTF-8', 0, 1515, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-cpme17', 'https://cpme17.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 2275, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-cpme17', 'https://cpme17.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 750, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-medef17', 'https://www.medef17.fr/', 200, 'text/html; charset=UTF-8', 0, 259, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-medef17', 'https://www.medef17.fr/fr/actualites', 200, 'text/html; charset=UTF-8', 0, 219, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-sud-ouest-charente-maritime', 'https://www.sudouest.fr/charente-maritime/', 200, 'text/html; charset=UTF-8', 0, 413, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-sud-ouest-charente-maritime', 'https://www.sudouest.fr/charente-maritime/rss.xml', 200, 'application/xml', 0, 141, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-actu-fr-charente-maritime', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17', 200, 'text/html; charset=UTF-8', 0, 165, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-actu-fr-charente-maritime', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17/rss.xml', 200, 'application/rss+xml; charset=utf-8', 0, 108, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-ici-la-rochelle', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17', 200, 'text/html; charset=UTF-8', 0, 272, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-ici-la-rochelle', 'https://www.ici.fr/rss/la-rochelle/a-la-une.xml', 200, 'application/xml', 0, 209, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 200, 'text/html; charset=UTF-8', 0, 404, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 200, 'text/xml; charset=UTF-8', 0, 174, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-agglo-la-rochelle', 'https://www.agglo-larochelle.fr/', 200, 'text/html;charset=UTF-8', 0, 2551, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-agglo-la-rochelle', 'https://www.agglo-larochelle.fr/actualites', 200, 'text/html;charset=UTF-8', 0, 2284, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-agglo-la-rochelle', 'https://www.agglo-larochelle.fr/les-flux-rss-de-l-agglo/-/data-agglo/all-9786027.rss', 200, 'application/rss+xml;charset=UTF-8', 0, 954, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-technopole-atlas', 'https://technopole-atlas.fr/', 200, 'text/html; charset=utf-8', 0, 230, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-technopole-atlas', 'https://technopole-atlas.fr/l-actualite', 200, 'text/html; charset=utf-8', 0, 513, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-cooperative-carbone', 'https://cooperativecarbone.fr/', 200, 'text/html; charset=UTF-8', 0, 167, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-cooperative-carbone', 'https://cooperativecarbone.fr/actus/', 200, 'text/html; charset=UTF-8', 0, 131, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200'),
  ('corpus:industrie17-cooperative-carbone', 'https://cooperativecarbone.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 511, '2026-11-22T03:24:11Z', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'ok200');
