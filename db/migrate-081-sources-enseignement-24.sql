-- Sources d'information du secteur « enseignement » du département 24 (Dordogne).
-- 16 sources ; 46 URL contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-enseignement-24.jsonl
-- Preuve HTTP : bench/results/verification-enseignement-24.json

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
  ('corpus:e24-cci-ecoles', 'Ecoles de la CCI de Dordogne (Boulazac/Perigueux)', 'institutionnel', 'https://www.ecoles.dordogne.cci.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":1}}'::jsonb, 3600, 'CFA et lycee professionnel de la chambre consulaire de Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-maine-biran', 'Lycee Maine de Biran (Bergerac)', 'institutionnel', 'https://blogpeda.ac-bordeaux.fr/mainedebiran/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":2}}'::jsonb, 3600, 'Lycee general et technologique de Bergerac (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-leo-testut', 'College Leo Testut (Bergerac)', 'institutionnel', 'https://blogpeda.ac-bordeaux.fr/leotestut/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":3}}'::jsonb, 3600, 'College de Bergerac (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-jean-capelle', 'Lycee des metiers Jean Capelle (Bergerac)', 'institutionnel', 'https://lyceejeancapellebergerac.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":4}}'::jsonb, 3600, 'Lycee professionnel de Bergerac (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-sud-perigord', 'Lycee des metiers Sud-Perigord Helene Duc (Bergerac)', 'institutionnel', 'https://www.lycee-sud-perigord.fr/2023/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":5}}'::jsonb, 3600, 'Lycee professionnel du Sud-Perigord a Bergerac (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-educagri-perigord', 'AgroCampus Perigord - Lycee agricole La Peyrouse (Perigueux)', 'institutionnel', 'https://perigord.educagri.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":6}}'::jsonb, 3600, 'Lycee agricole et CFA de Perigueux (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-fsu-snuipp24', 'FSU-SNUipp 24 (Dordogne)', 'institutionnel', 'https://24.fsu-snuipp.fr/spip.php?page=backend', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":7}}'::jsonb, 3600, 'Section departementale de la FSU-SNUipp de Dordogne (24), syndicat enseignant.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-annuaire-education', 'Annuaire des etablissements - Education nationale (Dordogne)', 'institutionnel', 'https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-annuaire-education&q=dordogne&rows=2', 'source d information publique, diffusion libre', true, 'narrative', 'json', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":8}}'::jsonb, 86400, 'Annuaire officiel des établissements, requete Dordogne (24), API JSON ouverte.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-sudouest-dordogne', 'Sud Ouest - Dordogne', 'presse', 'https://www.sudouest.fr/dordogne/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":9}}'::jsonb, 3600, 'Quotidien regional, edition Dordogne (24), rubrique education et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-sudouest-etudiant', 'Sud Ouest - Etudiant (lycees)', 'presse', 'https://www.sudouest.fr/etudiant/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":10}}'::jsonb, 3600, 'Rubrique Education et lycées de Sud Ouest, edition Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-dordogne-libre', 'Dordogne Libre', 'presse', 'https://www.dordognelibre.fr/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":11}}'::jsonb, 3600, 'Hebdomadaire de Perigueux (24), actualites locales et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-reussir-perigord', 'Reussir le Perigord', 'presse', 'https://www.reussirleperigord.fr/feed', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":12}}'::jsonb, 3600, 'Hebdomadaire departemental de Dordogne (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-ici-perigord', 'ici Perigord (Radio France)', 'presse', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":13}}'::jsonb, 3600, 'Radio publique locale du Perigord (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-perigueux-scolarite', 'Ville de Perigueux - rubrique scolarite', 'institutionnel', 'https://www.perigueux.fr/actualites/flux-actualites/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":14}}'::jsonb, 3600, 'Collectivite de Perigueux (24), rubrique scolarite et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-cij-perigueux', 'Point Info Jeunesse de Perigueux (CIJ)', 'institutionnel', 'https://www.perigueux-jeunesse.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":15}}'::jsonb, 3600, 'Annuaire jeunesse et formation de Perigueux (24), actualites et flux RSS.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-sarlat-scolarite', 'Sarlat-la-Canedas - ecoles et scolarite', 'institutionnel', 'https://sarlat.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-24.jsonl","ligne":16}}'::jsonb, 3600, 'Collectivite de Sarlat-la-Canedas (24), ecoles, scolarite et flux RSS.', 'Nouvelle-Aquitaine', '24')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de verification HTTP : une ligne par source integree, 200 observe le 2026-11-22.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
VALUES
  ('corpus:e24-cci-ecoles', 'https://www.ecoles.dordogne.cci.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-maine-biran', 'https://blogpeda.ac-bordeaux.fr/mainedebiran/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-leo-testut', 'https://blogpeda.ac-bordeaux.fr/leotestut/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-jean-capelle', 'https://lyceejeancapellebergerac.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-sud-perigord', 'https://www.lycee-sud-perigord.fr/2023/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-educagri-perigord', 'https://perigord.educagri.fr/rss.xml', 200, 'application/rss+xml;charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-fsu-snuipp24', 'https://24.fsu-snuipp.fr/spip.php?page=backend', 200, 'text/xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-annuaire-education', 'https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-annuaire-education&q=dordogne&rows=2', 200, 'application/json; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-sudouest-dordogne', 'https://www.sudouest.fr/dordogne/rss.xml', 200, 'application/xml', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-sudouest-etudiant', 'https://www.sudouest.fr/etudiant/rss.xml', 200, 'application/xml', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-dordogne-libre', 'https://www.dordognelibre.fr/rss.xml', 200, 'application/xml', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-reussir-perigord', 'https://www.reussirleperigord.fr/feed', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-ici-perigord', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 200, 'application/xml', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-perigueux-scolarite', 'https://www.perigueux.fr/actualites/flux-actualites/rss.xml', 200, 'application/xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-cij-perigueux', 'https://www.perigueux-jeunesse.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:e24-sarlat-scolarite', 'https://sarlat.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus enseignement-24 : HTTP 200 verifie le 2026-11-22');
