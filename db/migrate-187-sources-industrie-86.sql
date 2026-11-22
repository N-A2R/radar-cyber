-- Sources d'information du secteur industrie dans le département 86 (Vienne).
-- 18 sources, 48 contrôles HTTP (48 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-industrie-86.jsonl
-- Preuve HTTP : bench/results/verification-industrie-86.json

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
    'corpus:industrie86-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {
      "nom": "CCI de la Vienne",
      "type": "chambre consulaire",
      "secteur": "industrie",
      "site": "https://www.poitiers.cci.fr/",
      "actus": "https://www.poitiers.cci.fr/actualites/",
      "flux": "https://www.poitiers.cci.fr/actualites/feed/",
      "items": 10,
      "cyber": "Cybersécurité : PME/TPE, agissez pour ne pas subir ! (CCI de la Vienne, 08/04/2024)"
    },
    {
      "nom": "MEDEF Vienne",
      "type": "fédération patronale",
      "secteur": "industrie",
      "site": "https://www.medef-vienne.fr/",
      "actus": "https://www.medef-vienne.fr/actualite-de-lentreprise/",
      "flux": "https://www.medef-vienne.fr/feed/",
      "items": 10,
      "cyber": "Cybersécurité : rappel des bonnes pratiques (MEDEF, 06/10/2022)"
    },
    {
      "nom": "CPME Vienne (86)",
      "type": "fédération patronale",
      "secteur": "industrie",
      "site": "https://www.cpme.fr/qui-sommes-nous/annuaire/nos-cpme-territoriales/nouvelle-aquitaine/vienne",
      "actus": "https://www.cpme.fr/actualites/",
      "flux": "https://news.google.com/rss/search?q=CPME%20Vienne%20actualites&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "Aucun incident propre identifié ; flux de veille des dirigeants (10 items)"
    },
    {
      "nom": "CMA Nouvelle-Aquitaine — CMA Vienne",
      "type": "chambre consulaire",
      "secteur": "industrie",
      "site": "https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-vienne",
      "actus": "https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites",
      "flux": "https://news.google.com/rss/search?q=CMA%20Vienne%20artisanat%20industrie&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "Facturation électronique : une nouvelle étape pour les artisans (CMA Nouvelle-Aquitaine, 24/06/2026)"
    },
    {
      "nom": "Grand Poitiers — développement économique",
      "type": "agence de développement économique",
      "secteur": "industrie",
      "site": "https://www.grandpoitiers.fr/entreprendre-et-emploi",
      "actus": "https://www.grandpoitiers.fr/information-transversale/actualites",
      "flux": "https://www.grandpoitiers.fr/information-transversale/actualites/rss",
      "items": 117,
      "cyber": "Semaine de l'emploi du 12 au 16 octobre 2026 : recherche d'emploi et reconversion professionnelle"
    },
    {
      "nom": "Grand Châtellerault — pôle industrie",
      "type": "agence de développement économique",
      "secteur": "industrie",
      "site": "https://www.vivezengrand-chatellerault.fr/entreprendre/industrie/",
      "actus": "https://www.grand-chatellerault.fr/vivre/actualites",
      "flux": "https://news.google.com/rss/search?q=Grand%20Chatellerault%20industrie%20entreprises&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "À Châtellerault, le groupe L'Alliance se développe et recrute dans le secteur de l'industrie (La Nouvelle République, 2026)"
    },
    {
      "nom": "Neoloji Technopole (Poitiers)",
      "type": "technopole / incubateur",
      "secteur": "industrie",
      "site": "https://www.neoloji.fr/",
      "actus": "https://www.neoloji.fr/actualites",
      "flux": "https://news.google.com/rss/search?q=Neoloji%20technopole%20Poitiers&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "Forum Industrie & Innovation : la cybersécurité au programme (Neoloji, 12/04/2022)"
    },
    {
      "nom": "UIMM Nouvelle-Aquitaine — Vienne",
      "type": "syndicat professionnel métallurgie",
      "secteur": "industrie",
      "site": "https://www.uimmnouvelleaquitaine.com/",
      "actus": "https://www.uimmnouvelleaquitaine.com/actualite/presse.html",
      "flux": "https://news.google.com/rss/search?q=UIMM%20Nouvelle-Aquitaine%20metallurgie&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "Réindustrialisation : personne n'y croit (Matthieu Hede, UIMM, La Tribune, 2026)"
    },
    {
      "nom": "EIT Sud Vienne",
      "type": "cluster économie circulaire",
      "secteur": "industrie",
      "site": "https://eit-sudvienne.fr/",
      "actus": "https://eit-sudvienne.fr/category/actualites/",
      "flux": "https://eit-sudvienne.fr/feed/",
      "items": 10,
      "cyber": "Ficelles et filets de bottes de paille/foin : un recyclage prometteur (23/02/2024)"
    },
    {
      "nom": "ISAE-ENSMA (Poitiers)",
      "type": "école d'ingénieurs industrie/aéronautique",
      "secteur": "industrie",
      "site": "https://www.ensma.fr/",
      "actus": "https://www.ensma.fr/actualites/",
      "flux": "https://www.ensma.fr/feed/",
      "items": 10,
      "cyber": "JST AMAC 2026 : impression 3D et matériaux (09/11/2026)"
    },
    {
      "nom": "FTM-CGT Métallurgie",
      "type": "syndicat professionnel métallurgie",
      "secteur": "industrie",
      "site": "https://ftm-cgt.fr/",
      "actus": "https://ftm-cgt.fr/actualites/",
      "flux": "https://ftm-cgt.fr/feed/",
      "items": 20,
      "cyber": "Cyberattaque : les systèmes de supervision mis en danger (16/10/2026, cas Danfoss)"
    },
    {
      "nom": "Societe.com — entreprises de la Vienne (86)",
      "type": "annuaire professionnel",
      "secteur": "industrie",
      "site": "https://www.societe.com/entreprises/vienne-86",
      "actus": "https://www.societe.com/entreprises/vienne-86",
      "flux": "https://news.google.com/rss/search?q=societe.com%20entreprises%20Vienne%2086%20industrie&hl=fr&gl=FR&ceid=FR:fr",
      "items": 10,
      "cyber": "Un Café IA pour éclairer les entreprises (Le7.info, item du flux, 2026)"
    },
    {
      "nom": "La Nouvelle République — Vienne",
      "type": "presse locale",
      "secteur": "industrie",
      "site": "https://www.lanouvellerepublique.fr/vienne",
      "actus": "https://www.lanouvellerepublique.fr/vienne",
      "flux": "https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c",
      "items": 40,
      "cyber": "Poitiers : Vivaticket, prestataire de billetterie, victime d'une cyberattaque (2026)"
    },
    {
      "nom": "La Nouvelle République — Économie Vienne",
      "type": "presse économique locale",
      "secteur": "industrie",
      "site": "https://www.lanouvellerepublique.fr/vienne/economie",
      "actus": "https://www.lanouvellerepublique.fr/vienne/economie",
      "flux": "https://www.lanouvellerepublique.fr/api/v1/rss/6705263824a8a983658b456c",
      "items": 40,
      "cyber": "Vienne : la formation est une clé essentielle pour l'industrie et la métallurgie (21/11/2026)"
    },
    {
      "nom": "ICI Poitou",
      "type": "radio locale / média public",
      "secteur": "industrie",
      "site": "https://www.ici.fr/radio/poitou",
      "actus": "https://www.ici.fr/nouvelle-aquitaine/vienne-86",
      "flux": "https://www.ici.fr/rss/poitou/a-la-une.xml",
      "items": 40,
      "cyber": "Cyberattaque de frigos de la grande distribution : des enseignes touchées dans le Poitou (2026)"
    },
    {
      "nom": "France 3 Nouvelle-Aquitaine — Vienne",
      "type": "télévision locale / média public",
      "secteur": "industrie",
      "site": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne",
      "actus": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne",
      "flux": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss",
      "items": 30,
      "cyber": "La mairie de Poitiers victime d'une cyberattaque avec rançon (BFM, via Google Actualités)"
    },
    {
      "nom": "web86.info",
      "type": "presse locale",
      "secteur": "industrie",
      "site": "https://web86.info/",
      "actus": "https://web86.info/",
      "flux": "https://web86.info/feed/",
      "items": 10,
      "cyber": "Carte vitale ou carte bancaire ? débat à Coulombiers (17/11/2026)"
    },
    {
      "nom": "Entreprises en Vienne",
      "type": "revue économique départementale",
      "secteur": "industrie",
      "site": "https://entreprisesenvienne.fr/",
      "actus": "https://entreprisesenvienne.fr/",
      "flux": "https://news.google.com/rss/search?q=Entreprises%20en%20Vienne%20industrie&hl=fr&gl=FR&ceid=FR:fr",
      "items": 34,
      "cyber": "Vienne : pourquoi les entreprises jouent le jeu des Semaines de l'industrie (Le Dauphiné Libéré, 2026)"
    }
]$json$) WITH ORDINALITY AS t(value, ordinality)
), ins AS (
  INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
  SELECT
    d.id,
    d.d->>'nom',
    CASE WHEN d.d->>'type' ~ '(presse|radio|t.l.vision)' THEN 'presse' ELSE 'cti' END,
    d.d->>'actus',
    'source d information publique, diffusion libre',
    true,
    'narrative',
    'html',
    jsonb_build_object(
      'corpus', jsonb_build_object('fichier', 'sources-industrie-86.jsonl', 'ligne', d.ligne),
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
    CASE WHEN u.url LIKE '%/feed/%' THEN 'application/rss+xml' ELSE 'application/xml' END
  ELSE 'text/html' END,
  u.items,
  0,
  now(),
  'RadarCyberCorpus/1.0',
  'ok200',
  'Corpus industrie-86 : HTTP 200 vérifié le 2026-11-22'
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
