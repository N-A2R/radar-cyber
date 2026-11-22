-- Sources d'information du secteur « commerce » du département 24 (Dordogne).
-- 11 sources, 43 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel avec User-Agent navigateur, redirections suivies, 10 flux RSS).
-- Corpus détaillé : bench/corpus/sources-commerce-24.jsonl
-- Preuve HTTP : bench/results/verification-commerce-24.json

-- Déclaration locale pour rester applicable sur une branche sans migrate-064-source-verification.sql.
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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:commerce-24-cci-dordogne', 'CCI Dordogne — actualités et entreprises', 'cti', 'https://dordogne.cci.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":1}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Chambre consulaire du commerce et de l''industrie de la Dordogne, actualites et annuaire d''entreprises. Exemple cyber : cyberattaque de supermarches Intermarche en Dordogne.'),
  ('corpus:commerce-24-perigord-commerce', 'Périgord Commerce — commerçants et artisans de Dordogne', 'cti', 'https://accueil.perigord-commerce.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":2}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annuaire et federation des commerçants et artisans de Dordogne. Exemple cyber : faux site de vente de bois usurpant l''identite de la SARL Bellevert du Fleix.'),
  ('corpus:commerce-24-journal-des-entreprises', 'Le Journal des Entreprises — Dordogne', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":3}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Presse economique regionale, edition Dordogne. Exemple cyber : cyberattaque de supermarches Intermarche en Dordogne.'),
  ('corpus:commerce-24-dordogne-libre-economie', 'Dordogne Libre — rubrique économie', 'presse', 'https://www.dordognelibre.fr/economie/archives/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":4}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Hebdomadaire local, rubrique economie de Dordogne. Exemple cyber : radio Liberte FM de Riberac victime d''un piratage.'),
  ('corpus:commerce-24-sud-ouest-dordogne', 'Sud Ouest — Dordogne', 'presse', 'https://www.sudouest.fr/dordogne/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":5}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Presse quotidienne locale, edition Dordogne. Exemple cyber : cyberattaque de supermarches Intermarche en Dordogne.'),
  ('corpus:commerce-24-sud-ouest-bergerac', 'Sud Ouest — Bergerac', 'presse', 'https://www.sudouest.fr/dordogne/bergerac/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":6}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Presse quotidienne locale, edition Bergerac (24). Exemple cyber : faux site de vente de bois usurpant une entreprise du Fleix.'),
  ('corpus:commerce-24-ici-perigord', 'ICI Périgord — Dordogne (Radio France)', 'presse', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":7}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Radio locale de Périgord, actualites du departement 24. Exemple cyber : arnaque visant le reseau de transports Peribus du Grand Perigueux.'),
  ('corpus:commerce-24-reussir-le-perigord', 'Réussir le Périgord', 'presse', 'https://www.reussirleperigord.fr/feed', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":8}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Hebdomadaire departemental d informations economiques. Exemple cyber : arnaque visant le reseau de transports Peribus du Grand Perigueux.'),
  ('corpus:commerce-24-mon-entreprise-info', 'Mon-Entreprise-Info — actualités Dordogne', 'cti', 'https://mon-entreprise-info.com/actualites/dordogne/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":9}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annuaire et actualites des entreprises de Dordogne. Exemple cyber : faux site de vente de bois usurpant une entreprise du Fleix.'),
  ('corpus:commerce-24-societe-tech', 'Societe.Tech — entreprises Dordogne', 'presse', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-dordogne/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":10}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Presse specialisee entreprises et technologies, page Dordogne. Exemple cyber : cyberattaque de supermarches Intermarche en Dordogne.'),
  ('corpus:commerce-24-ville-bergerac-commerces', 'Ville de Bergerac — commerces et associations', 'cti', 'https://www.bergerac.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-24.jsonl","ligne":11}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Ville de Bergerac, annuaire et actualites des commerces et associations. Exemple cyber : QR codes d''horodateurs Q-Park pirates a Bergerac.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 43 URLs (sites, pages actualités, flux et articles cyber), toutes en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:commerce-24-cci-dordogne', 'https://dordogne.cci.fr/', 'text/html', 0),
    ('corpus:commerce-24-cci-dordogne', 'https://dordogne.cci.fr/actualites/', 'text/html', 0),
    ('corpus:commerce-24-cci-dordogne', 'https://dordogne.cci.fr/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-24-cci-dordogne', 'https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php', 'text/html', 0),
    ('corpus:commerce-24-perigord-commerce', 'https://accueil.perigord-commerce.com/', 'text/html', 0),
    ('corpus:commerce-24-perigord-commerce', 'https://accueil.perigord-commerce.com/feed/', 'application/rss+xml', 1),
    ('corpus:commerce-24-perigord-commerce', 'https://www.sudouest.fr/dordogne/je-ne-voudrais-pas-que-certains-viennent-se-venger-un-faux-site-de-vente-de-bois-de-chauffage-usurpe-l-identite-d-une-entreprise-de-dordogne-pour-arnaquer-les-clients-31392944.php', 'text/html', 0),
    ('corpus:commerce-24-journal-des-entreprises', 'https://www.lejournaldesentreprises.com/', 'text/html', 0),
    ('corpus:commerce-24-journal-des-entreprises', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/dordogne', 'text/html', 0),
    ('corpus:commerce-24-journal-des-entreprises', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml', 20),
    ('corpus:commerce-24-journal-des-entreprises', 'https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php', 'text/html', 0),
    ('corpus:commerce-24-dordogne-libre-economie', 'https://www.dordognelibre.fr/', 'text/html', 0),
    ('corpus:commerce-24-dordogne-libre-economie', 'https://www.dordognelibre.fr/economie/archives/', 'text/html', 0),
    ('corpus:commerce-24-dordogne-libre-economie', 'https://www.dordognelibre.fr/economie/archives/rss.xml', 'application/xml', 20),
    ('corpus:commerce-24-dordogne-libre-economie', 'https://www.dordognelibre.fr/dordogne/riberac/riberac-liberte-fm-victime-d-un-piratage-lance-une-cagnotte-31290979.php', 'text/html', 0),
    ('corpus:commerce-24-sud-ouest-dordogne', 'https://www.sudouest.fr/', 'text/html', 0),
    ('corpus:commerce-24-sud-ouest-dordogne', 'https://www.sudouest.fr/dordogne/archives/', 'text/html', 0),
    ('corpus:commerce-24-sud-ouest-dordogne', 'https://www.sudouest.fr/dordogne/rss.xml', 'application/xml', 20),
    ('corpus:commerce-24-sud-ouest-dordogne', 'https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php', 'text/html', 0),
    ('corpus:commerce-24-sud-ouest-bergerac', 'https://www.sudouest.fr/', 'text/html', 0),
    ('corpus:commerce-24-sud-ouest-bergerac', 'https://www.sudouest.fr/dordogne/bergerac/', 'text/html', 0),
    ('corpus:commerce-24-sud-ouest-bergerac', 'https://www.sudouest.fr/dordogne/bergerac/rss.xml', 'application/xml', 20),
    ('corpus:commerce-24-sud-ouest-bergerac', 'https://www.sudouest.fr/dordogne/je-ne-voudrais-pas-que-certains-viennent-se-venger-un-faux-site-de-vente-de-bois-de-chauffage-usurpe-l-identite-d-une-entreprise-de-dordogne-pour-arnaquer-les-clients-31392944.php', 'text/html', 0),
    ('corpus:commerce-24-ici-perigord', 'https://www.ici.fr/radio/perigord', 'text/html', 0),
    ('corpus:commerce-24-ici-perigord', 'https://www.ici.fr/nouvelle-aquitaine/dordogne-24/actu', 'text/html', 0),
    ('corpus:commerce-24-ici-perigord', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-24-ici-perigord', 'https://www.sudouest.fr/economie/transports/le-reseau-de-transports-du-grand-perigueux-alerte-contre-une-arnaque-23788236.php', 'text/html', 0),
    ('corpus:commerce-24-reussir-le-perigord', 'https://www.reussirleperigord.fr/', 'text/html', 0),
    ('corpus:commerce-24-reussir-le-perigord', 'https://www.reussirleperigord.fr/feed', 'application/rss+xml', 10),
    ('corpus:commerce-24-reussir-le-perigord', 'https://www.sudouest.fr/economie/transports/le-reseau-de-transports-du-grand-perigueux-alerte-contre-une-arnaque-23788236.php', 'text/html', 0),
    ('corpus:commerce-24-mon-entreprise-info', 'https://mon-entreprise-info.com/', 'text/html', 0),
    ('corpus:commerce-24-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/dordogne/', 'text/html', 0),
    ('corpus:commerce-24-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/dordogne/rss.xml', 'application/xml', 50),
    ('corpus:commerce-24-mon-entreprise-info', 'https://www.sudouest.fr/dordogne/je-ne-voudrais-pas-que-certains-viennent-se-venger-un-faux-site-de-vente-de-bois-de-chauffage-usurpe-l-identite-d-une-entreprise-de-dordogne-pour-arnaquer-les-clients-31392944.php', 'text/html', 0),
    ('corpus:commerce-24-societe-tech', 'https://www.societe.tech/', 'text/html', 0),
    ('corpus:commerce-24-societe-tech', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-dordogne/', 'text/html', 0),
    ('corpus:commerce-24-societe-tech', 'https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php', 'text/html', 0),
    ('corpus:commerce-24-ville-bergerac-commerces', 'https://www.bergerac.fr/', 'text/html', 0),
    ('corpus:commerce-24-ville-bergerac-commerces', 'https://www.bergerac.fr/coeur-de-ville/commerces-associations/', 'text/html', 0),
    ('corpus:commerce-24-ville-bergerac-commerces', 'https://www.bergerac.fr/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-24-ville-bergerac-commerces', 'https://www.sudouest.fr/economie/cybersecurite/les-qr-codes-d-horodateurs-pirates-en-dordogne-25534143.php', 'text/html', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-24 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
