-- Sources d'information du secteur « energie-eau » du département 33 (Gironde).
-- 26 sources, 71 URLs distinctes contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-energie-eau-33.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-33.json

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
  ('corpus:e33-sdeeg', 'SDEEG — Syndicat Départemental Énergie et Environnement de la Gironde', 'cti', 'https://news.google.com/rss/search?q=SDEEG%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 1}}'::jsonb, 3600, 'SDEEG — Syndicat Départemental Énergie et Environnement de la Gironde (syndicat départemental) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-conseil-departemental', 'Conseil départemental de la Gironde', 'cti', 'https://news.google.com/rss/search?q=site%3Agironde.fr%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 2}}'::jsonb, 3600, 'Conseil départemental de la Gironde (collectivité territoriale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-bordeaux-metropole', 'Bordeaux Métropole — eau et énergie', 'cti', 'https://www.bordeaux-metropole.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 3}}'::jsonb, 3600, 'Bordeaux Métropole — eau et énergie (intercommunalité) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-ville-bordeaux', 'Ville de Bordeaux', 'cti', 'https://www.bordeaux.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 4}}'::jsonb, 3600, 'Ville de Bordeaux (collectivité territoriale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-dreal', 'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'cti', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 5}}'::jsonb, 3600, 'DREAL Nouvelle-Aquitaine — énergie, climat et eau (administration régionale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-sud-ouest', 'Sud Ouest — Gironde', 'cti', 'https://www.sudouest.fr/gironde/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 6}}'::jsonb, 3600, 'Sud Ouest — Gironde (presse locale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-actu-fr', 'Actu.fr — Gironde', 'cti', 'https://news.google.com/rss/search?q=Gironde%20eau%20site%3Aactu.fr&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 7}}'::jsonb, 3600, 'Actu.fr — Gironde (presse en ligne) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-ici-gironde', 'ICI Gironde', 'cti', 'https://news.google.com/rss/search?q=ICI%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 8}}'::jsonb, 3600, 'ICI Gironde (radio locale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-france3', 'France 3 Nouvelle-Aquitaine — Gironde', 'cti', 'https://news.google.com/rss/search?q=France%203%20Gironde%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 9}}'::jsonb, 3600, 'France 3 Nouvelle-Aquitaine — Gironde (télévision locale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-haute-gironde', 'Haute Gironde', 'cti', 'https://www.hautegironde.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 10}}'::jsonb, 3600, 'Haute Gironde (presse locale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-enedis', 'Enedis', 'cti', 'https://news.google.com/rss/search?q=Enedis%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 11}}'::jsonb, 3600, 'Enedis (distributeur d''électricité) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-edf', 'EDF', 'cti', 'https://news.google.com/rss/search?q=EDF%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 12}}'::jsonb, 3600, 'EDF (opérateur énergétique) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-grdf', 'GRDF', 'cti', 'https://news.google.com/rss/search?q=GRDF%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 13}}'::jsonb, 3600, 'GRDF (distributeur de gaz) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-engie', 'ENGIE', 'cti', 'https://news.google.com/rss/search?q=ENGIE%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 14}}'::jsonb, 3600, 'ENGIE (opérateur énergétique) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-fp2e', 'FP2E — Fédération professionnelle des entreprises de l''eau', 'cti', 'https://www.fp2e.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 15}}'::jsonb, 3600, 'FP2E — Fédération professionnelle des entreprises de l''eau (fédération professionnelle) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-cieau', 'CIEau — Centre d''information sur l''eau', 'cti', 'https://www.cieau.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 16}}'::jsonb, 3600, 'CIEau — Centre d''information sur l''eau (centre de ressources sur l''eau) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-pro-rge', 'Pro-RGE — Gironde (33)', 'cti', 'https://news.google.com/rss/search?q=RGE%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 17}}'::jsonb, 3600, 'Pro-RGE — Gironde (33) (annuaire professionnel) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-suez', 'SUEZ', 'cti', 'https://news.google.com/rss/search?q=SUEZ%20Gironde%20eau&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 18}}'::jsonb, 3600, 'SUEZ (opérateur privé de l''eau) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-saur', 'SAUR', 'cti', 'https://news.google.com/rss/search?q=SAUR%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 19}}'::jsonb, 3600, 'SAUR (opérateur privé de l''eau) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-bfm-bordeaux', 'BFM Bordeaux', 'cti', 'https://www.bfmtv.com/rss/news-24-7/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 20}}'::jsonb, 3600, 'BFM Bordeaux (télévision locale) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-chambre-agriculture-gironde', 'Chambre d''agriculture de la Gironde — rubrique Énergie', 'cti', 'https://news.google.com/rss/search?q=Gironde%20%C3%A9nergie%20site%3Achambres-agriculture.fr&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 21}}'::jsonb, 3600, 'Chambre d''agriculture de la Gironde — rubrique Énergie (chambre consulaire) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-smegreg', 'SMEGREG — Syndicat mixte EPTB Nappes profondes de Gironde', 'cti', 'https://www.smegreg.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 22}}'::jsonb, 3600, 'SMEGREG — Syndicat mixte EPTB Nappes profondes de Gironde (syndicat mixte / EPTB) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-siea-portes-entre-deux-mers', 'SIEA des Portes de l''Entre-Deux-Mers', 'cti', 'https://news.google.com/rss/search?q=SIEA%20Portes%20de%20l%27Entre-Deux-Mers&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 23}}'::jsonb, 3600, 'SIEA des Portes de l''Entre-Deux-Mers (syndicat d''eau potable et d''assainissement) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-regie-eau-bordeaux-metropole', 'Régie de l''Eau Bordeaux Métropole', 'cti', 'https://news.google.com/rss/search?q=R%C3%A9gie%20de%20l%27Eau%20Bordeaux%20M%C3%A9tropole&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 24}}'::jsonb, 3600, 'Régie de l''Eau Bordeaux Métropole (régie publique de l''eau) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-epidor', 'EPIDOR — EPTB bassin de la Dordogne', 'cti', 'https://news.google.com/rss/search?q=EPIDOR%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 25}}'::jsonb, 3600, 'EPIDOR — EPTB bassin de la Dordogne (établissement public territorial de bassin) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33'),
  ('corpus:e33-ep-garonne', 'Établissement Public Garonne', 'cti', 'https://news.google.com/rss/search?q=Etablissement%20Public%20Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-33.jsonl", "ligne": 26}}'::jsonb, 3600, 'Établissement Public Garonne (établissement public territorial de bassin) : actualités énergie et eau en Gironde (33).', 'Nouvelle-Aquitaine', '33')
