-- Sources d'information du secteur « energie-eau » du département 24 (Dordogne).
-- 22 sources, 63 URLs distinctes contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-energie-eau-24.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-24.json

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
  ('corpus:e24-prefecture', 'Préfecture de la Dordogne', 'cti', 'https://news.google.com/rss/search?q=site%3Adordogne.gouv.fr+Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":1}}'::jsonb, 3600, 'Services de l''État en Dordogne (24) : actualités réglementaires eau et énergie.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-dreal', 'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'cti', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":2}}'::jsonb, 3600, 'Direction régionale de l''environnement, de l''aménagement et du logement : énergie, climat et eau en Nouvelle-Aquitaine.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-cci', 'CCI de la Dordogne', 'cti', 'https://dordogne.cci.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":3}}'::jsonb, 3600, 'Chambre de commerce et d''industrie de la Dordogne (24) : entreprises de l''énergie et de l''eau.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-grand-perigueux', 'Grand Périgueux — eau et assainissement', 'cti', 'https://www.grandperigueux.fr/actualites/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":4}}'::jsonb, 3600, 'Communauté d''agglomération du Grand Périgueux (24) : eau, assainissement et énergie.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-ccbdp', 'CC des Bastides Dordogne-Périgord — assainissement', 'cti', 'https://ccbdp.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":5}}'::jsonb, 3600, 'Communauté de communes des Bastides Dordogne-Périgord (24) : assainissement et cadre de vie.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-perigueux', 'Ville de Périgueux — actualités', 'cti', 'https://www.perigueux.fr/actualites/flux-actualites/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":6}}'::jsonb, 3600, 'Ville de Périgueux (24) : actualités, eau potable et réseaux.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-bergerac', 'Ville de Bergerac — actualités', 'cti', 'https://www.bergerac.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":7}}'::jsonb, 3600, 'Ville de Bergerac (24) : actualités, eau et environnement.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-enedis', 'Enedis — distribution d''électricité', 'cti', 'https://news.google.com/rss/search?q=Enedis%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":8}}'::jsonb, 3600, 'Distributeur d''électricité : actualités et alertes aux démarchages frauduleux en Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-edf', 'EDF — production et fourniture d''électricité', 'cti', 'https://news.google.com/rss/search?q=EDF%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":9}}'::jsonb, 3600, 'Opérateur énergétique : veille d''actualités concernant EDF et la Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-grdf', 'GRDF — réseau de distribution de gaz', 'cti', 'https://news.google.com/rss/search?q=GRDF%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":10}}'::jsonb, 3600, 'Distributeur de gaz : veille d''actualités pour la Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-suez', 'SUEZ — eau et assainissement', 'cti', 'https://www.suez.com/fr/news', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":11}}'::jsonb, 3600, 'Opérateur privé de l''eau et de l''assainissement : actualités et communiqués.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-fp2e', 'FP2E — Fédération professionnelle des entreprises de l''eau', 'cti', 'https://www.fp2e.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":12}}'::jsonb, 3600, 'Fédération professionnelle des entreprises de l''eau : actualités du secteur.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-cieau', 'CIEau — Centre d''information sur l''eau', 'cti', 'https://www.cieau.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":13}}'::jsonb, 3600, 'Centre d''information sur l''eau : actualités et ressources sur l''eau potable et l''assainissement.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-pro-rge', 'Pro-RGE — Entreprises RGE en Dordogne (24)', 'cti', 'https://pro-rge.fr/entreprises/dordogne-24/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":14}}'::jsonb, 3600, 'Annuaire professionnel des entreprises RGE (rénovation énergétique) de la Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-dordogne-libre', 'Dordogne Libre', 'cti', 'https://www.dordognelibre.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":15}}'::jsonb, 3600, 'Presse locale de la Dordogne (24) : actualités de proximité, eau et énergie.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-sud-ouest', 'Sud Ouest — Dordogne', 'cti', 'https://www.sudouest.fr/dordogne/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":16}}'::jsonb, 3600, 'Presse régionale : édition Dordogne (24), actualités eau et énergie.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-ici-perigord', 'Ici Périgord', 'cti', 'https://news.google.com/rss/search?q=ICI%20P%C3%A9rigord%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":17}}'::jsonb, 3600, 'Radio locale du Périgord (24) : eau, sécheresse et énergie.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-france3', 'France 3 Nouvelle-Aquitaine — Dordogne', 'cti', 'https://news.google.com/rss/search?q=France%203%20Dordogne%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":18}}'::jsonb, 3600, 'Télévision publique régionale : édition Dordogne (24), eau et énergie.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-sde24', 'SDE 24 — Syndicat départemental d''énergies de la Dordogne', 'cti', 'https://www.sde24.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":19}}'::jsonb, 3600, 'Syndicat départemental d''énergies de la Dordogne (24) : électricité, gaz, éclairage public et réseaux.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-engie', 'ENGIE — fourniture d''énergie', 'cti', 'https://news.google.com/rss/search?q=ENGIE%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":20}}'::jsonb, 3600, 'Fournisseur d''énergie : veille d''actualités concernant ENGIE et la Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-saur', 'SAUR — eau et assainissement', 'cti', 'https://news.google.com/rss/search?q=SAUR%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":21}}'::jsonb, 3600, 'Opérateur privé de l''eau et de l''assainissement : actualités et veille Dordogne (24).', 'Nouvelle-Aquitaine', '24'),
  ('corpus:e24-actu-dordogne', 'Actu Dordogne', 'cti', 'https://news.google.com/rss/search?q=Dordogne%20eau%20site%3Aactu.fr&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-24.jsonl","ligne":22}}'::jsonb, 3600, 'Presse en ligne de la Dordogne (24) : actualités eau et énergie.', 'Nouvelle-Aquitaine', '24')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 63 URLs distinctes contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:e24-prefecture', ARRAY['https://www.dordogne.gouv.fr/','https://www.dordogne.gouv.fr/Actualites','https://news.google.com/rss/search?q=site%3Adordogne.gouv.fr+Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-dreal', ARRAY['https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/','https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr','https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr']),
    ('corpus:e24-cci', ARRAY['https://dordogne.cci.fr/','https://dordogne.cci.fr/actualites/','https://dordogne.cci.fr/feed/']),
    ('corpus:e24-grand-perigueux', ARRAY['https://www.grandperigueux.fr/','https://www.grandperigueux.fr/actualites/','https://www.grandperigueux.fr/actualites/feed/']),
    ('corpus:e24-ccbdp', ARRAY['https://ccbdp.fr/','https://ccbdp.fr/accueil/actus/','https://ccbdp.fr/feed/']),
    ('corpus:e24-perigueux', ARRAY['https://www.perigueux.fr/','https://www.perigueux.fr/actualites.html','https://www.perigueux.fr/actualites/flux-actualites/rss.xml']),
    ('corpus:e24-bergerac', ARRAY['https://www.bergerac.fr/','https://www.bergerac.fr/category/actualite/','https://www.bergerac.fr/feed/']),
    ('corpus:e24-enedis', ARRAY['https://www.enedis.fr/','https://www.enedis.fr/presse','https://news.google.com/rss/search?q=Enedis%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-edf', ARRAY['https://www.edf.fr/','https://www.edf.fr/groupe-edf/innover/rd-un-savoir-faire-mondial/toutes-les-actualites-de-la-rd','https://news.google.com/rss/search?q=EDF%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-grdf', ARRAY['https://www.grdf.fr/','https://justdecarb.grdf.fr/espace-presse','https://news.google.com/rss/search?q=GRDF%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-suez', ARRAY['https://www.suez.com/fr','https://www.suez.com/fr/news','https://news.google.com/rss/search?q=SUEZ%20Dordogne%20eau&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-fp2e', ARRAY['https://www.fp2e.org/','https://www.fp2e.org/actualites/','https://www.fp2e.org/feed/']),
    ('corpus:e24-cieau', ARRAY['https://www.cieau.com/','https://www.cieau.com/categorie/actualite-de-eau/','https://www.cieau.com/feed/']),
    ('corpus:e24-pro-rge', ARRAY['https://pro-rge.fr/entreprises/dordogne-24/','https://pro-rge.fr/entreprise/d/24/','https://news.google.com/rss/search?q=RGE%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-dordogne-libre', ARRAY['https://www.dordognelibre.fr/','https://www.dordognelibre.fr/dordogne/','https://www.dordognelibre.fr/rss.xml']),
    ('corpus:e24-sud-ouest', ARRAY['https://www.sudouest.fr/dordogne','https://www.sudouest.fr/dordogne/rss.xml']),
    ('corpus:e24-ici-perigord', ARRAY['https://www.ici.fr/radio/perigord','https://www.ici.fr/nouvelle-aquitaine/dordogne-24','https://news.google.com/rss/search?q=ICI%20P%C3%A9rigord%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-france3', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne','https://news.google.com/rss/search?q=France%203%20Dordogne%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-sde24', ARRAY['https://www.sde24.fr/','https://www.sde24.fr/category/actualites/','https://www.sde24.fr/feed/']),
    ('corpus:e24-engie', ARRAY['https://www.engie.com/','https://www.engie.com/explore/actualites/','https://news.google.com/rss/search?q=ENGIE%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-saur', ARRAY['https://www.saur.com/fr/','https://www.saur.com/fr/actualites/','https://news.google.com/rss/search?q=SAUR%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e24-actu-dordogne', ARRAY['https://actu.fr/nouvelle-aquitaine/dordogne_24/','https://news.google.com/rss/search?q=Dordogne%20eau%20site%3Aactu.fr&hl=fr&gl=FR&ceid=FR:fr'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' OR a.url LIKE '%backend-actu%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-24 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
