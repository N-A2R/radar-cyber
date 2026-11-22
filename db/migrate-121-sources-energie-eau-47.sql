-- Sources d'information du secteur « energie-eau » du département 47 (Lot-et-Garonne).
-- 18 sources, 52 URLs distinctes contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-energie-eau-47.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-47.json

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
  ('corpus:e47-cci47', 'CCI Lot-et-Garonne', 'cti', 'https://news.google.com/rss/search?q=CCI%20Lot-et-Garonne%20energie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 1}}'::jsonb, 3600, 'CCI Lot-et-Garonne (chambre consulaire) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-chambre-agriculture-47', 'Chambre d''agriculture du Lot-et-Garonne', 'cti', 'https://news.google.com/rss/search?q=Chambre%20agriculture%20Lot-et-Garonne%20eau&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 2}}'::jsonb, 3600, 'Chambre d''agriculture du Lot-et-Garonne (chambre consulaire) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-dreal', 'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'cti', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 3}}'::jsonb, 3600, 'DREAL Nouvelle-Aquitaine — énergie, climat et eau (administration régionale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-actu-fr', 'Actu.fr — Lot-et-Garonne', 'cti', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 4}}'::jsonb, 3600, 'Actu.fr — Lot-et-Garonne (presse en ligne) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-ici-47', 'ICI Lot-et-Garonne', 'cti', 'https://news.google.com/rss/search?q=ICI%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 5}}'::jsonb, 3600, 'ICI Lot-et-Garonne (radio locale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-ep-garonne', 'Établissement Public Garonne — Gascogne et affluents pyrénéens', 'cti', 'https://news.google.com/rss/search?q=Etablissement%20Public%20Garonne%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 6}}'::jsonb, 3600, 'Établissement Public Garonne — Gascogne et affluents pyrénéens (établissement public territorial de bassin) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-pro-rge', 'Pro-RGE — Lot-et-Garonne (47)', 'cti', 'https://news.google.com/rss/search?q=RGE%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 7}}'::jsonb, 3600, 'Pro-RGE — Lot-et-Garonne (47) (annuaire professionnel) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-suez', 'SUEZ — eau et déchets', 'cti', 'https://news.google.com/rss/search?q=SUEZ%20Lot-et-Garonne%20eau&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 8}}'::jsonb, 3600, 'SUEZ — eau et déchets (opérateur privé de l''eau) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-saur', 'SAUR — eau et services essentiels', 'cti', 'https://news.google.com/rss/search?q=SAUR%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 9}}'::jsonb, 3600, 'SAUR — eau et services essentiels (opérateur privé de l''eau) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-enedis', 'Enedis — distribution d''électricité', 'cti', 'https://news.google.com/rss/search?q=Enedis%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 10}}'::jsonb, 3600, 'Enedis — distribution d''électricité (distributeur d''électricité) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-47-infos', '47 Infos — presse locale', 'cti', 'https://47infos.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 11}}'::jsonb, 3600, '47 Infos — presse locale (presse locale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-ladepeche-agen', 'La Dépêche du Midi — Agen (47)', 'cti', 'https://www.ladepeche.fr/communes/agen,47001/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 12}}'::jsonb, 3600, 'La Dépêche du Midi — Agen (47) (presse locale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-petit-bleu-agen', 'Le Petit Bleu d''Agen', 'cti', 'https://www.petitbleu.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 13}}'::jsonb, 3600, 'Le Petit Bleu d''Agen (presse locale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-quidam-hebdo', 'Quidam Hebdo — environnement Lot-et-Garonne', 'cti', 'https://quidam-hebdo.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 14}}'::jsonb, 3600, 'Quidam Hebdo — environnement Lot-et-Garonne (hebdomadaire local) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-agglo-agen-eau', 'Agglomération d''Agen — eau et assainissement', 'cti', 'https://news.google.com/rss/search?q=%22Agglom%C3%A9ration%20d%27Agen%22%20eau%20assainissement&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 15}}'::jsonb, 3600, 'Agglomération d''Agen — eau et assainissement (régie publique intercommunale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-ville-agen', 'Ville d''Agen — eau et énergie', 'cti', 'https://news.google.com/rss/search?q=%22Ville%20d%27Agen%22%20eau&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 16}}'::jsonb, 3600, 'Ville d''Agen — eau et énergie (collectivité territoriale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-conseil-departemental-47', 'Conseil départemental de Lot-et-Garonne', 'cti', 'https://news.google.com/rss/search?q=%22Lot-et-Garonne%22%20eau&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 17}}'::jsonb, 3600, 'Conseil départemental de Lot-et-Garonne (collectivité territoriale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47'),
  ('corpus:e47-cpme-47', 'CPME Lot-et-Garonne', 'cti', 'https://news.google.com/rss/search?q=%22CPME%2047%22%20energie&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus": {"fichier": "sources-energie-eau-47.jsonl", "ligne": 18}}'::jsonb, 3600, 'CPME Lot-et-Garonne (chambre patronale) : actualités énergie et eau en Lot-et-Garonne (47).', 'Nouvelle-Aquitaine', '47')
