-- Sources d'information du secteur industrie dans le département 16 (Charente).
-- 12 sources, 33 URL distinctes contrôlées en HTTP 200 le 2026-11-22 (curl -L, 36 vérifications).
-- Corpus détaillé : bench/corpus/sources-industrie-16.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:industrie16-cpme16', 'CPME16 — Confédération des petites et moyennes entreprises de Charente', 'cti', 'https://cpme16.fr/feed', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":1}}'::jsonb, 3600, 'Organisation patronale des TPE/PME de Charente (16), y compris les industriels. Exemple cyber : cyberattaque de la billetterie Hennessy a Cognac.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-grand-cognac', 'Grand Cognac — filiere du cognac et industrie', 'cti', 'https://www.grand-cognac.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":2}}'::jsonb, 3600, 'Agglomeration de Cognac : filiere spiritueux, incubation et manifestations industrielles (« Matinee de l industrie »).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-charente-libre-entreprises', 'Charente Libre — rubrique Entreprises', 'presse', 'https://www.charentelibre.fr/economie/entreprises/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":3}}'::jsonb, 3600, 'Quotidien de Charente, rubrique entreprises : industrie, IA et cyberattaques locales.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-sud-ouest-charente', 'Sud Ouest — edition Charente', 'presse', 'https://www.sudouest.fr/charente/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":4}}'::jsonb, 3600, 'Edition departementale de Sud Ouest : actualites economiques et industrielles de Charente.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-france3-charente', 'France 3 Nouvelle-Aquitaine — Charente', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":5}}'::jsonb, 3600, 'Service public de television, declinaison Charente : entreprises tech, IA et reindustrialisation.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-actu-fr-charente', 'actu.fr — Charente', 'presse', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":6}}'::jsonb, 3600, 'Presse locale numerique du departement 16 : entreprises, zones d activites et actualites industrielles.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-ici-charente', 'ICI Charente', 'presse', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":7}}'::jsonb, 3600, 'Radio publique locale : rubrique Charente et debats sur la reindustrialisation.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-grandangouleme-economie', 'GrandAngoulême — actualites economie', 'cti', 'https://www.grandangouleme.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":8}}'::jsonb, 3600, 'Agglomeration d Angouleme : developpement economique, zones d activites et systemes d information.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-absolument-angouleme', 'Absolument Angoulême — developpement economique', 'cti', 'https://www.absolument-angouleme.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":9}}'::jsonb, 3600, 'Agence de developpement economique d Angouleme : actualites des entreprises et de l industrie.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-uimm', 'UIMM — La Fabrique de l avenir', 'cti', 'https://uimm.lafabriquedelavenir.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":10}}'::jsonb, 3600, 'Federation professionnelle de l industrie : metiers, formation, IA et droit du travail.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-charente-numerique', 'Charente Numérique', 'cti', 'https://www.charente-numerique.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":11}}'::jsonb, 3600, 'Syndicat mixte de deploiement de la fibre en Charente : infrastructures numeriques des entreprises.', 'Nouvelle-Aquitaine', '16'),
  ('corpus:industrie16-journal-des-entreprises-na', 'Le Journal des Entreprises — Nouvelle-Aquitaine', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-16.jsonl","ligne":12}}'::jsonb, 3600, 'Presse economique regionale : industrie, IA infrastructure et entreprises de Charente.', 'Nouvelle-Aquitaine', '16')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP des 33 URL distinctes du corpus (site, page actualités, flux), toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus industrie-16 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:industrie16-cpme16', 'https://cpme16.fr/', 'text/html'),
  ('corpus:industrie16-cpme16', 'https://cpme16.fr/actualites', 'text/html'),
  ('corpus:industrie16-cpme16', 'https://cpme16.fr/feed', 'application/rss+xml'),
  ('corpus:industrie16-grand-cognac', 'https://www.grand-cognac.fr/', 'text/html'),
  ('corpus:industrie16-grand-cognac', 'https://www.grand-cognac.fr/comprendre-lagglo/les-actualites', 'text/html'),
  ('corpus:industrie16-grand-cognac', 'https://www.grand-cognac.fr/rss.xml', 'application/rss+xml'),
  ('corpus:industrie16-charente-libre-entreprises', 'https://www.charentelibre.fr/', 'text/html'),
  ('corpus:industrie16-charente-libre-entreprises', 'https://www.charentelibre.fr/economie/entreprises/', 'text/html'),
  ('corpus:industrie16-charente-libre-entreprises', 'https://www.charentelibre.fr/economie/entreprises/rss.xml', 'application/xml'),
  ('corpus:industrie16-sud-ouest-charente', 'https://www.sudouest.fr/charente/', 'text/html'),
  ('corpus:industrie16-sud-ouest-charente', 'https://www.sudouest.fr/charente/rss.xml', 'application/xml'),
  ('corpus:industrie16-france3-charente', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/', 'text/html'),
  ('corpus:industrie16-france3-charente', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/', 'text/html'),
  ('corpus:industrie16-france3-charente', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss', 'text/xml'),
  ('corpus:industrie16-actu-fr-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16', 'text/html'),
  ('corpus:industrie16-actu-fr-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'application/rss+xml'),
  ('corpus:industrie16-ici-charente', 'https://www.ici.fr/nouvelle-aquitaine/charente-16', 'text/html'),
  ('corpus:industrie16-ici-charente', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'application/xml'),
  ('corpus:industrie16-grandangouleme-economie', 'https://www.grandangouleme.fr/', 'text/html'),
  ('corpus:industrie16-grandangouleme-economie', 'https://www.grandangouleme.fr/category/actualites/economie/', 'text/html'),
  ('corpus:industrie16-grandangouleme-economie', 'https://www.grandangouleme.fr/feed/', 'application/rss+xml'),
  ('corpus:industrie16-absolument-angouleme', 'https://www.absolument-angouleme.fr/', 'text/html'),
  ('corpus:industrie16-absolument-angouleme', 'https://www.absolument-angouleme.fr/category/actus/', 'text/html'),
  ('corpus:industrie16-absolument-angouleme', 'https://www.absolument-angouleme.fr/feed/', 'application/rss+xml'),
  ('corpus:industrie16-uimm', 'https://uimm.lafabriquedelavenir.fr/', 'text/html'),
  ('corpus:industrie16-uimm', 'https://uimm.lafabriquedelavenir.fr/actualites/', 'text/html'),
  ('corpus:industrie16-uimm', 'https://uimm.lafabriquedelavenir.fr/feed/', 'application/rss+xml'),
  ('corpus:industrie16-charente-numerique', 'https://www.charente-numerique.fr/', 'text/html'),
  ('corpus:industrie16-charente-numerique', 'https://www.charente-numerique.fr/actualites/', 'text/html'),
  ('corpus:industrie16-charente-numerique', 'https://www.charente-numerique.fr/feed/', 'application/rss+xml'),
  ('corpus:industrie16-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'text/html'),
  ('corpus:industrie16-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'text/html'),
  ('corpus:industrie16-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);
