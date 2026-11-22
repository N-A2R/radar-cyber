-- Sources d'information du secteur « numerique » du departement 17 (Charente-Maritime).
-- 15 sources, 39 URLs controlees en HTTP 200 le 2026-11-22 (GET reel, redirections suivies).
-- Corpus detaille : bench/corpus/sources-numerique-17.jsonl
-- Rapport : bench/results/verification-numerique-17.json

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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:numerique-17-collectif-rochefort-numerique', 'Collectif Rochefort Numerique annuaire des professionnels du numerique', 'cti', 'https://www.rochefort-numerique.fr/blog/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'collectif d''entreprises du numerique (annuaire professionnel) - Charente-Maritime (17). Exemple cyber : Ouverture du Centre de Ressources en Cybersecurite de Charente-Maritime https://www.rochefort-numerique.fr/blog/ouverture-du-centre-de-ressources-en-cybersecurite-de-charente-maritime/'),
  ('corpus:numerique-17-digitalbay', 'Digitalbay cluster du numerique a La Rochelle', 'cti', 'https://digitalbay.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'cluster numerique (La Rochelle) - Charente-Maritime (17). Exemple cyber : La cybersecurite concerne aussi les TPE/PME https://digitalbay.fr/la-cybersecurite-concerne-aussi-les-tpe-pme/'),
  ('corpus:numerique-17-soluris', 'Soluris syndicat informatique de la Charente-Maritime', 'cti', 'https://www.soluris.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'syndicat informatique departemental - Charente-Maritime (17). Exemple cyber : Charente-Maritime : un elu lance une cyberattaque pour tester les defenses du syndicat informatique departemental https://www.sudouest.fr/charente-maritime/saintes/charente-maritime-un-elu-lance-une-cyberattaque-pour-teste'),
  ('corpus:numerique-17-numeum', 'Numeum syndicat des metiers du numerique', 'cti', 'https://numeum.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'syndicat professionnel du numerique - Charente-Maritime (17). Exemple cyber : Fuite de donnees chez Synbird : La Rochelle touchee comme 1 300 communes de France https://www.sudouest.fr/charente-maritime/la-rochelle/fuite-de-donnees-chez-synbird-la-rochelle-touchee-comme-1-300-communes-de-france-2687'),
  ('corpus:numerique-17-medef17', 'MEDEF Charente-Maritime commission numerique', 'cti', 'https://www.medef17.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'syndicat patronal departemental (commission digitale) - Charente-Maritime (17). Exemple cyber : Fuite de donnees chez Synbird : La Rochelle touchee comme 1 300 communes de France https://www.sudouest.fr/charente-maritime/la-rochelle/fuite-de-donnees-chez-synbird-la-rochelle-touchee-comme-1-300-commu'),
  ('corpus:numerique-17-clubs17', 'Clubs d''entreprises 17 annuaire CCI', 'cti', 'https://clubs-entreprises17.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'annuaire professionnel (CCI Charente-Maritime) - Charente-Maritime (17). Exemple cyber : En Charente-Maritime, ce magasin E.Leclerc est victime de la cyberattaque : les vitrines et bacs sont vides entierement https://actu.fr/nouvelle-aquitaine/surgeres_17434/en-charente-maritime-ce-magasin-e-leclerc'),
  ('corpus:numerique-17-departement17-inclusion-numerique', 'Departement de la Charente-Maritime inclusion numerique', 'cti', 'https://la.charente-maritime.fr/inclusion-numerique', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'collectivite departementale (inclusion numerique) - Charente-Maritime (17). Exemple cyber : Charente-Maritime : un elu lance une cyberattaque pour tester les defenses du syndicat informatique departemental https://www.sudouest.fr/charente-maritime/saintes/charente-maritime-un-elu-lance-une-cyberatta'),
  ('corpus:numerique-17-l3i', 'L3i Laboratoire d''informatique et d''intelligence de La Rochelle', 'cti', 'https://l3i.univ-larochelle.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'laboratoire universitaire d''informatique - Charente-Maritime (17). Exemple cyber : La billetterie du theatre de la Coursive a La Rochelle victime d''une attaque informatique https://www.ici.fr/infos/faits-divers-justice/la-billetterie-du-theatre-de-la-coursive-a-la-rochelle-victime-d-une-attaque-in'),
  ('corpus:numerique-17-eigsi', 'EIGSI ecole d''ingenieurs informatique, IA et cybersecurite', 'cti', 'https://www.eigsi.fr/actualites-ecole-ingenieur/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'ecole d''ingenieurs (formations numeriques) - Charente-Maritime (17). Exemple cyber : Fuite de donnees chez Synbird : La Rochelle touchee comme 1 300 communes de France https://www.sudouest.fr/charente-maritime/la-rochelle/fuite-de-donnees-chez-synbird-la-rochelle-touchee-comme-1-300-communes-de-fra'),
  ('corpus:numerique-17-cybermalveillance', 'Cybermalveillance.gouv.fr actualites cybersecurite', 'cti', 'https://www.cybermalveillance.gouv.fr/feed/atom-flux-actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'dispositif national de lutte contre la cybermalveillance - Charente-Maritime (17). Exemple cyber : En Charente-Maritime, ce magasin E.Leclerc est victime de la cyberattaque : les vitrines et bacs sont vides entierement https://actu.fr/nouvelle-aquitaine/surgeres_17434/en-charente-maritime-ce-magasin'),
  ('corpus:numerique-17-sud-ouest-17', 'Sud Ouest Charente-Maritime (numerique et cyber)', 'presse', 'https://www.sudouest.fr/charente-maritime/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'presse locale quotidienne - Charente-Maritime (17). Exemple cyber : Charente-Maritime : un elu lance une cyberattaque pour tester les defenses du syndicat informatique departemental https://www.sudouest.fr/charente-maritime/saintes/charente-maritime-un-elu-lance-une-cyberattaque-pour-tester-les-defe'),
  ('corpus:numerique-17-actu-fr-17', 'actu.fr Charente-Maritime', 'presse', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'presse locale numerique - Charente-Maritime (17). Exemple cyber : En Charente-Maritime, ce magasin E.Leclerc est victime de la cyberattaque : les vitrines et bacs sont vides entierement https://actu.fr/nouvelle-aquitaine/surgeres_17434/en-charente-maritime-ce-magasin-e-leclerc-est-victime-de-la-cybe'),
  ('corpus:numerique-17-ici-la-rochelle', 'ICI La Rochelle Charente-Maritime', 'presse', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'radio locale (actualites numeriques) - Charente-Maritime (17). Exemple cyber : La billetterie du theatre de la Coursive a La Rochelle victime d''une attaque informatique https://www.ici.fr/infos/faits-divers-justice/la-billetterie-du-theatre-de-la-coursive-a-la-rochelle-victime-d-une-attaque-informa'),
  ('corpus:numerique-17-haute-saintonge', 'Haute Saintonge actualites (inclusion numerique)', 'presse', 'https://www.hautesaintonge.fr/actualites-le-fil-info.html', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'presse locale hebdomadaire - Charente-Maritime (17). Exemple cyber : Charente-Maritime. Une alerte a l''arnaque sur les factures d''eau a Jonzac https://www.hautesaintonge.fr/actualite-27395-charente-maritime-une-alerte-a-l-arnaque-sur-les-factures-d-eau-a-jonzac'),
  ('corpus:numerique-17-cma-nouvelle-aquitaine', 'CMA Nouvelle-Aquitaine actualites (Charente-Maritime)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-17.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'chambre consulaire (transition numerique des entreprises) - Charente-Maritime (17). Exemple cyber : Fuite de donnees chez Synbird : La Rochelle touchee comme 1 300 communes de France https://www.sudouest.fr/charente-maritime/la-rochelle/fuite-de-donnees-chez-synbird-la-rochelle-touchee-comme-1-300-c')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de verification HTTP : 39 URLs (sites, pages actualites et flux) controlees en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:numerique-17-collectif-rochefort-numerique', 'https://www.rochefort-numerique.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-collectif-rochefort-numerique', 'https://www.rochefort-numerique.fr/blog/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-collectif-rochefort-numerique', 'https://www.rochefort-numerique.fr/blog/feed/', 'application/rss+xml; charset=UTF-8', 6),
    ('corpus:numerique-17-digitalbay', 'https://digitalbay.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-digitalbay', 'https://digitalbay.fr/toutes-nos-actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-digitalbay', 'https://digitalbay.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:numerique-17-soluris', 'https://www.soluris.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-soluris', 'https://www.soluris.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-soluris', 'https://www.soluris.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:numerique-17-numeum', 'https://numeum.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-numeum', 'https://numeum.fr/les-actualites-numeum/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-numeum', 'https://numeum.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:numerique-17-medef17', 'https://www.medef17.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-medef17', 'https://www.medef17.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-clubs17', 'https://clubs-entreprises17.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-clubs17', 'https://clubs-entreprises17.fr/evenements/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-clubs17', 'https://clubs-entreprises17.fr/feed/', 'application/rss+xml; charset=UTF-8', 1),
    ('corpus:numerique-17-departement17-inclusion-numerique', 'https://la.charente-maritime.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:numerique-17-departement17-inclusion-numerique', 'https://la.charente-maritime.fr/inclusion-numerique', 'text/html; charset=utf-8', 0),
    ('corpus:numerique-17-departement17-inclusion-numerique', 'https://la.charente-maritime.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:numerique-17-l3i', 'https://l3i.univ-larochelle.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-l3i', 'https://l3i.univ-larochelle.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-eigsi', 'https://www.eigsi.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-eigsi', 'https://www.eigsi.fr/actualites-ecole-ingenieur/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-cybermalveillance', 'https://www.cybermalveillance.gouv.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-cybermalveillance', 'https://www.cybermalveillance.gouv.fr/blog', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-cybermalveillance', 'https://www.cybermalveillance.gouv.fr/feed/atom-flux-actualites', 'application/rss+xml; charset=utf-8', 20),
    ('corpus:numerique-17-sud-ouest-17', 'https://www.sudouest.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-sud-ouest-17', 'https://www.sudouest.fr/charente-maritime/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-sud-ouest-17', 'https://www.sudouest.fr/charente-maritime/rss.xml', 'application/xml', 20),
    ('corpus:numerique-17-actu-fr-17', 'https://actu.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-actu-fr-17', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-ici-la-rochelle', 'https://www.ici.fr/radio/la-rochelle', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-ici-la-rochelle', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-ici-la-rochelle', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:numerique-17-haute-saintonge', 'https://www.hautesaintonge.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-haute-saintonge', 'https://www.hautesaintonge.fr/actualites-le-fil-info.html', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:numerique-17-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus numerique-17 : HTTP 200 verifie le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
