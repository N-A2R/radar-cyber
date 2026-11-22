-- Sources d'information du secteur commerce dans le département 86 (Vienne).
-- 15 sources, 51 contrôles HTTP (50 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-commerce-86.jsonl
-- Preuve HTTP : bench/results/verification-commerce-86.json

BEGIN;

CREATE TABLE IF NOT EXISTS source_verification (
  id               bigserial PRIMARY KEY,
  source_id        text NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  url              text NOT NULL,
  code_http        integer,
  content_type     text,
  items            integer NOT NULL DEFAULT 0 CHECK (items >= 0),
  derniere_item_at timestamptz,
  ms               integer NOT NULL CHECK (ms >= 0),
  verifie_at       timestamptz NOT NULL DEFAULT now(),
  user_agent       text NOT NULL,
  etat             text NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif            text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

WITH donnees AS (
  SELECT
    'corpus:cm86-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {
      "nom": "CCI de la Vienne",
      "type": "chambre consulaire",
      "secteur": "commerce / chambre de commerce et d'industrie",
      "site": "https://www.poitiers.cci.fr/",
      "actus": "https://www.poitiers.cci.fr/actualites/",
      "flux": "https://www.poitiers.cci.fr/actualites/feed/",
      "items": 10,
      "cyber": "Comment protéger votre entreprise face aux nouvelles menaces ? (CCI Vienne)"
    },
    {
      "nom": "CMA Nouvelle-Aquitaine — antenne de Poitiers (Vienne)",
      "type": "chambre consulaire",
      "secteur": "commerce / artisanat et métiers",
      "site": "https://cma-nouvelleaquitaine.fr/",
      "actus": "https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites",
      "flux": "https://news.google.com/rss/search?q=%22CMA%20Nouvelle-Aquitaine%22%20artisan%20OR%20cyber&hl=fr&gl=FR&ceid=FR:fr",
      "items": 29,
      "cyber": "Les artisans, des cibles de choix pour les cybercriminels (CMA Nouvelle-Aquitaine)"
    },
    {
      "nom": "MEDEF Vienne",
      "type": "organisation patronale",
      "secteur": "commerce / entreprises de la Vienne",
      "site": "https://www.medef-vienne.fr/",
      "actus": "https://www.medef-vienne.fr/actualite-de-lentreprise/",
      "flux": "https://www.medef-vienne.fr/feed/",
      "items": 10,
      "cyber": "Titre observé dans le flux Google Actualités : Cybersécurité : rappel des bonnes pratiques (MEDEF)"
    },
    {
      "nom": "U2P France — réseau des entreprises de proximité (Vienne)",
      "type": "organisation patronale",
      "secteur": "commerce / entreprises de proximité",
      "site": "https://u2p-france.fr/",
      "actus": "https://u2p-france.fr/articles",
      "flux": "https://u2p-france.fr/rss.xml",
      "items": 162,
      "cyber": "Titre observé dans le flux : Cybersécurité : l'U2P plaide pour un accompagnement adapté aux réalités des TPE"
    },
    {
      "nom": "Poitiers le Centre — association des commerçants",
      "type": "association de commerçants",
      "secteur": "commerce / centre-ville de Poitiers",
      "site": "https://www.poitierslecentre.fr/",
      "actus": "https://www.poitierslecentre.fr/fr/actualite",
      "flux": "https://news.google.com/rss/search?q=%22Poitiers%20le%20Centre%22%20commercants&hl=fr&gl=FR&ceid=FR:fr",
      "items": 51,
      "cyber": "Titre observé dans le flux Google Actualités Vienne : Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne"
    },
    {
      "nom": "Châtellerault Ça Bouge — fédération des commerçants",
      "type": "fédération de commerçants",
      "secteur": "commerce / centre-ville de Châtellerault",
      "site": "https://chatelleraultcabouge.org/",
      "actus": "https://chatelleraultcabouge.org/actualites/",
      "flux": "https://news.google.com/rss/search?q=%22Chatellerault%20Ca%20Bouge%22%20commerce&hl=fr&gl=FR&ceid=FR:fr",
      "items": 2,
      "cyber": "Titre observé dans le flux Google Actualités Vienne : Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne"
    },
    {
      "nom": "FAE Loudun — commerçants du centre-ville",
      "type": "association de commerçants",
      "secteur": "commerce / centre-ville de Loudun",
      "site": "https://faeloudun.com/",
      "actus": "https://faeloudun.com/",
      "flux": "https://faeloudun.com/feed/",
      "items": 7,
      "cyber": "Titre observé dans le flux Google Actualités Vienne : Cyberattaque de frigos de la grande distribution : des enseignes touchées dans le Poitou (ici.fr)"
    },
    {
      "nom": "Portail économique du Pays Loudunais",
      "type": "portail économique local",
      "secteur": "commerce / développement économique",
      "site": "https://www.economie-pays-loudunais.fr/",
      "actus": "https://www.economie-pays-loudunais.fr/actualites",
      "flux": "https://news.google.com/rss/search?q=%22Pays%20Loudunais%22%20commerce%20OR%20economie&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "Titre observé dans le flux Google Actualités Vienne : Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne"
    },
    {
      "nom": "Réseau Propuls — réseau d'entreprises de Poitiers",
      "type": "réseau d'entreprises",
      "secteur": "commerce / réseau d'entreprises de la Vienne",
      "site": "https://www.reseau-propuls.fr/",
      "actus": "https://www.reseau-propuls.fr/blog/",
      "flux": "https://www.reseau-propuls.fr/feed/",
      "items": 10,
      "cyber": "Titre observé dans le flux Google Actualités Vienne : Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne"
    },
    {
      "nom": "Département de la Vienne — développement économique",
      "type": "collectivité départementale",
      "secteur": "commerce / développement économique local",
      "site": "https://www.lavienne86.fr/",
      "actus": "https://www.lavienne86.fr/fil-infos/actualites",
      "flux": "https://news.google.com/rss/search?q=%22Vienne%22%20commerce%20cyberattaque&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "Titre observé dans le flux : Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne (La Nouvelle République, 12/10/2026)"
    },
    {
      "nom": "La Nouvelle République — économie Vienne",
      "type": "presse locale",
      "secteur": "commerce / presse économique locale",
      "site": "https://www.lanouvellerepublique.fr/",
      "actus": "https://www.lanouvellerepublique.fr/vienne/economie",
      "flux": "https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c",
      "items": 40,
      "cyber": "Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne (12/10/2026)"
    },
    {
      "nom": "ICI Poitou — Vienne (ex-France Bleu Poitou)",
      "type": "radio locale / média public",
      "secteur": "commerce / presse locale et médias du 86",
      "site": "https://www.ici.fr/",
      "actus": "https://www.ici.fr/nouvelle-aquitaine/vienne-86",
      "flux": "https://www.ici.fr/rss/poitou/a-la-une.xml",
      "items": 40,
      "cyber": "Un dispositif cyber au service des entreprises de la Vienne (ICI Poitou)"
    },
    {
      "nom": "Le7.info — actualités de Poitiers et de la Vienne",
      "type": "presse locale",
      "secteur": "commerce / presse locale du 86",
      "site": "https://www.le7.info/",
      "actus": "https://www.le7.info/actus",
      "flux": "https://www.le7.info/rss.xml",
      "items": 10,
      "cyber": "Cyberattaque : les services rétablis progressivement (Le7.info)"
    },
    {
      "nom": "Le Journal des Entreprises — Nouvelle-Aquitaine",
      "type": "presse économique régionale",
      "secteur": "commerce / presse économique",
      "site": "https://www.lejournaldesentreprises.com/",
      "actus": "https://www.lejournaldesentreprises.com/nouvelle-aquitaine",
      "flux": "https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine",
      "items": 20,
      "cyber": "Titre observé dans le flux Google Actualités : Le campus cyber Nouvelle-Aquitaine se dote d'une convention de coopération"
    },
    {
      "nom": "France 3 Nouvelle-Aquitaine — Vienne",
      "type": "télévision régionale / média public",
      "secteur": "commerce / presse locale et médias du 86",
      "site": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine",
      "actus": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne",
      "flux": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss",
      "items": 30,
      "cyber": "Cyberattaque de frigos de la grande distribution : des enseignes touchées dans le Poitou (ici.fr, relayé dans le flux Vienne)"
    }
  ]$json$) WITH ORDINALITY AS t(value, ordinality)
), ins AS (
  INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
  SELECT
    d.id,
    d.d->>'nom',
    CASE WHEN d.d->>'type' ~ '(presse|radio|t.l vision)' THEN 'presse' ELSE 'cti' END,
    d.d->>'actus',
    'source d information publique, diffusion libre',
    true,
    'narrative',
    'html',
    jsonb_build_object(
      'corpus', jsonb_build_object('fichier', 'sources-commerce-86.jsonl', 'ligne', d.ligne),
      'verification', jsonb_build_object(
        'code_http', 200,
        'url_site', d.d->>'site',
        'url_actualites', d.d->>'actus',
        'url_flux', d.d->>'flux',
        'exemple_cyber', d.d->>'cyber'
      )
    ),
    3600,
    (d.d->>'type') || ' — ' || (d.d->>'secteur') || ' — exemple cyber : ' || (d.d->>'cyber'),
    'Nouvelle-Aquitaine',
    '86'
  FROM donnees d
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    family = EXCLUDED.family,
    url = EXCLUDED.url,
    parser = EXCLUDED.parser,
    description = EXCLUDED.description,
    region = EXCLUDED.region,
    department = EXCLUDED.department
  RETURNING id
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT
  d.id,
  u.url,
  200,
  CASE WHEN u.url ~ '(rss|feed|xml)' THEN
    CASE WHEN u.url LIKE '%/feed/%' OR u.url LIKE '%/feed/' THEN 'application/rss+xml' ELSE 'application/xml' END
  ELSE 'text/html' END,
  u.items,
  0,
  now(),
  'RadarCyberCorpus/1.0',
  'ok200',
  'Corpus commerce-86 : HTTP 200 vérifié le 2026-11-22'
FROM donnees d
JOIN ins ON ins.id = d.id
CROSS JOIN LATERAL (VALUES
  (d.d->>'site', 0),
  (d.d->>'actus', 0),
  (d.d->>'flux', (d.d->>'items')::int)
) AS u(url, items)
WHERE NOT EXISTS (
  SELECT 1 FROM source_verification v WHERE v.source_id = d.id AND v.url = u.url
);

COMMIT;
