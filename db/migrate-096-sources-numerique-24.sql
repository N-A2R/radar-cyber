-- Sources d'information du secteur « numerique » du departement 24 (Dordogne).
-- 12 sources ; 42 URL controlees le 2026-11-22, 37 en HTTP 200 (GET reel, redirections suivies).
-- Corpus detaille : bench/corpus/sources-numerique-24.jsonl
-- Rapport : bench/results/verification-numerique-24.json

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
  ('corpus:numerique-24-digital-valley', 'Digital Valley — accompagnement des projets numériques et de l''innovation en Dordogne', 'cti', 'https://digital-valley.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":1}}'::jsonb, 3600, 'Digital Valley — accompagnement des projets numériques et de l''innovation en Dordogne — réseau d''accompagnement des projets numériques et des start-ups, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-french-tech-perigord', 'French Tech Périgord', 'cti', 'https://frenchtechperigord.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":2}}'::jsonb, 3600, 'French Tech Périgord — réseau French Tech — start-ups et entreprises innovantes du Périgord, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-cci-dordogne', 'CCI Dordogne — Chambre de commerce et d''industrie', 'cti', 'https://dordogne.cci.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":3}}'::jsonb, 3600, 'CCI Dordogne — Chambre de commerce et d''industrie — chambre consulaire (commerce, défis numériques des entreprises), source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-cpme-24', 'CPME 24 — Confédération des petites et moyennes entreprises de Dordogne', 'cti', 'https://cpme24.org/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":4}}'::jsonb, 3600, 'CPME 24 — Confédération des petites et moyennes entreprises de Dordogne — fédération patronale départementale (aides à la transition numérique), source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-cma-dordogne', 'CMA Dordogne — Chambre des métiers et de l''artisanat (CMA Nouvelle-Aquitaine)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":5}}'::jsonb, 3600, 'CMA Dordogne — Chambre des métiers et de l''artisanat (CMA Nouvelle-Aquitaine) — chambre consulaire (artisanat, innovation et transformation numérique), source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-nathd', 'NATHD — Nouvelle-Aquitaine Très Haut Débit (Dordogne-Périgord)', 'cti', 'https://nathd.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":6}}'::jsonb, 3600, 'NATHD — Nouvelle-Aquitaine Très Haut Débit (Dordogne-Périgord) — syndicat mixte fibre / réseau très haut débit, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-grand-perigueux', 'Grand Périgueux — actualités de l''agglomération', 'institutionnel', 'https://www.grandperigueux.fr/actualites/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":7}}'::jsonb, 3600, 'Grand Périgueux — actualités de l''agglomération — collectivité (communauté d''agglomération) — actualités numériques et incubateur Digital Valley, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-reussir-le-perigord', 'Réussir le Périgord — hebdomadaire d''informations de Dordogne', 'presse', 'https://www.reussirleperigord.fr/actualite', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":8}}'::jsonb, 3600, 'Réussir le Périgord — hebdomadaire d''informations de Dordogne — presse locale départementale, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-dordogne-libre', 'Dordogne Libre', 'presse', 'https://www.dordognelibre.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":9}}'::jsonb, 3600, 'Dordogne Libre — presse locale hebdomadaire (Périgueux), source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-actu-dordogne', 'actu.fr — Actu Dordogne', 'presse', 'https://actu.fr/nouvelle-aquitaine/dordogne_24/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":10}}'::jsonb, 3600, 'actu.fr — Actu Dordogne — presse locale numérique, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-ici-perigord', 'ici Périgord — Radio France', 'presse', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":11}}'::jsonb, 3600, 'ici Périgord — Radio France — radio publique locale, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:numerique-24-france3-dordogne', 'France 3 Nouvelle-Aquitaine — Dordogne', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-24.jsonl","ligne":12}}'::jsonb, 3600, 'France 3 Nouvelle-Aquitaine — Dordogne — télévision publique régionale, source d information du secteur numerique en Dordogne (24), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '24')
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
  ('corpus:numerique-24-digital-valley', 'https://digital-valley.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-french-tech-perigord', 'https://frenchtechperigord.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-cci-dordogne', 'https://dordogne.cci.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-cpme-24', 'https://cpme24.org/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-cma-dordogne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-nathd', 'https://nathd.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 5, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-grand-perigueux', 'https://www.grandperigueux.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-reussir-le-perigord', 'https://www.reussirleperigord.fr/actualite', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-dordogne-libre', 'https://www.dordognelibre.fr/rss.xml', 200, 'application/rss+xml; charset=UTF-8', 20, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-actu-dordogne', 'https://actu.fr/nouvelle-aquitaine/dordogne_24/rss.xml', 200, 'application/rss+xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-ici-perigord', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 200, 'application/xml', 20, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-24-france3-dordogne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 200, 'text/xml; charset=UTF-8', 30, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-24 : HTTP 200 vérifié le 2026-11-22');