ON CONFLICT (id) DO NOTHING;

WITH urls(source_id, liste) AS (
  VALUES
  ('corpus:e33-sdeeg', ARRAY['https://sdeeg33.fr/', 'https://sdeeg33.fr/actualites/', 'https://news.google.com/rss/search?q=SDEEG%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-conseil-departemental', ARRAY['https://www.gironde.fr/', 'https://www.gironde.fr/actualites', 'https://news.google.com/rss/search?q=site%3Agironde.fr%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-bordeaux-metropole', ARRAY['https://www.bordeaux-metropole.fr/', 'https://www.bordeaux-metropole.fr/actualites', 'https://www.bordeaux-metropole.fr/rss.xml']),
  ('corpus:e33-ville-bordeaux', ARRAY['https://www.bordeaux.fr/', 'https://www.bordeaux.fr/toute-l-actualite', 'https://www.bordeaux.fr/rss.xml']),
  ('corpus:e33-dreal', ARRAY['https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr']),
  ('corpus:e33-sud-ouest', ARRAY['https://www.sudouest.fr/gironde/', 'https://www.sudouest.fr/gironde/rss.xml']),
  ('corpus:e33-actu-fr', ARRAY['https://actu.fr/nouvelle-aquitaine/gironde_33/', 'https://news.google.com/rss/search?q=Gironde%20eau%20site%3Aactu.fr&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-ici-gironde', ARRAY['https://www.ici.fr/nouvelle-aquitaine/gironde-33', 'https://news.google.com/rss/search?q=ICI%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-france3', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde', 'https://news.google.com/rss/search?q=France%203%20Gironde%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-haute-gironde', ARRAY['https://www.hautegironde.fr/', 'https://www.hautegironde.fr/rss.xml']),
  ('corpus:e33-enedis', ARRAY['https://www.enedis.fr/', 'https://www.enedis.fr/presse', 'https://news.google.com/rss/search?q=Enedis%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-edf', ARRAY['https://www.edf.fr/', 'https://www.edf.fr/groupe-edf/innover/rd-un-savoir-faire-mondial/toutes-les-actualites-de-la-rd', 'https://news.google.com/rss/search?q=EDF%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-grdf', ARRAY['https://www.grdf.fr/', 'https://justdecarb.grdf.fr/espace-presse', 'https://news.google.com/rss/search?q=GRDF%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-engie', ARRAY['https://www.engie.com/explore/actualites/', 'https://news.google.com/rss/search?q=ENGIE%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-fp2e', ARRAY['https://www.fp2e.org/', 'https://www.fp2e.org/actualites/', 'https://www.fp2e.org/feed/']),
  ('corpus:e33-cieau', ARRAY['https://www.cieau.com/', 'https://www.cieau.com/categorie/actualite-de-eau/', 'https://www.cieau.com/feed/']),
  ('corpus:e33-pro-rge', ARRAY['https://pro-rge.fr/entreprises/gironde-33/', 'https://pro-rge.fr/entreprise/d/33/', 'https://news.google.com/rss/search?q=RGE%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-suez', ARRAY['https://www.suez.com/fr', 'https://www.suez.com/fr/news', 'https://news.google.com/rss/search?q=SUEZ%20Gironde%20eau&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-saur', ARRAY['https://www.saur.com/fr/', 'https://www.saur.com/fr/actualites/', 'https://news.google.com/rss/search?q=SAUR%20Gironde&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-bfm-bordeaux', ARRAY['https://www.bfmtv.com/bordeaux/', 'https://www.bfmtv.com/rss/news-24-7/']),
  ('corpus:e33-chambre-agriculture-gironde', ARRAY['https://gironde.chambres-agriculture.fr/', 'https://gironde.chambres-agriculture.fr/energie-1', 'https://news.google.com/rss/search?q=Gironde%20%C3%A9nergie%20site%3Achambres-agriculture.fr&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-smegreg', ARRAY['https://www.smegreg.org/', 'https://www.smegreg.org/actualites/', 'https://www.smegreg.org/feed/']),
  ('corpus:e33-siea-portes-entre-deux-mers', ARRAY['https://www.siea-portesentredeuxmers.fr/', 'https://www.siea-portesentredeuxmers.fr/actualites', 'https://news.google.com/rss/search?q=SIEA%20Portes%20de%20l%27Entre-Deux-Mers&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-regie-eau-bordeaux-metropole', ARRAY['http://leaubordeauxmetropole.fr/', 'http://leaubordeauxmetropole.fr/actualites', 'https://news.google.com/rss/search?q=R%C3%A9gie%20de%20l%27Eau%20Bordeaux%20M%C3%A9tropole&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-epidor', ARRAY['https://www.eptb-dordogne.fr/', 'https://www.eptb-dordogne.fr/index', 'https://news.google.com/rss/search?q=EPIDOR%20Dordogne&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e33-ep-garonne', ARRAY['https://www.ep-garonne.fr/', 'https://www.ep-garonne.fr/focus', 'https://news.google.com/rss/search?q=Etablissement%20Public%20Garonne&hl=fr&gl=FR&ceid=FR:fr'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url,
       v.code_http, v.content_type, v.items, v.ms, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-33 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
  ('http://leaubordeauxmetropole.fr/', 200, 'text/html; charset=utf-8', 0, 69, 'Régie de L&#039;Eau Bordeaux Métropole'),
  ('http://leaubordeauxmetropole.fr/actualites', 200, 'text/html; charset=utf-8', 0, 71, 'Toutes nos actualités | Régie de L&#039;Eau Bordeaux Métropole'),
  ('https://actu.fr/nouvelle-aquitaine/gironde_33/', 200, 'text/html; charset=UTF-8', 0, 119, 'Actu Gironde | actu.fr'),
  ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde', 200, 'text/html; charset=UTF-8', 0, 134, 'Gironde : actualités et infos en direct, faits-divers, sport, loisir et culture - France 3 Nouvelle-Aquitaine'),
  ('https://gironde.chambres-agriculture.fr/', 200, 'text/html; charset=utf-8', 0, 508, 'Chambre d&#039;Agriculture de la Gironde - Chambre d&#039;agriculture de la Gironde'),
  ('https://gironde.chambres-agriculture.fr/energie-1', 200, 'text/html; charset=utf-8', 0, 336, 'Energie - Chambre d&#039;agriculture de la Gironde'),
  ('https://justdecarb.grdf.fr/espace-presse', 200, 'text/html; charset=utf-8', 0, 268, 'Espace presse | Just decarb'),
  ('https://news.google.com/rss/search?q=EDF%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 32, 366, '"EDF Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=ENGIE%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 32, 80, '"ENGIE Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=EPIDOR%20Dordogne&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 30, 79, '"EPIDOR Dordogne" - Google Actualités'),
  ('https://news.google.com/rss/search?q=Enedis%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 45, 81, '"Enedis Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=Etablissement%20Public%20Garonne&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 34, 69, '"Etablissement Public Garonne" - Google Actualités'),
  ('https://news.google.com/rss/search?q=France%203%20Gironde%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 35, 84, '"France 3 Gironde eau énergie" - Google Actualités'),
  ('https://news.google.com/rss/search?q=GRDF%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 17, 57, '"GRDF Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=Gironde%20%C3%A9nergie%20site%3Achambres-agriculture.fr&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 58, 78, '"Gironde énergie site:chambres-agriculture.fr" - Google Actualités'),
  ('https://news.google.com/rss/search?q=Gironde%20eau%20site%3Aactu.fr&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 100, 88, '"Gironde eau site:actu.fr" - Google Actualités'),
  ('https://news.google.com/rss/search?q=ICI%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 100, 402, '"ICI Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=R%C3%A9gie%20de%20l%27Eau%20Bordeaux%20M%C3%A9tropole&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 43, 281, '"Régie de l''Eau Bordeaux Métropole" - Google Actualités'),
  ('https://news.google.com/rss/search?q=RGE%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 9, 67, '"RGE Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=SAUR%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 10, 58, '"SAUR Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=SDEEG%20Gironde&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 19, 64, '"SDEEG Gironde" - Google Actualités'),
  ('https://news.google.com/rss/search?q=SIEA%20Portes%20de%20l%27Entre-Deux-Mers&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 5, 62, '"SIEA Portes de l''Entre-Deux-Mers" - Google Actualités'),
  ('https://news.google.com/rss/search?q=SUEZ%20Gironde%20eau&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 11, 61, '"SUEZ Gironde eau" - Google Actualités'),
  ('https://news.google.com/rss/search?q=site%3Agironde.fr%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 100, 139, '"site:gironde.fr eau énergie" - Google Actualités'),
  ('https://pro-rge.fr/entreprise/d/33/', 200, 'text/html; charset=utf-8', 0, 412, 'Liste des entreprises RGE en Gironde 33 par commune'),
  ('https://pro-rge.fr/entreprises/gironde-33/', 200, 'text/html; charset=utf-8', 0, 1630, '1400 entreprises RGE en Gironde 33 | Liste Professionnels RGE'),
  ('https://sdeeg33.fr/', 200, 'text/html; charset=UTF-8', 0, 620, 'Syndicat Départemental Energie et Environnement de la Gironde'),
  ('https://sdeeg33.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 630, 'Syndicat Départemental Energie et Environnement de la Gironde'),
  ('https://www.bfmtv.com/bordeaux/', 200, 'text/html; charset=utf-8', 0, 69, 'Actualités Bordeaux: Infos et vidéos de votre ville en continu - BFM'),
  ('https://www.bfmtv.com/rss/news-24-7/', 200, 'application/xml', 30, 47, 'Home Fil actu - actualités'),
  ('https://www.bordeaux-metropole.fr/', 200, 'text/html; charset=UTF-8', 0, 286, 'Accueil Bordeaux Métropole | Bordeaux Métropole'),
  ('https://www.bordeaux-metropole.fr/actualites', 200, 'text/html; charset=UTF-8', 0, 518, 'Actualités de Bordeaux Métropole | Bordeaux Métropole'),
  ('https://www.bordeaux-metropole.fr/rss.xml', 200, 'application/rss+xml; charset=utf-8', 10, 284, 'Bordeaux Métropole'),
  ('https://www.bordeaux.fr/', 200, 'text/html; charset=utf-8', 0, 212, 'Site officiel de la ville de Bordeaux | Bordeaux'),
  ('https://www.bordeaux.fr/rss.xml', 200, 'application/rss+xml; charset=utf-8', 10, 311, 'Site de la ville de Bordeaux'),
  ('https://www.bordeaux.fr/toute-l-actualite', 200, 'text/html; charset=utf-8', 0, 368, 'Toute l&#039;actualité | Site de la ville de Bordeaux'),
  ('https://www.cieau.com/', 200, 'text/html; charset=UTF-8', 0, 623, 'Centre d''information sur l''eau'),
  ('https://www.cieau.com/categorie/actualite-de-eau/', 200, 'text/html; charset=UTF-8', 0, 558, 'L‘actualité de l‘eau | Centre d''information sur l''eau'),
  ('https://www.cieau.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 460, 'Centre d''information sur l''eau'),
  ('https://www.edf.fr/', 200, 'text/html; charset=UTF-8', 0, 121, 'EDF France | Groupe EDF'),
  ('https://www.edf.fr/groupe-edf/innover/rd-un-savoir-faire-mondial/toutes-les-actualites-de-la-rd', 200, 'text/html; charset=UTF-8', 0, 93, 'Toutes les actualités de la R&amp;D | Groupe EDF'),
  ('https://www.enedis.fr/', 200, 'text/html', 0, 343, 'Enedis | Gestionnaire du réseau de distribution d’électricité'),
  ('https://www.enedis.fr/presse', 200, 'text/html; charset=UTF-8', 0, 1262, 'Presse | Enedis'),
  ('https://www.engie.com/explore/actualites/', 200, 'text/html; charset=UTF-8', 0, 171, 'Actualités et tendances - ENGIE'),
  ('https://www.ep-garonne.fr/', 200, 'text/html; charset=utf-8', 0, 359, 'Etablissement Public Garonne - Gascogne &amp; affluents pyrénéens'),
  ('https://www.ep-garonne.fr/focus', 200, 'text/html; charset=utf-8', 0, 257, 'Actualités | Etablissement Public Garonne'),
  ('https://www.eptb-dordogne.fr/', 200, 'text/html; charset=UTF-8', 0, 1182, ''),
  ('https://www.eptb-dordogne.fr/index', 200, 'text/html; charset=UTF-8', 0, 190, ''),
  ('https://www.fp2e.org/', 200, 'text/html; charset=UTF-8', 0, 680, 'Accueil - FP2E'),
  ('https://www.fp2e.org/actualites/', 200, 'text/html; charset=UTF-8', 0, 1848, 'Actualités - FP2E'),
  ('https://www.fp2e.org/feed/', 200, 'application/rss+xml; charset=UTF-8', 2, 647, 'FP2E'),
  ('https://www.gironde.fr/', 200, 'text/html; charset=UTF-8', 0, 193, 'Accueil | Gironde.FR'),
  ('https://www.gironde.fr/actualites', 200, 'text/html; charset=UTF-8', 0, 186, 'Nos actualités | Gironde.FR'),
  ('https://www.grdf.fr/', 200, 'text/html; charset=utf-8', 0, 155, 'GRDF : le réseau de distribution de gaz en France | GRDF.FR'),
  ('https://www.hautegironde.fr/', 200, 'text/html; charset=UTF-8', 0, 395, 'Haute Gironde: Actualités et informations en direct'),
  ('https://www.hautegironde.fr/rss.xml', 200, 'application/xml', 20, 62, 'Haute Gironde: Actualités et informations en direct'),
  ('https://www.ici.fr/nouvelle-aquitaine/gironde-33', 200, 'text/html; charset=UTF-8', 0, 183, 'Gironde (33)  : actualités et podcasts de votre département en direct - ICI'),
  ('https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/', 200, 'text/html; charset=utf-8', 0, 397, 'Accueil | DREAL Nouvelle-Aquitaine'),
  ('https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr', 200, 'text/xml; charset=utf-8', 176, 242, 'DREAL Nouvelle-Aquitaine'),
  ('https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr', 200, 'text/html; charset=utf-8', 0, 343, 'Actualités, page 1 | DREAL Nouvelle-Aquitaine'),
  ('https://www.saur.com/fr/', 200, 'text/html; charset=UTF-8', 0, 368, 'Acteur exclusif de l’eau et des services essentiels | Saur'),
  ('https://www.saur.com/fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 113, 'Actualités : communiqués de presse, articles et annonces | Saur'),
  ('https://www.siea-portesentredeuxmers.fr/', 200, 'text/html; charset=utf-8', 0, 123, 'SIEA des Portes de l''Entre-Deux-Mers'),
  ('https://www.siea-portesentredeuxmers.fr/actualites', 200, 'text/html; charset=utf-8', 0, 1156, 'Actualités | SIEA'),
  ('https://www.smegreg.org/', 200, 'text/html; charset=UTF-8', 0, 1719, 'Accueil - SMEGREG'),
  ('https://www.smegreg.org/actualites/', 200, 'text/html; charset=UTF-8', 0, 1765, 'Actualités - SMEGREG'),
  ('https://www.smegreg.org/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 1594, 'SMEGREG'),
  ('https://www.sudouest.fr/gironde/', 200, 'text/html; charset=UTF-8', 0, 222, 'Gironde : Actualités et info en direct : faits divers, météo, sorties, sport - Sud Ouest'),
  ('https://www.sudouest.fr/gironde/rss.xml', 200, 'application/xml', 20, 808, 'Gironde : Actualités et info en direct : faits divers, météo, sorties, sport - Sud Ouest'),
  ('https://www.suez.com/fr', 200, 'text/html; charset=utf-8', 0, 941, 'SUEZ | Expert des m&#233;tiers de l&#39;eau et des d&#233;chets'),
  ('https://www.suez.com/fr/news', 200, 'text/html; charset=utf-8', 0, 397, 'Toutes nos actualit&#233;s | SUEZ')
) AS v(url, code_http, content_type, items, ms) ON v.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification sv WHERE sv.source_id = u.source_id AND sv.url = a.url);