ON CONFLICT (id) DO NOTHING;

WITH urls(source_id, liste) AS (
  VALUES
  ('corpus:e47-cci47', ARRAY['https://www.cci47.fr/', 'https://cci47.fr/actualites/', 'https://news.google.com/rss/search?q=CCI%20Lot-et-Garonne%20energie&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-chambre-agriculture-47', ARRAY['https://lot-et-garonne.chambres-agriculture.fr/', 'https://lot-et-garonne.chambres-agriculture.fr/actualites', 'https://news.google.com/rss/search?q=Chambre%20agriculture%20Lot-et-Garonne%20eau&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-dreal', ARRAY['https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr']),
  ('corpus:e47-actu-fr', ARRAY['https://www.actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml']),
  ('corpus:e47-ici-47', ARRAY['https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'https://news.google.com/rss/search?q=ICI%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-ep-garonne', ARRAY['https://www.ep-garonne.fr/', 'https://www.ep-garonne.fr/focus', 'https://news.google.com/rss/search?q=Etablissement%20Public%20Garonne%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-pro-rge', ARRAY['https://pro-rge.fr/entreprises/lot-et-garonne-47/', 'https://pro-rge.fr/entreprise/d/47/', 'https://news.google.com/rss/search?q=RGE%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-suez', ARRAY['https://www.suez.com/fr', 'https://www.suez.com/fr/news', 'https://news.google.com/rss/search?q=SUEZ%20Lot-et-Garonne%20eau&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-saur', ARRAY['https://www.saur.com/fr/', 'https://www.saur.com/fr/actualites/', 'https://news.google.com/rss/search?q=SAUR%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-enedis', ARRAY['https://www.enedis.fr/', 'https://www.enedis.fr/presse', 'https://news.google.com/rss/search?q=Enedis%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-47-infos', ARRAY['https://47infos.fr/', 'https://47infos.fr/category/societe/', 'https://47infos.fr/feed/']),
  ('corpus:e47-ladepeche-agen', ARRAY['https://www.ladepeche.fr/communes/agen,47001/', 'https://www.ladepeche.fr/actu/environnement/', 'https://www.ladepeche.fr/communes/agen,47001/rss.xml']),
  ('corpus:e47-petit-bleu-agen', ARRAY['https://www.petitbleu.fr/', 'https://www.petitbleu.fr/actu/environnement/', 'https://www.petitbleu.fr/rss.xml']),
  ('corpus:e47-quidam-hebdo', ARRAY['https://quidam-hebdo.com/', 'https://quidam-hebdo.com/category/environnement-lot-et-garonne/', 'https://quidam-hebdo.com/feed/']),
  ('corpus:e47-agglo-agen-eau', ARRAY['https://www.agglo-agen.net/', 'https://www.agglo-agen.net/vie-quotidienne/eau-et-assainissement/eau-et-assainissement-actualites-sur-le-territoire', 'https://news.google.com/rss/search?q=%22Agglom%C3%A9ration%20d%27Agen%22%20eau%20assainissement&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-ville-agen', ARRAY['https://www.agen.fr/', 'https://www.agen.fr/en-ce-moment/actualites', 'https://news.google.com/rss/search?q=%22Ville%20d%27Agen%22%20eau&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-conseil-departemental-47', ARRAY['https://www.lotetgaronne.fr/accueil', 'https://www.lotetgaronne.fr/actualites', 'https://news.google.com/rss/search?q=%22Lot-et-Garonne%22%20eau&hl=fr&gl=FR&ceid=FR:fr']),
  ('corpus:e47-cpme-47', ARRAY['https://www.cpme47.fr/', 'https://www.cpme47.fr/actualites/', 'https://news.google.com/rss/search?q=%22CPME%2047%22%20energie&hl=fr&gl=FR&ceid=FR:fr'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url,
       v.code_http, v.content_type, v.items, v.ms, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-47 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
  ('https://www.cci47.fr/', 200, 'text/html; charset=UTF-8', 0, 738, 'CCI Lot-et-Garonne | Le Partenaire des Entreprises et des Territoires du 47'),
  ('https://cci47.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 695, 'CCI Lot-et-Garonne | Le Partenaire des Entreprises et des Territoires du 47'),
  ('https://news.google.com/rss/search?q=CCI%20Lot-et-Garonne%20energie&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 9, 282, '"CCI Lot-et-Garonne energie" - Google Actualités'),
  ('https://lot-et-garonne.chambres-agriculture.fr/', 200, 'text/html; charset=utf-8', 0, 432, 'Chambre agriculture de Lot et Garonne - Chambre agriculture du lot et Garonne'),
  ('https://lot-et-garonne.chambres-agriculture.fr/actualites', 200, 'text/html; charset=utf-8', 0, 681, 'Actualités - Chambre agriculture du lot et Garonne'),
  ('https://news.google.com/rss/search?q=Chambre%20agriculture%20Lot-et-Garonne%20eau&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 21, 245, '"Chambre agriculture Lot-et-Garonne eau" - Google Actualités'),
  ('https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/', 200, 'text/html; charset=utf-8', 0, 1872, 'Accueil | DREAL Nouvelle-Aquitaine'),
  ('https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr', 200, 'text/html; charset=utf-8', 0, 2800, 'Actualités, page 1 | DREAL Nouvelle-Aquitaine'),
  ('https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu&lang=fr', 200, 'text/xml; charset=utf-8', 176, 255, 'DREAL Nouvelle-Aquitaine'),
  ('https://www.actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 200, 'text/html; charset=UTF-8', 0, 249, 'Actu Lot-et-Garonne | actu.fr'),
  ('https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml', 200, 'application/rss+xml; charset=utf-8', 0, 77, 'Lot-et-Garonne - L''actualité en continu - actu.fr'),
  ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 200, 'text/html; charset=UTF-8', 0, 215, 'Lot-et-Garonne (47) : actualités et podcasts de votre département en direct - ICI'),
  ('https://news.google.com/rss/search?q=ICI%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 38, 302, '"ICI Lot-et-Garonne" - Google Actualités'),
  ('https://www.ep-garonne.fr/', 200, 'text/html; charset=utf-8', 0, 490, 'Etablissement Public Garonne - Gascogne &amp; affluents pyrénéens'),
  ('https://www.ep-garonne.fr/focus', 200, 'text/html; charset=utf-8', 0, 156, 'Actualités | Etablissement Public Garonne'),
  ('https://news.google.com/rss/search?q=Etablissement%20Public%20Garonne%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 34, 280, '"Etablissement Public Garonne Lot-et-Garonne" - Google Actualités'),
  ('https://pro-rge.fr/entreprises/lot-et-garonne-47/', 200, 'text/html; charset=utf-8', 0, 730, '471 entreprises RGE en Lot-et-Garonne 47 | Liste Professionnels RGE'),
  ('https://pro-rge.fr/entreprise/d/47/', 200, 'text/html; charset=utf-8', 0, 740, 'Liste des entreprises RGE en Lot-et-Garonne 47 par commune'),
  ('https://news.google.com/rss/search?q=RGE%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 39, 276, '"RGE Lot-et-Garonne" - Google Actualités'),
  ('https://www.suez.com/fr', 200, 'text/html; charset=utf-8', 0, 442, 'SUEZ | Expert des m&#233;tiers de l&#39;eau et des d&#233;chets'),
  ('https://www.suez.com/fr/news', 200, 'text/html; charset=utf-8', 0, 515, 'Toutes nos actualit&#233;s | SUEZ'),
  ('https://news.google.com/rss/search?q=SUEZ%20Lot-et-Garonne%20eau&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 49, 311, '"SUEZ Lot-et-Garonne eau" - Google Actualités'),
  ('https://www.saur.com/fr/', 200, 'text/html; charset=UTF-8', 0, 160, 'Acteur exclusif de l’eau et des services essentiels | Saur'),
  ('https://www.saur.com/fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 369, 'Actualités : communiqués de presse, articles et annonces | Saur'),
  ('https://news.google.com/rss/search?q=SAUR%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 30, 253, '"SAUR Lot-et-Garonne" - Google Actualités'),
  ('https://www.enedis.fr/', 200, 'text/html', 0, 110, 'Enedis | Gestionnaire du réseau de distribution d’électricité'),
  ('https://www.enedis.fr/presse', 200, 'text/html; charset=UTF-8', 0, 127, 'Presse | Enedis'),
  ('https://news.google.com/rss/search?q=Enedis%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 25, 241, '"Enedis Lot-et-Garonne" - Google Actualités'),
  ('https://47infos.fr/', 200, 'text/html; charset=UTF-8', 0, 484, '-'),
  ('https://47infos.fr/category/societe/', 200, 'text/html; charset=UTF-8', 0, 157, 'Société -'),
  ('https://47infos.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 332, ''),
  ('https://www.ladepeche.fr/communes/agen,47001/', 200, 'text/html; charset=UTF-8', 0, 173, 'Actualités Agen - ladepeche.fr'),
  ('https://www.ladepeche.fr/actu/environnement/', 200, 'text/html; charset=UTF-8', 0, 143, 'Environnement - ladepeche.fr'),
  ('https://www.ladepeche.fr/communes/agen,47001/rss.xml', 200, 'text/xml; charset=UTF-8', 25, 101, 'Agen'),
  ('https://www.petitbleu.fr/', 200, 'text/html; charset=UTF-8', 0, 164, 'Actualités et infos d''Agen et sa région - À la une - petitbleu.fr'),
  ('https://www.petitbleu.fr/actu/environnement/', 200, 'text/html; charset=UTF-8', 0, 154, 'Environnement : Toute l''actualité environnementale - petitbleu.fr'),
  ('https://www.petitbleu.fr/rss.xml', 200, 'text/xml; charset=UTF-8', 100, 145, 'Actualités et infos d&#039;Agen et sa région - À la une'),
  ('https://quidam-hebdo.com/', 200, 'text/html; charset=UTF-8', 0, 705, 'Accueil - Quidam Hebdo'),
  ('https://quidam-hebdo.com/category/environnement-lot-et-garonne/', 200, 'text/html; charset=UTF-8', 0, 473, 'Archives des Environnement - Quidam Hebdo'),
  ('https://quidam-hebdo.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 376, 'Quidam Hebdo'),
  ('https://www.agglo-agen.net/', 200, 'text/html; charset=utf-8', 0, 232, 'Agglomération d''Agen'),
  ('https://www.agglo-agen.net/vie-quotidienne/eau-et-assainissement/eau-et-assainissement-actualites-sur-le-territoire', 200, 'text/html; charset=utf-8', 0, 206, 'Eau et Assainissement : actualités sur le territoire'),
  ('https://news.google.com/rss/search?q=%22Agglom%C3%A9ration%20d%27Agen%22%20eau%20assainissement&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 9, 66, '""Agglomération d''Agen" eau assainissement" - Google Actualités'),
  ('https://www.agen.fr/', 200, 'text/html; charset=utf-8', 0, 1455, 'Ville d''Agen'),
  ('https://www.agen.fr/en-ce-moment/actualites', 200, 'text/html; charset=utf-8', 0, 494, 'Actualités'),
  ('https://news.google.com/rss/search?q=%22Ville%20d%27Agen%22%20eau&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 10, 74, '""Ville d''Agen" eau" - Google Actualités'),
  ('https://www.lotetgaronne.fr/accueil', 200, 'text/html;charset=utf-8', 0, 288, 'Conseil départemental de Lot-et-Garonne à Agen (cœur du Sud-Ouest/ Nouvelle-Aquitaine)'),
  ('https://www.lotetgaronne.fr/actualites', 200, 'text/html;charset=utf-8', 0, 336, 'Actualités'),
  ('https://news.google.com/rss/search?q=%22Lot-et-Garonne%22%20eau&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 59, 300, '""Lot-et-Garonne" eau" - Google Actualités'),
  ('https://www.cpme47.fr/', 200, 'text/html; charset=UTF-8', 0, 170, 'Confédération des petites et moyennes entreprises du Lot-et-Garonne'),
  ('https://www.cpme47.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 136, 'Nos actualités - CPME 47'),
  ('https://news.google.com/rss/search?q=%22CPME%2047%22%20energie&hl=fr&gl=FR&ceid=FR:fr', 200, 'application/xml; charset=utf-8', 0, 236, '""CPME 47" energie" - Google Actualités')
) AS v(url, code_http, content_type, items, ms) ON v.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification sv WHERE sv.source_id = u.source_id AND sv.url = a.url);
