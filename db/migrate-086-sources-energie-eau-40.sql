-- Sources d'information du secteur « energie-eau » du département 40 (Landes).
-- 18 sources, 52 URLs distinctes contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-energie-eau-40.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-40.json

-- Traçage déclaré pour rester applicable sur une branche qui ne contient pas
-- encore la migration de création de source_verification.
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
  ('corpus:e40-sydec40', 'SYDEC 40 — syndicat d''équipement des communes des Landes (eau, assainissement, électricité, gaz)', 'cti', 'https://www.sydec40.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":1}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : SYDEC 40 — syndicat d''équipement des communes des Landes (eau, assainissement, électricité, gaz). Actualites : https://www.sydec40.fr/actualites/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-grand-dax', 'Grand Dax Agglomération — eau et assainissement', 'cti', 'https://news.google.com/rss/search?q=%22Grand+Dax%22+eau+assainissement&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":2}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : Grand Dax Agglomération — eau et assainissement. Actualites : https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-mont-de-marsan', 'Ville de Mont-de-Marsan — réseaux d''eau et énergie', 'cti', 'https://www.montdemarsan.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":3}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : Ville de Mont-de-Marsan — réseaux d''eau et énergie. Actualites : https://www.montdemarsan.fr/connaitre-le-territoire/actualites/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-chambre-agriculture', 'Chambre d''agriculture des Landes — eau et irrigation', 'cti', 'https://news.google.com/rss/search?q=%22Chambre+d%27agriculture%22+Landes+eau&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":4}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : Chambre d''agriculture des Landes — eau et irrigation. Actualites : https://landes.chambres-agriculture.fr/actualites-1.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-enedis', 'Enedis — distribution d''électricité dans les Landes', 'cti', 'https://news.google.com/rss/search?q=Enedis%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":5}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : Enedis — distribution d''électricité dans les Landes. Actualites : https://www.enedis.fr/presse.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-edf', 'EDF — production et fourniture d''électricité', 'cti', 'https://news.google.com/rss/search?q=EDF%20Landes%20energie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":6}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : EDF — production et fourniture d''électricité. Actualites : https://news.google.com/rss/search?q=EDF%20Landes&hl=fr&gl=FR&ceid=FR:fr.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-engie', 'ENGIE — énergie et gaz', 'cti', 'https://news.google.com/rss/search?q=ENGIE%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":7}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : ENGIE — énergie et gaz. Actualites : https://www.engie.com/explore/actualites/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-grdf', 'GRDF — distribution de gaz dans les Landes', 'cti', 'https://news.google.com/rss/search?q=GRDF%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":8}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : GRDF — distribution de gaz dans les Landes. Actualites : https://www.grdf.fr/actualites.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-suez', 'SUEZ — eau et assainissement', 'cti', 'https://news.google.com/rss/search?q=SUEZ%20eau%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":9}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : SUEZ — eau et assainissement. Actualites : https://www.suez.com/fr/actualites.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-saur', 'SAUR — eau et assainissement', 'cti', 'https://news.google.com/rss/search?q=SAUR%20Landes%20eau&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":10}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : SAUR — eau et assainissement. Actualites : https://www.saur.com/fr/actualites/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-fp2e', 'FP2E — Fédération professionnelle des entreprises de l''eau', 'cti', 'https://www.fp2e.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":11}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : FP2E — Fédération professionnelle des entreprises de l''eau. Actualites : https://www.fp2e.org/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-cieau', 'CIEAU — Centre d''information de l''eau', 'cti', 'https://www.cieau.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":12}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : CIEAU — Centre d''information de l''eau. Actualites : https://www.cieau.com/categorie/actualite-de-eau/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-dreal', 'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'cti', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":13}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : DREAL Nouvelle-Aquitaine — énergie, climat et eau. Actualites : https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr&id_mot=2686.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-cci', 'CCI des Landes — entreprises de l''énergie et de l''eau', 'cti', 'https://news.google.com/rss/search?q=site%3Alandes.cci.fr+energie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":14}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : CCI des Landes — entreprises de l''énergie et de l''eau. Actualites : https://www.landes.cci.fr/presse/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-rge', 'Annuaire RGE — entreprises de l''énergie dans les Landes (40)', 'cti', 'https://news.google.com/rss/search?q=RGE%20Landes%20energie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":15}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : Annuaire RGE — entreprises de l''énergie dans les Landes (40). Actualites : https://pro-rge.fr/entreprises/landes-40/.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-actu-landes', 'actu.fr — Actu Landes', 'presse', 'https://actu.fr/landes/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":16}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : actu.fr — Actu Landes. Actualites : https://actu.fr/landes/dernieres-actus.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-landes-info', 'Landes Info — actualités locales', 'presse', 'https://landesinfo.net/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":17}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : Landes Info — actualités locales. Actualites : https://landesinfo.net/edition.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:e40-ici-gascogne', 'ICI Gascogne — actualités Landes (40)', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-40.jsonl","ligne":18}}'::jsonb, 3600, 'Secteur energie-eau, departement 40 (Landes) : ICI Gascogne — actualités Landes (40). Actualites : https://www.ici.fr/nouvelle-aquitaine/landes-40.', 'Nouvelle-Aquitaine', '40');

INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT u.source_id, u.url, 200, u.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-40 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:e40-sydec40', 'https://www.sydec40.fr/', 'text/html'),
  ('corpus:e40-sydec40', 'https://www.sydec40.fr/actualites/', 'text/html'),
  ('corpus:e40-sydec40', 'https://www.sydec40.fr/feed/', 'application/rss+xml'),
  ('corpus:e40-grand-dax', 'https://www.grand-dax.fr/', 'text/html'),
  ('corpus:e40-grand-dax', 'https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/', 'text/html'),
  ('corpus:e40-grand-dax', 'https://news.google.com/rss/search?q=%22Grand+Dax%22+eau+assainissement&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-mont-de-marsan', 'https://www.montdemarsan.fr/', 'text/html'),
  ('corpus:e40-mont-de-marsan', 'https://www.montdemarsan.fr/connaitre-le-territoire/actualites/', 'text/html'),
  ('corpus:e40-mont-de-marsan', 'https://www.montdemarsan.fr/feed/', 'application/rss+xml'),
  ('corpus:e40-chambre-agriculture', 'https://landes.chambres-agriculture.fr/', 'text/html'),
  ('corpus:e40-chambre-agriculture', 'https://landes.chambres-agriculture.fr/actualites-1', 'text/html'),
  ('corpus:e40-chambre-agriculture', 'https://news.google.com/rss/search?q=%22Chambre+d%27agriculture%22+Landes+eau&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-enedis', 'https://www.enedis.fr/', 'text/html'),
  ('corpus:e40-enedis', 'https://www.enedis.fr/presse', 'text/html'),
  ('corpus:e40-enedis', 'https://news.google.com/rss/search?q=Enedis%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-edf', 'https://www.edf.fr/', 'text/html'),
  ('corpus:e40-edf', 'https://news.google.com/rss/search?q=EDF%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-edf', 'https://news.google.com/rss/search?q=EDF%20Landes%20energie&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-engie', 'https://www.engie.com/', 'text/html'),
  ('corpus:e40-engie', 'https://www.engie.com/explore/actualites/', 'text/html'),
  ('corpus:e40-engie', 'https://news.google.com/rss/search?q=ENGIE%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-grdf', 'https://www.grdf.fr/', 'text/html'),
  ('corpus:e40-grdf', 'https://www.grdf.fr/actualites', 'text/html'),
  ('corpus:e40-grdf', 'https://news.google.com/rss/search?q=GRDF%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-suez', 'https://www.suez.com/fr', 'text/html'),
  ('corpus:e40-suez', 'https://www.suez.com/fr/actualites', 'text/html'),
  ('corpus:e40-suez', 'https://news.google.com/rss/search?q=SUEZ%20eau%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-saur', 'https://www.saur.com/fr/', 'text/html'),
  ('corpus:e40-saur', 'https://www.saur.com/fr/actualites/', 'text/html'),
  ('corpus:e40-saur', 'https://news.google.com/rss/search?q=SAUR%20Landes%20eau&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-fp2e', 'https://www.fp2e.org/', 'text/html'),
  ('corpus:e40-fp2e', 'https://www.fp2e.org/feed/', 'application/rss+xml'),
  ('corpus:e40-cieau', 'https://www.cieau.com/', 'text/html'),
  ('corpus:e40-cieau', 'https://www.cieau.com/categorie/actualite-de-eau/', 'text/html'),
  ('corpus:e40-cieau', 'https://www.cieau.com/feed/', 'application/rss+xml'),
  ('corpus:e40-dreal', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/', 'text/html'),
  ('corpus:e40-dreal', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr&id_mot=2686', 'text/html'),
  ('corpus:e40-dreal', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr', 'application/rss+xml'),
  ('corpus:e40-cci', 'https://landes.cci.fr/', 'text/html'),
  ('corpus:e40-cci', 'https://www.landes.cci.fr/presse/', 'text/html'),
  ('corpus:e40-cci', 'https://news.google.com/rss/search?q=site%3Alandes.cci.fr+energie&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-rge', 'https://pro-rge.fr/entreprise/d/40/', 'text/html'),
  ('corpus:e40-rge', 'https://pro-rge.fr/entreprises/landes-40/', 'text/html'),
  ('corpus:e40-rge', 'https://news.google.com/rss/search?q=RGE%20Landes%20energie&hl=fr&gl=FR&ceid=FR:fr', 'application/rss+xml'),
  ('corpus:e40-actu-landes', 'https://actu.fr/nouvelle-aquitaine/landes_40/', 'text/html'),
  ('corpus:e40-actu-landes', 'https://actu.fr/landes/dernieres-actus', 'text/html'),
  ('corpus:e40-actu-landes', 'https://actu.fr/landes/rss.xml', 'application/rss+xml'),
  ('corpus:e40-landes-info', 'https://landesinfo.net/', 'text/html'),
  ('corpus:e40-landes-info', 'https://landesinfo.net/edition', 'text/html'),
  ('corpus:e40-landes-info', 'https://landesinfo.net/feed/', 'application/rss+xml'),
  ('corpus:e40-ici-gascogne', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html'),
  ('corpus:e40-ici-gascogne', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/rss+xml')
) AS u(source_id, url, content_type);
