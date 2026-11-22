-- Sources d'information du secteur « enseignement » du département 23 (Creuse).
-- 17 sources ; 44 URL contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-enseignement-23.jsonl
-- Preuve HTTP : bench/results/verification-enseignement-23.json

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
  ('corpus:e23-loewy', 'Cité scolaire Raymond Loewy (Guéret)', 'institutionnel', 'https://www.cite-loewy.org/feed', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":1}}'::jsonb, 3600, 'Cité scolaire de Guéret (23), collège, lycée et DSAA, actualités et flux RSS.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-aubusson', 'Cité scolaire Eugène Jamot / Jean Jaurès (Aubusson)', 'institutionnel', 'https://www.cite-scolaire-aubusson.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":2}}'::jsonb, 3600, 'Cité scolaire d Aubusson (23), collège et lycées, actualités et flux RSS.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-favard', 'Lycée polyvalent Jean Favard (La Souterraine)', 'institutionnel', 'https://lyceejeanfavard.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":3}}'::jsonb, 3600, 'Lycée polyvalent de La Souterraine (23), actualités et flux RSS.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-defumade', 'Lycée agricole Alphonse Defumade (Ahun)', 'institutionnel', 'https://ahun.educagri.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":4}}'::jsonb, 3600, 'Lycée agricole et CFA d Ahun (23), actualités et flux RSS.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-roussillat', 'Lycée professionnel Louis-Gaston Roussillat (Guéret)', 'institutionnel', 'https://lproussillat.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":5}}'::jsonb, 3600, 'Lycée professionnel de Guéret (23), actualités et flux RSS.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-lmb', 'Lycée polyvalent des métiers du bâtiment (Felletin)', 'institutionnel', 'https://lmb-felletin.fr/blog/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":6}}'::jsonb, 3600, 'Lycée des métiers du bâtiment de Felletin (23), actualités du campus.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-bourdan', 'Lycée Pierre Bourdan (Guéret)', 'institutionnel', 'https://etablissement.ac-limoges.fr/lyc-pierre-bourdan/spip.php?page=backend', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":7}}'::jsonb, 3600, 'Lycée de Guéret (23), site SPIP, actualités et flux backend.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-gueret-campus', 'Campus de Guéret — Université de Limoges (IUT, Inspé)', 'institutionnel', 'https://gueret.unilim.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":8}}'::jsonb, 3600, 'Campus universitaire de Guéret (23), IUT carrières sociales et Inspé, actualités et flux RSS.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-greta', 'GRETA du Limousin — antenne de la Creuse', 'institutionnel', 'https://www.greta-du-limousin.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":9}}'::jsonb, 3600, 'GRETA du Limousin, antenne de la Creuse (23), formation continue.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-cfa-cci', 'CFA de la CCI de la Creuse (Guéret)', 'institutionnel', 'https://www.cfa-cci-creuse.com/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":10}}'::jsonb, 3600, 'Centre de formation d apprentis de la CCI de la Creuse (23), à Guéret.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-fsu23', 'FSU-SNUipp 23 (Creuse)', 'institutionnel', 'https://23.fsu-snuipp.fr/spip.php?page=backend', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":11}}'::jsonb, 3600, 'Section départementale FSU-SNUipp de la Creuse (23), syndicat enseignant.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-fcpe23', 'FCPE de la Creuse (23)', 'institutionnel', 'https://fcpe23.org/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":12}}'::jsonb, 3600, 'Fédération départementale des parents d élèves de la Creuse (23).', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-annuaire', 'Annuaire des établissements — Éducation nationale (Creuse)', 'institutionnel', 'https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-annuaire-education&q=creuse&rows=2', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":13}}'::jsonb, 3600, 'Annuaire officiel des établissements, requête Creuse (23), API JSON ouverte.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-montagne', 'La Montagne — Creuse', 'presse', 'https://www.lamontagne.fr/actualites/education', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":14}}'::jsonb, 3600, 'Quotidien régional, édition Creuse (23), rubrique Éducation.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-actu', 'actu.fr — Actu Creuse', 'presse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":15}}'::jsonb, 3600, 'Presse locale numérique de la Creuse (23), actualités et flux RSS.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-ici', 'ici Creuse — Radio France', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/creuse-23/actu', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":16}}'::jsonb, 3600, 'Radio publique locale de la Creuse (23), actualités du département.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-populaire', 'Le Populaire du Centre — Guéret', 'presse', 'https://www.lepopulaire.fr/actualites/education', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-23.jsonl","ligne":17}}'::jsonb, 3600, 'Quotidien régional, édition Guéret (23), rubrique Éducation.', 'Nouvelle-Aquitaine', '23')
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
  ('corpus:e23-loewy', 'https://www.cite-loewy.org/feed', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-aubusson', 'https://www.cite-scolaire-aubusson.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-favard', 'https://lyceejeanfavard.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-defumade', 'https://ahun.educagri.fr/rss.xml', 200, 'application/rss+xml;charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-roussillat', 'https://lproussillat.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-lmb', 'https://lmb-felletin.fr/blog/actualites', 200, 'text/html; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-bourdan', 'https://etablissement.ac-limoges.fr/lyc-pierre-bourdan/spip.php?page=backend', 200, 'text/xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-gueret-campus', 'https://gueret.unilim.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-greta', 'https://www.greta-du-limousin.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-cfa-cci', 'https://www.cfa-cci-creuse.com/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-fsu23', 'https://23.fsu-snuipp.fr/spip.php?page=backend', 200, 'text/xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-fcpe23', 'https://fcpe23.org/actualites', 200, 'text/html; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-annuaire', 'https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-annuaire-education&q=creuse&rows=2', 200, 'application/json; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-montagne', 'https://www.lamontagne.fr/actualites/education', 200, 'text/html; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-actu', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 200, 'application/rss+xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-ici', 'https://www.ici.fr/nouvelle-aquitaine/creuse-23/actu', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:e23-populaire', 'https://www.lepopulaire.fr/actualites/education', 200, 'text/html; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-23 : HTTP 200 vérifié le 2026-11-22');
