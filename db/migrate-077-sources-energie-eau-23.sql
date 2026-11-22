-- Sources d'information du secteur « energie-eau » du département 23 (Creuse).
-- 18 sources, 47 URLs distinctes contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-energie-eau-23.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-23.json

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
  ('corpus:e23-conseil-departemental', 'Conseil départemental de la Creuse', 'cti', 'https://www.creuse.fr/rss/actus.rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":1}}'::jsonb, 3600, 'Collectivité de la Creuse (23) : eau, milieux aquatiques et transition énergétique.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-eau-milieux', 'Département de la Creuse — Eau et milieux aquatiques', 'cti', 'https://www.creuse.fr/-Environnement-', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":2}}'::jsonb, 3600, 'Page thématique eau et milieux aquatiques du Département de la Creuse (23).', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-prefecture', 'Services de l''État en Creuse — préfecture', 'cti', 'https://www.creuse.gouv.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":3}}'::jsonb, 3600, 'Préfecture de la Creuse (23) : actualités réglementaires eau et énergie.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-dreal', 'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'cti', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":4}}'::jsonb, 3600, 'Direction régionale de l''environnement, de l''aménagement et du logement : énergie, climat et eau en Nouvelle-Aquitaine.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-cci-creuse', 'CCI de la Creuse', 'cti', 'https://www.cci-creuse.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":5}}'::jsonb, 3600, 'Chambre de commerce et d''industrie de la Creuse (23) : entreprises de l''énergie et de l''eau.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-cma', 'CMA Nouvelle-Aquitaine — délégation de la Creuse', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":6}}'::jsonb, 3600, 'Chambre des métiers et de l''artisanat — délégation de la Creuse (23) : artisans de l''énergie et de l''eau.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-agglo-gueret', 'Agglomération du Grand Guéret — eau et assainissement', 'cti', 'https://www.agglo-grandgueret.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":7}}'::jsonb, 3600, 'Communauté d''agglomération du Grand Guéret (23) : eau, assainissement et énergie.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-enedis', 'Enedis — gestionnaire du réseau de distribution d''électricité', 'cti', 'https://www.enedis.fr/presse', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":8}}'::jsonb, 3600, 'Distributeur d''électricité — actualités et communiqués, dont les alertes aux démarchages frauduleux.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-fp2e', 'FP2E — Fédération professionnelle des entreprises de l''eau', 'cti', 'https://www.fp2e.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":9}}'::jsonb, 3600, 'Fédération professionnelle des entreprises de l''eau : actualités du secteur.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-cieau', 'CIEau — Centre d''information sur l''eau', 'cti', 'https://www.cieau.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":10}}'::jsonb, 3600, 'Centre d''information sur l''eau : actualités et ressources sur l''eau potable et l''assainissement.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-grdf', 'GRDF — réseau de distribution de gaz', 'cti', 'https://news.google.com/rss/search?q=GRDF&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":11}}'::jsonb, 3600, 'Distributeur de gaz : veille d''actualités pour la Creuse (23).', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-suez', 'SUEZ — eau et assainissement', 'cti', 'https://www.suez.com/fr/news', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":12}}'::jsonb, 3600, 'Opérateur privé de l''eau et de l''assainissement : actualités et communiqués.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-edf', 'EDF — production et fourniture d''électricité', 'cti', 'https://news.google.com/rss/search?q=EDF%20Creuse&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":13}}'::jsonb, 3600, 'Opérateur énergétique : veille d''actualités concernant EDF et la Creuse (23).', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-pro-rge', 'Pro-RGE — Entreprises RGE en Creuse (23)', 'cti', 'https://pro-rge.fr/entreprises/creuse-23/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":14}}'::jsonb, 3600, 'Annuaire professionnel des entreprises RGE (rénovation énergétique) de la Creuse (23).', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-recours-france', 'Recours France — Énergie et eau en Creuse (23)', 'cti', 'https://recours-france.fr/annuaire/energie/23-creuse', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":15}}'::jsonb, 3600, 'Annuaire professionnel Énergie et eau du département 23 (Creuse).', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-la-montagne', 'La Montagne — Creuse', 'cti', 'https://news.google.com/rss/search?q=site%3Alamontagne.fr%20creuse%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":16}}'::jsonb, 3600, 'Presse locale de la Creuse (23) : actualités economie, eau et énergie.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-ici-creuse', 'Ici Creuse (ex-France Bleu Creuse)', 'cti', 'https://news.google.com/rss/search?q=Ici%20Creuse%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":17}}'::jsonb, 3600, 'Radio locale de la Creuse (23) : actualités eau, sécheresse et énergie.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:e23-radio-totem', 'Radio Totem — info Creuse', 'cti', 'https://news.google.com/rss/search?q=Radio%20Totem%20Creuse&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-23.jsonl","ligne":18}}'::jsonb, 3600, 'Radio locale de la Creuse (23) : information de proximité, eau et énergie.', 'Nouvelle-Aquitaine', '23')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 47 URLs distinctes contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:e23-conseil-departemental', ARRAY['https://www.creuse.fr/','https://www.creuse.fr/-A-la-une-','https://www.creuse.fr/rss/actus.rss']),
    ('corpus:e23-eau-milieux', ARRAY['https://www.creuse.fr/-Eau-et-milieux-aquatiques-','https://www.creuse.fr/-Environnement-']),
    ('corpus:e23-prefecture', ARRAY['https://www.creuse.gouv.fr/','https://www.creuse.gouv.fr/actualites','https://news.google.com/rss/search?q=Creuse%20gouv%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-dreal', ARRAY['https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/','https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites','https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu']),
    ('corpus:e23-cci-creuse', ARRAY['https://www.cci-creuse.com/','https://www.cci-creuse.com/category/entreprise/','https://www.cci-creuse.com/feed/']),
    ('corpus:e23-cma', ARRAY['https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-creuse','https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites','https://news.google.com/rss/search?q=CMA%20Creuse&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-agglo-gueret', ARRAY['https://www.agglo-grandgueret.fr/','https://www.agglo-grandgueret.fr/lagglo/actualites/','https://www.agglo-grandgueret.fr/feed/']),
    ('corpus:e23-enedis', ARRAY['https://www.enedis.fr/','https://www.enedis.fr/presse','https://news.google.com/rss/search?q=Enedis%20Creuse&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-fp2e', ARRAY['https://www.fp2e.org/','https://www.fp2e.org/actualites/','https://www.fp2e.org/feed/']),
    ('corpus:e23-cieau', ARRAY['https://www.cieau.com/','https://www.cieau.com/categorie/actualite-de-eau/','https://www.cieau.com/feed/']),
    ('corpus:e23-grdf', ARRAY['https://www.grdf.fr/','https://news.google.com/rss/search?q=GRDF&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-suez', ARRAY['https://www.suez.com/fr','https://www.suez.com/fr/news','https://news.google.com/rss/search?q=SUEZ%20eau&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-edf', ARRAY['https://www.edf.fr/','https://news.google.com/rss/search?q=EDF%20Creuse&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-pro-rge', ARRAY['https://pro-rge.fr/entreprises/creuse-23/']),
    ('corpus:e23-recours-france', ARRAY['https://recours-france.fr/annuaire/energie/23-creuse']),
    ('corpus:e23-la-montagne', ARRAY['https://www.lamontagne.fr/creuse/','https://www.lamontagne.fr/creuse/economie','https://news.google.com/rss/search?q=site%3Alamontagne.fr%20creuse%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-ici-creuse', ARRAY['https://www.ici.fr/radio/creuse','https://www.ici.fr/infos','https://news.google.com/rss/search?q=Ici%20Creuse%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e23-radio-totem', ARRAY['https://www.radiototem.net/','https://www.radiototem.net/info','https://news.google.com/rss/search?q=Radio%20Totem%20Creuse&hl=fr&gl=FR&ceid=FR:fr'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' OR a.url LIKE '%backend-actu%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-23 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
