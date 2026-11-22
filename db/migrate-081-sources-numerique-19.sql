-- Sources d'information du secteur « numerique » du departement 19 (Correze).
-- 18 sources, 39 URLs distinctes controlees en HTTP 200 le 2026-11-22 (GET reel, redirections suivies).
-- Corpus detaille : bench/corpus/sources-numerique-19.jsonl
-- Rapport : bench/results/verification-numerique-19.json
-- La table de tracage est declaree ici en complement pour rester applicable sur une branche qui ne contient pas encore migrate-064-source-verification.sql.
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
CREATE INDEX IF NOT EXISTS idx_source_verification_source_date ON source_verification (source_id, verifie_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at ON source_verification (verifie_at DESC);
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:numerique-19-dorsal', 'Dorsal service public du numerique en Limousin (Correze)', 'cti', 'https://www.dorsal.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'syndicat mixte de deploiement de la fibre (19, 23, 87) - Correze (19). Exemple cyber : A Altillac, en Correze, le supermarche Intermarche victime dune cyberattaque https://www.lamontagne.fr/altillac-19120/actualites/a-altillac-en-correze-le-supermarche-intermarche-victime-dune-cyberattaque_15062828/'),
  ('corpus:numerique-19-correze-numerique', 'Correze Numerique portail departemental d''inclusion numerique', 'cti', 'https://www.correzenumerique.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'portail public d''inclusion et de mediation numerique - Correze (19). Exemple cyber : Cyberattaque a la mairie de Sarran (Correze) : 44 000 euros de budget perdus https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/j-en-ai-pleure-victime-d-une-cyberattaque-cette-mairie-perd-44-000-euros-de-son-budget-3174492.html'),
  ('corpus:numerique-19-departement-correze-fibre', 'Departement de la Correze fibre et innovation numerique', 'cti', 'https://www.correze.fr/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'collectivite departementale (fibre, inclusion et innovation numeriques) - Correze (19). Exemple cyber : Cyberattaque a la mairie de Sarran (Correze) : 44 000 euros de budget perdus https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/j-en-ai-pleure-victime-d-une-cyberattaque-cette-mairie-perd-44-000-euros-de-son-budget-3174492.html'),
  ('corpus:numerique-19-nathd', 'NATHD societe publique locale du tres haut debit en Nouvelle-Aquitaine', 'cti', 'https://nathd.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'societe publique locale (fibre, dont la Correze) - Correze (19). Exemple cyber : Le laboratoire Novabio victime de deux cyberattaques : des donnees de sante en fuite https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/'),
  ('corpus:numerique-19-centre-supervision-rural', 'Correze Centre de Supervision Rural', 'cti', 'https://www.supervision.correze.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'centre de supervision numerique du departement (CD19) - Correze (19). Exemple cyber : A Altillac, en Correze, le supermarche Intermarche victime dune cyberattaque https://www.lamontagne.fr/altillac-19120/actualites/a-altillac-en-correze-le-supermarche-intermarche-victime-dune-cyberattaque_15062828/'),
  ('corpus:numerique-19-corrtech', 'CorrTech tiers-lieu numerique des Bains Douches (Tulle)', 'cti', 'https://www.corrtech.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'tiers-lieu de formation et d''inclusion numerique - Correze (19). Exemple cyber : College La Salle de Brive : 8 000 euros de rancon et tous les bulletins perdus apres une cyberattaque https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/le-montant-de-la-rancon-qui-etait-de-8-000-euros-ce-college-perd-tous-les-bulletins-des-eleves-apres-une-cyberattaque-3107128.html'),
  ('corpus:numerique-19-iut-limousin', 'IUT du Limousin formations numeriques (Brive, Tulle)', 'cti', 'https://www.iut.unilim.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'institut universitaire de technologie (informatique) - Correze (19). Exemple cyber : College La Salle de Brive : 8 000 euros de rancon et tous les bulletins perdus apres une cyberattaque https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/le-montant-de-la-rancon-qui-etait-de-8-000-euros-ce-college-perd-tous-les-bulletins-des-eleves-apres-une-cyberattaque-3107128.html'),
  ('corpus:numerique-19-sud-ouest', 'Sud Ouest Correze', 'presse', 'https://www.sudouest.fr/correze/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'presse locale quotidienne - Correze (19). Exemple cyber : Petites entreprises correziennes victimes de cyberattaques : 50 a 60 commandes perdues https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/on-a-perdu-entre-50-et-60-commandes-les-petites-entreprises-victimes-de-cyberattaques-une-cible-privilegiee-pour-les-pirates-informatiques-3110353.html'),
  ('corpus:numerique-19-la-montagne', 'La Montagne Correze', 'presse', 'https://news.google.com/rss/search?q=site%3Alamontagne.fr%20Corr%C3%A8ze%20num%C3%A9rique&hl=fr&gl=FR&ceid=FR%3Afr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'presse locale quotidienne - Correze (19). Exemple cyber : A Altillac, en Correze, le supermarche Intermarche victime dune cyberattaque https://www.lamontagne.fr/altillac-19120/actualites/a-altillac-en-correze-le-supermarche-intermarche-victime-dune-cyberattaque_15062828/'),
  ('corpus:numerique-19-actu-fr', 'actu.fr Correze', 'presse', 'https://news.google.com/rss/search?q=site%3Aactu.fr%20Corr%C3%A8ze%20cyberattaque&hl=fr&gl=FR&ceid=FR%3Afr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'presse locale numerique - Correze (19). Exemple cyber : Petites entreprises correziennes victimes de cyberattaques : 50 a 60 commandes perdues https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/on-a-perdu-entre-50-et-60-commandes-les-petites-entreprises-victimes-de-cyberattaques-une-cible-privilegiee-pour-les-pirates-informatiques-3110353.html'),
  ('corpus:numerique-19-ici-correze', 'ICI Correze (Radio France)', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'radio locale du service public (actualites numeriques) - Correze (19). Exemple cyber : Cyberattaque a Altillac (Correze) : le supermarche Intermarche victime d''une attaque https://www.lamontagne.fr/altillac-19120/actualites/a-altillac-en-correze-le-supermarche-intermarche-victime-dune-cyberattaque_15062828/'),
  ('corpus:numerique-19-france3', 'France 3 Nouvelle-Aquitaine Correze', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'television locale du service public - Correze (19). Exemple cyber : Cyberattaque a la mairie de Sarran (Correze) : 44 000 euros de budget perdus https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/j-en-ai-pleure-victime-d-une-cyberattaque-cette-mairie-perd-44-000-euros-de-son-budget-3174492.html'),
  ('corpus:numerique-19-cybermalveillance', 'Cybermalveillance.gouv.fr actualites cybersecurite', 'cti', 'https://www.cybermalveillance.gouv.fr/feed/atom-flux-actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'dispositif national de lutte contre la cybermalveillance - Correze (19). Exemple cyber : Le laboratoire Novabio victime de deux cyberattaques : des donnees de sante en fuite https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/'),
  ('corpus:numerique-19-numeum', 'Numeum syndicat des metiers du numerique', 'cti', 'https://numeum.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'syndicat professionnel du numerique (antenne Nouvelle-Aquitaine) - Correze (19). Exemple cyber : Petites entreprises correziennes victimes de cyberattaques : 50 a 60 commandes perdues https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/on-a-perdu-entre-50-et-60-commandes-les-petites-entreprises-victimes-de-cyberattaques-une-cible-privilegiee-pour-les-pirates-informatiques-3110353.html'),
  ('corpus:numerique-19-la-vie-correzienne', 'La Vie Correzienne actualites locales', 'presse', 'https://www.laviecorrezienne.fr/actualites-actualites.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'presse locale hebdomadaire - Correze (19). Exemple cyber : Cyberattaque a la mairie de Sarran (Correze) : 44 000 euros de budget perdus https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/j-en-ai-pleure-victime-d-une-cyberattaque-cette-mairie-perd-44-000-euros-de-son-budget-3174492.html'),
  ('corpus:numerique-19-fal19', 'FAL19 pole numerique (Tulle)', 'cti', 'https://fal19.fr/vie-associative/numerique', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'federation d''associations loi 1901 (pole numerique) - Correze (19). Exemple cyber : Cyberattaque a la mairie de Sarran (Correze) : 44 000 euros de budget perdus https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/j-en-ai-pleure-victime-d-une-cyberattaque-cette-mairie-perd-44-000-euros-de-son-budget-3174492.html'),
  ('corpus:numerique-19-les-ptts', 'Les PTTs cybercafe et ateliers numeriques (Tarnac)', 'cti', 'https://lesptts.net/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'association locale (cybercafe, mediation numerique) - Correze (19). Exemple cyber : Le cybercafe des PTTs fait peau neuve (Tarnac, Correze) https://lesptts.net/cybercafe/'),
  ('corpus:numerique-19-mednum19', 'Annuaire de la mediation numerique en Correze (MedNum19)', 'cti', 'https://mednum19.gogocarto.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-19.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'annuaire professionnel de la mediation numerique - Correze (19). Exemple cyber : Cyberattaque du college La Salle de Brive : 8 000 euros de rancon et tous les bulletins perdus https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/le-montant-de-la-rancon-qui-etait-de-8-000-euros-ce-college-perd-tous-les-bulletins-des-eleves-apres-une-cyberattaque-3107128.html');
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;
-- Trace de verification HTTP : 48 roles (sites, pages actualites et flux) sur 39 URLs distinctes, toutes en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:numerique-19-dorsal', 'https://www.dorsal.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-dorsal', 'https://www.dorsal.fr/actu-numerique-limousin/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-dorsal', 'https://www.dorsal.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:numerique-19-correze-numerique', 'https://www.correzenumerique.fr/', 'text/html;charset=utf-8', 0),
    ('corpus:numerique-19-correze-numerique', 'https://www.correzenumerique.fr/actualites', 'text/html;charset=utf-8', 0),
    ('corpus:numerique-19-departement-correze-fibre', 'https://www.correze.fr/', 'text/html;charset=UTF-8', 0),
    ('corpus:numerique-19-departement-correze-fibre', 'https://www.correze.fr/fibre', 'text/html;charset=UTF-8', 0),
    ('corpus:numerique-19-departement-correze-fibre', 'https://www.correze.fr/rss', 'application/rss+xml', 10),
    ('corpus:numerique-19-nathd', 'https://nathd.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-nathd', 'https://nathd.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-nathd', 'https://nathd.fr/feed/', 'application/rss+xml; charset=UTF-8', 5),
    ('corpus:numerique-19-centre-supervision-rural', 'https://www.supervision.correze.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-centre-supervision-rural', 'https://www.supervision.correze.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-corrtech', 'https://www.corrtech.fr/', 'text/html', 0),
    ('corpus:numerique-19-corrtech', 'https://www.corrtech.fr/', 'text/html', 0),
    ('corpus:numerique-19-iut-limousin', 'https://www.iut.unilim.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-iut-limousin', 'https://www.iut.unilim.fr/tous-les-articles/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-iut-limousin', 'https://www.iut.unilim.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:numerique-19-sud-ouest', 'https://www.sudouest.fr/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-sud-ouest', 'https://www.sudouest.fr/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-sud-ouest', 'https://www.sudouest.fr/correze/rss.xml', 'application/xml', 20),
    ('corpus:numerique-19-la-montagne', 'https://www.lamontagne.fr/correze/', 'text/html; charset=utf-8', 0),
    ('corpus:numerique-19-la-montagne', 'https://www.lamontagne.fr/correze/', 'text/html; charset=utf-8', 0),
    ('corpus:numerique-19-la-montagne', 'https://news.google.com/rss/search?q=site%3Alamontagne.fr%20Corr%C3%A8ze%20num%C3%A9rique&hl=fr&gl=FR&ceid=FR%3Afr', 'application/xml; charset=utf-8', 100),
    ('corpus:numerique-19-actu-fr', 'https://actu.fr/nouvelle-aquitaine/correze_19/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-actu-fr', 'https://actu.fr/nouvelle-aquitaine/correze_19/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-actu-fr', 'https://news.google.com/rss/search?q=site%3Aactu.fr%20Corr%C3%A8ze%20cyberattaque&hl=fr&gl=FR&ceid=FR%3Afr', 'application/xml; charset=utf-8', 9),
    ('corpus:numerique-19-ici-correze', 'https://www.ici.fr/nouvelle-aquitaine/correze-19/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-ici-correze', 'https://www.ici.fr/nouvelle-aquitaine/correze-19/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-ici-correze', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:numerique-19-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/rss', 'text/xml; charset=UTF-8', 30),
    ('corpus:numerique-19-cybermalveillance', 'https://www.cybermalveillance.gouv.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-cybermalveillance', 'https://www.cybermalveillance.gouv.fr/blog', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-cybermalveillance', 'https://www.cybermalveillance.gouv.fr/feed/atom-flux-actualites', 'application/rss+xml; charset=utf-8', 20),
    ('corpus:numerique-19-numeum', 'https://numeum.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-numeum', 'https://numeum.fr/les-actualites-numeum/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-numeum', 'https://numeum.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:numerique-19-la-vie-correzienne', 'https://www.laviecorrezienne.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-la-vie-correzienne', 'https://www.laviecorrezienne.fr/actualites-actualites.html', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-fal19', 'https://fal19.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:numerique-19-fal19', 'https://fal19.fr/vie-associative/numerique', 'text/html; charset=utf-8', 0),
    ('corpus:numerique-19-les-ptts', 'https://lesptts.net/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-les-ptts', 'https://lesptts.net/category/lesateliers/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-les-ptts', 'https://lesptts.net/feed/', 'application/rss+xml; charset=UTF-8', 7),
    ('corpus:numerique-19-mednum19', 'https://mednum19.gogocarto.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-19-mednum19', 'https://mednum19.gogocarto.fr/', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus numerique-19 : HTTP 200 verifie le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
